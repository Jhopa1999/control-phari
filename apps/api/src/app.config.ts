import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Lee los origenes CORS permitidos desde CORS_ORIGINS (lista separada por
 * comas). Si no esta definida, NO se abre CORS a "*": se devuelve una lista
 * vacia y no se habilita CORS.
 */
function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Configuracion compartida de la aplicacion NestJS.
 *
 * La usan tanto el arranque real (main.ts) como el generador de OpenAPI
 * (generate-openapi.ts), de modo que el contrato se construye con exactamente
 * la misma configuracion que el runtime.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS configurable por CORS_ORIGINS. Solo se habilita si hay origenes
  // declarados explicitamente; nunca se abre a "*" por defecto y no se
  // habilitan credentials (todavia no hay necesidad).
  const corsOrigins = parseCorsOrigins();
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PATCH'],
    });
  }
}

/**
 * Metadata generica del contrato OpenAPI de la plantilla.
 */
export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('Plantilla Portales API')
    .setDescription('API estandar para portales internos')
    .setVersion('0.1.0')
    .build();
}
