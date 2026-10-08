import {
  api,
  type CatalogItem,
  type CreateCatalogItem,
  type UpdateCatalogItem,
} from './api-client';

/**
 * Error de dominio con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 */
export class CatalogError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 404:
      return 'El elemento no existe o fue removido.';
    case 409:
      return 'Ya existe un elemento con ese codigo en esta maestra.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

/**
 * Normaliza cualquier fallo (HTTP o de red) a un CatalogError entendible.
 */
function toCatalogError(status: number | undefined): CatalogError {
  if (status === undefined) {
    return new CatalogError(
      'No fue posible comunicarse con el servidor.',
    );
  }
  return new CatalogError(messageForStatus(status), status);
}

export interface CatalogFilters {
  catalog?: string;
  active?: boolean;
}

export async function listCatalogItems(
  filters: CatalogFilters = {},
): Promise<CatalogItem[]> {
  try {
    const { data, error, response } = await api.GET('/catalog-items', {
      params: {
        query: {
          ...(filters.catalog ? { catalog: filters.catalog } : {}),
          ...(filters.active !== undefined ? { active: filters.active } : {}),
        },
      },
    });
    if (error || !data) {
      throw toCatalogError(response.status);
    }
    return data as CatalogItem[];
  } catch (err) {
    if (err instanceof CatalogError) throw err;
    throw toCatalogError(undefined);
  }
}

export async function createCatalogItem(
  input: CreateCatalogItem,
): Promise<CatalogItem> {
  try {
    const { data, error, response } = await api.POST('/catalog-items', {
      body: input,
    });
    if (error || !data) {
      throw toCatalogError(response.status);
    }
    return data as CatalogItem;
  } catch (err) {
    if (err instanceof CatalogError) throw err;
    throw toCatalogError(undefined);
  }
}

export async function updateCatalogItem(
  id: string,
  input: UpdateCatalogItem,
): Promise<CatalogItem> {
  try {
    const { data, error, response } = await api.PATCH('/catalog-items/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toCatalogError(response.status);
    }
    return data as CatalogItem;
  } catch (err) {
    if (err instanceof CatalogError) throw err;
    throw toCatalogError(undefined);
  }
}
