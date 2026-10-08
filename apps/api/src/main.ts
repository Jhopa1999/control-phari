import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
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
  const app = await NestFactory.create(AppModule);

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
  // eslint-disable-next-line no-console
  console.log(`API escuchando en http://localhost:${port}`);
}

void bootstrap();
