import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';
import { CapacityScopeService } from './capacity-scope.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

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

describe('CapacityController (delegacion)', () => {
  const capacityService = {
    summary: jest.fn().mockResolvedValue('summary'),
    listAvailability: jest.fn().mockResolvedValue('listAvailability'),
    createAvailability: jest.fn().mockResolvedValue('createAvailability'),
    updateAvailability: jest.fn().mockResolvedValue('updateAvailability'),
    listAssignments: jest.fn().mockResolvedValue('listAssignments'),
    createAssignment: jest.fn().mockResolvedValue('createAssignment'),
    updateAssignment: jest.fn().mockResolvedValue('updateAssignment'),
    removeAssignment: jest.fn().mockResolvedValue(undefined),
  } as unknown as CapacityService;
  const scopeService = {
    listPeople: jest.fn().mockResolvedValue('people'),
  } as unknown as CapacityScopeService;
  const controller = new CapacityController(capacityService, scopeService);
  const a = actor();

  it('summary delega en capacityService', async () => {
    const query = { month: '2025-03' } as never;
    await expect(controller.summary(a, query)).resolves.toBe('summary');
    expect(capacityService.summary).toHaveBeenCalledWith(a, query);
  });

  it('people delega en scopeService', async () => {
    await expect(controller.people(a)).resolves.toBe('people');
    expect(scopeService.listPeople).toHaveBeenCalledWith(a);
  });

  it('listAvailability delega actor y filtros', async () => {
    const filters = { month: '2025-03' } as never;
    await expect(controller.listAvailability(a, filters)).resolves.toBe(
      'listAvailability',
    );
    expect(capacityService.listAvailability).toHaveBeenCalledWith(a, filters);
  });

  it('createAvailability delega actor y dto', async () => {
    const dto = { userId: 'x' } as never;
    await expect(controller.createAvailability(a, dto)).resolves.toBe(
      'createAvailability',
    );
    expect(capacityService.createAvailability).toHaveBeenCalledWith(a, dto);
  });

  it('updateAvailability delega actor, id y dto', async () => {
    const dto = { hours: 1 } as never;
    await expect(controller.updateAvailability(a, 'av1', dto)).resolves.toBe(
      'updateAvailability',
    );
    expect(capacityService.updateAvailability).toHaveBeenCalledWith(
      a,
      'av1',
      dto,
    );
  });

  it('listAssignments delega actor y filtros', async () => {
    const filters = { month: '2025-03' } as never;
    await expect(controller.listAssignments(a, filters)).resolves.toBe(
      'listAssignments',
    );
    expect(capacityService.listAssignments).toHaveBeenCalledWith(a, filters);
  });

  it('createAssignment delega actor y dto', async () => {
    const dto = { processId: 'p1' } as never;
    await expect(controller.createAssignment(a, dto)).resolves.toBe(
      'createAssignment',
    );
    expect(capacityService.createAssignment).toHaveBeenCalledWith(a, dto);
  });

  it('updateAssignment delega actor, id y dto', async () => {
    const dto = { hours: 2 } as never;
    await expect(controller.updateAssignment(a, 'as1', dto)).resolves.toBe(
      'updateAssignment',
    );
    expect(capacityService.updateAssignment).toHaveBeenCalledWith(
      a,
      'as1',
      dto,
    );
  });

  it('removeAssignment delega actor e id', async () => {
    await expect(
      controller.removeAssignment(a, 'as1'),
    ).resolves.toBeUndefined();
    expect(capacityService.removeAssignment).toHaveBeenCalledWith(a, 'as1');
  });
});
