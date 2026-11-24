import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';
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
    isLiderProceso: false,
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
    const filters = { page: 1, pageSize: 25, action: 'CREATE' } as never;
    await expect(controller.findMany(a, filters)).resolves.toBe('findMany');
    expect(svc.findMany).toHaveBeenCalledWith(a, filters);
  });

  it('findMany delega también los filtros de actor, fechas y proceso sin modificarlos', async () => {
    const a = actor();
    const filters = {
      actorUserId: '11111111-1111-4111-8111-111111111111',
      from: '2026-03-01',
      to: '2026-03-31',
      processId: '33333333-3333-4333-8333-333333333333',
    } as never;
    await controller.findMany(a, filters);
    expect(svc.findMany).toHaveBeenLastCalledWith(a, filters);
  });

  describe('validación de ListAuditEventsDto', () => {
    async function errorsOf(query: Record<string, string>): Promise<string[]> {
      const errors = await validate(plainToInstance(ListAuditEventsDto, query));
      return errors.map((e) => e.property);
    }

    it('acepta actor, proceso y fechas bien formados', async () => {
      await expect(
        errorsOf({
          actorUserId: '11111111-1111-4111-8111-111111111111',
          processId: '33333333-3333-4333-8333-333333333333',
          from: '2026-03-01',
          to: '2026-03-31',
        }),
      ).resolves.toEqual([]);
    });

    it('rechaza uuid mal formados y fechas con otro formato', async () => {
      await expect(
        errorsOf({ actorUserId: 'abc', processId: '123', from: '01/03/2026', to: '2026-3-1' }),
      ).resolves.toEqual(expect.arrayContaining(['actorUserId', 'processId', 'from', 'to']));
    });
  });
});
