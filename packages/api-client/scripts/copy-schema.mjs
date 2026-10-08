// Copia el schema de tipos generado (.d.ts) a dist/. tsc no emite archivos
// .d.ts de entrada hacia outDir, de modo que sin esta copia dist/index.d.ts
// referenciaria un ./generated/schema inexistente y los tipos del contrato
// (paths/components/operations) colapsarian a `any` en los consumidores.
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../src/generated/schema.d.ts');
const dest = resolve(here, '../dist/generated/schema.d.ts');

await mkdir(dirname(dest), { recursive: true });
await copyFile(src, dest);

console.log(`[api-client] schema copiado -> ${dest}`);
