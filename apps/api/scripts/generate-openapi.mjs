#!/usr/bin/env node
/**
 * Genera el contrato OpenAPI (apps/api/openapi/openapi.json) desde el codigo
 * COMPILADO.
 *
 * Por que no se ejecuta src/generate-openapi.ts directamente con tsx: tsx usa
 * esbuild, que no emite los metadatos de decoradores (`emitDecoratorMetadata`).
 * Sin ellos NestJS no puede leer el tipo de un parametro `@Query() filtros: Dto`
 * y el OpenAPI omite todos sus filtros (y el cuerpo de /auth/login). Compilando
 * antes con tsc esos metadatos existen y el contrato queda completo. El cambio es
 * solo aditivo: no quita ni modifica operaciones, parametros ni esquemas.
 *
 * Pasos: tsc -> carpeta temporal .openapi-build -> node generate-openapi.js ->
 * se borra la carpeta temporal (siempre, aunque falle).
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(apiRoot, '.openapi-build');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

try {
  rmSync(outDir, { recursive: true, force: true });
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json', '--outDir', outDir], {
    cwd: apiRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, [resolve(outDir, 'generate-openapi.js')], {
    cwd: apiRoot,
    stdio: 'inherit',
  });
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
