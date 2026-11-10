import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { RequestState } from '../../request/request-state';

/** Centinela del filtro de proceso para las solicitudes sin proceso principal. */
export const NO_PROCESS_SENTINEL = 'SIN_PROCESO';

/**
 * Tope de valores por filtro de GET /portfolio. Holgado frente a los catalogos
 * reales (15 estados, 5 bandas, decenas de procesos) y suficiente para el caso
 * «todo menos uno»; evita consultas con listas arbitrariamente largas.
 */
export const MAX_FILTER_VALUES = 50;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida que `mainProcessId` sea un UUID o el literal centinela SIN_PROCESO
 * (solicitudes sin proceso, aun por triar). Relaja `@IsUUID` sin abrir el filtro
 * a texto libre. Se aplica a cada elemento del arreglo (`each: true`).
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
    return 'Cada valor de mainProcessId debe ser un UUID o el literal SIN_PROCESO.';
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
 * Parametro de consulta repetido (`?state=A&state=B`): un valor suelto se
 * convierte en arreglo de un elemento, asi un solo valor se comporta como antes.
 */
const toArray = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === null || Array.isArray(value)
    ? value
    : [value];

const maxMessage = (campo: string): string =>
  `El filtro ${campo} admite como máximo ${MAX_FILTER_VALUES} valores.`;

/**
 * Filtros opcionales de GET /portfolio (design §5.3). Cada filtro acepta uno o
 * varios valores (parametro repetido): OR dentro de un filtro, AND entre
 * filtros. INTERSECTAN con el alcance, nunca lo amplian (patron
 * `capacity.listAssignments`).
 */
export class ListPortfolioDto {
  @ApiPropertyOptional({
    type: String,
    isArray: true,
    maxItems: MAX_FILTER_VALUES,
    description: `Filtra por uno o varios procesos principales (UUID) o por el literal SIN_PROCESO para las solicitudes sin proceso asignado (aún por triar). Se repite el parámetro (?mainProcessId=a&mainProcessId=b); los valores se combinan con O. Máximo ${MAX_FILTER_VALUES} valores.`,
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray({ message: 'mainProcessId debe ser uno o varios valores.' })
  @ArrayMaxSize(MAX_FILTER_VALUES, { message: maxMessage('mainProcessId') })
  @Validate(UuidOrNoProcessConstraint, { each: true })
  mainProcessId?: string[];

  @ApiPropertyOptional({
    enum: RequestState,
    isArray: true,
    maxItems: MAX_FILTER_VALUES,
    description: `Filtra por uno o varios estados operativos (?state=A&state=B; se combinan con O). Máximo ${MAX_FILTER_VALUES} valores.`,
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray({ message: 'state debe ser uno o varios valores.' })
  @ArrayMaxSize(MAX_FILTER_VALUES, { message: maxMessage('state') })
  @IsEnum(RequestState, {
    each: true,
    message: 'Cada valor de state debe ser un estado operativo válido.',
  })
  state?: RequestState[];

  @ApiPropertyOptional({
    enum: PORTFOLIO_BANDS,
    isArray: true,
    maxItems: MAX_FILTER_VALUES,
    description: `Filtra por una o varias bandas de prioridad (P1..P4) o SIN_PRIORIZAR (?band=P1&band=SIN_PRIORIZAR; se combinan con O). Máximo ${MAX_FILTER_VALUES} valores.`,
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray({ message: 'band debe ser uno o varios valores.' })
  @ArrayMaxSize(MAX_FILTER_VALUES, { message: maxMessage('band') })
  @IsIn(PORTFOLIO_BANDS, {
    each: true,
    message: 'Cada valor de band debe ser P1, P2, P3, P4 o SIN_PRIORIZAR.',
  })
  band?: (typeof PORTFOLIO_BANDS)[number][];
}
