import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildOpenApiConfig, configureApp } from './app.config';

// Mantenemos una unica fuente de configuracion local: el .env de la raiz del
// monorepo. NestJS no lo carga automaticamente, asi que lo cargamos aqui con
// dotenv (ruta explicita a la raiz) antes de crear la aplicacion. No se usa
// @nestjs/config porque dotenv ya es dependencia del backend y basta para
// cargar un unico .env sin configuracion adicional.
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  // bufferLogs retiene los logs de arranque hasta que pino queda activo como
  // logger de la app, de modo que nada se escribe con el logger por defecto.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Activar pino (nestjs-pino) como logger de la aplicacion. Esto es runtime
  // HTTP puro y vive SOLO en main.ts: el generador de OpenAPI crea la app con
  // { logger: false } y nunca llega aqui, de modo que el contrato sigue siendo
  // determinista.
  app.useLogger(app.get(Logger));

  // Configuracion compartida con el generador de OpenAPI.
  configureApp(app);

  // Swagger UI SOLO en desarrollo y de forma explicita (ENABLE_SWAGGER_UI=true).
  // Por defecto NO se expone, para no publicar el contrato en produccion.
  if (process.env.ENABLE_SWAGGER_UI === 'true') {
    const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  await app.listen(port);
  app.get(Logger).log(`API escuchando en http://localhost:${port}`);
}

void bootstrap();
