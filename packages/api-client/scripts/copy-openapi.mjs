// Copia el contrato OpenAPI de la API (fuente de verdad) a src/generated/ para
// que el api-client lo entregue en runtime (p. ej. al MCP). Los Dockerfiles de
// mcp y web solo copian packages/api-client: apps/api no esta en su contexto.
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../../apps/api/openapi/openapi.json');
const dest = resolve(here, '../src/generated/openapi.json');

await mkdir(dirname(dest), { recursive: true });
await copyFile(src, dest);

console.log(`[api-client] contrato OpenAPI copiado -> ${dest}`);
