import {
  api,
  type Asset,
  type ChangeAssetStatus,
  type CreateAsset,
  type UpdateAsset,
} from './api-client';

/**
 * Error de dominio de activos con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 */
export class AssetError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AssetError';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos o la transicion solicitada.';
    case 403:
      return 'No tienes acceso a esta accion.';
    case 404:
      return 'El activo no existe o esta fuera de tu alcance.';
    case 409:
      return 'El activo entra en conflicto con otro existente.';
    default:
      return 'Ocurrio un error al procesar la solicitud.';
  }
}

/** Normaliza cualquier fallo (HTTP o de red) a un AssetError entendible. */
function toAssetError(status: number | undefined): AssetError {
  if (status === undefined) {
    return new AssetError('No fue posible comunicarse con el servidor.');
  }
  return new AssetError(messageForStatus(status), status);
}

/** Activos en alcance (GET /assets). El backend filtra por alcance. */
export async function listAssets(): Promise<Asset[]> {
  try {
    const { data, error, response } = await api.GET('/assets');
    if (error || !data) {
      throw toAssetError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof AssetError) throw err;
    throw toAssetError(undefined);
  }
}

/** Detalle de un activo (GET /assets/:id). */
export async function getAsset(id: string): Promise<Asset> {
  try {
    const { data, error, response } = await api.GET('/assets/{id}', {
      params: { path: { id } },
    });
    if (error || !data) {
      throw toAssetError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof AssetError) throw err;
    throw toAssetError(undefined);
  }
}

/** Crea un activo; nace en BORRADOR (POST /assets, 201). */
export async function createAsset(input: CreateAsset): Promise<Asset> {
  try {
    const { data, error, response } = await api.POST('/assets', {
      body: input,
    });
    if (error || !data) {
      throw toAssetError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof AssetError) throw err;
    throw toAssetError(undefined);
  }
}

/** Edita los metadatos de un activo (PATCH /assets/:id, 200 + DTO). */
export async function updateAsset(
  id: string,
  input: UpdateAsset,
): Promise<Asset> {
  try {
    const { data, error, response } = await api.PATCH('/assets/{id}', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toAssetError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof AssetError) throw err;
    throw toAssetError(undefined);
  }
}

/** Cambia el estado de un activo (POST /assets/:id/status, 200). */
export async function changeAssetStatus(
  id: string,
  input: ChangeAssetStatus,
): Promise<Asset> {
  try {
    const { data, error, response } = await api.POST('/assets/{id}/status', {
      params: { path: { id } },
      body: input,
    });
    if (error || !data) {
      throw toAssetError(response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof AssetError) throw err;
    throw toAssetError(undefined);
  }
}
