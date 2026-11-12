/**
 * Cabeceras de seguridad HTTP de la API (BL-017). Middleware propio y pequeño
 * (no se añade helmet): la API solo devuelve JSON, SSE o ficheros.
 *
 * Se fijan ANTES de la ruta con setHeader, de modo que un controlador que
 * defina la misma cabecera (p. ej. el SSE del asistente) la sobrescribe.
 */

/** HSTS de 180 dias, sin includeSubDomains ni preload (dominio provisional). */
export const HSTS_VALUE = 'max-age=15552000';

/** CSP de la API: solo devuelve datos, nunca documentos. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

interface HeaderRequest {
  secure?: boolean;
  path?: string;
  url?: string;
}

interface HeaderResponse {
  setHeader(name: string, value: string): unknown;
}

/** Swagger UI (/docs) necesita cargar scripts y estilos: sin CSP restrictiva. */
function isDocsPath(req: HeaderRequest): boolean {
  const path = req.path ?? req.url ?? '';
  return path === '/docs' || path.startsWith('/docs/');
}

export function securityHeadersMiddleware(
  req: HeaderRequest,
  res: HeaderResponse,
  next: () => void,
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!isDocsPath(req)) {
    res.setHeader('Content-Security-Policy', API_CSP);
  }
  if (req.secure === true) {
    res.setHeader('Strict-Transport-Security', HSTS_VALUE);
  }
  next();
}
