import { SmtpConfigController } from './smtp-config.controller';
import { SmtpConfigService } from './smtp-config.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';

function actor(): CurrentActor {
  return {
    userId: 'u1',
    name: 'U',
    identifier: 'u@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.ADMIN]),
    scopedProcessIds: new Set(),
    isJefeArea: false,
    isAdmin: true,
  };
}

describe('SmtpConfigController (delegacion)', () => {
  const svc = {
    getCurrent: jest.fn().mockResolvedValue('getCurrent'),
    update: jest.fn().mockResolvedValue('update'),
    test: jest.fn().mockResolvedValue('test'),
  } as unknown as SmtpConfigService;
  const controller = new SmtpConfigController(svc);
  const a = actor();

  it('getCurrent delega en el service', async () => {
    await expect(controller.getCurrent()).resolves.toBe('getCurrent');
    expect(svc.getCurrent).toHaveBeenCalledWith();
  });

  it('update delega actor y dto', async () => {
    const dto = {} as never;
    await expect(controller.update(a, dto)).resolves.toBe('update');
    expect(svc.update).toHaveBeenCalledWith(a, dto);
  });

  it('test delega el dto', async () => {
    const dto = { to: 'x@demo.local' } as never;
    await expect(controller.test(dto)).resolves.toBe('test');
    expect(svc.test).toHaveBeenCalledWith(dto);
  });
});
