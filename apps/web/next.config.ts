import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Origen de la API si `NEXT_PUBLIC_API_BASE_URL` es absoluta (desarrollo:
 * http://localhost:3101). En producción es `/api` (mismo origen) y no añade nada.
 */
function apiOrigin(): string | null {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null; // ruta relativa («/api»): mismo origen, cubierto por 'self'.
  }
}

/**
 * Content-Security-Policy de la web (docs/design/sesion-cookie-httponly.md §9.2).
 *
 * 'unsafe-inline' en script-src: Next emite scripts en línea para el arranque y
 * la hidratación y next-themes inyecta un script anti-parpadeo; quitarlo exige
 * nonces por petición (renderizado dinámico de todas las rutas), cambio fuera
 * de alcance. La protección del token la da la cookie HttpOnly, no la CSP.
 * 'unsafe-inline' en style-src: Tailwind/Radix/Next usan atributos style.
 * 'unsafe-eval' y ws: solo en desarrollo (React/Next en `next dev` y HMR).
 * img-src https: porque react-markdown pinta imágenes remotas de los documentos
 * y las URL prefirmadas de S3 tienen host variable; blob: por las vistas
 * previas de adjuntos.
 */
function contentSecurityPolicy(): string {
  const api = apiOrigin();
  const connect = ["'self'", ...(api ? [api] : []), ...(isDev ? ['ws:', 'wss:'] : [])];
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    'img-src \'self\' data: blob: https:',
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
  ];
  return directives.join('; ');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Quita la cabecera `x-powered-by: Next.js`.
  poweredByHeader: false,
  // Salida "standalone" para imagenes de produccion pequenas: Next copia solo
  // las dependencias necesarias a .next/standalone. En un monorepo npm
  // workspaces hay que apuntar la raiz de rastreo de archivos al root del repo.
  output: 'standalone',
  outputFileTracingRoot: require('node:path').join(__dirname, '../../'),
  // Solo desarrollo: el indicador de Next tapaba el menú lateral abajo a la izquierda.
  devIndicators: { position: 'bottom-right' },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
      {
        // HSTS solo si la petición llegó por https (el nginx pasa X-Forwarded-Proto).
        // Sin includeSubDomains ni preload: el dominio de producción es provisional.
        source: '/:path*',
        has: [{ type: 'header', key: 'x-forwarded-proto', value: 'https' }],
        headers: [{ key: 'Strict-Transport-Security', value: 'max-age=15552000' }],
      },
    ];
  },
};

export default nextConfig;
