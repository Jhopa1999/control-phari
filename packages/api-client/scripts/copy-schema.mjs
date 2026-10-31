// Copia el schema de tipos generado (.d.ts) a dist/. tsc no emite archivos
// .d.ts de entrada hacia outDir, de modo que sin esta copia dist/index.d.ts
// referenciaria un ./generated/schema inexistente y los tipos del contrato
// (paths/components/operations) colapsarian a `any` en los consumidores.
//
// Ademas copia el contrato OpenAPI (generated/openapi.json) a dist/, para que
// el paquete lo exporte como "./openapi.json" (lo consume el MCP en runtime).
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

for (const file of ['schema.d.ts', 'openapi.json']) {
  const src = resolve(here, '../src/generated', file);
  const dest = resolve(here, '../dist/generated', file);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`[api-client] ${file} copiado -> ${dest}`);
}
