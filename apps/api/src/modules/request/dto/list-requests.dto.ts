import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  Validate,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import {
  MAX_FILTER_VALUES,
  PORTFOLIO_BANDS,
  UuidOrNoProcessConstraint,
  maxMessage,
  toArray,
} from '../../portfolio/dto/list-portfolio.dto';
import { REQUEST_SORT_KEYS, type RequestSortKey } from '../request-sort';
import { RequestState } from '../request-state';

/**
 * Filtros, búsqueda, orden y paginación opcionales de GET /requests (design
 * §3.4). `state` y `mainProcessId` aceptan un valor o varios (`?state=A&state=B`,
 * OR dentro de un filtro, AND entre filtros), como en el portafolio; un valor
 * único sigue funcionando igual que antes. `@IsEnum(RequestState)` valida SOLO
 * el filtro de lectura; la integridad de la escritura del estado la garantiza
 * RequestStateService, no este DTO. Todos los parámetros son opcionales: sin
 * ellos se devuelve el listado completo del alcance, con un tope de 1000 filas.
 */
export class ListRequestsDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({
    enum: REQUEST_SORT_KEYS,
    description:
      'Columna de orden: registeredAt (por defecto, descendente), code, title, state (orden del flujo), score (prioridad; sin evaluación al final). Empata por id.',
  })
  @IsOptional()
  @IsIn(REQUEST_SORT_KEYS as readonly string[], {
    message: 'sort debe ser registeredAt, code, title, state o score.',
  })
  sort?: RequestSortKey;
}
