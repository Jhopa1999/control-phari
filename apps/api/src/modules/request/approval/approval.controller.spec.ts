import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { ROLES_KEY } from '../../auth/roles.decorator';

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

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BatchApprovalDto } from './dto/batch-approval.dto';

describe('ApprovalController (delegacion)', () => {
  const svc = {
    pendingApproval: jest.fn().mockResolvedValue('pendingApproval'),
    findForRequest: jest.fn().mockResolvedValue('findForRequest'),
    create: jest.fn().mockResolvedValue('create'),
    batchApprove: jest.fn().mockResolvedValue('batch'),
  } as unknown as ApprovalService;
  const controller = new ApprovalController(svc);
  const a = actor();

  it('pendingApproval delega el actor', async () => {
    await expect(controller.pendingApproval(a)).resolves.toBe(
      'pendingApproval',
    );
    expect(svc.pendingApproval).toHaveBeenCalledWith(a);
  });

  it('findForRequest delega actor e id', async () => {
    await expect(controller.findForRequest(a, 'r1')).resolves.toBe(
      'findForRequest',
    );
    expect(svc.findForRequest).toHaveBeenCalledWith(a, 'r1');
  });

  it('create delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, 'r1', dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, 'r1', dto);
  });

  it('batchApproval delega actor y requestIds', async () => {
    await expect(controller.batchApproval(a, { requestIds: ['x'] })).resolves.toBe('batch');
    expect(svc.batchApprove).toHaveBeenCalledWith(a, ['x']);
  });
});

/**
 * Autorizacion por rol (regla de negocio): la DECISION de aprobar/devolver es
 * exclusiva de JEFE_AREA, mientras que la lectura (cola e historico) sigue
 * disponible para JEFE_AREA y LIDER_PROCESO. El RolesGuard aplica la metadata
 * del metodo si existe (getAllAndOverride: metodo > clase), por lo que basta
 * con afirmar la metadata declarada en cada nivel.
 */
describe('ApprovalController (autorizacion por rol)', () => {
  it('la clase permite JEFE_AREA y LIDER_PROCESO (lectura)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ApprovalController) as
      | RoleCode[]
      | undefined;
    expect(roles).toEqual([RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO]);
  });

  it('POST :id/approval es exclusivo de JEFE_AREA (sobreescribe la clase)', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      ApprovalController.prototype.create,
    ) as RoleCode[] | undefined;
    expect(roles).toEqual([RoleCode.JEFE_AREA]);
  });

  it('los GET (cola e historico) no sobreescriben el rol de la clase', () => {
    const pending = Reflect.getMetadata(
      ROLES_KEY,
      ApprovalController.prototype.pendingApproval,
    );
    const history = Reflect.getMetadata(
      ROLES_KEY,
      ApprovalController.prototype.findForRequest,
    );
    expect(pending).toBeUndefined();
    expect(history).toBeUndefined();
  });
});

describe('POST requests/batch-approval', () => {
  it('es exclusivo de JEFE_AREA (el líder recibe 403)', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      ApprovalController.prototype.batchApproval,
    ) as RoleCode[] | undefined;
    expect(roles).toEqual([RoleCode.JEFE_AREA]);
  });

  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const check = async (requestIds: unknown) =>
    validate(plainToInstance(BatchApprovalDto, { requestIds }));

  it('acepta de 1 a 25 ids únicos', async () => {
    expect(await check([uuid(1)])).toHaveLength(0);
    expect(await check(Array.from({ length: 25 }, (_, i) => uuid(i + 1)))).toHaveLength(0);
  });

  it('rechaza lista vacía, repetidos, más de 25 e ids no UUID', async () => {
    expect(await check([])).not.toHaveLength(0);
    expect(await check([uuid(1), uuid(1)])).not.toHaveLength(0);
    expect(await check(Array.from({ length: 26 }, (_, i) => uuid(i + 1)))).not.toHaveLength(0);
    expect(await check(['no-es-uuid'])).not.toHaveLength(0);
    expect(await check(undefined)).not.toHaveLength(0);
  });
});