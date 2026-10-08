# Plantilla de Portales Internos

Monorepo (npm workspaces) para construir portales internos reutilizables.

## ¿Vas a iniciar un nuevo portal?

Si vas a crear un portal a partir de esta plantilla, comienza por el
[Manual de Uso de la Plantilla](docs/manual-uso-plantilla.md).

## Stack

- Frontend: Next.js 16 (App Router) + TypeScript estricto + Tailwind CSS 4.
- Backend: NestJS 11 + TypeScript estricto.
- Gestor de paquetes: npm (unico `package-lock.json` en la raiz).

## Estructura

```
plantilla-portales/
  apps/
    web/        Frontend Next.js (puerto 3000)
    api/        Backend NestJS (puerto 3001)
  packages/     Paquetes compartidos (reservado)
  infra/        Contenedores y despliegue (reservado)
  docs/         Documentacion y decisiones
  .kiro/        Instrucciones, agentes y especificaciones
```

## Requisitos

- Node.js >= 20.9.0 (probado con v24.19.0).
- npm >= 10.

## Instalacion

Instala todas las dependencias del monorepo desde la raiz:

```bash
npm install
```

## Variables de entorno

Copia los ejemplos antes de ejecutar.

Base de datos (raiz), en PowerShell:

```powershell
Copy-Item .env.example .env
```

Frontend:

```bash
cp apps/web/.env.example apps/web/.env.local
```

- `.env` (raiz): credenciales y puerto de PostgreSQL para Docker Compose, mas
  `DATABASE_URL` y `CORS_ORIGINS` para el backend. Es la **unica** fuente de
  configuracion local del backend; no existe `apps/api/.env`. El puerto del
  backend (`PORT`, por defecto 3001) tambien puede definirse aqui si se desea.
- `apps/web/.env.local`: `NEXT_PUBLIC_API_BASE_URL` apuntando al backend.

Los archivos `.env` reales no se versionan (ver `.gitignore`); solo se versionan
los `.env.example` y `.env.production.example`.

## Base de datos local (PostgreSQL via Docker Compose)

Requiere Docker con Docker Compose v2 (`docker compose`).

1. Copia las variables de entorno de la raiz (si aun no lo hiciste):

   ```powershell
   Copy-Item .env.example .env
   ```

2. Levanta PostgreSQL en segundo plano:

   ```bash
   npm run db:up
   ```

3. Revisa el estado de los servicios:

   ```bash
   npm run db:ps
   ```

4. Ver logs en vivo:

   ```bash
   npm run db:logs
   ```

5. Apaga los servicios:

   ```bash
   npm run db:down
   ```

`npm run db:down` (equivale a `docker compose down`) detiene y elimina los
contenedores, pero **NO** elimina el volumen `postgres_data`: los datos locales
se conservan.

Para eliminar deliberadamente los datos locales se usaria:

```bash
docker compose down -v
```

Atencion: `docker compose down -v` **borra la base de datos local** (elimina el
volumen `postgres_data`). Usar solo si quieres descartar todos los datos.

### Puerto del host

El puerto del host es configurable con `POSTGRES_PORT` (interno siempre 5432).

- **Configuracion de la plantilla** (`.env.example`): usa el puerto por defecto
  **5432**.
- **Configuracion local de esta maquina** (`.env`): usa **5433** porque este
  equipo ya tiene un PostgreSQL nativo ocupando el 5432. Es una particularidad
  de esta maquina, no el estandar de la plantilla.

Si tu equipo ya tiene un servicio ocupando el 5432, cambia unicamente el puerto
del host en tu `.env` local (por ejemplo a 5433) y ajusta tambien `DATABASE_URL`.
El puerto interno del contenedor sigue siendo 5432.

## Prisma (ORM, solo en apps/api)

Prisma pertenece exclusivamente al backend (`apps/api`). El frontend nunca usa
Prisma ni se conecta a PostgreSQL.

- Schema: `apps/api/prisma/schema.prisma`.
- Configuracion de la CLI: `apps/api/prisma.config.ts`.
- `DATABASE_URL`: se lee del `.env` de la raiz. Prisma 7 ya no carga el `.env`
  automaticamente, por eso `prisma.config.ts` lo carga de forma explicita con
  `dotenv` apuntando al `.env` de la raiz (una sola fuente de configuracion;
  no existe `apps/api/.env`).

Comandos (desde la raiz o desde `apps/api`):

```bash
npm run prisma:format     # formatea el schema
npm run prisma:validate   # valida el schema
npm run prisma:generate   # genera el Prisma Client
```

El Prisma Client se genera en `apps/api/src/generated/prisma` (ignorado por Git;
se regenera con `prisma:generate`).

### Integracion con NestJS (PrismaModule / PrismaService)

Prisma se integra en el backend mediante:

- `apps/api/src/database/prisma.service.ts` — `PrismaService`, que extiende el
  `PrismaClient` generado y se conecta a PostgreSQL a traves del driver adapter
  `PrismaPg` (`@prisma/adapter-pg`). Flujo:
  `DATABASE_URL -> PrismaPg -> PrismaClient -> PostgreSQL`.
- `apps/api/src/database/prisma.module.ts` — `PrismaModule`, que provee y exporta
  `PrismaService`.

`PrismaModule` **no es global** de forma deliberada: los futuros modulos de
negocio que necesiten base de datos deben **importar `PrismaModule`
explicitamente**, de modo que las dependencias de datos queden visibles.

`DATABASE_URL` se lee de variables de entorno (nunca hardcodeada). El backend
carga el `.env` de la raiz con `dotenv` al arrancar (`apps/api/src/main.ts`),
manteniendo una sola fuente de configuracion local (no existe `apps/api/.env`).
Si `DATABASE_URL` falta, `PrismaService` lanza un error claro
("Database configuration missing") sin exponer credenciales.

`PrismaService` gestiona el ciclo de vida de NestJS: conecta en `OnModuleInit`
(falla temprano si la base no responde) y cierra el pool en `OnModuleDestroy`.

### Primera migracion

La primera migracion versionada es
`apps/api/prisma/migrations/20261007161124_create_catalog_items`, que crea la
tabla `catalog_items` (modelo `CatalogItem`). Se creo con el mecanismo oficial
de Prisma 7:

```bash
# desde apps/api
npx prisma migrate dev --name create_catalog_items
```

No se usa `db push`: las migraciones quedan versionadas en el repositorio.

## Funcionalidad de referencia: maestras/catalogos (CatalogModule)

Primera funcionalidad reutilizable de la plantilla. Es **generica**: sirve para
cualquier maestra (estados, prioridades, categorias, tipos, areas, opciones de
desplegables) sin acoplarse a un negocio concreto. El campo `catalog` identifica
a que maestra pertenece cada opcion (p. ej. `PRIORITY`, `STATUS`,
`PROJECT_TYPE`).

- Ubicacion: `apps/api/src/modules/catalog/`
  (`catalog.module.ts`, `catalog.controller.ts`, `catalog.service.ts`, `dto/`).
- `CatalogModule` importa `PrismaModule` explicitamente (que no es global).
- Modelo `CatalogItem`: `id` (uuid), `catalog`, `code`, `label`, `active`
  (default true), `sortOrder` (default 0), `createdAt`, `updatedAt`.
  Restriccion unica `(catalog, code)` e indices en `catalog`, `active`,
  `sortOrder`. En PostgreSQL la tabla es `catalog_items` con columnas snake_case
  (mapeadas con `@map`/`@@map`).

Endpoints:

```
POST  /catalog-items          crea un item (catalog y code se normalizan a MAYUSCULAS)
GET   /catalog-items          lista; filtros opcionales ?catalog= y ?active=
GET   /catalog-items/:id      obtiene por id (404 si no existe)
PATCH /catalog-items/:id      actualiza label, active, sortOrder
```

Reglas:

- `catalog` y `code` se normalizan (trim + mayusculas); `label` no se altera.
- `catalog` y `code` son identificadores estables: **no** se modifican por PATCH.
- Duplicado `(catalog, code)` responde **409 Conflict**; los errores internos de
  Prisma no se exponen al cliente.
- **No existe DELETE fisico**: una maestra se desactiva con `active = false` para
  no romper referencias futuras.

La validacion de entrada usa `class-validator`/`class-transformer` con un
`ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`): se
rechazan campos no declarados en los DTO.

## Contrato de API: NestJS -> OpenAPI -> packages/api-client

NestJS es la **unica fuente oficial del contrato** de API. El flujo es:

```
NestJS (@nestjs/swagger)
   -> apps/api/openapi/openapi.json   (contrato OpenAPI)
   -> packages/api-client             (tipos + cliente HTTP tipado)
   -> consumo desde apps/web          (en un paso posterior)
```

No se escriben manualmente interfaces de API en el frontend: los tipos se
generan desde OpenAPI. No duplicar contratos.

- Contrato: `apps/api/openapi/openapi.json`, generado de forma determinista por
  `apps/api/src/generate-openapi.ts` (crea la app, construye el documento y
  cierra; no hace `listen()` ni abre conexion a la base).
- Metadata del contrato: title "Plantilla Portales API", version "0.1.0".
- `packages/api-client`: workspace con `openapi-typescript` (genera
  `src/generated/schema.d.ts`) y `openapi-fetch` (cliente tipado). Solo depende
  de lo necesario para ser un cliente HTTP; no depende de NestJS ni Prisma.
- `baseUrl` lo proporciona el consumidor via `createApiClient({ baseUrl })`; el
  paquete no lo hardcodea ni conoce variables de ningun framework.
- Swagger UI (`/docs`) esta deshabilitado por defecto; se habilita solo en
  desarrollo con `ENABLE_SWAGGER_UI=true`.

Regeneracion:

```bash
npm run openapi:generate      # regenera apps/api/openapi/openapi.json
npm run api-client:generate   # regenera los tipos del cliente desde el OpenAPI
npm run contracts:generate    # ambos, en orden
```

### Generacion separada del build

La generacion de contratos y el build son pasos **separados**:

- `npm run build` y `npm run typecheck` usan los artefactos versionados
  (`openapi.json` y `schema.d.ts`) tal cual estan en el repositorio. **No**
  ejecutan `contracts:generate`, por lo que no dependen de `.env` ni de
  `DATABASE_URL`. Un clon limpio o un CI pueden compilar sin configuracion local
  ni base de datos.
- `npm run contracts:generate` es el paso explicito para cuando cambia la API en
  NestJS. Ese paso si carga el `.env` (porque crea el modulo de la aplicacion),
  pero no se conecta a PostgreSQL: el generador no llama a `app.init()`.

Regla de trabajo: **cada cambio del contrato en NestJS debe ir acompanado de
`npm run contracts:generate`** y del commit de `openapi.json` y `schema.d.ts`
actualizados. Mas adelante, GitHub Actions verificara que estos archivos
generados esten sincronizados; ese check de CI todavia no esta implementado.

Los artefactos de build (`packages/api-client/dist/`) **no** se versionan (estan
en `.gitignore`): se reconstruyen con `npm run build:api-client`. En cambio
`openapi.json` y `schema.d.ts` si se versionan por ahora, por formar parte del
contrato generado.

## Frontend (apps/web): Maestras

El frontend es Next.js (App Router) con Tailwind CSS 4 y shadcn/ui. Consume el
backend **exclusivamente** a traves de `@plantilla-portales/api-client`:

```
apps/web  ->  @plantilla-portales/api-client  ->  NestJS (OpenAPI)
```

No se escriben interfaces de API a mano ni se usa `fetch` manual para la Catalog
API: los tipos salen del contrato (`components['schemas'][...]`) y las llamadas
pasan por el cliente tipado.

- Pantalla `/catalogs` ("Maestras"): listar, filtrar (catalogo + estado), crear,
  editar y activar/desactivar. No hay borrado fisico; desactivar usa
  `PATCH { active: false }`.
- `/` redirige a `/catalogs`.
- Cliente API: `apps/web/src/lib/api-client.ts` crea la instancia con
  `createApiClient({ baseUrl })` leyendo `NEXT_PUBLIC_API_BASE_URL`. Si falta, se
  produce un error claro.
- Estados de UI: loading (skeleton), vacio, error (con reintentar) y exito.
- CORS: el backend solo acepta los origenes de `CORS_ORIGINS` (nunca `*`).

### Configuracion del frontend

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
```

`apps/web/.env.example`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

Nunca pongas `DATABASE_URL` ni credenciales en los `.env` del frontend; esa
variable es configuracion publica, no un secreto.

### Levantar todo en local

```bash
npm run db:up      # 1. PostgreSQL (Docker)
npm run dev:api    # 2. API en http://localhost:3001
npm run dev:web    # 3. Web en http://localhost:3000  (reconstruye api-client antes)
```

En desarrollo, `dev:web` reconstruye `packages/api-client` antes de arrancar
(script `predev:web`) para que los tipos y el cliente esten disponibles.

## Comandos (desde la raiz)

Ejecutar cada proyecto por separado:

```bash
npm run dev:web   # Frontend en http://localhost:3000
npm run dev:api   # Backend en http://localhost:3001
```

Construir todo el monorepo:

```bash
npm run build       # api -> api-client -> web (usa contratos versionados)
npm run build:web
npm run build:api
npm run build:api-client
```

Comprobacion de tipos:

```bash
npm run typecheck       # web + api + api-client
npm run typecheck:web
npm run typecheck:api
npm run typecheck:api-client
```

Base de datos local (Docker Compose):

```bash
npm run db:up     # docker compose up -d postgres
npm run db:ps     # docker compose ps
npm run db:logs   # docker compose logs -f postgres
npm run db:down   # docker compose down (conserva el volumen)
```

Pruebas:

```bash
npm run test:unit   # Jest: logica del backend, aislada (mockea Prisma, sin BD)
npm run test:e2e    # Playwright: flujo real en navegador (Chromium)
npm run test:all    # unit + e2e
```

- **Jest** (en `apps/api`) prueba reglas del backend sin tocar PostgreSQL
  (PrismaService se mockea).
- **Playwright** (en la raiz, `e2e/`) valida la cadena completa
  navegador -> Next.js -> api-client -> NestJS -> Prisma -> PostgreSQL, por lo
  que **requiere PostgreSQL local levantado** (`npm run db:up`). Playwright
  levanta API y Web automaticamente (webServer) usando los scripts de dev.
  Los datos E2E viven en el catalogo reservado `E2E_CATALOG` y se limpian antes
  y despues de la suite. `npm run build` **no** ejecuta las pruebas E2E.

## Endpoints

- Backend salud: `GET http://localhost:3001/health`

  ```json
  {
    "status": "ok",
    "service": "plantilla-portales-api",
    "timestamp": "<ISO-8601>"
  }
  ```

## Agentes Kiro

La plantilla incluye cuatro agentes de Kiro en `.kiro/agents/` que usan esta
arquitectura como estándar. Se apoyan en los steering (`.kiro/steering/`); no
fijan modelo (usan el seleccionado en Kiro).

- **Desarrollador**: implementación de funcionalidades completas respetando la
  arquitectura (lectura + escritura + shell + web).
- **Revisor**: auditoría técnica y arquitectónica sin modificar código
  (lectura + shell, sin escritura).
- **Testing**: reproducción de bugs y pruebas Jest/Playwright
  (lectura + escritura + shell, acotado a archivos de test).
- **Arquitecto**: decisiones transversales antes de cambios grandes; produce
  decisión y plan, no código (lectura + web, sin escritura).

Flujo manual recomendado:

- Solicitud normal: **Desarrollador**.
- Cambio importante: **Arquitecto** → Desarrollador → Revisor → Testing (cuando
  corresponda).
- Corrección de bug: **Testing** → Desarrollador → Revisor.

## Despliegue (producción) y CI

La plantilla se empaqueta con Docker Compose para un único servidor, detrás de
Nginx como punto público. El detalle completo (arquitectura, variables, build,
migraciones, start/stop, logs, backup, rollback, HTTPS) está en
[`docs/deployment.md`](docs/deployment.md).

Resumen:

```bash
cp .env.production.example .env.production   # completar secretos
npm run docker:prod:build                    # construir imágenes
npm run docker:prod:up                        # levantar nginx + web + api + postgres
npm run docker:prod:migrate                   # prisma migrate deploy (paso explícito)
# validar: http://localhost/  y  http://localhost/api/health
```

- `compose.yaml` es solo para desarrollo; `compose.prod.yaml` es producción.
- Dockerfiles multi-stage (Node 24), Next.js en salida `standalone`, Nginx hace
  proxy `/ -> web` y `/api/ -> api` (quitando el prefijo).
- En producción el navegador usa la API por el mismo dominio (`/api`); en
  desarrollo sigue siendo `http://localhost:3001`.
- CI en `.github/workflows/ci.yml`: contratos + unit + typecheck + build +
  migrate deploy + E2E (Playwright/Chromium) con PostgreSQL 17 de servicio.

## Pendiente (siguientes incrementos)

Autenticacion e identidad, HTTPS con certificados reales, CD automático y MCP.
