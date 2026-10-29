import { api, type TaskEvidence } from './api-client';
import { PlanError, serverMessage } from './plan';

/** Tamaño máximo que anuncia la UI; el backend es quien lo valida de verdad. */
export const EVIDENCE_MAX_MB = 8;

/** Extensiones que acepta el selector de archivos (el backend valida el tipo). */
export const EVIDENCE_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.log,.csv,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip';

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'El archivo no es válido: revisa el tipo y el tamaño.';
    case 403:
      return 'Solo el responsable de la tarea o el líder del proceso puede cambiar sus evidencias.';
    case 404:
      return 'La evidencia no existe o está fuera de tu alcance.';
    case 409:
      return 'El proyecto está cerrado y no admite cambios.';
    case 413:
      return `El archivo supera el tamaño máximo (${EVIDENCE_MAX_MB} MB).`;
    case 503:
      return 'El almacenamiento de archivos no está disponible. Avisa al administrador.';
    default:
      return 'Ocurrió un error al procesar la evidencia.';
  }
}

function toError(status: number | undefined, body?: unknown): PlanError {
  if (status === undefined) {
    return new PlanError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new PlanError(serverMessage(status, body) ?? messageForStatus(status), status);
}

/** Evidencias (archivos) de una tarea. */
export async function listTaskEvidence(taskId: string): Promise<TaskEvidence[]> {
  try {
    const { data, error, response } = await api.GET('/tasks/{taskId}/evidence', {
      params: { path: { taskId } },
    });
    if (error || !data) throw toError(response.status, error);
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toError(undefined);
  }
}

/** Sube un archivo (multipart) y devuelve la evidencia creada. */
export async function uploadTaskEvidence(taskId: string, file: File): Promise<TaskEvidence> {
  try {
    const { data, error, response } = await api.POST('/tasks/{taskId}/evidence', {
      params: { path: { taskId } },
      // El contrato tipa el binario como string; el serializador lo envia como File.
      body: { file: file as unknown as string },
      bodySerializer: (body) => {
        const form = new FormData();
        form.append('file', body.file as unknown as File);
        return form;
      },
    });
    if (error || !data) throw toError(response.status, error);
    return data;
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toError(undefined);
  }
}

/** Pide una URL temporal y abre la descarga en una pestaña nueva. */
export async function openTaskEvidence(taskId: string, evidenceId: string): Promise<void> {
  try {
    const { data, error, response } = await api.GET(
      '/tasks/{taskId}/evidence/{evidenceId}/download',
      { params: { path: { taskId, evidenceId } } },
    );
    if (error || !data) throw toError(response.status, error);
    window.open(data.url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toError(undefined);
  }
}

/** Quita una evidencia. */
export async function deleteTaskEvidence(taskId: string, evidenceId: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/tasks/{taskId}/evidence/{evidenceId}', {
      params: { path: { taskId, evidenceId } },
    });
    if (error) throw toError(response.status, error);
  } catch (err) {
    if (err instanceof PlanError) throw err;
    throw toError(undefined);
  }
}

/** Tamaño legible: 12 KB, 1,4 MB. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
