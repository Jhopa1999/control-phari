import {
  api,
  type ChangeDocumentStatus,
  type CreateDocument,
  type CreateDocumentVersion,
  type Document,
  type DocumentContent,
  type DocumentVersion,
  type UpdateDocument,
} from './api-client';

/**
 * Error de dominio de documentos con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 */
export class DocumentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos o la transicion solicitada.';
    case 403:
      return 'No tienes acceso a esta accion.';
    case 404:
      return 'El documento no existe o esta fuera de tu alcance.';
    case 409:
      return 'El documento entra en conflicto con otra version.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

/** Normaliza cualquier fallo (HTTP o de red) a un DocumentError entendible. */
function toDocumentError(status: number | undefined): DocumentError {
  if (status === undefined) {
    return new DocumentError('No fue posible comunicarse con el servidor.');
  }
  return new DocumentError(messageForStatus(status), status);
}

/** Documentos en alcance (GET /documents). Sin contenido; filtra el backend. */
export async function listDocuments(): Promise<Document[]> {
  try {
    const { data, error, response } = await api.GET('/documents');
    if (error || !data) {
      throw toDocumentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw toDocumentError(undefined);
  }
}

/** Detalle de un documento (GET /documents/:id). */
export async function getDocument(id: string): Promise<Document> {
  try {
    const { data, error, response } = await api.GET('/documents/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toDocumentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw toDocumentError(undefined);
  }
}

/** Crea un documento con su version 1 (POST /documents, 201). */
export async function createDocument(
  input: CreateDocument,
): Promise<Document> {
  try {
    const { data, error, response } = await api.POST('/documents', {
      body: input,
    });
    if (error || !data) {
      throw toDocumentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw toDocumentError(undefined);
  }
}

/** Edita los metadatos del documento; no toca contenido/estado (PATCH). */
export async function updateDocument(
  id: string,
  input: UpdateDocument,
): Promise<Document> {
  try {
    const { data, error, response } = await api.PATCH('/documents/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toDocumentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw toDocumentError(undefined);
  }
}

/** Crea una nueva version de contenido (POST /documents/:id/versions, 201). */
export async function createDocumentVersion(
  id: string,
  input: CreateDocumentVersion,
): Promise<Document> {
  try {
    const { data, error, response } = await api.POST(
      '/documents/{id}/versions',
      {
        params: { path: { id } },
        body: input,
      },
    );
    if (error || !data) {
      throw toDocumentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw toDocumentError(undefined);
  }
}

/** Historial de versiones del documento, sin contenido (GET /versions). */
export async function listDocumentVersions(
  id: string,
): Promise<DocumentVersion[]> {
  try {
    const { data, error, response } = await api.GET(
      '/documents/{id}/versions',
      {
        params: { path: { id } },
      },
    );
    if (error || !data) {
      throw toDocumentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw toDocumentError(undefined);
  }
}

/** Contenido de una version concreta (GET /versions/:versionId/content). */
export async function getVersionContent(
  id: string,
  versionId: string,
): Promise<DocumentContent> {
  try {
    const { data, error, response } = await api.GET(
      '/documents/{id}/versions/{versionId}/content',
      {
        params: { path: { id, versionId } },
      },
    );
    if (error || !data) {
      throw toDocumentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw toDocumentError(undefined);
  }
}

/** Contenido de la version vigente (GET /documents/:id/content). */
export async function getCurrentContent(
  id: string,
): Promise<DocumentContent> {
  try {
    const { data, error, response } = await api.GET('/documents/{id}/content', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toDocumentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw toDocumentError(undefined);
  }
}

/** Cambia el estado del documento (POST /documents/:id/status, 200). */
export async function changeDocumentStatus(
  id: string,
  input: ChangeDocumentStatus,
): Promise<Document> {
  try {
    const { data, error, response } = await api.POST(
      '/documents/{id}/status',
      {
        params: { path: { id } },
        body: input,
      },
    );
    if (error || !data) {
      throw toDocumentError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw toDocumentError(undefined);
  }
}

/**
 * Convierte un titulo en un slug seguro para nombre de archivo:
 * minusculas, sin acentos, separadores a guion. Fallback 'documento'.
 */
function slug(title: string): string {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '');
  return normalized || 'documento';
}

/**
 * Arma y dispara la descarga de un archivo .md en el navegador a partir del
 * contenido devuelto por la API (/content). El backend NO genera el adjunto:
 * se construye un Blob 'text/markdown' en el cliente (design §3, SCR-16).
 * El nombre es `${slug(title)}-v${versionNumber}.md`.
 */
export function downloadMarkdown(
  doc: Pick<Document, 'title'>,
  content: DocumentContent,
): void {
  const title = content.title || doc.title;
  const fileName = `${slug(title)}-v${content.versionNumber}.md`;
  const blob = new Blob([content.content], {
    type: 'text/markdown;charset=utf-8',
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
