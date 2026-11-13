import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
// El scheduler de avisos de compromisos importa `@nestjs/schedule` (ESM): se
// mockea como en recurring-activity.module.spec.ts (solo se inspecciona metadata).
jest.mock('@nestjs/schedule', () => ({
  SchedulerRegistry: class {},
  ScheduleModule: { forRoot: () => ({}) },
}));
import { CoordinationModule } from './coordination.module';
import { WorklogController } from './worklog/worklog.controller';
import { MeetingController } from './meeting/meeting.controller';
import { CommitmentController } from './commitment/commitment.controller';
import { CoordinationScopeService } from './coordination-scope.service';
import { WorkflowStateService } from './workflow-state.service';
import { WorklogService } from './worklog/worklog.service';
import { MeetingService } from './meeting/meeting.service';
import { CommitmentService } from './commitment/commitment.service';
import { WorklogSuggestionService } from './worklog/worklog-suggestion.service';
import { CommitmentNoticeService } from './commitment/commitment-notice.service';

/**
 * Contrato de registro del modulo coordination (patron capacity.module.spec.ts):
 * los 4 controllers y sus services (mas los helpers de alcance/estado) estan
 * registrados. Las rutas estaticas no colisionan con las parametricas (prefijos
 * propios por recurso, design §3.2); el WorklogController se registra primero.
 */
describe('CoordinationModule', () => {
  const controllers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CoordinationModule) ?? [];
  const providers: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CoordinationModule) ?? [];

  it('registra los 4 controllers', () => {
    expect(controllers).toContain(WorklogController);
    expect(controllers).toContain(MeetingController);
    expect(controllers).toContain(CommitmentController);
  });

  it('registra WorklogController primero (precaucion de routing, D0/MEDIUM-2)', () => {
    expect(controllers[0]).toBe(WorklogController);
  });

  it('registra los services de alcance/estado y los 4 de dominio', () => {
    expect(providers).toContain(CoordinationScopeService);
    expect(providers).toContain(WorkflowStateService);
    expect(providers).toContain(WorklogService);
    expect(providers).toContain(MeetingService);
    expect(providers).toContain(CommitmentService);
    expect(providers).toContain(WorklogSuggestionService);
    expect(providers).toContain(CommitmentNoticeService);
  });
});
