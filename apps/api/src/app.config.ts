import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder } from '@nestjs/swagger';
import { securityHeadersMiddleware } from './security/security-headers.middleware';

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
export function parseCorsOrigins(
  raw = process.env.CORS_ORIGINS,
  nodeEnv = process.env.NODE_ENV,
  logger: Pick<Logger, 'error'> = new Logger('Cors'),
): string[] {
  if (!raw) {
    return [];
  }
  const entries = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  // "*" es incompatible con credenciales (cookie de sesion). En produccion se
  // descarta con un error en log (no se aborta el arranque para no provocar un
  // bucle de reinicio); fuera de produccion falla pronto con mensaje claro.
  if (entries.includes('*')) {
    const message =
      'CORS_ORIGINS contiene "*", incompatible con credenciales; usa origenes explicitos.';
    if (nodeEnv !== 'production') {
      throw new Error(message);
    }
    logger.error(`${message} Se descarta "*".`);
  }
  return entries.filter((origin) => origin !== '*');
}

/** Cabeceras de peticion permitidas en CORS (las unicas que manda la web). */
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Actor-Id',
  'X-Portal-Csrf',
];

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

  // Detras de nginx (loopback / redes privadas de Docker) req.secure refleja
  // X-Forwarded-Proto, de lo que depende el atributo Secure de la cookie.
  // Cabeceras de seguridad propias y sin x-powered-by (guard typeof: el
  // generador de OpenAPI crea la app sin adaptador HTTP completo).
  if (typeof expressApp.set === 'function') {
    expressApp.set('trust proxy', 'loopback, linklocal, uniquelocal');
  }
  if (typeof expressApp.disable === 'function') {
    expressApp.disable('x-powered-by');
  }
  if (typeof expressApp.use === 'function') {
    expressApp.use(securityHeadersMiddleware);
  }

  // CORS configurable por CORS_ORIGINS. Solo se habilita si hay origenes
  // declarados explicitamente; nunca "*". Con origenes explicitos se permiten
  // credenciales (cookie de sesion) unicamente para esa lista.
  const corsOrigins = parseCorsOrigins();
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: CORS_ALLOWED_HEADERS,
    });
  }
}

/**
 * Metadata del contrato OpenAPI del portal Control PHARI.
 *
 * Las descripciones de cada tag se declaran aqui (y no renombrando los
 * identificadores de @ApiTags de los controllers) para no romper el contrato
 * ni el cliente TypeScript generado a partir de OpenAPI: el nombre del tag es
 * parte del contrato. El primer argumento de .addTag() coincide EXACTAMENTE
 * con el valor usado en @ApiTags del controller correspondiente.
 */
export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('API Control PHARI')
    .setDescription(
      'API del portal interno Control PHARI para la gestion de solicitudes, ' +
        'planes, gobernanza y recursos del area.',
    )
    .setVersion('0.1.0')
    .addTag('users', 'Gestion de usuarios e identidades funcionales (solo JEFE_AREA).')
    .addTag('auth', 'Autenticacion: inicio de sesion, restablecimiento y activacion de contrasena.')
    .addTag('audit', 'Eventos de auditoria del sistema, con alcance segun el rol.')
    .addTag('health', 'Estado de salud del servicio.')
    .addTag('capacity', 'Capacidad del equipo: disponibilidad y asignacion de horas por persona y mes.')
    .addTag('requests', 'Solicitudes: registro y ficha dentro del alcance del actor.')
    .addTag('triage', 'Triage de solicitudes.')
    .addTag('priority', 'Priorizacion de solicitudes.')
    .addTag('approval', 'Aprobacion de solicitudes.')
    .addTag('grants', 'Concesion de permisos (grants) a usuarios dentro del alcance del jefe.')
    .addTag('processes', 'Procesos de negocio (solo JEFE_AREA).')
    .addTag('catalog-items', 'Maestras y catalogos configurables.')
    .addTag('plan', 'Planes asociados a las solicitudes.')
    .addTag('plan-phases', 'Fases de un plan.')
    .addTag('tasks', 'Tareas del plan.')
    .addTag('task-dependencies', 'Dependencias entre tareas.')
    .addTag('governance-gates', 'Compuertas de gobernanza (gates) de las solicitudes.')
    .addTag('governance-validations', 'Validaciones de gobernanza de las solicitudes.')
    .addTag('worklog', 'Registro de trabajo (worklog).')
    .addTag('commitments', 'Compromisos de coordinacion.')
    .addTag('meetings', 'Reuniones y sus participantes.')
    .addTag('assets', 'Activos de conocimiento.')
    .addTag('documents', 'Documentos y sus versiones.')
    .addTag('portfolio', 'Portafolio de solicitudes dentro del alcance.')
    .addTag('area-control', 'Control de area.')
    .addTag('admin-smtp', 'Administracion de la configuracion SMTP (solo ADMIN).')
    .addTag('admin-users', 'Administracion de usuarios y su rol de ADMIN (solo ADMIN).')
    .addTag('me', 'Datos del usuario autenticado y sus capacidades/menu.')
    .addTag('dev', 'Utilidades de desarrollo (solo activas en modo dev).')
    .build();
}
