import { api } from './api-client';
import type { components } from '@plantilla-portales/api-client';
import { ApiError, toApiError } from './api-error';

export { ApiError };

/**
 * Tipos del dominio de gobierno derivados del contrato OpenAPI generado.
 * La fuente es packages/api-client; no se declaran interfaces manuales.
 */
export type GovernanceBoard =
  components['schemas']['GovernanceBoardResponseDto'];
export type GateCheck = components['schemas']['GateCheckResponseDto'];
export type GatePendingItem =
  components['schemas']['GatePendingItemResponseDto'];
export type GateValidationSummary =
  components['schemas']['GateValidationSummaryDto'];
export type ValidationRecord =
  components['schemas']['ValidationResponseDto'];
export type CreateValidation =
  components['schemas']['CreateValidationDto'];
export type CreatePendingItem =
  components['schemas']['CreatePendingItemDto'];
export type ResolvePendingItem =
  components['schemas']['ResolvePendingItemDto'];

/**
 * Codigos de gate conocidos (espejo del enum GateCode del backend). El backend
 * sigue siendo la autoridad: aqui solo se usan para ordenar/etiquetar la UI.
 */
export const GATE_ORDER = ['GC1', 'GC2', 'GC3', 'GC4', 'GC5'] as const;

/**
 * Obtiene el tablero de los 5 gates de una solicitud (GET /requests/:id/gates).
 * 404 fuera de alcance. El backend materializa y deriva los gates.
 */
export async function getGovernanceBoard(
  requestId: string,
): Promise<GovernanceBoard> {
  try {
    const { data, error, response } = await api.GET('/requests/{id}/gates', {
      params: { path: { id: requestId } },
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

/** Historial de validaciones de la solicitud (GET /requests/:id/validations). */
export async function listValidations(
  requestId: string,
): Promise<ValidationRecord[]> {
  try {
    const { data, error, response } = await api.GET(
      '/requests/{id}/validations',
      { params: { path: { id: requestId } } },
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
 * Registra una validacion (POST /requests/:id/validations). Registrar NO
 * aprueba ningun gate ni cambia el estado (BR-008): el backend es la autoridad.
 */
export async function createValidation(
  requestId: string,
  input: CreateValidation,
): Promise<ValidationRecord> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/validations',
      { params: { path: { id: requestId } }, body: input },
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
 * Resuelve un defecto bloqueante de una validacion
 * (PATCH /requests/:id/validations/:validationId/resolve-blocking).
 * Levanta el impedimento; no aprueba el gate ni cambia el estado (D-C5).
 */
export async function resolveBlocking(
  requestId: string,
  validationId: string,
  resolutionNote?: string,
): Promise<ValidationRecord> {
  try {
    const { data, error, response } = await api.PATCH(
      '/requests/{id}/validations/{validationId}/resolve-blocking',
      {
        params: { path: { id: requestId, validationId } },
        body: resolutionNote ? { resolutionNote } : {},
      },
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
 * Fija/cambia la ruta proporcional de la solicitud
 * (PUT /requests/:id/governance-route). Accion manual del lider (review).
 */
export async function setGovernanceRoute(
  requestId: string,
  route: string,
): Promise<GovernanceBoard> {
  try {
    const { data, error, response } = await api.PUT(
      '/requests/{id}/governance-route',
      { params: { path: { id: requestId } }, body: { route } },
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

/** Registra un faltante de un gate (POST .../gates/:gateCode/pending-items). */
export async function addPendingItem(
  requestId: string,
  gateCode: string,
  input: CreatePendingItem,
): Promise<GatePendingItem> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/gates/{gateCode}/pending-items',
      {
        params: { path: { id: requestId, gateCode } },
        body: input,
      },
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

/** Resuelve/edita un faltante (PATCH .../pending-items/:itemId). */
export async function resolvePendingItem(
  requestId: string,
  gateCode: string,
  itemId: string,
  input: ResolvePendingItem,
): Promise<GatePendingItem> {
  try {
    const { data, error, response } = await api.PATCH(
      '/requests/{id}/gates/{gateCode}/pending-items/{itemId}',
      {
        params: { path: { id: requestId, gateCode, itemId } },
        body: input,
      },
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

/** Aprueba un gate por la autoridad (POST .../gates/:gateCode/approve). */
export async function approveGate(
  requestId: string,
  gateCode: string,
  authorityNote?: string,
): Promise<GateCheck> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/gates/{gateCode}/approve',
      {
        params: { path: { id: requestId, gateCode } },
        body: authorityNote ? { authorityNote } : {},
      },
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

/** Marca un gate NO_APLICA con motivo (POST .../gates/:gateCode/waive). */
export async function waiveGate(
  requestId: string,
  gateCode: string,
  waiverReason: string,
): Promise<GateCheck> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/gates/{gateCode}/waive',
      {
        params: { path: { id: requestId, gateCode } },
        body: { waiverReason },
      },
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

/** Prepara GC4: EN_EJECUCION -> EN_VALIDACION (POST .../GC4/request-validation). */
export async function requestValidationStage(
  requestId: string,
  note?: string,
): Promise<GovernanceBoard> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/gates/GC4/request-validation',
      {
        params: { path: { id: requestId } },
        body: note ? { note } : {},
      },
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

/** Prepara GC4: EN_VALIDACION -> LISTA_PARA_LIBERAR (POST .../GC4/mark-ready). */
export async function markReadyStage(
  requestId: string,
  note?: string,
): Promise<GovernanceBoard> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/gates/GC4/mark-ready',
      {
        params: { path: { id: requestId } },
        body: note ? { note } : {},
      },
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

/** Prepara GC5: EN_ESTABILIZACION -> OPERATIVA (POST .../GC5/confirm-stabilization). */
export async function confirmStabilizationStage(
  requestId: string,
  note?: string,
): Promise<GovernanceBoard> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{id}/gates/GC5/confirm-stabilization',
      {
        params: { path: { id: requestId } },
        body: note ? { note } : {},
      },
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
