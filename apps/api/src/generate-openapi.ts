import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiConfig, configureApp } from './app.config';

// Cargamos el .env raiz igual que main.ts: PrismaService valida DATABASE_URL en
// su constructor. No se abre conexion a la base porque no llamamos a app.init()
// ni app.listen(), de modo que la generacion del contrato es determinista y no
// requiere PostgreSQL en ejecucion.
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Genera el contrato OpenAPI de forma determinista, sin levantar un servidor.
 *
 *   1. crea la aplicacion NestJS (sin init()/listen(), sin tocar la base)
 *   2. aplica la configuracion compartida
 *   3. construye el documento OpenAPI
 *   4. escribe apps/api/openapi/openapi.json
 *   5. cierra la aplicacion
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);

  const document = SwaggerModule.createDocument(app, buildOpenApiConfig());

  const outDir = path.resolve(__dirname, '../openapi');
  const outFile = path.join(outDir, 'openapi.json');
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();

  // eslint-disable-next-line no-console
  console.log(`OpenAPI generado en ${outFile}`);
}

void generate();
