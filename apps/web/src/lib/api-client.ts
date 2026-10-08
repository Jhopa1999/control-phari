import { createApiClient } from '@plantilla-portales/api-client';
import type { components } from '@plantilla-portales/api-client';

/**
 * Tipos del dominio derivados del contrato OpenAPI generado.
 * No se declaran interfaces manuales: la fuente es packages/api-client.
 */
export type CatalogItem = components['schemas']['CatalogItemResponseDto'];
export type CreateCatalogItem = components['schemas']['CreateCatalogItemDto'];
export type UpdateCatalogItem = components['schemas']['UpdateCatalogItemDto'];

export type MyPermissions = components['schemas']['MyPermissionsResponseDto'];
export type MyGrant = components['schemas']['MyGrantDto'];
export type DevActor = components['schemas']['DevActorResponseDto'];
export type Process = components['schemas']['ProcessResponseDto'];
export type CreateProcess = components['schemas']['CreateProcessDto'];
export type UpdateProcess = components['schemas']['UpdateProcessDto'];
export type User = components['schemas']['UserResponseDto'];
export type CreateUser = components['schemas']['CreateUserDto'];
export type UpdateUser = components['schemas']['UpdateUserDto'];
export type Grant = components['schemas']['GrantResponseDto'];
export type CreateGrant = components['schemas']['CreateGrantDto'];
export type AuditEvent = components['schemas']['AuditEventResponseDto'];

/**
 * Clave de localStorage donde el selector de usuario (dev) guarda el
 * identifier del actor actual. Mecanismo exclusivo de desarrollo (design 3.2).
 */
export const ACTOR_STORAGE_KEY = 'actorId';

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

/**
 * Middleware de request: inyecta la cabecera X-Actor-Id leyendo el identifier
 * del actor seleccionado en localStorage en cada peticion (design 5.3). Usar un
 * middleware evita recrear el cliente al cambiar de usuario. Solo corre en el
 * navegador; en el servidor localStorage no existe y la cabecera se omite.
 */
api.use({
  onRequest({ request }) {
    if (typeof window === 'undefined') return request;
    const actorId = window.localStorage.getItem(ACTOR_STORAGE_KEY);
    if (actorId) {
      request.headers.set('X-Actor-Id', actorId);
    }
    return request;
  },
});
