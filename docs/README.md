# docs

Documentacion y decisiones tecnicas de la plantilla de portales.

## Indice de documentacion

- **[manual-uso-plantilla.md](manual-uso-plantilla.md)** — Manual de Uso de la
  Plantilla: guia operativa para el equipo (crear un portal nuevo, levantarlo,
  trabajar con Kiro, desarrollar funcionalidades, migraciones, contratos,
  pruebas, Git/PR, CI y despliegue). Empieza aqui si vas a usar la plantilla.
- **[deployment.md](deployment.md)** — Manual de despliegue a produccion
  (Docker Compose, Nginx, variables, migraciones, start/stop, logs, backup,
  rollback, HTTPS).
- Este archivo (`README.md`) — decisiones tecnicas registradas durante la
  construccion de la plantilla.

## Decisiones registradas

### Versiones del stack (andamiaje inicial)

- Node.js: >= 20.9.0 (desarrollado con v24.19.0).
- Next.js: 16.4.0 (App Router).
- React / React DOM: 19.3.0.
- NestJS (core, common, platform-express): 11.2.7.
- NestJS CLI / schematics: 11.0.24 / 11.1.0.
- TypeScript: 5.9.3 (modo estricto en web y api).
- Tailwind CSS: 4.3.3 (via `@tailwindcss/postcss`).

Se eligieron versiones estables, sin tags preliminares, verificando
compatibilidad de `engines` y `peerDependencies` en los metadatos de npm.

Nota de compatibilidad: la linea NestJS 12 (schematics 12.x) exige
`typescript >= 6.0.0`, que todavia no tiene version estable publicada. Por eso
se fija la linea estable NestJS 11, cuyo schematics 11.1.0 admite
`typescript >= 4.8.2` y es compatible con TypeScript 5.9.3.

### Infraestructura local (PostgreSQL via Docker Compose)

- Imagen: `postgres:17-alpine`.
- Motivo: PostgreSQL 17 es una linea estable consolidada, con amplio soporte de
  herramientas (incluido Prisma, que se incorporara despues). Se fija la version
  mayor (`17`) para evitar saltos mayores accidentales, y la variante `alpine`
  por ser ligera. Se evita el tag `latest`.
- El servicio se llama `postgres` y no usa `container_name`, para evitar
  conflictos entre proyectos creados desde esta plantilla.
- Credenciales, nombre de base y puerto del host son configurables por variables
  de entorno (`.env` en la raiz, a partir de `.env.example`).
- Volumen persistente administrado por Docker: `postgres_data`.
- `DATABASE_URL` apunta a `localhost` porque Prisma correra en el host (apps/api),
  no dentro del contenedor.
- Prisma todavia NO se instalo en este incremento.

### Prisma (ORM, solo en apps/api)

- Version: `prisma` y `@prisma/client` **7.10.0** (dev y runtime respectivamente).
- Motivo: 7.10.0 es la ultima linea **estable**. El tag `latest` de npm apunta a
  `8.0.0-rc.x`, que es release candidate (preliminar) y el estandar prohibe
  versiones preliminares.
- Compatibilidad verificada: `engines.node` = `^20.19 || ^22.12 || >=24.0`
  (OK con Node 24); peer `typescript >=5.4.0` (OK con TS 5.9.3); PostgreSQL 17
  (conexion real verificada).
- Driver adapter: Prisma 7 requiere driver adapter para PostgreSQL en runtime.
  Se instalo `@prisma/adapter-pg@7.10.0` (incluye `pg` como dependencia).
- Schema: `apps/api/prisma/schema.prisma`. Generator `prisma-client` (nuevo en
  v7, reemplaza a `prisma-client-js`) con `output` obligatorio hacia
  `src/generated/prisma`. Datasource `provider = "postgresql"` sin `url` en el
  schema (en v7 la URL va en la config).
- `DATABASE_URL`: Prisma 7 ya NO carga `.env` automaticamente. `prisma.config.ts`
  carga el `.env` de la raiz con `dotenv` (ruta explicita `../../.env`) y define
  `datasource.url = env("DATABASE_URL")`. Asi se mantiene una unica fuente de
  configuracion local y no se duplica `apps/api/.env`.
- Dependencias de dev anadidas en apps/api para la config TS: `dotenv@18.0.6` y
  `tsx@4.23.15` (la CLI ejecuta `prisma.config.ts`, que es TypeScript).
- Todavia NO hay migraciones ni modelos: el schema es valido vacio. La primera
  migracion se hara con la primera funcionalidad de referencia.

Cambios relevantes de Prisma 7 a tener en cuenta:

- ESM-only y driver adapters obligatorios para PostgreSQL.
- El cliente se genera como codigo TypeScript dentro del proyecto (ya no en
  node_modules); `output` es obligatorio.
- La URL ya no se declara en el schema; va en `prisma.config.ts`.
- Varios subcomandos (`db execute`, etc.) ya no aceptan `--url` ni `--schema`;
  leen la datasource desde la config.

### Nota de entorno (conflicto de puerto)

En esta maquina existe un PostgreSQL **nativo** (servicio `postgresql-x64-18`)
ocupando el puerto 5432 del host. Eso hacia que `localhost:5432` resolviera al
PostgreSQL nativo en lugar del contenedor, con error de autenticacion `28P01`.

Diferenciar claramente:

- **Configuracion de la plantilla** (`.env.example`): puerto host por defecto
  **5432**. Es el estandar reutilizable; no se altera por una particularidad de
  una maquina.
- **Configuracion local de esta maquina** (`.env`): puerto host **5433**, porque
  existe un PostgreSQL nativo ocupando el 5432. Solo cambio el puerto del host;
  usuario, contrasena y base no cambiaron. El puerto interno del contenedor
  sigue siendo 5432.

5433 es, por tanto, una configuracion local de este equipo, no el valor por
defecto de la plantilla.

### Integracion de Prisma en NestJS (PrismaModule / PrismaService)

- Ubicacion: `apps/api/src/database/` (`prisma.module.ts`, `prisma.service.ts`).
- `PrismaService` extiende el `PrismaClient` generado (v7) y se conecta via el
  driver adapter `PrismaPg` (`@prisma/adapter-pg`):
  `DATABASE_URL -> PrismaPg -> PrismaClient -> PostgreSQL`.
- `DATABASE_URL` nunca se hardcodea; se lee de `process.env`. El backend carga el
  `.env` de la raiz con `dotenv` en `main.ts` (una sola fuente de configuracion,
  sin `apps/api/.env`). Si falta, se lanza un error claro sin exponer la URL ni
  credenciales.
- `PrismaModule` NO es `@Global()` por decision explicita: los modulos de negocio
  importaran `PrismaModule` cuando necesiten persistencia, para hacer visibles
  las dependencias.
- Ciclo de vida: `$connect()` en `OnModuleInit`, `$disconnect()` en
  `OnModuleDestroy` (verificado como correcto con Prisma 7 + PrismaPg).
- No se instalaron dependencias nuevas: `dotenv` ya pertenecia a apps/api; se
  descarto `@nestjs/config` por innecesario para cargar un unico `.env`.
- Conexion real NestJS -> PrismaService -> PostgreSQL verificada con un script
  controlado (eliminado tras la validacion). Sin modelos, migraciones ni tablas.

### Primera funcionalidad de referencia: maestras/catalogos

- Modulo: `apps/api/src/modules/catalog/` (`catalog.module.ts`,
  `catalog.controller.ts`, `catalog.service.ts`, `dto/`). Importa `PrismaModule`
  explicitamente (que sigue sin ser global).
- Modelo `CatalogItem` (tabla `catalog_items`): maestra generica reutilizable;
  `catalog` identifica a que maestra pertenece cada opcion. Campos: `id` (uuid),
  `catalog`, `code`, `label`, `active` (default true), `sortOrder` (default 0),
  `createdAt`, `updatedAt`. Unique `(catalog, code)`; indices en `catalog`,
  `active`, `sortOrder`. Mapeo camelCase (TS) / snake_case (PostgreSQL) con
  `@map`/`@@map`.
- Primera migracion versionada:
  `20261007161124_create_catalog_items` (via `prisma migrate dev`, no `db push`).
- Endpoints REST: `POST /catalog-items`, `GET /catalog-items` (filtros
  `catalog`/`active`), `GET /catalog-items/:id`, `PATCH /catalog-items/:id`.
- Normalizacion: `catalog` y `code` se recortan y pasan a mayusculas; `label` no.
  `catalog` y `code` son estables y no se modifican por PATCH.
- Errores: duplicado `(catalog, code)` -> 409; id inexistente -> 404; sin exponer
  errores internos de Prisma ni stack traces.
- Principio de borrado: **no hay DELETE fisico**; las maestras se desactivan con
  `active = false` para no romper referencias futuras.
- Validacion: se instalaron `class-validator@0.15.1` y `class-transformer@0.5.1`
  en apps/api (necesarias para el `ValidationPipe` estandar de NestJS). Pipe
  global con `whitelist`, `forbidNonWhitelisted` y `transform`.

### Contrato de API: OpenAPI + packages/api-client

- NestJS es la unica fuente oficial del contrato. Flujo:
  `NestJS -> OpenAPI (apps/api/openapi/openapi.json) -> packages/api-client -> (futuro) apps/web`.
- OpenAPI con `@nestjs/swagger@11.4.7` (linea 11, compatible con NestJS 11.2.x;
  la linea 12 exige NestJS 12). Metadata: title "Plantilla Portales API",
  version "0.1.0".
- Generador determinista: `apps/api/src/generate-openapi.ts` (ejecutado con
  `tsx`). Crea la app, construye el documento y cierra; sin `listen()` y sin
  abrir conexion a la base (no llama a `app.init()`), por lo que no requiere
  PostgreSQL en ejecucion.
- Configuracion compartida en `apps/api/src/app.config.ts` (`configureApp` y
  `buildOpenApiConfig`), usada por `main.ts` y por el generador para que runtime
  y contrato coincidan.
- Response DTO propio `CatalogItemResponseDto`: separa el contrato HTTP del tipo
  interno de Prisma. No hay capa de mappers porque la forma coincide.
- Como no se usa el CLI plugin de `@nestjs/swagger` (el generador corre con
  `tsx`, no con `nest build`), los `@ApiProperty`/`@ApiPropertyOptional` declaran
  `type` explicito y los bodies usan `@ApiBody({ type })`. Asi el contrato es
  correcto sin depender de inferencias fragiles.
- `packages/api-client`: workspace con `openapi-typescript@7.13.0` (tipos ->
  `src/generated/schema.d.ts`) y `openapi-fetch@0.17.0` (cliente tipado,
  `fetch` nativo, sin Axios ni Java). Build con `tsc` (sin bundler). No depende
  de NestJS, Prisma, class-validator ni class-transformer.
- `baseUrl` lo inyecta el consumidor via `createApiClient({ baseUrl })`; el
  paquete no lo hardcodea.
- Scripts: `openapi:generate`, `api-client:generate`, `contracts:generate`
  (ambos). `npm run build` y `npm run typecheck` incluyen el api-client.
- Generacion separada del build: ni `build` ni `typecheck` ejecutan
  `contracts:generate`. Usan los artefactos versionados tal cual, por lo que no
  dependen de `.env` ni de `DATABASE_URL` (un clon limpio o CI compilan sin
  configuracion local ni base). `contracts:generate` es el paso explicito cuando
  cambia la API; carga el `.env` pero no conecta a PostgreSQL (sin `app.init()`).
- Orden del build por dependencias reales: `api -> api-client -> web` (en el
  Paso 11 web consumira api-client). Sin ciclos build/generate.
- Artefactos generados (`openapi.json`, `schema.d.ts`) versionados para que un
  clon limpio compile sin pasos previos; regenerables con `contracts:generate`.
  Los artefactos de build (`packages/api-client/dist/`) NO se versionan
  (`.gitignore`); se reconstruyen con `build:api-client`.
- Regla: cada cambio de contrato en NestJS debe ir con `npm run contracts:generate`
  y el commit de los generados. El check de CI que verifica la sincronizacion
  todavia NO esta implementado.
- Swagger UI (`/docs`) deshabilitado por defecto; se habilita en desarrollo con
  `ENABLE_SWAGGER_UI=true`.

### Frontend (apps/web): primera interfaz real (Maestras)

- Stack UI: Next.js App Router + Tailwind CSS 4 + shadcn/ui (CLI estable 4.21.4,
  configurado de forma manual/moderna para Tailwind v4: `components.json`,
  `src/lib/utils.ts`, variables de tema en `globals.css` con `@theme inline`).
- Flujo: `apps/web -> @plantilla-portales/api-client -> NestJS (OpenAPI)`. El
  frontend declara el workspace como dependencia (`"@plantilla-portales/api-client": "*"`)
  y lo consume por su nombre; no importa desde `packages/.../src` ni duplica
  contratos. Los tipos salen de `components['schemas'][...]`.
- Dependencias agregadas a apps/web: `@radix-ui/*` (dialog, label, select,
  separator, slot, switch), `class-variance-authority`, `clsx`, `tailwind-merge`,
  `lucide-react`, `sonner`; dev `tw-animate-css`. No se instalo React Query,
  Redux, Zustand, React Hook Form ni Zod: cinco campos simples se manejan con
  estado React y validacion minima (el backend es la autoridad).
- Pantalla `/catalogs`: listar, filtrar (catalogo + estado via query backend,
  con boton Aplicar), crear (Dialog), editar (Dialog con catalog/code en solo
  lectura; PATCH no envia catalog/code), activar/desactivar (`PATCH active`). Sin
  DELETE fisico. Estados loading/vacio/error/exito explicitos. Fechas formateadas
  con `Intl.DateTimeFormat` (no ISO crudo). `/` redirige a `/catalogs`.
- Cliente: `apps/web/src/lib/api-client.ts` (instancia unica,
  `createApiClient({ baseUrl })` con `NEXT_PUBLIC_API_BASE_URL`, error claro si
  falta) y `apps/web/src/lib/catalog.ts` (envuelve las llamadas y traduce
  400/404/409/red a mensajes entendibles; nunca expone JSON crudo ni Prisma).
- CORS: configurable por `CORS_ORIGINS` (lista separada por comas) en
  `configureApp`. Si no esta definida, NO se habilita CORS (nunca `*`); sin
  `credentials`. Metodos permitidos: GET, POST, PATCH. Añadida a `.env.example`
  raiz. Este cambio no toca el contrato OpenAPI, por lo que no se regenero.
- Config del frontend: `apps/web/.env.example` con `NEXT_PUBLIC_API_BASE_URL`;
  `.env.local` (ignorado por Git) para esta maquina. Nunca secretos del backend.
- Dev: `predev:web` reconstruye `packages/api-client` antes de `dev:web`.

### Testing (Jest + Playwright)

- Versiones: `jest@30.5.2`, `@types/jest@30.0.0`, `ts-jest@29.4.14` (dev en
  apps/api) y `@playwright/test@1.63.0` (dev en la raiz). Estables, compatibles
  con Node 24, TS 5.9, NestJS 11 y Next 16/React 19. ts-jest (sin Babel) porque
  su peer de TypeScript (`>=4.3 <6`) admite 5.9.
- **Jest** (solo apps/api): `apps/api/jest.config.ts` (ts-jest, `testEnvironment:
  node`). Prueba unitaria de `CatalogService` en
  `src/modules/catalog/catalog.service.spec.ts` (14 casos: normalizacion a
  mayusculas, create con defaults y P2002 -> ConflictException sin exponer
  Prisma, findOne 200/404, update de label/active/sortOrder sin tocar
  catalog/code, findMany con filtros y orden). **No** usa PostgreSQL:
  PrismaService se mockea con un objeto tipado minimo (sin librerias de mocking).
  Los specs se excluyen de `tsc`/build (`tsconfig` exclude `**/*.spec.ts`).
- **Playwright** (raiz): `playwright.config.ts` + `e2e/catalogs.spec.ts`. Solo
  Chromium. `baseURL=http://localhost:3000`; dos `webServer` (API en
  `/health`, Web en `/catalogs`) que arrancan con los scripts de dev;
  `reuseExistingServer` activo fuera de CI. `workers: 1` (catalogo compartido),
  reporter `list`, `screenshot: only-on-failure`, `trace: retain-on-failure`,
  `video: off`. Valida la cadena completa navegador -> Next -> api-client ->
  NestJS -> Prisma -> PostgreSQL.
- Datos E2E aislados en `E2E_CATALOG`. Limpieza con utilidad de testing
  `apps/api/test-utils/e2e-cleanup.ts` (Prisma directo, `deleteMany` con filtro
  estricto `catalog = E2E_CATALOG`; nunca sin `where`). NO se expone por HTTP y
  NO se agrego ningun endpoint DELETE: la API productiva sigue sin DELETE fisico.
- Selectores accesibles (`getByRole`, `getByLabel`, `getByText`); el filtro de
  catalogo se acota por id (`#filter-catalog`/`#filter-active`) por compartir
  etiqueta con el campo del dialog. Esperas por condicion (`waitForResponse`,
  `toBeVisible`), sin `waitForTimeout`.
- Scripts raiz: `test:unit`, `test:e2e`, `test:all`. El `build` NO ejecuta E2E.
  Artefactos ignorados: `test-results/`, `playwright-report/`, `coverage/`,
  `.playwright/`, `blob-report/`.

### Agentes Kiro (.kiro/agents/)

- Formato: Markdown con frontmatter YAML (formato moderno de Kiro IDE 1.x), en
  `.kiro/agents/{desarrollador,revisor,testing,arquitecto}.md`. Se eligió
  Markdown porque es el formato que requiere la estructura objetivo y el que
  consume el Kiro IDE para agentes de workspace. Permisos con `permissions.rules`
  (capability/match/effect); sin campos legacy (`toolsSettings`); sin `model`
  fijado (usa el modelo seleccionado en Kiro); `includeMcpJson: false`,
  `includePowers: false`.
- Cada agente carga como `resources` los steering y la documentación relevante
  (`file://.kiro/steering/**/*.md`, README, docs, package.json y los que aportan
  contexto a su rol), en vez de duplicar el steering en el prompt.
- **Desarrollador**: tools lectura + `fs_write` + `execute_bash` + web. Permite
  `npm run *`, `git status/diff/ls-files/check-ignore`, `docker compose ps/logs`
  y escritura en `apps/** packages/** infra/** docs/**` y config raíz; deniega
  `docker compose down -v`, `git reset --hard`, `git clean -fd` y escritura de
  `.env*`. No preautoriza `git commit/push` (quedan a confirmación).
- **Revisor**: lectura + `execute_bash`, SIN escritura. Solo comprobaciones de
  solo lectura (git diff/status, test:unit, typecheck, build, test:e2e cuando
  aplica). Entrega hallazgos con Severidad/Ubicación/Problema/Impacto/
  Recomendación.
- **Testing**: lectura + `fs_write` + `execute_bash`, escritura acotada a
  `apps/api/**/*.spec.ts`, `apps/api/test-utils/**`, `e2e/**`,
  `playwright.config.ts`, `apps/api/jest.config.ts`; deniega destructivos y
  `.env*`. Conoce `E2E_CATALOG` y la utilidad de limpieza.
- **Arquitecto**: lectura + web + shell de solo lectura, SIN escritura. Produce
  decisión y plan (PROBLEMA..PLAN), con sesgo a la simplicidad (no recomienda
  microservicios/K8s/Kafka/Redis sin necesidad demostrada).
- Sin orquestación automática entre agentes (independientes y predecibles).
  Flujo manual: solicitud normal -> Desarrollador; cambio grande -> Arquitecto
  -> Desarrollador -> Revisor -> Testing; bug -> Testing -> Desarrollador ->
  Revisor.
- Validación: `kiro-cli agent validate` solo acepta JSON, así que se validó el
  esquema de campos de cada agente generando un JSON equivalente (los cuatro:
  VÁLIDO). Los `.md` los descubre el Kiro IDE en `.kiro/agents/`.

### Empaquetado y CI/CD (producción, un solo servidor)

Detalle operativo completo en `docs/deployment.md`. Resumen técnico:

- Imágenes: `apps/api/Dockerfile` y `apps/web/Dockerfile`, multi-stage sobre
  `node:24-bookworm-slim` (Debian slim: OpenSSL para los engines de Prisma,
  evita problemas de Alpine/musl). Build context = raíz del monorepo (respeta
  npm workspaces). Usuario no-root (`node`). Sin `.env` ni secretos en la imagen.
- API: instala deps → `prisma generate` → `nest build`. NO corre migraciones en
  el build. Conserva dev deps (prisma CLI + tsx) para poder ejecutar
  `prisma migrate deploy` como paso explícito (`docker compose run --rm api ...`).
  Imagen ~1.1GB (tradeoff; optimizable en un incremento futuro).
- Web: `next build` con `output: 'standalone'` + `outputFileTracingRoot` a la
  raíz (monorepo). Imagen runtime ~268MB. `NEXT_PUBLIC_API_BASE_URL` es build-arg
  (pública, se incrusta en build); por defecto `/api` en producción.
- `prisma.config.ts` ahora lee `process.env.DATABASE_URL` directamente (no el
  helper `env()` que lanzaba error si faltaba la variable). Así `prisma generate`
  funciona sin base en el build de Docker/CI, y `migrate deploy` recibe la URL
  real en despliegue. `generate`/`validate` locales siguen OK.
- Nginx (`infra/nginx/nginx.conf`): único punto público; `/` → web:3000,
  `/api/` → api:3001 con rewrite del prefijo (`proxy_pass .../`), headers
  `Host`/`X-Real-IP`/`X-Forwarded-*`, `map` para upgrade de websockets. HTTP por
  defecto; bloque HTTPS de ejemplo comentado (Certbot). Sintaxis validada con
  `nginx -t`.
- `compose.prod.yaml` (separado del `compose.yaml` de desarrollo): nginx (único
  que publica puerto, 80), web, api y postgres sin puertos al host; postgres con
  volumen `postgres_data_prod`; api→`postgres:5432`; healthchecks (pg_isready,
  /health vía fetch, /catalogs vía fetch). Migraciones como paso explícito, no en
  el arranque.
- `.env.production.example`: credenciales de Postgres, `NEXT_PUBLIC_API_BASE_URL=/api`,
  `CORS_ORIGINS` (vacío por defecto, porque con `/api` no hay cross-origin; el
  soporte CORS del backend se conserva), `HTTP_PORT`.
- Scripts raíz: `docker:prod:build|up|down|migrate|logs`.
- CI `.github/workflows/ci.yml` (rama `main`/`master` + PR): un job con Node 24
  (cache npm), service container PostgreSQL 17 (credenciales de CI
  `ci_user`/`ci_password`/`plantilla_portales_ci`), `DATABASE_URL` a
  `localhost:5432`. Secuencia: `npm ci` → `contracts:generate` → verificación
  `git diff --exit-code` de `openapi.json` y `schema.d.ts` (falla si no están
  sincronizados; implementa el check pendiente del Paso 10) → `test:unit` →
  `typecheck` → `build` → `prisma migrate deploy` → `playwright install
  --with-deps chromium` → `test:e2e` (NEXT_PUBLIC_API_BASE_URL=localhost:3001,
  CORS_ORIGINS=localhost:3000). Solo CI; sin CD automático.

## Decisiones pendientes

- Estrategia de autenticacion e identidad.
- HTTPS con certificados reales (Certbot) y, luego, CD automático a un servidor.
- Reducir el tamaño de la imagen de la API (hoy conserva dev deps para migrar).
- Paralelizar E2E con datos aislados por worker (hoy workers=1).
- MCP (incremento futuro).
