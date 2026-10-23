import { GateCheckController } from './gate-check.controller';
import { GateCheckService } from './gate-check.service';
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

describe('GateCheckController (delegacion)', () => {
  const svc = {
    getForRequest: jest.fn().mockResolvedValue('getForRequest'),
    addPendingItem: jest.fn().mockResolvedValue('addPendingItem'),
    resolvePendingItem: jest.fn().mockResolvedValue('resolvePendingItem'),
    advanceStage: jest.fn().mockResolvedValue('advanceStage'),
    approve: jest.fn().mockResolvedValue('approve'),
    waive: jest.fn().mockResolvedValue('waive'),
    block: jest.fn().mockResolvedValue('block'),
    unblock: jest.fn().mockResolvedValue('unblock'),
    setRoute: jest.fn().mockResolvedValue('setRoute'),
  } as unknown as GateCheckService;
  const controller = new GateCheckController(svc);
  const a = actor();

  it('getForRequest delega actor e id', async () => {
    await expect(controller.getForRequest(a, 'r1')).resolves.toBe(
      'getForRequest',
    );
    expect(svc.getForRequest).toHaveBeenCalledWith(a, 'r1');
  });

  it('addPendingItem delega actor, id, gateCode y dto', async () => {
    const dto = {} as never;
    await expect(
      controller.addPendingItem(a, 'r1', 'GC1', dto),
    ).resolves.toBe('addPendingItem');
    expect(svc.addPendingItem).toHaveBeenCalledWith(a, 'r1', 'GC1', dto);
  });

  it('resolvePendingItem delega actor, id, gateCode, itemId y dto', async () => {
    const dto = {} as never;
    await expect(
      controller.resolvePendingItem(a, 'r1', 'GC1', 'it1', dto),
    ).resolves.toBe('resolvePendingItem');
    expect(svc.resolvePendingItem).toHaveBeenCalledWith(
      a,
      'r1',
      'GC1',
      'it1',
      dto,
    );
  });

  it('requestValidation avanza la etapa request-validation', async () => {
    const dto = {} as never;
    await expect(
      controller.requestValidation(a, 'r1', dto),
    ).resolves.toBe('advanceStage');
    expect(svc.advanceStage).toHaveBeenCalledWith(
      a,
      'r1',
      'request-validation',
    );
  });

  it('markReady avanza la etapa mark-ready', async () => {
    const dto = {} as never;
    await expect(controller.markReady(a, 'r1', dto)).resolves.toBe(
      'advanceStage',
    );
    expect(svc.advanceStage).toHaveBeenCalledWith(a, 'r1', 'mark-ready');
  });

  it('confirmStabilization avanza la etapa confirm-stabilization', async () => {
    const dto = {} as never;
    await expect(
      controller.confirmStabilization(a, 'r1', dto),
    ).resolves.toBe('advanceStage');
    expect(svc.advanceStage).toHaveBeenCalledWith(
      a,
      'r1',
      'confirm-stabilization',
    );
  });

  it('approve delega actor, id, gateCode y dto', async () => {
    const dto = {} as never;
    await expect(controller.approve(a, 'r1', 'GC4', dto)).resolves.toBe(
      'approve',
    );
    expect(svc.approve).toHaveBeenCalledWith(a, 'r1', 'GC4', dto);
  });

  it('waive delega actor, id, gateCode y dto', async () => {
    const dto = {} as never;
    await expect(controller.waive(a, 'r1', 'GC2', dto)).resolves.toBe('waive');
    expect(svc.waive).toHaveBeenCalledWith(a, 'r1', 'GC2', dto);
  });

  it('block delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.block(a, 'r1', dto)).resolves.toBe('block');
    expect(svc.block).toHaveBeenCalledWith(a, 'r1', dto);
  });

  it('unblock delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.unblock(a, 'r1', dto)).resolves.toBe('unblock');
    expect(svc.unblock).toHaveBeenCalledWith(a, 'r1', dto);
  });

  it('setRoute delega actor, id y dto', async () => {
    const dto = {} as never;
    await expect(controller.setRoute(a, 'r1', dto)).resolves.toBe('setRoute');
    expect(svc.setRoute).toHaveBeenCalledWith(a, 'r1', dto);
  });
});
