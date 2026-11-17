import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };
}

describe('DocumentController (delegacion)', () => {
  const svc = {
    list: jest.fn().mockResolvedValue({ rows: ['fila'], total: 7, truncated: false, window: { paginated: true, page: 2, pageSize: 5, skip: 5, take: 5 } }),
    createDocument: jest.fn().mockResolvedValue('createDocument'),
    get: jest.fn().mockResolvedValue('get'),
    updateDocument: jest.fn().mockResolvedValue('updateDocument'),
    createVersion: jest.fn().mockResolvedValue('createVersion'),
    listVersions: jest.fn().mockResolvedValue('listVersions'),
    getVersionContent: jest.fn().mockResolvedValue('getVersionContent'),
    getCurrentContent: jest.fn().mockResolvedValue('getCurrentContent'),
    changeStatus: jest.fn().mockResolvedValue('changeStatus'),
  } as unknown as DocumentService;
  const controller = new DocumentController(svc);
  const a = actor();

  it('list delega actor y filtros', async () => {
    const filters = {} as never;
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
    await expect(controller.list(a, filters, res)).resolves.toEqual(['fila']);
    // El total y la ventana viajan en cabeceras; el cuerpo sigue siendo un arreglo.
    expect(headers).toEqual({
      'X-Total-Count': '7',
      'X-Page': '2',
      'X-Page-Size': '5',
      'X-Truncated': 'false',
    });
    expect(svc.list).toHaveBeenCalledWith(a, filters);
  });

  it('create delega en createDocument', async () => {
    const dto = {} as never;
    await expect(controller.create(a, dto)).resolves.toBe('createDocument');
    expect(svc.createDocument).toHaveBeenCalledWith(a, dto);
  });

  it('get delega actor e id', async () => {
    await expect(controller.get(a, 'd1')).resolves.toBe('get');
    expect(svc.get).toHaveBeenCalledWith(a, 'd1');
  });

  it('update delega en updateDocument', async () => {
    const dto = {} as never;
    await expect(controller.update(a, 'd1', dto)).resolves.toBe(
      'updateDocument',
    );
    expect(svc.updateDocument).toHaveBeenCalledWith(a, 'd1', dto);
  });

  it('createVersion delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.createVersion(a, 'd1', dto)).resolves.toBe(
      'createVersion',
    );
    expect(svc.createVersion).toHaveBeenCalledWith(a, 'd1', dto);
  });

  it('listVersions delega actor e id', async () => {
    await expect(controller.listVersions(a, 'd1')).resolves.toBe(
      'listVersions',
    );
    expect(svc.listVersions).toHaveBeenCalledWith(a, 'd1');
  });

  it('getVersionContent delega actor, id y versionId', async () => {
    await expect(
      controller.getVersionContent(a, 'd1', 'v1'),
    ).resolves.toBe('getVersionContent');
    expect(svc.getVersionContent).toHaveBeenCalledWith(a, 'd1', 'v1');
  });

  it('getCurrentContent delega actor e id', async () => {
    await expect(controller.getCurrentContent(a, 'd1')).resolves.toBe(
      'getCurrentContent',
    );
    expect(svc.getCurrentContent).toHaveBeenCalledWith(a, 'd1');
  });

  it('changeStatus delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.changeStatus(a, 'd1', dto)).resolves.toBe(
      'changeStatus',
    );
    expect(svc.changeStatus).toHaveBeenCalledWith(a, 'd1', dto);
  });
});
