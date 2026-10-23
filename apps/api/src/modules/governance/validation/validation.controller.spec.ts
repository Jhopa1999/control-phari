import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
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

describe('ValidationController (delegacion)', () => {
  const svc = {
    findForRequest: jest.fn().mockResolvedValue('findForRequest'),
    create: jest.fn().mockResolvedValue('create'),
    resolveBlocking: jest.fn().mockResolvedValue('resolveBlocking'),
  } as unknown as ValidationService;
  const controller = new ValidationController(svc);
  const a = actor();

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

  it('resolveBlocking delega actor, id, validationId y dto', async () => {
    const dto = {} as never;
    await expect(
      controller.resolveBlocking(a, 'r1', 'v1', dto),
    ).resolves.toBe('resolveBlocking');
    expect(svc.resolveBlocking).toHaveBeenCalledWith(a, 'r1', 'v1', dto);
  });
});
