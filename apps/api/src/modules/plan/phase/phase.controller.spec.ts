import { PhaseController } from './phase.controller';
import { PhaseService } from './phase.service';
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
    isAdmin: false,
  };
}

describe('PhaseController (delegacion)', () => {
  const svc = {
    findForPlan: jest.fn().mockResolvedValue('findForPlan'),
    create: jest.fn().mockResolvedValue('create'),
    reorder: jest.fn().mockResolvedValue('reorder'),
    update: jest.fn().mockResolvedValue('update'),
    remove: jest.fn().mockResolvedValue(undefined),
  } as unknown as PhaseService;
  const controller = new PhaseController(svc);
  const a = actor();

  it('findForPlan delega actor y planId', async () => {
    await expect(controller.findForPlan(a, 'pl1')).resolves.toBe(
      'findForPlan',
    );
    expect(svc.findForPlan).toHaveBeenCalledWith(a, 'pl1');
  });

  it('create delega actor, planId y dto', async () => {
    const dto = {} as never;
    await expect(controller.create(a, 'pl1', dto)).resolves.toBe('create');
    expect(svc.create).toHaveBeenCalledWith(a, 'pl1', dto);
  });

  it('reorder delega actor, planId y dto', async () => {
    const dto = {} as never;
    await expect(controller.reorder(a, 'pl1', dto)).resolves.toBe('reorder');
    expect(svc.reorder).toHaveBeenCalledWith(a, 'pl1', dto);
  });

  it('update delega actor, planId, phaseId y dto', async () => {
    const dto = {} as never;
    await expect(controller.update(a, 'pl1', 'ph1', dto)).resolves.toBe(
      'update',
    );
    expect(svc.update).toHaveBeenCalledWith(a, 'pl1', 'ph1', dto);
  });

  it('remove delega actor, planId y phaseId', async () => {
    await expect(controller.remove(a, 'pl1', 'ph1')).resolves.toBeUndefined();
    expect(svc.remove).toHaveBeenCalledWith(a, 'pl1', 'ph1');
  });
});
