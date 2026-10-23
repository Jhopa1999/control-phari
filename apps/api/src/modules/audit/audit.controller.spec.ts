import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

describe('AuditController (delegacion)', () => {
  const svc = {
    findMany: jest.fn().mockResolvedValue('findMany'),
  } as unknown as AuditService;
  const controller = new AuditController(svc);

  it('findMany delega actor y filtros', async () => {
    const a = actor();
    const filters = { take: 10 } as never;
    await expect(controller.findMany(a, filters)).resolves.toBe('findMany');
    expect(svc.findMany).toHaveBeenCalledWith(a, filters);
  });
});
