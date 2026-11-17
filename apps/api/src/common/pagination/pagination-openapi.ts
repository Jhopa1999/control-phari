import type { HeadersObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  LIST_HARD_CAP,
  PAGE_HEADER,
  PAGE_SIZE_HEADER,
  TOTAL_COUNT_HEADER,
  TRUNCATED_HEADER,
} from './pagination';

/** Cabeceras de respuesta de un listado paginado, para `@ApiResponse({ headers })`. */
export const PAGINATION_RESPONSE_HEADERS: HeadersObject = {
  [TOTAL_COUNT_HEADER]: {
    description: 'Total de filas tras alcance, filtros y búsqueda (no solo la página).',
    schema: { type: 'integer' },
  },
  [PAGE_HEADER]: {
    description: 'Página servida (1 si no se pidió página).',
    schema: { type: 'integer' },
  },
  [PAGE_SIZE_HEADER]: {
    description: `Tamaño de la página servida (${LIST_HARD_CAP} si no se pidió página).`,
    schema: { type: 'integer' },
  },
  [TRUNCATED_HEADER]: {
    description: `true si no se pidió página y el listado superó el tope de ${LIST_HARD_CAP} filas.`,
    schema: { type: 'string', enum: ['true', 'false'] },
  },
};
