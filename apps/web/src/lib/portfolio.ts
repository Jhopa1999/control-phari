import { api } from './api-client';
import type { components, paths } from '@plantilla-portales/api-client';
import { ApiError, toApiError, apiErrorFrom } from './api-error';
import { readServerPage, type ServerPage } from './pagination';

export { ApiError };

/**
 * Item del portafolio derivado del contrato OpenAPI generado (SCR-07).
 * La fuente es packages/api-client; no se declaran interfaces manuales.
 */
export type PortfolioItem =
  components['schemas']['PortfolioItemResponseDto'];

/**
 * Filtros opcionales del portafolio. Intersectan el alcance que devuelve el
 * backend; nunca lo amplian (patron de capacity.listAssignments).
 */
type PortfolioListQuery = NonNullable<paths['/portfolio']['get']['parameters']['query']>;

export interface PortfolioFilters {
  /** Ids de proceso o `SIN_PROCESO`; varios se combinan con O. */
  mainProcessId?: string[];
  state?: string[];
  band?: string[];
}

/**
 * Lista las iniciativas del portafolio en alcance (GET /portfolio). Accesible
 * a los 3 roles; el alcance se impone en el where del backend. Cada filtro
 * admite varios valores (el cliente generado repite el parametro) que se
 * combinan con O; entre filtros, Y. Valores fuera de rango devuelven 400; un
 * proceso fuera de alcance intersecta a vacio (no 404).
 */
export async function listPortfolio(
  filters: PortfolioFilters = {},
): Promise<PortfolioItem[]> {
  return (await listPortfolioPage(filters)).rows;
}

/** Columnas por las que el servidor sabe ordenar el portafolio (lista blanca). */
export type PortfolioSortKey = NonNullable<PortfolioListQuery['sort']>;

/** Búsqueda (código y título), orden y página del listado del portafolio. */
export interface PortfolioPageQuery extends PortfolioFilters {
  q?: string;
  sort?: PortfolioSortKey;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * Una página del portafolio (GET /portfolio con page/pageSize). Sin página
 * devuelve todo el alcance filtrado con el tope de 1000 filas del servidor.
 */
export async function listPortfolioPage(
  filters: PortfolioPageQuery = {},
  signal?: AbortSignal,
): Promise<ServerPage<PortfolioItem>> {
  try {
    const { data, error, response } = await api.GET('/portfolio', {
      params: {
        query: {
          ...(filters.mainProcessId?.length ? { mainProcessId: filters.mainProcessId } : {}),
          ...(filters.state?.length ? { state: filters.state as PortfolioListQuery['state'] } : {}),
          ...(filters.band?.length ? { band: filters.band as PortfolioListQuery['band'] } : {}),
          ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
          ...(filters.sort ? { sort: filters.sort } : {}),
          ...(filters.dir ? { dir: filters.dir } : {}),
          ...(filters.page !== undefined ? { page: filters.page } : {}),
          ...(filters.pageSize !== undefined ? { pageSize: filters.pageSize } : {}),
        },
      },
      signal,
    });
    if (error || !data) {
      throw apiErrorFrom(response.status, error);
    }
    return readServerPage(data, response);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (signal?.aborted) throw err;
    throw toApiError(undefined);
  }
}
