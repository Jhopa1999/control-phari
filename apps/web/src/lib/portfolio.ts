import { api } from './api-client';
import type { components, paths } from '@plantilla-portales/api-client';
import { ApiError, toApiError } from './api-error';

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
  mainProcessId?: string;
  state?: string;
  band?: string;
}

/**
 * Lista las iniciativas del portafolio en alcance (GET /portfolio). Accesible
 * a los 3 roles; el alcance se impone en el where del backend. Filtros fuera de
 * rango devuelven 400; un proceso fuera de alcance intersecta a vacio (no 404).
 */
export async function listPortfolio(
  filters: PortfolioFilters = {},
): Promise<PortfolioItem[]> {
  try {
    const { data, error, response } = await api.GET('/portfolio', {
      params: {
        query: {
          ...(filters.mainProcessId
            ? { mainProcessId: filters.mainProcessId }
            : {}),
          ...(filters.state ? { state: filters.state as PortfolioListQuery['state'] } : {}),
          ...(filters.band ? { band: filters.band as PortfolioListQuery['band'] } : {}),
        },
      },
    });
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
