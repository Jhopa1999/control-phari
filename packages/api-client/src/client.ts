import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './generated/schema';

export interface ApiClientOptions {
  /**
   * URL base de la API (p. ej. "http://localhost:3001"). La proporciona el
   * consumidor; el paquete nunca la hardcodea ni conoce variables de entorno
   * especificas de ningun framework.
   */
  baseUrl: string;
  /**
   * Cabeceras por defecto opcionales para todas las peticiones.
   */
  headers?: Record<string, string>;
}

/**
 * Crea un cliente HTTP tipado a partir del contrato OpenAPI de la API.
 * Los tipos de rutas, parametros, cuerpos y respuestas provienen de los tipos
 * generados (`paths`), de modo que no se duplican contratos manualmente.
 */
export function createApiClient(options: ApiClientOptions): Client<paths> {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    headers: options.headers,
  });
}
