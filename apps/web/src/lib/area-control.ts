import { api } from './api-client';
import type { components } from '@plantilla-portales/api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Tipos del control del area derivados del contrato OpenAPI generado.
 * La fuente es packages/api-client; no se declaran interfaces manuales.
 */
export type AreaIndicators =
  components['schemas']['AreaIndicatorsResponseDto'];
export type IndicatorStatus = components['schemas']['IndicatorStatusDto'];
export type EvaluationTimeIndicator =
  components['schemas']['EvaluationTimeIndicatorDto'];
export type MilestoneComplianceIndicator =
  components['schemas']['MilestoneComplianceIndicatorDto'];
export type DeliveryTimeIndicator =
  components['schemas']['DeliveryTimeIndicatorDto'];
export type DeliveryTimeGroup =
  components['schemas']['DeliveryTimeGroupDto'];
export type BlocksIndicator = components['schemas']['BlocksIndicatorDto'];
export type BlockCause = components['schemas']['BlockCauseDto'];
export type FutureIndicator = components['schemas']['FutureIndicatorDto'];
export type DemandSummary =
  components['schemas']['DemandSummaryResponseDto'];
export type StateCount = components['schemas']['StateCountDto'];
export type BandCount = components['schemas']['BandCountDto'];

/** Filtro de periodo compartido por los dos endpoints de control del area. */
export interface PeriodFilter {
  from?: string;
  to?: string;
}

function periodQuery(filter: PeriodFilter): Record<string, string> {
  return {
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  };
}

/**
 * Indicadores del marco §9 (GET /area-control/indicators). Solo jefe/lider;
 * un integrante que fuerce la ruta recibe 403 (el backend es la autoridad).
 * El rango de fechas invalido devuelve 400.
 */
export async function getAreaIndicators(
  filter: PeriodFilter = {},
): Promise<AreaIndicators> {
  try {
    const { data, error, response } = await api.GET(
      '/area-control/indicators',
      { params: { query: periodQuery(filter) } },
    );
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/**
 * Panorama de demanda (GET /area-control/demand-summary). Accesible a los 3
 * roles; el alcance se aplica en el where del backend.
 */
export async function getDemandSummary(
  filter: PeriodFilter = {},
): Promise<DemandSummary> {
  try {
    const { data, error, response } = await api.GET(
      '/area-control/demand-summary',
      { params: { query: periodQuery(filter) } },
    );
    if (error || !data) {
      throw toApiError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
