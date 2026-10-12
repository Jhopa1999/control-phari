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
  `lucide-react`, `sonner`; dev `tw-animate-css`. Renovación de UI: también
  `@radix-ui/react-tooltip@1.3.0`, `@radix-ui/react-dropdown-menu@2.1.25` y
  `@radix-ui/react-tabs@1.1.22`, con versión exacta y sin scripts de
  instalación (`allowScripts` no cambia). No se instalo React Query,
  Redux, Zustand, React Hook Form ni Zod: cinco campos simples se manejan con
  estado React y validacion minima (el backend es la autoridad).
- Sistema de diseño (`apps/web/src/app/globals.css`): tokens en OKLCH para el
  tema claro (`:root`) y el oscuro (`.dark`), un único acento y tonos
  semánticos `success`, `warning`, `danger`, `info` y `neutral` con variantes
  `-subtle` y `-border`. La paleta `neutral-50…950` de Tailwind se elimina para
  que `text-neutral` y `bg-neutral-subtle` sean tokens propios. `text-meta`
  (13/18 px) es un tamaño propio y `cn()` lo registra en tailwind-merge para
  que no lo confunda con un color.
- Cambiar el acento corporativo: editar solo `--primary`, `--primary-hover`,
  `--primary-foreground` y `--primary-subtle` en el bloque marcado al inicio de
  `:root` y de `.dark`; `--ring` lo sigue solo. Condiciones de contraste:
  `--primary-foreground` sobre `--primary` ≥ 4.5:1, y `--primary` como texto
  sobre `#fff` y sobre `--muted` ≥ 4.5:1.
- Tipografía: Inter con `next/font/google` (se autoaloja en el build; variable
  `--font-inter` en `<html>`). Si el build no puede descargarla (entorno sin
  salida a internet), se quita el import de `layout.tsx` y `--font-sans` queda
  en la pila de sistema (`system-ui`, `Segoe UI`, Roboto…).
- El tema oscuro queda preparado en `.dark`, pero no hay selector de tema; los
  toasts usan tema claro fijo hasta que exista.
- Utilidades de presentación en `apps/web/src/lib`, sin reglas de negocio:
  `format.ts` define las únicas reglas de fechas del portal (una fecha de
  calendario guardada se muestra en UTC; un valor por defecto, como "hoy" o el
  mes actual, se propone con el calendario local del usuario; una fecha
  guardada pasa a un `<input type="date">` en UTC) y el formato de horas,
  porcentajes y conteos ("1 pendiente", "−10 h", "45 %").
  `status-presentation.ts` da etiqueta, tono e icono de cada estado, y
  `table-sort.ts` con el hook `use-client-table.ts` hacen búsqueda, orden y
  paginación en cliente sobre lo que ya devuelve la API. `useClientTable`
  exige `pageSize` (`25 | 50 | 100 | null`): con `null` no pagina y entrega
  todas las filas filtradas; con un número, la vista pinta siempre la
  paginación, para que ninguna fila quede oculta sin un control que lo
  indique.
- Componentes compartidos en `apps/web/src/components`, que toda pantalla
  migrada compone en lugar de estilos propios: estructura (`PageLayout`,
  `PageHeader`, que emite el único `h1`, `Section` y `Toolbar` con
  `SearchInput`), estados (`DataView`, `EmptyState`, `ErrorState`,
  `InlineNotice`, `TableSkeleton` y `PageFallback`), estados de dominio
  (`StatusBadge`, `PriorityBadge` y `PriorityLegend`), indicadores
  (`StatStrip`, `StatTile` y `UtilizationBar`), bloqueos (`DisabledReason`,
  `DisabledHint` y `RequirementsPanel`), confirmaciones (`ConfirmDialog` y
  `ReasonDialog`), tablas (`RowActions`, `RowActionsCell`,
  `SortableTableHead`, `ResultCount`, `DataTablePagination` y `CellTitle`),
  maestro‑detalle (`MasterDetail` y `SelectableList`), formularios (`Field`,
  `FieldSet`, `FormError` y `RequiredHint`) y la barra de contexto de solicitud
  (`RequestContextBar`, `RequestSummary` y `RequestFacts`). Son seguros para
  servidor (sin `'use client'`, hooks ni Radix) `PageLayout`, `PageHeader`,
  `EmptyState`, `InlineNotice`, `DescriptionList`, `StatStrip`/`StatTile`,
  `StatusBadge`/`PriorityBadge`/`PriorityLegend`, `TableSkeleton` y
  `PageFallback`; en código de servidor, un enlace con aspecto de botón se
  escribe `<Link className={buttonVariants({ variant })}>`. Una acción
  bloqueada por una regla usa `aria-disabled` (`Button unavailable`) con su
  motivo visible (`DisabledReason`) o en un tooltip que también se abre al
  pulsar (`DisabledHint`); el atributo `disabled` queda para lo transitorio, el
  límite natural y «sin cambios por guardar». `ConfirmDialog` y `ReasonDialog`
  devuelven el foco al control que los abrió y, si la acción lo retiró, a
  `returnFocusTo()`. Mi trabajo y Proyectos son las primeras pantallas
  migradas.
- Paneles (patrón F): Panel del área (`/inicio`), Indicadores
  (`/demanda/resumen`) y Capacidad (`/activos/capacidad`). Los dos primeros
  comparten el filtro «Periodo» (`components/period-fieldset.tsx`, con los ids
  `dashboard-*` e `indicadores-*` de siempre). Los cuatro indicadores del Panel
  se leen tal cual de la respuesta de la API, sin cálculos nuevos; la barra de
  distribución es solo presentación. En Indicadores, un indicador que no aplica
  muestra «No aplica» con el motivo de la API, nunca un 0, y sin el módulo
  `demandOverview` no se llama al backend. El Resumen de carga de Capacidad
  muestra todas las personas (`pageSize: null`) y se ordena por Persona,
  Utilización y Utilización plan. Sus diálogos usan `Field` y `FormError`:
  todos los errores del cliente se muestran a la vez y el foco va al primer
  campo con error.
- Demanda: Solicitudes (`/demanda/solicitudes`) busca, filtra (estado,
  proceso y banda de prioridad), ordena y pagina en cliente, de 25 en 25, sin
  parámetros nuevos en la API. El título abre la ficha y el menú «Más
  acciones» ofrece «Ir a triage», «Ir a priorización», «Ir a planificación» e
  «Ir a controles de gobierno» solo si el módulo está permitido y la solicitud
  cumple el predicado del destino (`isTriageable`, `isPrioritizable`,
  `isPlannable` de `lib/request-state.ts`; Controles no tiene predicado).
  Triage y Priorización son mesas de trabajo con `RequestContextBar` agrupada,
  la ficha de la solicitud al lado y, si la solicitud no admite la acción, un
  `RequirementsPanel` (`triage-block`, `priority-block`) con el motivo y la
  acción para resolverlo. Las dos aceptan `?requestId=` (`lib/use-request-param.ts`,
  `page.tsx` con `<Suspense>` y `PageFallback`): la selección vive en el estado
  de la vista y la URL solo la refleja; un id que no está en la lista muestra
  un aviso y limpia la URL. Los toasts de éxito encadenan el paso siguiente
  («Ir a triage», «Ir a priorización», «Ir a aprobaciones») cuando el módulo
  está permitido. Aprobaciones (`/administracion/revision`) tiene dos
  secciones con su «Actualizar»; devolver usa `ReasonDialog`
  (`devolver-dialog.tsx`) y, como la fila desaparece, el foco pasa a la fila
  siguiente o al encabezado de la sección. Sin el módulo `review` no se llama
  al backend y se muestra un aviso, como en Indicadores.
- Ejecución: Planificación (`/seguimiento/plan`) es una mesa de trabajo con
  `RequestContextBar` agrupada por estado y acepta `?requestId=` como Triage
  y Priorización (los enlaces «Ir a planificación» de Solicitudes y «Ver plan»
  de Aprobaciones llegan con la solicitud elegida). Con el plan en borrador o
  devuelto, la guía es un `RequirementsPanel` (`plan-guide`) con los textos y
  acciones de `lib/plan-guide.ts` y el envío a autorización con confirmación;
  con el plan en autorización o autorizado, la guía no se muestra (aunque
  `getPlanGuide` se sigue llamando) y un aviso explica que no se puede editar.
  Las fases van en una tabla compacta: subir y bajar respetan el límite
  natural y el bloqueo de la fase inicial con tareas (motivo en tooltip), el
  foco vuelve al botón pulsado tras reordenar y «Agregar tarea» ya funciona en
  fases que tienen tareas (§19.1). Las tareas muestran todas las filas
  (`pageSize: null`), con la columna Responsable y «Solo mis tareas»
  comparando con `permissions.userId` (§19.13). Sin el módulo `plan` no se
  llama al backend y se muestra el aviso de rol. Tareas (`/seguimiento/tareas`)
  es una página de detalle con migas, predecesoras (`task-predecessors` si
  alguna bloquea) y, en el lateral, evidencia y aceptación. Portafolio
  conserva sus tres filtros de servidor y añade búsqueda por título, orden y
  paginación de 25 en 25 en cliente; «Limpiar filtros» restablece también los
  de servidor y recarga.
- Registro diario: Bitácora (`/seguimiento/bitacora`) y Reporte semanal
  (`/seguimiento/semanal`) usan `MasterDetail` + `SelectableList`. La cabecera
  del detalle (fecha o «Semana del {lunes}», estado y proceso) sale del ítem de
  la lista mientras carga el detalle, así el `h2` sigue montado y, por debajo
  de 1024 px, recibe el foco al elegir. Tras guardar o eliminar, el detalle se
  recarga sin pasar por el esqueleto, para que las filas sigan montadas y el
  foco pueda volver a ellas. Enviar y eliminar piden confirmación
  (`ConfirmDialog`, textos de §13.3); al eliminar un diario el foco va al
  encabezado del diario que quede seleccionado o, si no queda ninguno, al
  título de la lista (`MasterDetail` acepta `listHeadingRef`), y al eliminar
  una actividad, a la fila siguiente o al encabezado «Actividades». Los tres
  diálogos (`diario-*`, `act-*`, `sem-*`, mismos ids) muestran todos los
  errores a la vez; las reglas que combinan campos (planificada: proyecto o
  tarea; extraordinaria: solicitante y justificación) van en `FormError` y
  marcan solo los campos que las incumplen.
- Coordinación: Novedades (`/seguimiento/novedades`), Reuniones
  (`/seguimiento/reuniones`) y Compromisos (`/seguimiento/compromisos`) usan
  el mismo maestro‑detalle. La ficha es una `Card` con el título en `h2`, el
  estado (`StatusBadge kind="record"`), los metadatos y una `DescriptionList`.
  Novedades y Compromisos agrupan sus transiciones bajo «Cambiar estado a:»
  (`role="group"`), un botón por destino de `nextStates` sin cambios; tras
  una transición, si el foco se perdió, pasa al encabezado del detalle.
  Eliminar una reunión pide confirmación (§13.3) y el foco va al encabezado de
  la reunión que quede seleccionada o al título de la lista. Los tres
  diálogos (`nov-*`, `reu-*`, `com-*`, mismos ids) muestran todos los errores
  a la vez y, al cerrarse, devuelven el foco al botón que los abrió con
  `useDialogReturnFocus` (sin `DialogTrigger`, Radix lo dejaría en `body`).
  Si un proceso, una persona o una reunión no vienen en las listas del alcance
  del actor, se muestra «… fuera de tu alcance» en vez del id.
- Activos, Documentos y Maestras (patrón A): Activos (`/activos/catalogo`) y
  Documentos (`/activos/documentos`) buscan por nombre o título
  (`filtro-busqueda`, `doc-filtro-busqueda`), filtran, ordenan y paginan en
  cliente de 25 en 25, con los filtros e ids de siempre y «Limpiar filtros»
  (el foco vuelve a la búsqueda). Los estados se muestran con su etiqueta
  (`StatusBadge asset` y `document`), también en los toasts de transición. Las
  transiciones siguen dependiendo de los roles asignados (jefe de área o líder
  del proceso del activo). En Documentos, «Editar» e «Historial» van en línea y
  «Descargar .md» y las transiciones en «Más acciones»; sin activos no
  retirados, «Nuevo documento» queda no disponible con su motivo y el enlace
  «Ir a Activos». El editor usa `Tabs` (Editor / Vista previa) y conserva el
  límite de 200.000 caracteres y Ctrl/Cmd+S. Maestras (`/catalogs` y
  `/administracion/maestras`, un único componente) mantiene sus filtros de
  servidor con «Aplicar» y añade orden y paginación en cliente; el diálogo
  muestra «Catálogo y código son obligatorios.» en `FormError` (marcando solo
  los campos vacíos) y los errores del backend, como el 409 de duplicado,
  también dentro del diálogo además del toast. `lib/catalog.ts` y
  `e2e/catalogs.spec.ts` pasan a los textos con tilde en el mismo cambio.
- Shell y navegación: `components/app-shell.tsx` monta «Saltar al contenido»
  (primer enfocable, lleva a `main#contenido`), el menú lateral
  (`app-sidebar.tsx`) y, por debajo de 1024 px, una barra superior con el menú
  en un cajón (`mobile-nav.tsx`). En escritorio, la columna del menú ocupa todo
  el alto de la página y el menú queda fijo al alto de la ventana (`sticky`),
  con scroll propio si no cabe. El menú se reagrupa por flujo de trabajo en
  `lib/navigation.ts` (7 grupos y 23 ítems, filtrados por `allowedModules`; es
  cosmético, el servidor manda) sin cambiar ninguna URL: «Tareas» sale del
  menú y marca «Mi trabajo», y `/catalogs` marca «Maestras».
  `MODULE_LABELS` y `MODULE_ORDER` dan la etiqueta y el orden de los 21
  módulos. Entre 1024 y 1279 px el menú es un riel de 56 px; el botón
  «Contraer menú» / «Expandir menú» guarda la preferencia en
  `localStorage.sidebarCollapsed` (`lib/use-sidebar-mode.ts`), y CSS resuelve
  el modo con `data-sidebar` y la variante `rail:` de `globals.css`. El login
  tiene su propio `h1`, y las rutas inexistentes y los errores de ejecución
  tienen pantallas en español (`app/not-found.tsx`, `app/error.tsx` y
  `app/global-error.tsx`).
- Cambiar el logo: sustituir el contenido de `BrandMark` en
  `apps/web/src/components/brand.tsx` por un `next/image` de `/logo.svg` a
  28 px. Es el único punto: lo usan el menú, la barra móvil, el login, las
  pantallas de carga de la sesión y la de error global.
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
- URLs de la suite configurables por entorno. Sin variables valen lo mismo que
  en la CI: `E2E_WEB_URL` (`baseURL` y `webServer` de la web; por defecto
  `http://localhost:3000`), `E2E_API_URL` (se espera su `/health`; por defecto
  `http://localhost:3001`) y `WEB_ORIGIN` (origen del `localStorage` que fijan
  `e2e/global-setup.ts` y `e2e/responsible-selector.spec.ts`; si falta, se usa
  `E2E_WEB_URL`). Sirven para verificar contra servidores en otros puertos sin
  tocar los de 3000/3001: fuera de CI, `reuseExistingServer` reutiliza los que
  ya respondan en esas URLs.
- `e2e/jwt-session.spec.ts`: regresiones de la sesión jwt (recargar conserva la
  sesión y la ruta; un enlace directo vuelve a su ruta tras iniciar sesión;
  `/login` con sesión lleva a `/inicio`; aviso de sesión expirada; un `next`
  externo se ignora; cerrar sesión no deja `next`). Se salta salvo
  `E2E_AUTH_MODE=jwt`. Necesita `E2E_JWT_PASSWORD`, la contraseña de desarrollo
  del seed (`DEV_PASSWORD` en `apps/api/prisma/seed.ts`; ni el spec ni esta
  documentación la copian), y admite `E2E_JWT_IDENTIFIER` (por defecto
  `jefe@demo.local`). Antes hay que levantar la API con `AUTH_MODE=jwt` y
  `JWT_SECRET`, y la web con `NEXT_PUBLIC_AUTH_MODE=jwt`, porque fuera de CI
  Playwright reutiliza los servidores que ya están en marcha. Después,
  `npm run test:e2e -- e2e/jwt-session.spec.ts` (solo ese spec: el resto de la
  suite usa dev-header).
- `e2e/shell-navigation.spec.ts`: el menú con sus grupos en orden y la página
  activa (también «Mi trabajo» en `/seguimiento/tareas` y «Maestras» en
  `/catalogs`), el filtrado del integrante, el cajón a 390 px (navega, se
  cierra y devuelve el foco; sin tooltips aunque esté guardada la preferencia
  de riel), el riel a 1100 px (botón, foco y preferencia guardada), «Saltar al
  contenido», el 404 de una ruta inexistente y (paso 8) el listado de
  Solicitudes con 30 solicitudes ficticias: conteo, paginación, sin resultados
  con un solo «Limpiar filtros» y orden real de la columna Registro. Ese paso
  sirve el `GET /requests` con un fixture (`page.route` + `route.fetch()` +
  `route.fulfill({ response, json })`): la petición pasa por la API real y solo
  se sustituye el cuerpo. Solo depende de los actores del seed.
- `e2e/web-lib.spec.ts`: funciones puras de `apps/web/src/lib`
  (`safe-redirect.ts`, `format.ts`, `navigation.ts`, comparado con
  `MODULE_KEYS` y `MODULE_MATRIX` del backend, `status-presentation.ts`,
  `plan-guide.ts`, `request-state.ts`, `task-filters.ts` y `table-sort.ts`,
  incluida la invariante de paginación de `buildTableView`) con el runner de Playwright y
  sin el fixture `page`, así que no abre navegador. Es una excepción a
  `.kiro/steering/30-pruebas.md`, que reserva Playwright a los flujos E2E: Jest
  solo está configurado en `apps/api` y llevarlo a `apps/web` exigiría
  dependencias y configuración nuevas. Los módulos que importa son puros (solo
  importaciones relativas, `lucide-react` e `import type` de
  `lib/api-client.ts`; nunca el alias `@/` ni valores de ese módulo, que lanza
  un error al importarse sin `NEXT_PUBLIC_API_BASE_URL`). El bloque de
  `format.ts` fija `process.env.TZ = 'America/Bogota'` y lo restaura al
  terminar, para que los errores de UTC frente a hora local aparezcan también
  en una máquina o una CI en UTC.
- `e2e/date-display.spec.ts`: fechas con datos fijos. Fija la zona horaria del
  navegador (`timezoneId: 'America/Bogota'`) y su reloj
  (`page.clock.setFixedTime`) en una hora en la que el calendario UTC ya va un
  día por delante, y comprueba que «Nuevo diario» propone el día local. Abre el
  diálogo y lo cierra con «Cancelar»: no crea datos. También comprueba que Mi
  trabajo muestra la fecha de vencimiento guardada sin correrla un día: sirve
  el `GET /my-work` con un fixture (`page.route` + `route.fetch()` +
  `route.fulfill({ response, json })`), de modo que la petición pasa por la
  API real, con autenticación, permisos y CORS, y solo se sustituye el cuerpo;
  no depende de los datos de la base. Los valores por defecto
  de diario, novedad, reunión, compromiso, reporte semanal, Capacidad, Panel
  del área e Indicadores se calculan con el calendario local en el cliente;
  las tres vistas con periodo o mes lo fijan después del montaje y, hasta
  entonces, muestran un esqueleto en el campo y no consultan la API.
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
