import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, Validate } from 'class-validator';
import {
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { RequestState } from '../../request/request-state';

/** Centinela del filtro de proceso para las solicitudes sin proceso principal. */
export const NO_PROCESS_SENTINEL = 'SIN_PROCESO';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida que `mainProcessId` sea un UUID o el literal centinela SIN_PROCESO
 * (solicitudes sin proceso, aun por triar). Relaja `@IsUUID` sin abrir el filtro
 * a texto libre.
 */
@ValidatorConstraint({ name: 'uuidOrNoProcess' })
export class UuidOrNoProcessConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      (value === NO_PROCESS_SENTINEL || UUID_PATTERN.test(value))
    );
  }

  defaultMessage(): string {
    return 'mainProcessId debe ser un UUID o el literal SIN_PROCESO.';
  }
}

/** Bandas de prioridad validas para el filtro (incl. SIN_PRIORIZAR). */
export const PORTFOLIO_BANDS = [
  'P1',
  'P2',
  'P3',
  'P4',
  'SIN_PRIORIZAR',
] as const;

/**
 * Filtros opcionales de GET /portfolio (design §5.3). Mismos tipos que
 * `ListRequestsDto`; INTERSECTAN con el alcance, nunca lo amplian (patron
 * `capacity.listAssignments`).
 */
export class ListPortfolioDto {
  @ApiPropertyOptional({
    type: String,
    description:
      'Filtra por proceso principal (UUID) o por el literal SIN_PROCESO para las solicitudes sin proceso asignado (aun por triar).',
  })
  @IsOptional()
  @IsString()
  @Validate(UuidOrNoProcessConstraint)
  mainProcessId?: string;

  @ApiPropertyOptional({ enum: RequestState, description: 'Filtra por estado operativo.' })
  @IsOptional()
  @IsEnum(RequestState)
  state?: RequestState;

  @ApiPropertyOptional({
    enum: PORTFOLIO_BANDS,
    description: 'Filtra por banda de prioridad o SIN_PRIORIZAR.',
  })
  @IsOptional()
  @IsIn(PORTFOLIO_BANDS)
  band?: (typeof PORTFOLIO_BANDS)[number];
}
