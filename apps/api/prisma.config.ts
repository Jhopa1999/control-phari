import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma ORM v7 ya no carga el .env automaticamente.
// Mantenemos una unica fuente de configuracion local: el .env de la raiz del
// monorepo. Lo cargamos explicitamente apuntando dos niveles por encima de
// apps/api, de modo que no se necesita un apps/api/.env duplicado. Si el .env
// no existe (p. ej. en el build de Docker o en CI), dotenv simplemente no hace
// nada y se usan las variables de entorno ya presentes.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../.env') });

// Se lee process.env.DATABASE_URL directamente (en vez del helper env() de
// prisma/config, que lanza error si la variable no existe). Asi `prisma
// generate` funciona sin base de datos (no la necesita), mientras que
// `prisma migrate deploy` recibe la URL real desde el entorno en despliegue.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
