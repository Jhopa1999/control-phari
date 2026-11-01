import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import {
  AssistantProposalsService,
  EXECUTION_STALE_MS,
  PROPOSAL_TTL_MS,
  extractResult,
} from './assistant-proposals.service';
import type { AssistantToolGateway, AssistantToolSession } from './assistant-tools';

/**
 * Propuestas de acción: nada se ejecuta hasta que la persona confirma; solo la
 * dueña puede resolverla; una sola vez; con su token; vence a las 24 h; y un
 * rechazo de la API queda explicado en la propia propuesta.
 */
const USER_ID = 'u-1';
const ID = '11111111-1111-4111-8111-111111111111';
const BEARER = 'Bearer token-de-prueba';

function actor(userId = USER_ID): CurrentActor {
  return {
    userId,
    name: 'Ana',
    identifier: 'ana@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    conversationId: 'c-1',
    messageId: 'm-1',
    userId: USER_ID,
    toolName: 'request.create',
    summary: 'Crear la solicitud «X»',
    args: { body: { title: 'X', mainProcessId: 'p-1' } },
    status: 'PENDIENTE',
    resultText: null,
    errorText: null,
    createdAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

interface Opts {
  stored?: ReturnType<typeof row> | null;
  claim?: number;
  callResult?: { text: string; isError: boolean };
  callError?: Error;
  configured?: boolean;
}

function makeDeps(opts: Opts = {}) {
  let current = opts.stored === undefined ? row() : opts.stored;
  const prisma = {
    aiProposal: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) =>
        current && where.userId === current.userId ? current : null,
      ),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const count = opts.claim ?? 1;
        if (count > 0 && current) current = { ...current, ...data } as typeof current;
        return { count };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        current = { ...current, ...data } as NonNullable<typeof current>;
        return current;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        row({ id: 'new', ...data }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  const session: AssistantToolSession = {
    listTools: jest.fn().mockResolvedValue([]),
    callTool: opts.callError
      ? jest.fn().mockRejectedValue(opts.callError)
      : jest.fn().mockResolvedValue(
          opts.callResult ?? { text: '{"id":"r-9","title":"X"}', isError: false },
        ),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const gateway: AssistantToolGateway = {
    isConfigured: () => opts.configured ?? true,
    open: jest.fn().mockResolvedValue(session),
  };
  return { service: new AssistantProposalsService(prisma, gateway), prisma, gateway, session };
}

describe('extractResult', () => {
  it('toma id y título (o nombre) de la respuesta JSON', () => {
    expect(extractResult('{"id":"a","title":"T"}')).toEqual({ id: 'a', title: 'T' });
    expect(extractResult('{"id":"a","name":"N"}')).toEqual({ id: 'a', title: 'N' });
  });
  it('tolera texto que no es JSON o está vacío', () => {
    expect(extractResult('no es json')).toEqual({ id: null, title: null });
    expect(extractResult(null)).toEqual({ id: null, title: null });
  });
});

describe('estado visible', () => {
  it('una pendiente de más de 24 h aparece como EXPIRADA con su motivo', () => {
    const { service } = makeDeps();
    const old = row({ createdAt: new Date(Date.now() - PROPOSAL_TTL_MS - 1000) });
    const dto = service.toDto(old as never);
    expect(dto.status).toBe('EXPIRADA');
    expect(dto.error).toMatch(/venció/);
  });

  it('una ejecución sin terminar tras 10 min aparece como FALLIDA (interrumpida)', () => {
    const { service } = makeDeps();
    const stale = row({
      status: 'EJECUTANDO',
      resolvedAt: new Date(Date.now() - EXECUTION_STALE_MS - 1000),
    });
    const dto = service.toDto(stale as never);
    expect(dto.status).toBe('FALLIDA');
    expect(dto.error).toMatch(/interrumpió/);
  });

  it('muestra el título de la acción y el id del registro resultante', () => {
    const { service } = makeDeps();
    const dto = service.toDto(
      row({ status: 'CONFIRMADA', resultText: '{"id":"r-9","title":"Mi solicitud"}' }) as never,
    );
    expect(dto).toMatchObject({
      title: 'Crear solicitud',
      status: 'CONFIRMADA',
      resultId: 'r-9',
      resultTitle: 'Mi solicitud',
      error: null,
    });
  });
});

describe('confirm', () => {
  it('ejecuta la MISMA tool con los MISMOS argumentos y el token de la persona', async () => {
    const deps = makeDeps();
    const dto = await deps.service.confirm(actor(), BEARER, ID);
    expect(deps.gateway.open).toHaveBeenCalledWith(BEARER);
    expect(deps.session.callTool).toHaveBeenCalledWith('request.create', {
      body: { title: 'X', mainProcessId: 'p-1' },
    });
    expect(dto.status).toBe('CONFIRMADA');
    expect(dto.resultId).toBe('r-9');
    expect(deps.session.close).toHaveBeenCalled();
  });

  it('reserva la propuesta de forma atómica: si otra confirmación ganó, 409 y no ejecuta', async () => {
    const deps = makeDeps({ claim: 0 });
    await expect(deps.service.confirm(actor(), BEARER, ID)).rejects.toBeInstanceOf(ConflictException);
    expect(deps.session.callTool).not.toHaveBeenCalled();
  });

  it('el rechazo de la API (permisos, validación) queda como FALLIDA con su motivo', async () => {
    const deps = makeDeps({
      callResult: { text: 'No tienes acceso a esta acción.', isError: true },
    });
    const dto = await deps.service.confirm(actor(), BEARER, ID);
    expect(dto.status).toBe('FALLIDA');
    expect(dto.error).toBe('No tienes acceso a esta acción.');
  });

  it('una caída del MCP queda como FALLIDA sin filtrar el detalle interno', async () => {
    const deps = makeDeps({ callError: new Error('ECONNREFUSED 10.0.0.5:3002') });
    const dto = await deps.service.confirm(actor(), BEARER, ID);
    expect(dto.status).toBe('FALLIDA');
    expect(dto.error).not.toMatch(/ECONNREFUSED|10\.0/);
    expect(deps.session.close).toHaveBeenCalled();
  });

  it('otra persona no puede confirmar (404) y nada se ejecuta', async () => {
    const deps = makeDeps();
    await expect(deps.service.confirm(actor('u-2'), BEARER, ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deps.session.callTool).not.toHaveBeenCalled();
  });

  it.each(['CONFIRMADA', 'DESCARTADA', 'EJECUTANDO', 'FALLIDA'])(
    'no se puede confirmar una propuesta %s (409)',
    async (status) => {
      const deps = makeDeps({ stored: row({ status, resolvedAt: new Date() }) });
      await expect(deps.service.confirm(actor(), BEARER, ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(deps.session.callTool).not.toHaveBeenCalled();
    },
  );

  it('una propuesta vencida no se ejecuta', async () => {
    const deps = makeDeps({
      stored: row({ createdAt: new Date(Date.now() - PROPOSAL_TTL_MS - 5000) }),
    });
    await expect(deps.service.confirm(actor(), BEARER, ID)).rejects.toThrow(/venció/);
    expect(deps.session.callTool).not.toHaveBeenCalled();
  });

  it('sin Bearer válido o sin MCP configurado no ejecuta', async () => {
    await expect(makeDeps().service.confirm(actor(), undefined, ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      makeDeps({ configured: false }).service.confirm(actor(), BEARER, ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('una tool que ya no está en la lista permitida no se ejecuta', async () => {
    const deps = makeDeps({ stored: row({ toolName: 'user.create' }) });
    await expect(deps.service.confirm(actor(), BEARER, ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deps.session.callTool).not.toHaveBeenCalled();
  });
});

describe('discard', () => {
  it('descarta una pendiente propia sin ejecutar nada', async () => {
    const deps = makeDeps();
    const dto = await deps.service.discard(actor(), ID);
    expect(dto.status).toBe('DESCARTADA');
    expect(deps.gateway.open).not.toHaveBeenCalled();
  });

  it('no descarta la de otra persona ni una ya resuelta', async () => {
    await expect(makeDeps().service.discard(actor('u-2'), ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      makeDeps({ stored: row({ status: 'CONFIRMADA' }) }).service.discard(actor(), ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('create y asociación', () => {
  it('crea PENDIENTE y asocia las propuestas del turno al mensaje', async () => {
    const deps = makeDeps();
    const dto = await deps.service.create({
      userId: USER_ID,
      conversationId: 'c-1',
      toolName: 'request.create',
      summary: 'Resumen',
      args: { body: {} },
    });
    expect(dto.status).toBe('PENDIENTE');
    await deps.service.attachToMessage(['a', 'b'], 'm-7');
    expect(deps.prisma.aiProposal.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: { messageId: 'm-7' },
    });
    // Sin propuestas no toca la base.
    (deps.prisma.aiProposal.updateMany as jest.Mock).mockClear();
    await deps.service.attachToMessage([], 'm-7');
    expect(deps.prisma.aiProposal.updateMany).not.toHaveBeenCalled();
  });
});
