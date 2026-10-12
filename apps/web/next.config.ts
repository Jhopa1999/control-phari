import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Salida "standalone" para imagenes de produccion pequenas: Next copia solo
  // las dependencias necesarias a .next/standalone. En un monorepo npm
  // workspaces hay que apuntar la raiz de rastreo de archivos al root del repo.
  output: 'standalone',
  outputFileTracingRoot: require('node:path').join(__dirname, '../../'),
  // Solo desarrollo: el indicador de Next tapaba el menú lateral abajo a la izquierda.
  devIndicators: { position: 'bottom-right' },
};

export default nextConfig;
