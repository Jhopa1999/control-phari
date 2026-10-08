import { CurrentActor } from './current-actor';

/**
 * Token de inyeccion de la interfaz ActorResolver. El dia que exista auth real
 * se sustituye el provider (p. ej. uno que lea un JWT/sesion) sin tocar guards,
 * decorators ni servicios de dominio (design 3.2).
 */
export const ACTOR_RESOLVER = Symbol('ACTOR_RESOLVER');

/**
 * Resuelve la identidad de una peticion a un CurrentActor. Abstraccion detras
 * de la cual vive la capa de identidad (hoy, header de dev; manana, auth real).
 */
export interface ActorResolver {
  /**
   * Resuelve el actor a partir del valor crudo de identidad (hoy, el header
   * `X-Actor-Id`). Devuelve null si no hay identidad o el usuario no existe /
   * esta inactivo; el guard traduce ese null a 401.
   */
  resolve(rawIdentity: string | undefined): Promise<CurrentActor | null>;
}
