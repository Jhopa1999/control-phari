import {
  api,
  type CreatePlan,
  type ImportPlanResult,
  type Plan,
  type PlanDocument,
  type PlanGuide,
  type ReturnPlan,
  type UpdatePlan,
} from './api-client';

/**
 * Error de dominio del plan, con mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 * Mismo criterio que lib/requests.ts / lib/approval.ts.
 */
export class PlanError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PlanError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 403:
      return 'No tienes permiso para esta acción.';
    case 404:
      return 'No existe o está fuera de tu alcance.';
    case 409:
      return 'El plan no cumple la precondición de esta fase.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

function toPlanError(status: number | undefined): PlanError {
  if (status === undefined) {
    return new PlanError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new PlanError(messageForStatus(status), status);
}

/**
 * Obtiene el plan de una solicitud (GET /requests/:requestId/plan).
 * 404 si la solicitud esta fuera de alcance o aun no tiene plan.
 */
export async function getPlan(requestId: string): Promise<Plan> {
  try {
    const { data, error, response } = await api.GET(
      '/requests/{requestId}/plan',
      { params: { path: { requestId } } },
    );
    if (error || !data) {
      throw toPlanError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPlanError(undefined);
  }
}

/**
 * Crea el plan de una solicitud COMPROMETIDA (POST /requests/:requestId/plan).
 * Lleva la solicitud a EN_PLANIFICACION; 409 si el estado no aplica o ya existe.
 */
export async function createPlan(
  requestId: string,
  input: CreatePlan,
): Promise<Plan> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{requestId}/plan',
      { params: { path: { requestId } }, body: input },
    );
    if (error || !data) {
      throw toPlanError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPlanError(undefined);
  }
}

/** Edita la ficha del plan (PATCH /requests/:requestId/plan). No toca status. */
export async function updatePlan(
  requestId: string,
  input: UpdatePlan,
): Promise<Plan> {
  try {
    const { data, error, response } = await api.PATCH(
      '/requests/{requestId}/plan',
      { params: { path: { requestId } }, body: input },
    );
    if (error || !data) {
      throw toPlanError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPlanError(undefined);
  }
}

/**
 * Guia de pendientes del plan (GET /requests/:requestId/plan/guide).
 * canSubmit=false mientras existan pendientes en categorias implementadas.
 */
export async function getPlanGuide(requestId: string): Promise<PlanGuide> {
  try {
    const { data, error, response } = await api.GET(
      '/requests/{requestId}/plan/guide',
      { params: { path: { requestId } } },
    );
    if (error || !data) {
      throw toPlanError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPlanError(undefined);
  }
}

/**
 * Envia el plan a autorizacion (POST /requests/:requestId/plan/submit).
 * 409 si la guia tiene pendientes (AC-007): el backend es el control real.
 */
export async function submitPlan(requestId: string): Promise<Plan> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{requestId}/plan/submit',
      { params: { path: { requestId } }, body: {} },
    );
    if (error || !data) {
      throw toPlanError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPlanError(undefined);
  }
}

/**
 * Autoriza el plan (POST /requests/:requestId/plan/authorize). Requiere rol
 * review; lleva la solicitud a EN_EJECUCION.
 */
export async function authorizePlan(requestId: string): Promise<Plan> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{requestId}/plan/authorize',
      { params: { path: { requestId } }, body: {} },
    );
    if (error || !data) {
      throw toPlanError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPlanError(undefined);
  }
}

/**
 * Devuelve el plan con motivo (POST /requests/:requestId/plan/return).
 * El motivo es obligatorio: si falta, el backend responde 400 (AC-031).
 */
export async function returnPlan(
  requestId: string,
  input: ReturnPlan,
): Promise<Plan> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{requestId}/plan/return',
      { params: { path: { requestId } }, body: input },
    );
    if (error || !data) {
      throw toPlanError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPlanError(undefined);
  }
}

/**
 * Exporta el plan como documento portable (GET /requests/:requestId/plan/export).
 * El backend arma el documento (sin responsables); el frontend solo lo consume.
 */
export async function exportPlan(requestId: string): Promise<PlanDocument> {
  try {
    const { data, error, response } = await api.GET(
      '/requests/{requestId}/plan/export',
      { params: { path: { requestId } } },
    );
    if (error || !data) {
      throw toPlanError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPlanError(undefined);
  }
}

/**
 * Importa un documento de plan (POST /requests/:requestId/plan/import). Reemplaza
 * el contenido del plan editable; el backend valida kind/version/refs/ciclos/hito
 * y responde 400/409 si no procede. Devuelve el resumen con `message`.
 */
export async function importPlan(
  requestId: string,
  doc: PlanDocument,
): Promise<ImportPlanResult> {
  try {
    const { data, error, response } = await api.POST(
      '/requests/{requestId}/plan/import',
      { params: { path: { requestId } }, body: doc },
    );
    if (error || !data) {
      throw toPlanError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toPlanError(undefined);
  }
}

/**
 * Arma y dispara la descarga del documento del plan como JSON en el navegador,
 * con el mismo patrón que downloadMarkdown de lib/documents.ts (Blob +
 * <a download> + revokeObjectURL). Nombre: `plan-<requestId>.json`.
 */
export function downloadPlanDocument(
  requestId: string,
  doc: PlanDocument,
): void {
  const fileName = `plan-${requestId}.json`;
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Lee un archivo elegido por el usuario y lo parsea como JSON. No valida la
 * forma del documento (eso lo hace el backend al importar); solo garantiza que
 * sea JSON legible. Lanza PlanError con mensaje claro si el archivo no es JSON.
 */
export async function parsePlanDocumentFile(file: File): Promise<unknown> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new PlanError('No fue posible leer el archivo. Inténtalo de nuevo.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new PlanError(
      'El archivo no es un JSON válido. Elige un documento de plan exportado desde aquí.',
    );
  }
}

// Etiquetas de PlanStatus: viven en el módulo puro status-labels.ts
// (design §7.9.2) y se reexportan aquí para que los consumidores no cambien.
export { PLAN_STATUS_LABELS, planStatusLabel } from './status-labels';
