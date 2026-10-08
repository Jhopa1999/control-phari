import { createApiClient } from '@plantilla-portales/api-client';
import type { components } from '@plantilla-portales/api-client';

/**
 * Tipos del dominio derivados del contrato OpenAPI generado.
 * No se declaran interfaces manuales: la fuente es packages/api-client.
 */
export type CatalogItem = components['schemas']['CatalogItemResponseDto'];
export type CreateCatalogItem = components['schemas']['CreateCatalogItemDto'];
export type UpdateCatalogItem = components['schemas']['UpdateCatalogItemDto'];

/**
 * URL base de la API, leida de la configuracion publica del frontend.
 * No es un secreto (no contiene credenciales). Si falta, se produce un error
 * entendible en lugar de usar un valor hardcodeado.
 */
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!baseUrl) {
  throw new Error(
    'Falta la configuracion NEXT_PUBLIC_API_BASE_URL. Define la URL de la API ' +
      'en apps/web/.env.local (ver apps/web/.env.example).',
  );
}

/**
 * Instancia reutilizable del cliente tipado generado desde OpenAPI.
 */
export const api = createApiClient({ baseUrl });
