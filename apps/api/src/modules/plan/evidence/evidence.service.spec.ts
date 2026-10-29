import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import {
  EvidenceService,
  evidenceMaxBytes,
  sanitizeFileName,
  type UploadedEvidenceFile,
} from './evidence.service';

function actor(role: RoleCode, userId: string): CurrentActor {
  return {
    userId,
    name: userId,
    identifier: `${userId}@demo.local`,
    grants: [],
    roleCodes: new Set([role]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: role === RoleCode.JEFE_AREA,
    isAdmin: false,
  };
}

function pdf(overrides: Partial<UploadedEvidenceFile> = {}): UploadedEvidenceFile {
  return {
    originalname: 'Informe final.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('x'),
    ...overrides,
  };
}

function setup(responsibleUserId: string | null = 'u-resp', requestState = 'EN_EJECUCION') {
  const tx = {
    taskEvidence: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          createdAt: new Date('2026-10-29T00:00:00Z'),
          uploadedBy: { name: 'Ana' },
        }),
      ),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    taskEvidence: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const planState = {
    requireTaskInScope: jest.fn().mockResolvedValue({
      task: { id: 't1', responsibleUserId },
      mainProcessId: 'p1',
      requestId: 'r1',
      requestState,
    }),
    assertProjectOpen: jest.fn(),
  };
  const storage = {
    put: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    presignDownload: jest.fn().mockResolvedValue({ url: 'https://s3/x', expiresInSeconds: 300 }),
  };
  const service = new EvidenceService(
    prisma as never,
    audit as never,
    planState as never,
    storage as never,
  );
  return { service, prisma, tx, audit, planState, storage };
}

describe('EvidenceService', () => {
  it('el responsable sube un archivo: se guarda en S3 con clave organizada y se audita', async () => {
    const m = setup();
    const res = await m.service.upload(actor(RoleCode.INTEGRANTE, 'u-resp'), 't1', pdf());

    const key = m.storage.put.mock.calls[0][0] as string;
    expect(key).toMatch(/^proyectos\/r1\/tareas\/t1\/evidencias\/[0-9a-f-]{36}-Informe_final\.pdf$/);
    expect(res.fileName).toBe('Informe final.pdf');
    expect(res.uploadedByName).toBe('Ana');
    expect(m.audit.record).toHaveBeenCalledTimes(1);
  });

  it('un integrante que no es responsable no puede subir (403)', async () => {
    const m = setup('otro');
    await expect(
      m.service.upload(actor(RoleCode.INTEGRANTE, 'u-resp'), 't1', pdf()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.storage.put).not.toHaveBeenCalled();
  });

  it('un lider puede subir aunque no sea el responsable', async () => {
    const m = setup('otro');
    await expect(
      m.service.upload(actor(RoleCode.LIDER_PROCESO, 'lider'), 't1', pdf()),
    ).resolves.toBeDefined();
  });

  it('rechaza archivo vacio, muy grande o de tipo no permitido (400)', async () => {
    const m = setup();
    const a = actor(RoleCode.INTEGRANTE, 'u-resp');
    await expect(m.service.upload(a, 't1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(m.service.upload(a, 't1', pdf({ size: 0 }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      m.service.upload(a, 't1', pdf({ size: 50 * 1024 * 1024 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      m.service.upload(a, 't1', pdf({ originalname: 'virus.exe', mimetype: 'application/x-msdownload' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Extension que no corresponde al tipo declarado.
    await expect(
      m.service.upload(a, 't1', pdf({ originalname: 'script.html' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(m.storage.put).not.toHaveBeenCalled();
  });

  it('si falla el registro en BD se borra el objeto subido', async () => {
    const m = setup();
    m.prisma.$transaction.mockRejectedValueOnce(new Error('db'));
    await expect(
      m.service.upload(actor(RoleCode.INTEGRANTE, 'u-resp'), 't1', pdf()),
    ).rejects.toThrow('db');
    expect(m.storage.remove).toHaveBeenCalledTimes(1);
  });

  it('descargar una evidencia inexistente da 404', async () => {
    const m = setup();
    m.prisma.taskEvidence.findFirst.mockResolvedValue(null);
    await expect(
      m.service.download(actor(RoleCode.INTEGRANTE, 'u-resp'), 't1', 'e1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('descargar devuelve la URL prefirmada', async () => {
    const m = setup();
    m.prisma.taskEvidence.findFirst.mockResolvedValue({
      storageKey: 'k',
      fileName: 'a.pdf',
      contentType: 'application/pdf',
    });
    const res = await m.service.download(actor(RoleCode.INTEGRANTE, 'x'), 't1', 'e1');
    expect(res.url).toBe('https://s3/x');
  });

  it('quitar borra el registro y luego el objeto', async () => {
    const m = setup();
    m.prisma.taskEvidence.findFirst.mockResolvedValue({
      id: 'e1',
      storageKey: 'k',
      fileName: 'a.pdf',
    });
    await m.service.remove(actor(RoleCode.INTEGRANTE, 'u-resp'), 't1', 'e1');
    expect(m.tx.taskEvidence.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
    expect(m.storage.remove).toHaveBeenCalledWith('k');
  });

  it('proyecto cerrado: assertProjectOpen bloquea subir', async () => {
    const m = setup('u-resp', 'CERRADA');
    m.planState.assertProjectOpen.mockImplementation(() => {
      throw new Error('cerrado');
    });
    await expect(
      m.service.upload(actor(RoleCode.INTEGRANTE, 'u-resp'), 't1', pdf()),
    ).rejects.toThrow('cerrado');
  });
});

describe('helpers de evidencia', () => {
  it('sanitizeFileName quita rutas, tildes y caracteres raros', () => {
    expect(sanitizeFileName('..\\..\\Ñandú informe (1).pdf')).toBe('Nandu_informe_1_.pdf');
    expect(sanitizeFileName('')).toBe('archivo');
  });

  it('evidenceMaxBytes usa el valor valido o el default de 8 MB', () => {
    expect(evidenceMaxBytes('1000')).toBe(1000);
    expect(evidenceMaxBytes(undefined)).toBe(8 * 1024 * 1024);
    expect(evidenceMaxBytes('-1')).toBe(8 * 1024 * 1024);
  });
});
