import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { requestScopeWhere } from '../../request/request-scope.service';
import { KnowledgeScopeService } from '../knowledge-scope.service';
import { DocumentStateService } from './document-state.service';
import { DocumentService } from './document.service';

/** Filas de un listado paginado (el servicio devuelve PageResult). */
async function rowsOf<T>(p: Promise<{ rows: T[] }>): Promise<T[]> {
  return (await p).rows;
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function createMocks() {
  const prismaObj: Record<string, any> = {
    asset: { findFirst: jest.fn() },
    request: { findMany: jest.fn().mockResolvedValue([]) },
    catalogItem: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    document: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    documentVersion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const scope = new KnowledgeScopeService();
  const state = new DocumentStateService();
  const service = new DocumentService(prisma, audit, scope, state, { notify: jest.fn(), areaHeadsForProcess: jest.fn().mockResolvedValue([]), processLeaders: jest.fn().mockResolvedValue([]) } as never);
  return { prismaObj, auditRecord, service };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: scoped.map((p) => ({
      processId: p,
      processCode: p,
      processName: p,
      roleCode: RoleCode.LIDER_PROCESO,
      roleName: 'LIDER_PROCESO',
    })),
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };
}

function jefe(): CurrentActor {
  return {
    userId: 'uj',
    name: 'Jefe',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isLiderProceso: false,
    isAdmin: false,
  };
}

function integrante(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ui',
    name: 'Integrante',
    identifier: 'integrante@demo.local',
    grants: scoped.map((p) => ({
      processId: p,
      processCode: p,
      processName: p,
      roleCode: RoleCode.INTEGRANTE,
      roleName: 'INTEGRANTE',
    })),
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };
}

const now = new Date('2025-03-10T00:00:00.000Z');

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    processId: 'p1',
    requestId: null,
    ownerUserId: null,
    name: 'Activo',
    status: 'BORRADOR',
    typeCode: null,
    technologyCode: null,
    sourceCode: null,
    frequencyCode: null,
    documentationRef: null,
    functionalDescription: null,
    dependencies: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function docRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    assetId: 'a1',
    title: 'Doc',
    categoryCode: null,
    status: 'BORRADOR',
    currentVersionId: null,
    createdAt: now,
    updatedAt: now,
    currentVersion: null,
    asset: { name: 'Activo' },
    request: null,
    ...overrides,
  };
}

function versionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    documentId: 'd1',
    versionNumber: 1,
    content: 'contenido',
    authorUserId: 'ul',
    createdAt: now,
    ...overrides,
  };
}

describe('DocumentService', () => {
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
  });

  describe('createDocument', () => {
    it('crea el documento, la version 1 y setea currentVersionId; audita DOCUMENT y DOCUMENT_VERSION', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.document.create.mockResolvedValue(docRow());
      m.prismaObj.documentVersion.create.mockResolvedValue(versionRow());
      m.prismaObj.document.update.mockResolvedValue(
        docRow({
          currentVersionId: 'v1',
          currentVersion: {
            id: 'v1',
            versionNumber: 1,
            authorUserId: 'ul',
            createdAt: now,
          },
        }),
      );

      const res = await m.service.createDocument(lider(), {
        assetId: 'a1',
        title: 'Doc',
        content: 'contenido',
      });

      expect(m.prismaObj.documentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ versionNumber: 1, authorUserId: 'ul' }),
        }),
      );
      expect(m.prismaObj.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentVersionId: 'v1' } }),
      );
      expect(res.currentVersion?.versionNumber).toBe(1);
      const types = m.auditRecord.mock.calls.map((c: any[]) => c[1].objectType);
      expect(types).toContain('DOCUMENT');
      expect(types).toContain('DOCUMENT_VERSION');
    });

    it('integrante con activo ya ACTIVO -> 403', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ status: 'ACTIVO' }),
      );
      await expect(
        m.service.createDocument(integrante(), {
          assetId: 'a1',
          title: 'Doc',
          content: 'contenido',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('activo fuera de alcance -> 404', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(null);
      await expect(
        m.service.createDocument(lider(), {
          assetId: 'ajeno',
          title: 'Doc',
          content: 'contenido',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createVersion (versionado inmutable, AC-020)', () => {
    beforeEach(() => {
      m.prismaObj.document.findFirst.mockResolvedValue(
        docRow({
          status: 'VIGENTE',
          currentVersionId: 'v1',
          currentVersion: {
            id: 'v1',
            versionNumber: 1,
            authorUserId: 'ul',
            createdAt: now,
          },
        }),
      );
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
    });

    it('incrementa versionNumber, mueve el puntero y devuelve a BORRADOR un VIGENTE de cualquier categoría (D9)', async () => {
      m.prismaObj.documentVersion.aggregate.mockResolvedValue({
        _max: { versionNumber: 1 },
      });
      m.prismaObj.documentVersion.create.mockResolvedValue(
        versionRow({ id: 'v2', versionNumber: 2 }),
      );
      m.prismaObj.document.update.mockResolvedValue(
        docRow({
          status: 'VIGENTE',
          currentVersionId: 'v2',
          currentVersion: {
            id: 'v2',
            versionNumber: 2,
            authorUserId: 'ul',
            createdAt: now,
          },
        }),
      );

      const res = await m.service.createVersion(lider(), 'd1', {
        content: 'nuevo contenido',
      });

      expect(m.prismaObj.documentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ versionNumber: 2 }),
        }),
      );
      // D9: versionar un VIGENTE lo devuelve a BORRADOR en toda categoría.
      const updateArg = m.prismaObj.document.update.mock.calls[0][0];
      expect(updateArg.data).toEqual({
        currentVersionId: 'v2',
        status: 'BORRADOR',
      });
      expect(res.currentVersion?.versionNumber).toBe(2);
    });

    it.each(['BORRADOR', 'RECHAZADO', 'ARCHIVADA', 'PENDIENTE_APROBACION'])(
      'versionar un documento %s (categoría que no es de cierre) conserva su estado',
      async (status) => {
        m.prismaObj.document.findFirst.mockResolvedValue(
          docRow({ status, categoryCode: 'TECNICA', currentVersionId: 'v1' }),
        );
        m.prismaObj.documentVersion.aggregate.mockResolvedValue({
          _max: { versionNumber: 1 },
        });
        m.prismaObj.documentVersion.create.mockResolvedValue(
          versionRow({ id: 'v2', versionNumber: 2 }),
        );
        m.prismaObj.document.update.mockResolvedValue(
          docRow({ status, currentVersionId: 'v2' }),
        );
        await m.service.createVersion(lider(), 'd1', { content: 'nuevo' });
        const data = m.prismaObj.document.update.mock.calls[0][0].data;
        expect(data).toEqual({ currentVersionId: 'v2' });
      },
    );

    it('la documentación de cierre pendiente de aprobación vuelve a BORRADOR al versionar', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(
        docRow({ status: 'PENDIENTE_APROBACION', categoryCode: 'CIERRE' }),
      );
      m.prismaObj.documentVersion.aggregate.mockResolvedValue({
        _max: { versionNumber: 1 },
      });
      m.prismaObj.documentVersion.create.mockResolvedValue(
        versionRow({ id: 'v2', versionNumber: 2 }),
      );
      m.prismaObj.document.update.mockResolvedValue(docRow({ currentVersionId: 'v2' }));
      await m.service.createVersion(lider(), 'd1', { content: 'nuevo' });
      expect(m.prismaObj.document.update.mock.calls[0][0].data).toEqual({
        currentVersionId: 'v2',
        status: 'BORRADOR',
      });
    });

    it('concurrencia: un reintento tras P2002 y luego exito', async () => {
      m.prismaObj.documentVersion.aggregate
        .mockResolvedValueOnce({ _max: { versionNumber: 1 } })
        .mockResolvedValueOnce({ _max: { versionNumber: 2 } });
      m.prismaObj.documentVersion.create
        .mockRejectedValueOnce(p2002())
        .mockResolvedValueOnce(versionRow({ id: 'v3', versionNumber: 3 }));
      m.prismaObj.document.update.mockResolvedValue(
        docRow({ status: 'VIGENTE', currentVersionId: 'v3' }),
      );

      await m.service.createVersion(lider(), 'd1', { content: 'c' });
      expect(m.prismaObj.documentVersion.create).toHaveBeenCalledTimes(2);
    });

    it('concurrencia: si el reintento tambien choca -> 409', async () => {
      m.prismaObj.documentVersion.aggregate.mockResolvedValue({
        _max: { versionNumber: 1 },
      });
      m.prismaObj.documentVersion.create
        .mockRejectedValueOnce(p2002())
        .mockRejectedValueOnce(p2002());

      await expect(
        m.service.createVersion(lider(), 'd1', { content: 'c' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(m.prismaObj.documentVersion.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('changeStatus', () => {
    it('integrante no puede cambiar estado del documento -> 403', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      await expect(
        m.service.changeStatus(integrante(), 'd1', { targetStatus: 'VIGENTE' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('salto de estado invalido -> 400', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      await expect(
        m.service.changeStatus(lider(), 'd1', { targetStatus: 'ARCHIVADA' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['BORRADOR', 'ARCHIVADA'])(
      'líder no publica directo %s -> VIGENTE: 403 en español y sin mutación (D9)',
      async (status) => {
        m.prismaObj.document.findFirst.mockResolvedValue(docRow({ status }));
        m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
        await expect(
          m.service.changeStatus(lider(), 'd1', { targetStatus: 'VIGENTE' }),
        ).rejects.toThrow(
          'Solo el jefe de área puede publicar directamente; envía el documento a aprobación.',
        );
        expect(m.prismaObj.document.update).not.toHaveBeenCalled();
      },
    );

    it('líder sigue enviando a aprobación y retirando un vigente a borrador', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.document.update.mockResolvedValue(
        docRow({ status: 'PENDIENTE_APROBACION' }),
      );
      await expect(
        m.service.changeStatus(lider(), 'd1', {
          targetStatus: 'PENDIENTE_APROBACION',
        }),
      ).resolves.toMatchObject({ status: 'PENDIENTE_APROBACION' });
      m.prismaObj.document.findFirst.mockResolvedValue(docRow({ status: 'VIGENTE' }));
      m.prismaObj.document.update.mockResolvedValue(docRow({ status: 'BORRADOR' }));
      await expect(
        m.service.changeStatus(lider(), 'd1', { targetStatus: 'BORRADOR' }),
      ).resolves.toMatchObject({ status: 'BORRADOR' });
    });

    it('jefe reactiva ARCHIVADA -> VIGENTE', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow({ status: 'ARCHIVADA' }));
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.document.update.mockResolvedValue(docRow({ status: 'VIGENTE' }));
      await expect(
        m.service.changeStatus(jefe(), 'd1', { targetStatus: 'VIGENTE' }),
      ).resolves.toMatchObject({ status: 'VIGENTE' });
    });

    it('jefe publica BORRADOR -> VIGENTE y audita UPDATE', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.document.update.mockResolvedValue(
        docRow({ status: 'VIGENTE' }),
      );
      const res = await m.service.changeStatus(jefe(), 'd1', {
        targetStatus: 'VIGENTE',
      });
      expect(res.status).toBe('VIGENTE');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'DOCUMENT',
        scopeProcessId: 'p1',
      });
    });
  });

  describe('categoría del documento (maestra DOC_CATEGORY)', () => {
    it('createDocument con categoría inexistente o inactiva -> 400 sin crear', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.catalogItem.findFirst.mockResolvedValue(null);
      await expect(
        m.service.createDocument(lider(), {
          assetId: 'a1',
          title: 'Doc',
          content: 'c',
          categoryCode: 'NO_EXISTE',
        }),
      ).rejects.toThrow('La categoría del documento no existe o está inactiva.');
      expect(m.prismaObj.catalogItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { catalog: 'DOC_CATEGORY', code: 'NO_EXISTE', active: true },
        }),
      );
      expect(m.prismaObj.document.create).not.toHaveBeenCalled();
    });

    it('updateDocument con categoría inexistente -> 400 sin actualizar', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.catalogItem.findFirst.mockResolvedValue(null);
      await expect(
        m.service.updateDocument(lider(), 'd1', { categoryCode: 'NO_EXISTE' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.prismaObj.document.update).not.toHaveBeenCalled();
    });

    it('updateDocument que solo cambia el título no consulta la maestra (categoría ya guardada se conserva)', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(
        docRow({ categoryCode: 'LEGADA' }),
      );
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.document.update.mockResolvedValue(docRow({ title: 'Nuevo' }));
      await m.service.updateDocument(lider(), 'd1', { title: 'Nuevo' });
      expect(m.prismaObj.catalogItem.findFirst).not.toHaveBeenCalled();
    });

    it('categoría válida y activa se acepta', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.document.create.mockResolvedValue(docRow());
      m.prismaObj.documentVersion.create.mockResolvedValue(versionRow());
      m.prismaObj.document.update.mockResolvedValue(docRow({ currentVersionId: 'v1' }));
      await expect(
        m.service.createDocument(lider(), {
          assetId: 'a1',
          title: 'Doc',
          content: 'c',
          categoryCode: 'TECNICA',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('lecturas', () => {
    it('documento fuera de alcance -> 404', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(null);
      await expect(m.service.get(lider(), 'ajeno')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('getVersionContent devuelve el contenido de la version', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.documentVersion.findFirst.mockResolvedValue(versionRow());
      const res = await m.service.getVersionContent(lider(), 'd1', 'v1');
      expect(res.content).toBe('contenido');
      expect(res.versionNumber).toBe(1);
    });

    it('getVersionContent con versionId inexistente -> 404', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.documentVersion.findFirst.mockResolvedValue(null);
      await expect(
        m.service.getVersionContent(lider(), 'd1', 'vX'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getCurrentContent devuelve la version vigente', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(
        docRow({ currentVersionId: 'v1' }),
      );
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.documentVersion.findFirst.mockResolvedValue(versionRow());
      const res = await m.service.getCurrentContent(lider(), 'd1');
      expect(res.content).toBe('contenido');
    });

    it('getCurrentContent sin currentVersionId -> 404', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(
        docRow({ currentVersionId: null }),
      );
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      await expect(
        m.service.getCurrentContent(lider(), 'd1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getCurrentContent con puntero colgante (version no hallada) -> 404', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(
        docRow({ currentVersionId: 'v1' }),
      );
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.documentVersion.findFirst.mockResolvedValue(null);
      await expect(
        m.service.getCurrentContent(lider(), 'd1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requireDocumentInScope: activo del documento no hallado (defensivo) -> 404', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(null);
      await expect(m.service.get(lider(), 'd1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('listVersions devuelve versiones ordenadas', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.documentVersion.findMany.mockResolvedValue([
        versionRow({ id: 'v2', versionNumber: 2 }),
        versionRow(),
      ]);
      const res = await m.service.listVersions(lider(), 'd1');
      expect(res.map((v) => v.versionNumber)).toEqual([2, 1]);
    });
  });

  describe('list', () => {
    it('aplica filtros processId/requestId/assetId/status/q y take', async () => {
      m.prismaObj.document.findMany.mockResolvedValue([docRow()]);
      const res = await rowsOf(
        m.service.list(lider(), {
          processId: 'p1',
          requestId: 'r1',
          assetId: 'a1',
          status: 'BORRADOR',
          q: 'manual',
          take: 10,
        } as any),
      );
      expect(res).toHaveLength(1);
      const call = m.prismaObj.document.findMany.mock.calls[0][0];
      const and = call.where.AND;
      expect(and).toContainEqual({ assetId: 'a1' });
      expect(and).toContainEqual({ status: 'BORRADOR' });
      expect(and).toContainEqual({
        title: { contains: 'manual', mode: 'insensitive' },
      });
      // Filtros de activo embebidos.
      const assetFilter = and.find((c: any) => c.asset);
      expect(assetFilter.asset.AND).toContainEqual({ processId: 'p1' });
      // El filtro por proyecto incluye documentos vinculados o del activo de origen.
      expect(and).toContainEqual({
        OR: [{ requestId: 'r1' }, { asset: { requestId: 'r1' } }],
      });
      expect(call.take).toBe(10);
    });

    it('sin parámetros devuelve el alcance completo con el tope de 1000 filas', async () => {
      m.prismaObj.document.findMany.mockResolvedValue([]);
      const result = await m.service.list(lider(), {} as any);
      expect(result.rows).toEqual([]);
      const call = m.prismaObj.document.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(1000);
      expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
      expect(result.truncated).toBe(false);
    });

    it('page/pageSize, orden por título y total del mismo where', async () => {
      m.prismaObj.document.findMany.mockResolvedValue([docRow()]);
      m.prismaObj.document.count.mockResolvedValue(51);
      const result = await m.service.list(integrante(['p1']), {
        page: 2,
        pageSize: 25,
        sort: 'title',
        dir: 'desc',
      } as any);
      const call = m.prismaObj.document.findMany.mock.calls[0][0];
      expect(call.skip).toBe(25);
      expect(call.take).toBe(25);
      expect(call.orderBy).toEqual([{ title: 'desc' }, { id: 'asc' }]);
      const countWhere = m.prismaObj.document.count.mock.calls[0][0].where;
      expect(countWhere).toEqual(call.where);
      // El alcance del integrante (por el activo) está en el where del total.
      expect(countWhere.AND[0].asset.AND[0]).toEqual({
        OR: [
          { processId: { in: ['p1'] } },
          { visibilities: { some: { processId: { in: ['p1'] } } } },
        ],
      });
      expect(result.total).toBe(51);
    });

    it('BL-039: nombre del activo y código/título del proyecto; eliminado no se nombra', async () => {
      m.prismaObj.request.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      m.prismaObj.document.findMany.mockResolvedValue([
        docRow({
          requestId: 'r1',
          asset: { name: 'Tablero de ventas' },
          request: { code: 'PRY-0012', title: 'Cierre', deletedAt: null },
        }),
        docRow({
          id: 'd2',
          requestId: 'r2',
          request: { code: 'PRY-0013', title: 'X', deletedAt: new Date() },
        }),
      ]);
      const [doc, borrado] = await rowsOf(m.service.list(lider(), {} as any));
      expect(doc).toMatchObject({
        assetName: 'Tablero de ventas',
        requestCode: 'PRY-0012',
        requestTitle: 'Cierre',
      });
      expect(borrado.requestCode).toBeNull();
      expect(borrado.requestTitle).toBeNull();
      expect(m.prismaObj.document.findMany.mock.calls[0][0].include).toMatchObject({
        asset: { select: { name: true } },
      });
    });

    it('B1: la solicitud fuera del alcance del actor no se nombra; con alcance sí', async () => {
      m.prismaObj.document.findMany.mockResolvedValue([
        docRow({
          requestId: 'r1',
          request: { code: 'PRY-0012', title: 'Cierre', deletedAt: null },
        }),
      ]);

      // Integrante sin acceso a la solicitud: el alcance no la devuelve.
      m.prismaObj.request.findMany.mockResolvedValue([]);
      const [sinAcceso] = await rowsOf(m.service.list(integrante(), {} as any));
      expect(sinAcceso.requestId).toBe('r1');
      expect(sinAcceso.requestCode).toBeNull();
      expect(sinAcceso.requestTitle).toBeNull();
      expect(m.prismaObj.request.findMany).toHaveBeenCalledTimes(1);
      expect(m.prismaObj.request.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ id: { in: ['r1'] } }, requestScopeWhere(integrante())],
      });

      // Jefe: la solicitud está en su alcance y se nombra.
      m.prismaObj.request.findMany.mockResolvedValue([{ id: 'r1' }]);
      const [conAcceso] = await rowsOf(m.service.list(jefe(), {} as any));
      expect(conAcceso.requestCode).toBe('PRY-0012');
      expect(conAcceso.requestTitle).toBe('Cierre');
    });

    it('B1: get no nombra la solicitud fuera del alcance', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(
        docRow({
          requestId: 'r1',
          request: { code: 'PRY-0012', title: 'Cierre', deletedAt: null },
        }),
      );
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.request.findMany.mockResolvedValue([]);
      const res = await m.service.get(integrante(), 'd1');
      expect(res.requestCode).toBeNull();
      expect(res.requestTitle).toBeNull();
    });
  });

  describe('updateDocument', () => {
    it('actualiza title/categoryCode y audita UPDATE', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.document.update.mockImplementation(({ data }: any) =>
        Promise.resolve(docRow({ ...data })),
      );
      const res = await m.service.updateDocument(lider(), 'd1', {
        title: 'Renombrado',
        categoryCode: 'MANUAL',
      });
      expect(res.title).toBe('Renombrado');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'DOCUMENT',
      });
    });

    it('integrante con activo ACTIVO -> 403', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(docRow());
      m.prismaObj.asset.findFirst.mockResolvedValue(
        assetRow({ status: 'ACTIVO' }),
      );
      await expect(
        m.service.updateDocument(integrante(), 'd1', { title: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createDocument / createVersion: errores adicionales', () => {
    it('createDocument P2002 -> 409', async () => {
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.document.create.mockRejectedValue(p2002());
      await expect(
        m.service.createDocument(lider(), {
          assetId: 'a1',
          title: 'Doc',
          content: 'c',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('createDocument error no-P2002 se propaga', async () => {
      const boom = new Error('db down');
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.document.create.mockRejectedValue(boom);
      await expect(
        m.service.createDocument(lider(), {
          assetId: 'a1',
          title: 'Doc',
          content: 'c',
        }),
      ).rejects.toBe(boom);
    });

    it('createVersion sin versiones previas inicia en 1 (max null)', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(
        docRow({ status: 'VIGENTE' }),
      );
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.documentVersion.aggregate.mockResolvedValue({
        _max: { versionNumber: null },
      });
      m.prismaObj.documentVersion.create.mockResolvedValue(versionRow());
      m.prismaObj.document.update.mockResolvedValue(
        docRow({ status: 'VIGENTE', currentVersionId: 'v1' }),
      );
      await m.service.createVersion(lider(), 'd1', { content: 'c' });
      expect(m.prismaObj.documentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ versionNumber: 1 }),
        }),
      );
    });

    it('createVersion error no-P2002 se propaga sin reintento', async () => {
      m.prismaObj.document.findFirst.mockResolvedValue(
        docRow({ status: 'VIGENTE' }),
      );
      m.prismaObj.asset.findFirst.mockResolvedValue(assetRow());
      m.prismaObj.documentVersion.aggregate.mockResolvedValue({
        _max: { versionNumber: 1 },
      });
      const boom = new Error('db down');
      m.prismaObj.documentVersion.create.mockRejectedValue(boom);
      await expect(
        m.service.createVersion(lider(), 'd1', { content: 'c' }),
      ).rejects.toBe(boom);
      expect(m.prismaObj.documentVersion.create).toHaveBeenCalledTimes(1);
    });
  });
});
