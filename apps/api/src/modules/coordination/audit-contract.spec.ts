import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListAuditEventsDto } from '../audit/dto/list-audit-events.dto';

/**
 * Contrato de auditoria (leccion 2, §1.6): cada objectType nuevo de Fase 5
 * (ampliado en AuditObjectType de audit.service.ts) DEBE ser aceptado por el
 * filtro `?objectType=` de GET /audit-events (OBJECT_TYPES del DTO), o el filtro
 * da 400 pese a registrarse el evento. Se valida via el DTO real (que usa
 * `@IsIn(OBJECT_TYPES)`), evitando mantener una copia del array.
 */
const FASE5_OBJECT_TYPES = [
  'DAILY_LOG',
  'DAILY_LOG_ACTIVITY',
  'WEEKLY_REPORT',
  'ISSUE',
  'MEETING',
  'COMMITMENT',
] as const;

describe('contrato AuditObjectType ⊆ OBJECT_TYPES (Fase 5)', () => {
  for (const objectType of FASE5_OBJECT_TYPES) {
    it(`el filtro acepta objectType=${objectType} sin error`, () => {
      const dto = plainToInstance(ListAuditEventsDto, { objectType });
      const errors = validateSync(dto);
      expect(errors).toHaveLength(0);
    });
  }

  it('rechaza un objectType inexistente (prueba de que el @IsIn esta activo)', () => {
    const dto = plainToInstance(ListAuditEventsDto, {
      objectType: 'NO_EXISTE',
    });
    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
