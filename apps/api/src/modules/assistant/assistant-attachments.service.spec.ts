import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiModelCatalogService } from '../ai/ai-model-catalog.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { BedrockClient } from '../ai/bedrock.client';
import type { ConverseRequest } from '../ai/bedrock-converse';
import type { CurrentActor } from '../auth/current-actor';
import { StorageService } from '../storage/storage.service';
import {
  AssistantAttachmentsService,
  type UploadedAttachmentFile,
} from './assistant-attachments.service';
import { MAX_UNSENT_ATTACHMENTS } from './assistant.constants';

/**
 * Adjuntos del asistente: validación del archivo, lectura con el modelo (o
 * directa si es texto), almacenamiento, edición, baja y vínculo con el mensaje.
 */
const USER_ID = 'u-1';
const actor = { userId: USER_ID, name: 'Ana', roleCodes: new Set() } as unknown as CurrentActor;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.4 contenido');

function file(name: string, buffer: Buffer, mimetype = 'application/octet-stream'): UploadedAttachmentFile {
  return { originalname: name, mimetype, size: buffer.length, buffer };
}

function makeDeps(
  opts: {
    enabled?: boolean;
    vision?: boolean;
    documents?: boolean;
    unsent?: number;
    modelText?: string;
    modelError?: Error;
    rows?: Array<Record<string, unknown>>;
  } = {},
) {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    aiGlobalConfig: {
      findFirst: jest.fn().mockResolvedValue({ enabled: opts.enabled ?? true, credentialMode: 'iam-role' }),
    },
    aiAgentConfig: {
      findUnique: jest.fn().mockResolvedValue({
        enabled: opts.enabled ?? true,
        region: 'us-east-2',
        model: 'm',
        timeoutMs: 1000,
      }),
    },
    aiAttachment: {
      count: jest.fn().mockResolvedValue(opts.unsent ?? 0),
      findMany: jest.fn().mockResolvedValue(opts.rows ?? []),
      findFirst: jest.fn(),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { ...data, createdAt: new Date('2026-11-05T10:00:00Z') };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'a-1',
        fileName: 'a.txt',
        contentType: 'text/plain',
        sizeBytes: 3,
        kind: 'documento',
        storageKey: 'k',
        truncated: false,
        createdAt: new Date('2026-11-05T10:00:00Z'),
        ...data,
      })),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;

  const converse = jest.fn(async (_request: ConverseRequest) => {
    if (opts.modelError) throw opts.modelError;
    return {
      content: [{ type: 'text' as const, text: opts.modelText ?? 'Texto leído del archivo' }],
      stopReason: 'end_turn' as const,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 },
    };
  });
  const bedrock = { converse } as unknown as BedrockClient;
  const models = {
    inputCapabilities: jest
      .fn()
      .mockResolvedValue({ vision: opts.vision ?? true, documents: opts.documents ?? true }),
  } as unknown as AiModelCatalogService;
  const usage = {
    assertWithinBudget: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AiUsageService;
  const storage = {
    put: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;

  const service = new AssistantAttachmentsService(prisma, storage, bedrock, models, usage);
  return { service, prisma, converse, models, usage, storage, created };
}

describe('AssistantAttachmentsService · subida', () => {
  it('lee una imagen con el modelo, la guarda en S3 y devuelve el texto extraído', async () => {
    const deps = makeDeps({ modelText: 'Solicitud: tablero de ventas' });
    const dto = await deps.service.upload(actor, file('captura.png', PNG, 'image/png'));
    expect(dto).toMatchObject({
      fileName: 'captura.png',
      kind: 'imagen',
      extractedText: 'Solicitud: tablero de ventas',
      truncated: false,
    });
    const request = deps.converse.mock.calls[0][0];
    expect(request.messages[0].content[0]).toMatchObject({ type: 'image', format: 'png' });
    expect(deps.storage.put).toHaveBeenCalledTimes(1);
    expect((deps.storage.put as jest.Mock).mock.calls[0][0]).toMatch(/^asistente\/u-1\/[0-9a-f-]{36}-captura\.png$/);
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, agentCode: 'ASISTENTE', modelId: 'm' }),
    );
  });

  it('envía los documentos como bloque de documento con nombre válido', async () => {
    const deps = makeDeps();
    await deps.service.upload(actor, file('Informe_final (v2).pdf', PDF, 'application/pdf'));
    const block = deps.converse.mock.calls[0][0].messages[0].content[0];
    expect(block).toMatchObject({ type: 'document', format: 'pdf', name: 'Informe final (v2)' });
  });

  it('un archivo de texto se lee directamente, sin llamar al modelo', async () => {
    const deps = makeDeps();
    const dto = await deps.service.upload(actor, file('notas.md', Buffer.from('# Título\nContenido'), 'text/markdown'));
    expect(dto.extractedText).toBe('# Título\nContenido');
    expect(deps.converse).not.toHaveBeenCalled();
    expect(deps.usage.record).not.toHaveBeenCalled();
  });

  it('recorta el texto largo e indica que se recortó', async () => {
    const deps = makeDeps({ modelText: 'x'.repeat(25_000) });
    const dto = await deps.service.upload(actor, file('captura.png', PNG));
    expect(dto.extractedText).toHaveLength(20_000);
    expect(dto.truncated).toBe(true);
  });

  it('rechaza sin archivo, tipo no permitido y contenido que no corresponde al tipo', async () => {
    const deps = makeDeps();
    await expect(deps.service.upload(actor, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      deps.service.upload(actor, file('virus.exe', Buffer.from('MZ'))),
    ).rejects.toThrow(/no está permitido/);
    await expect(
      deps.service.upload(actor, file('falsa.png', Buffer.from('MZ no soy una imagen'))),
    ).rejects.toThrow(/no corresponde/);
    expect(deps.converse).not.toHaveBeenCalled();
    expect(deps.storage.put).not.toHaveBeenCalled();
  });

  it('con el asistente apagado o sin presupuesto responde 409 sin leer nada', async () => {
    await expect(
      makeDeps({ enabled: false }).service.upload(actor, file('a.png', PNG)),
    ).rejects.toBeInstanceOf(ConflictException);

    const deps = makeDeps();
    (deps.usage.assertWithinBudget as jest.Mock).mockRejectedValue(new ConflictException('presupuesto'));
    await expect(deps.service.upload(actor, file('a.png', PNG))).rejects.toThrow('presupuesto');
    expect(deps.converse).not.toHaveBeenCalled();
  });

  it('si el modelo no lee imágenes o documentos lo dice (409)', async () => {
    await expect(
      makeDeps({ vision: false }).service.upload(actor, file('a.png', PNG)),
    ).rejects.toThrow(/imágenes/);
    await expect(
      makeDeps({ documents: false }).service.upload(actor, file('a.pdf', PDF)),
    ).rejects.toThrow(/documentos/);
    // Un archivo de texto no necesita capacidades del modelo.
    await expect(
      makeDeps({ vision: false, documents: false }).service.upload(actor, file('a.txt', Buffer.from('hola'))),
    ).resolves.toBeDefined();
  });

  it('un archivo sin contenido legible responde 422 y no deja nada guardado', async () => {
    const deps = makeDeps({ modelText: '   ' });
    await expect(deps.service.upload(actor, file('vacia.png', PNG))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(deps.storage.put).not.toHaveBeenCalled();
    expect(deps.created).toHaveLength(0);
  });

  it('si el modelo falla responde 502 sin detalle interno y sin guardar', async () => {
    const deps = makeDeps({ modelError: new Error('detalle interno de AWS') });
    const error = await deps.service.upload(actor, file('a.png', PNG)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).not.toMatch(/AWS/);
    expect(deps.storage.put).not.toHaveBeenCalled();
  });

  it('limita los adjuntos sin enviar por persona', async () => {
    const deps = makeDeps({ unsent: MAX_UNSENT_ATTACHMENTS });
    await expect(deps.service.upload(actor, file('a.png', PNG))).rejects.toThrow(/demasiados archivos/);
  });

  it('si falla el registro en la base borra el archivo ya subido', async () => {
    const deps = makeDeps();
    (deps.prisma.aiAttachment.create as jest.Mock).mockRejectedValue(new Error('BD caída'));
    await expect(deps.service.upload(actor, file('a.png', PNG))).rejects.toThrow('BD caída');
    expect(deps.storage.remove).toHaveBeenCalledTimes(1);
  });

  it('purga los adjuntos abandonados (sin enviar) de la persona al subir uno nuevo', async () => {
    const deps = makeDeps();
    (deps.prisma.aiAttachment.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'old-1', storageKey: 'asistente/u-1/old-1-a.png' },
    ]);
    await deps.service.upload(actor, file('a.png', PNG));
    expect(deps.prisma.aiAttachment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old-1'] } } });
    expect(deps.storage.remove).toHaveBeenCalledWith('asistente/u-1/old-1-a.png');
  });
});

describe('AssistantAttachmentsService · edición, baja y envío', () => {
  const owned = (extra: Record<string, unknown> = {}) => ({
    id: 'a-1',
    userId: USER_ID,
    messageId: null,
    storageKey: 'asistente/u-1/a-1-a.txt',
    ...extra,
  });

  it('corrige el texto de un adjunto propio sin enviar', async () => {
    const deps = makeDeps();
    (deps.prisma.aiAttachment.findFirst as jest.Mock).mockResolvedValue(owned());
    const dto = await deps.service.updateText(actor, 'a-1', '  Texto corregido ');
    expect(dto.extractedText).toBe('Texto corregido');
    expect(dto.truncated).toBe(false);
  });

  it('rechaza un texto vacío o demasiado largo', async () => {
    const deps = makeDeps();
    (deps.prisma.aiAttachment.findFirst as jest.Mock).mockResolvedValue(owned());
    await expect(deps.service.updateText(actor, 'a-1', '   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(deps.service.updateText(actor, 'a-1', 'x'.repeat(20_001))).rejects.toThrow(/20000/);
  });

  it('no deja modificar ni quitar un adjunto ya enviado (409) ni ajeno (404)', async () => {
    const deps = makeDeps();
    (deps.prisma.aiAttachment.findFirst as jest.Mock).mockResolvedValue(owned({ messageId: 'm-1' }));
    await expect(deps.service.updateText(actor, 'a-1', 'x')).rejects.toBeInstanceOf(ConflictException);
    await expect(deps.service.remove(actor, 'a-1')).rejects.toBeInstanceOf(ConflictException);

    (deps.prisma.aiAttachment.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(deps.service.remove(actor, 'a-1')).rejects.toBeInstanceOf(NotFoundException);
    expect((deps.prisma.aiAttachment.findFirst as jest.Mock).mock.calls[0][0].where).toEqual({
      id: 'a-1',
      userId: USER_ID,
    });
  });

  it('al quitar un adjunto borra la fila y el archivo', async () => {
    const deps = makeDeps();
    (deps.prisma.aiAttachment.findFirst as jest.Mock).mockResolvedValue(owned());
    await deps.service.remove(actor, 'a-1');
    expect(deps.prisma.aiAttachment.delete).toHaveBeenCalledWith({ where: { id: 'a-1' } });
    expect(deps.storage.remove).toHaveBeenCalledWith('asistente/u-1/a-1-a.txt');
  });

  it('requireForSend exige adjuntos propios sin enviar y respeta el máximo por mensaje', async () => {
    const deps = makeDeps({ rows: [{ id: 'a-1' }] });
    await expect(deps.service.requireForSend(actor, [])).resolves.toEqual([]);
    await expect(deps.service.requireForSend(actor, ['a-1'])).resolves.toHaveLength(1);
    expect((deps.prisma.aiAttachment.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      id: { in: ['a-1'] },
      userId: USER_ID,
      messageId: null,
    });
    // Uno de los adjuntos no existe o ya se envió.
    await expect(deps.service.requireForSend(actor, ['a-1', 'a-2'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      deps.service.requireForSend(actor, ['1', '2', '3', '4', '5', '6']),
    ).rejects.toThrow(/Máximo 5/);
  });

  it('vincula los adjuntos al mensaje y a la conversación solo si seguían sin enviar', async () => {
    const deps = makeDeps();
    await deps.service.attachToMessage(['a-1'], 'c-1', 'm-1');
    expect(deps.prisma.aiAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a-1'] }, messageId: null },
      data: { conversationId: 'c-1', messageId: 'm-1' },
    });
    await deps.service.attachToMessage([], 'c-1', 'm-1');
    expect(deps.prisma.aiAttachment.updateMany).toHaveBeenCalledTimes(1);
  });

  it('agrupa los adjuntos por mensaje para el historial', async () => {
    const row = (id: string, messageId: string) => ({
      id,
      messageId,
      fileName: `${id}.txt`,
      contentType: 'text/plain',
      sizeBytes: 3,
      kind: 'documento',
      extractedText: 'abc',
      truncated: false,
      createdAt: new Date('2026-11-05T10:00:00Z'),
    });
    const deps = makeDeps({ rows: [row('a', 'm-1'), row('b', 'm-1'), row('c', 'm-2')] });
    const map = await deps.service.byMessage('c-1');
    expect(map.get('m-1')?.map((a) => a.id)).toEqual(['a', 'b']);
    expect(map.get('m-2')).toHaveLength(1);
  });

  it('al borrar una conversación elimina del almacenamiento los archivos de sus adjuntos', async () => {
    const deps = makeDeps({ rows: [{ storageKey: 'k1' }, { storageKey: 'k2' }] });
    await deps.service.removeConversationFiles('c-1');
    expect(deps.storage.remove).toHaveBeenCalledWith('k1');
    expect(deps.storage.remove).toHaveBeenCalledWith('k2');
  });

  it('un fallo al borrar un archivo no rompe el flujo', async () => {
    const deps = makeDeps({ rows: [{ storageKey: 'k1' }] });
    (deps.storage.remove as jest.Mock).mockRejectedValue(new Error('S3 caído'));
    await expect(deps.service.removeConversationFiles('c-1')).resolves.toBeUndefined();
  });
});
