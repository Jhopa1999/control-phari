import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Limite del cuerpo de la peticion. El contenido de un documento Markdown
 * admite hasta 200.000 caracteres (regla de negocio, Fase 6). El default de
 * Express (100kb) rechazaria con 413 un documento legitimo grande ANTES de que
 * el ValidationPipe aplique la regla de 200.000. Se eleva a 1mb para que la
 * validacion de negocio (MaxLength 200000) sea la que gobierne, dejando margen
 * para el resto del JSON y multibyte UTF-8.
 */
const BODY_LIMIT = '1mb';

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
  // Limite de cuerpo coherente con la regla de negocio del contenido Markdown
  // (200.000 caracteres); ver BODY_LIMIT. Usa la API tipada del adaptador
  // Express de NestJS (useBodyParser), disponible en el arranque real. El
  // generador de OpenAPI (generate-openapi.ts) crea la app sin adaptador HTTP
  // completo; el guard `typeof` evita fallar alli y mantiene una sola fuente de
  // configuracion.
  const expressApp = app as NestExpressApplication;
  if (typeof expressApp.useBodyParser === 'function') {
    expressApp.useBodyParser('json', { limit: BODY_LIMIT });
    expressApp.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });
  }

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
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
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
