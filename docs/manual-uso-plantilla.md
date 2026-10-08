# Manual de Uso de la Plantilla

Guía operativa para el equipo de desarrollo. Si vas a crear o mantener un portal
interno a partir de esta plantilla, este documento te lleva desde cero hasta un
Pull Request con CI en verde.

Audiencia: personas con conocimientos básicos de Git, TypeScript y desarrollo
web. No se asume conocimiento previo de la arquitectura de esta plantilla.

---

## 1. Introducción

**Plantilla Portales** es una base reutilizable para desarrollar portales
internos manteniendo una arquitectura y una forma de trabajo estándar en todo el
equipo.

Ya viene resuelto (no hay que volver a construirlo):

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui.
- **Backend**: NestJS + TypeScript.
- **Base de datos**: PostgreSQL.
- **ORM**: Prisma (solo en el backend).
- **Contrato de API**: OpenAPI, con cliente tipado en `packages/api-client`.
- **Pruebas**: Jest (unitarias de backend) y Playwright (E2E).
- **Infraestructura**: Docker, Docker Compose y Nginx.
- **CI**: GitHub Actions.
- **Kiro**: steering (reglas) y agents (roles).

Cuando se inicia un portal nuevo **no se reconstruye esta infraestructura**. El
equipo se concentra en lo que aporta valor al negocio:

- el dominio y sus modelos de datos,
- las funcionalidades y reglas de negocio,
- las integraciones,
- la experiencia de usuario.

---

## 2. Cuándo usar la plantilla

Está pensada para **portales internos administrativos** construidos con el stack
estándar del equipo. Ejemplos conceptuales del tipo de producto (no son
funcionalidades incluidas en la plantilla):

- portal de solicitudes,
- portal de auditoría,
- administración de maestros,
- operaciones internas,
- gestión de procesos.

Si tu necesidad encaja con un portal interno sobre este stack, la plantilla es el
punto de partida correcto.

---

## 3. Arquitectura

### Desarrollo

```
Usuario
  |
  v
Next.js (apps/web)
  |
  v
packages/api-client   (cliente HTTP tipado, generado desde OpenAPI)
  |
  v
NestJS (apps/api)  ->  Controller  ->  DTO  ->  Service
                                                  |
                                                  v
                                              Prisma
                                                  |
                                                  v
                                             PostgreSQL
```

### Producción

```
Usuario
  |
  v
Nginx (único punto público)
  |-- /     -> Next.js (web)
  '-- /api  -> NestJS (api)
                  |
                  v
               Prisma
                  |
                  v
              PostgreSQL
```

Responsabilidades por capa:

- **Next.js**: presentación, navegación, formularios, estados visuales. Consume
  la API; nunca accede a la base de datos.
- **packages/api-client**: cliente HTTP tipado generado desde el contrato
  OpenAPI. Evita duplicar tipos de la API en el frontend.
- **NestJS**: lógica de negocio, validación, autorización, acceso a datos y
  exposición de la API REST (y su OpenAPI).
- **Controller**: recibe HTTP y delega; se mantiene delgado.
- **DTO**: define y valida la entrada.
- **Service**: concentra las reglas de negocio.
- **Prisma / PostgreSQL**: persistencia transaccional (solo desde el backend).
- **Nginx**: en producción, único punto público; enruta `/` a la web y `/api` al
  backend.

---

## 4. Crear un nuevo proyecto

El flujo recomendado usa **GitHub Template Repository**:

1. Entra al repositorio de la plantilla en GitHub.
2. Pulsa **Use this template** → **Create a new repository**.
3. Crea el repositorio del nuevo portal.
4. Clónalo y ábrelo con Kiro.

```bash
git clone <URL_REPOSITORIO>
cd <NOMBRE_PROYECTO>
npm ci
```

> `<URL_REPOSITORIO>` y `<NOMBRE_PROYECTO>` son placeholders: usa los valores
> reales de tu nuevo repositorio.

---

## 5. Requisitos locales

| Herramienta | Requisito |
|-------------|-----------|
| Git | Cualquier versión reciente. |
| Node.js | `>=20.9.0` (definido en `package.json` → `engines.node`; probado con v24). |
| npm | El que acompaña a tu Node (se usa `npm ci` y workspaces). |
| Docker | Para PostgreSQL local y las imágenes de producción. |
| Docker Compose | v2 (`docker compose ...`). |
| Kiro | Para trabajar con steering y agents del proyecto. |

No instales versiones específicas de las librerías a mano: `npm ci` instala
exactamente lo fijado en `package-lock.json`.

---

## 6. Primer arranque

1. **Variables de entorno.** Copia las plantillas de ejemplo a los archivos
   reales (que nunca se versionan):

   Backend / base de datos (raíz), en PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Frontend:

   ```powershell
   Copy-Item apps/web/.env.example apps/web/.env.local
   ```

   > **Nunca** versiones los `.env` reales. Solo se versionan los `.env.example`
   > y `.env.production.example`.

2. **Dependencias:**

   ```bash
   npm ci
   ```

3. **Base de datos (PostgreSQL en Docker):**

   ```bash
   npm run db:up      # levanta el contenedor de PostgreSQL
   npm run db:ps      # verifica que está "healthy"
   ```

4. **Aplicar las migraciones existentes** (crea las tablas del proyecto):

   ```bash
   npm run prisma:migrate:deploy --workspace apps/api
   ```

5. **Levantar los servicios** (en terminales separadas):

   ```bash
   npm run dev:api    # backend  -> http://localhost:3001
   npm run dev:web    # frontend -> http://localhost:3000
   ```

   > `dev:web` reconstruye `packages/api-client` automáticamente antes de
   > arrancar (script `predev:web`).

Rutas útiles:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Health del backend: `http://localhost:3001/health`

---

## 7. Estructura del repositorio

| Carpeta | Contiene | Cuándo la tocas |
|---------|----------|-----------------|
| `apps/web` | Frontend Next.js (App Router, componentes shadcn/ui, páginas). | Al crear/ajustar pantallas y experiencia de usuario. |
| `apps/api` | Backend NestJS, módulos de negocio, Prisma (`schema.prisma`, migraciones). | Al crear/ajustar lógica de negocio, API y modelos de datos. |
| `packages/api-client` | Cliente HTTP tipado generado desde OpenAPI (`@plantilla-portales/api-client`). | Casi nunca a mano: se regenera con `contracts:generate`. |
| `infra` | Configuración de Nginx para producción. | Solo en cambios de despliegue/proxy. |
| `docs` | Documentación (este manual, despliegue, decisiones). | Al documentar decisiones o procedimientos. |
| `.kiro` | `steering/` (reglas) y `agents/` (roles de Kiro). | Rara vez; son estándar del equipo (ver sección 20). |
| `.github` | Workflow de CI (`workflows/ci.yml`). | Solo en cambios del pipeline. |

---

## 8. Cómo trabajar con Kiro

Hay dos conceptos distintos:

- **`.kiro/steering/`** — las **reglas de construcción** del software (cómo se
  hacen las cosas en esta plantilla). Kiro las tiene siempre presentes.
- **`.kiro/agents/`** — el **rol** que Kiro adopta en una sesión (qué hace y con
  qué permisos).

### Los cuatro agentes

| Agente | Para qué sirve |
|--------|----------------|
| **Desarrollador** | Implementar funcionalidades completas respetando la arquitectura. |
| **Revisor** | Auditar cambios sin modificar código; entrega hallazgos. |
| **Testing** | Reproducir bugs y crear/mantener pruebas Jest y Playwright. |
| **Arquitecto** | Analizar decisiones transversales antes de un cambio grande; produce decisión y plan, no código. |

### Qué agente usar

| Necesidad | Agente |
|-----------|--------|
| Nueva funcionalidad | Desarrollador |
| Corrección de bug | Testing |
| Revisión de un cambio | Revisor |
| Cambio arquitectónico | Arquitecto |

### Flujos recomendados (manuales)

- **Cambio normal:** Desarrollador → Revisor (cuando corresponda).
- **Cambio grande:** Arquitecto → Desarrollador → Revisor → Testing.
- **Bug:** Testing → Desarrollador → Revisor.

> El flujo es **manual**: tú decides cuándo invocar cada agente. No hay
> orquestación automática entre ellos.

---

## 9. Crear una nueva funcionalidad

Esta es la sección más importante. La plantilla incluye una funcionalidad de
referencia **real y completa** (maestras/catálogos). Antes de crear algo nuevo,
**léela como ejemplo**:

- Backend: `apps/api/src/modules/catalog/`
- Frontend: `apps/web/src/app/catalogs/`

### Patrón backend

```
schema.prisma
   |
   v
migración versionada
   |
   v
Módulo NestJS (apps/api/src/modules/<feature>/)
   |-- <feature>.controller.ts   (HTTP, delgado)
   |-- <feature>.service.ts      (reglas de negocio)
   |-- <feature>.module.ts       (importa PrismaModule explícitamente)
   '-- dto/                       (entrada + validación)
         |
         v
      PrismaService
         |
         v
      PostgreSQL
```

### Del backend al frontend (contrato)

```
NestJS (DTOs + decoradores OpenAPI)
   |
   v
OpenAPI (apps/api/openapi/openapi.json)
   |
   v
contracts:generate
   |
   v
packages/api-client (schema.d.ts + cliente)
   |
   v
Next.js (consume el cliente tipado)
```

### Procedimiento práctico

1. Define el modelo de datos de la funcionalidad.
2. Edita `apps/api/prisma/schema.prisma` (nuevo modelo).
3. Crea la migración (ver sección 10):
   `npx prisma migrate dev --name <nombre>` dentro de `apps/api`.
4. Crea el módulo NestJS en `apps/api/src/modules/<feature>/`.
5. Crea los DTOs (entrada y, si aplica, respuesta) con validación y decoradores
   `@ApiProperty`.
6. Implementa el **service** (reglas de negocio, uso de `PrismaService`).
7. Crea el **controller** (delgado; delega en el service).
8. Documenta las rutas/estados con los decoradores OpenAPI.
9. Ejecuta `npm run contracts:generate` para regenerar OpenAPI y el api-client.
10. Consume `@plantilla-portales/api-client` desde Next.js (no escribas tipos a
    mano).
11. Crea la UI en `apps/web/src/app/<ruta>/` (estados loading/vacío/error/éxito,
    accesibilidad, responsive).
12. Crea/actualiza pruebas (Jest para el service, Playwright si hay flujo nuevo).
13. Valida (ver sección 15).

> Imita el módulo `catalog` y la pantalla `catalogs`: resuelven este patrón de
> extremo a extremo (incluyendo normalización, errores 400/404/409 y
> activar/desactivar en vez de borrar).

---

## 10. Prisma y migraciones

- **Desarrollo**: migraciones **versionadas**. Para crear una nueva, desde
  `apps/api`:

  ```bash
  npx prisma migrate dev --name <nombre_descriptivo>
  ```

  Para aplicar las migraciones existentes (p. ej. en un clon nuevo):

  ```bash
  npm run prisma:migrate:deploy --workspace apps/api
  ```

- **Producción**: se aplican con `prisma migrate deploy` como **paso explícito**
  del despliegue (ver `docs/deployment.md`), nunca en el arranque del contenedor.

Reglas:

- **Nunca** uses `db push` como sustituto de migraciones permanentes.
- **Nunca** uses `migrate dev` en producción.

Comandos de apoyo (desde la raíz): `npm run prisma:format`,
`npm run prisma:validate`, `npm run prisma:generate`.

---

## 11. OpenAPI y api-client

Regla central: **NestJS es la fuente oficial del contrato de API.**

```
NestJS DTO (apps/api)
   |
   v
OpenAPI (apps/api/openapi/openapi.json)
   |
   v
schema.d.ts (packages/api-client/src/generated/)
   |
   v
api-client (@plantilla-portales/api-client)
   |
   v
Next.js
```

Cuando cambie el contrato HTTP (nuevos endpoints, campos, tipos):

```bash
npm run contracts:generate
```

y versiona los archivos generados (`openapi.json` y `schema.d.ts`).

**No** declares en el frontend interfaces que ya existen en el contrato. Por
ejemplo, evita:

```ts
// ❌ No hacer esto si el tipo ya viene del contrato
interface Customer { /* ... */ }
```

En su lugar, usa los tipos del paquete `@plantilla-portales/api-client`.

---

## 12. Frontend

Stack: Next.js (App Router) + Tailwind CSS + shadcn/ui, consumiendo
`@plantilla-portales/api-client`.

Reglas:

- **Nunca** uses Prisma en el frontend.
- **Nunca** te conectes directamente a PostgreSQL.
- **No** dupliques contratos: usa el api-client.
- Contempla siempre los estados: **loading, vacío, error, éxito**.
- Cuida la **accesibilidad** (labels, roles, navegación por teclado).
- Mantén un **responsive** razonable (no una app móvil aparte).

---

## 13. Backend

Separación de responsabilidades:

| Capa | Responsabilidad |
|------|-----------------|
| **Controller** | Recibe HTTP, aplica DTOs, delega. Se mantiene **delgado**. |
| **DTO** | Define y valida la entrada; nunca confía en el cliente. |
| **Service** | Concentra las reglas de negocio. |
| **PrismaService** | Acceso a datos. Pertenece solo al backend. |

Los controllers no deben contener lógica de negocio compleja ni consultas Prisma
directas: eso vive en el service.

---

## 14. Pruebas

- **Jest** — pruebas unitarias del backend, **aisladas** (Prisma mockeado, sin
  base real).
- **Playwright** — flujo completo real en navegador (cadena web → api-client →
  NestJS → Prisma → PostgreSQL).

Comandos:

```bash
npm run test:unit    # Jest (backend)
npm run test:e2e     # Playwright (requiere PostgreSQL levantado: npm run db:up)
npm run test:all     # unit + e2e
```

Cuándo ejecutar cada uno:

- `test:unit`: siempre que toques lógica del backend; es rápido.
- `test:e2e`: cuando cambies un flujo cubierto por E2E (p. ej. la pantalla de
  maestras) o antes de entregar un cambio funcional completo. Requiere Docker/
  PostgreSQL arriba.

---

## 15. Validación antes de entregar

Checklist mínimo:

```bash
npm run test:unit
npm run typecheck
npm run build
```

Según el tipo de cambio, además:

- Cambió un **flujo cubierto por E2E** → `npm run test:e2e`.
- Cambió el **contrato HTTP** → `npm run contracts:generate` (y versiona los
  generados).
- Cambió **Prisma** → crea la **migración** correspondiente.

---

## 16. Git y GitHub

Flujo de equipo sencillo (sin GitFlow complejo):

```
main
  |
  v
feature/<descripcion>    (o fix/<descripcion>)
  |
  v
Pull Request
  |
  v
CI (GitHub Actions)
  |
  v
review
  |
  v
merge a main
```

Ejemplos de nombres de rama:

- `feature/solicitudes`
- `fix/catalog-filter`

Trabaja siempre sobre una rama de feature; abre un Pull Request hacia `main`.

---

## 17. GitHub Actions (CI)

El workflow `.github/workflows/ci.yml` se ejecuta en cada push a la rama
principal y en cada Pull Request. Valida, en orden:

1. **Contratos sincronizados** — regenera y comprueba que `openapi.json` y
   `schema.d.ts` no cambian. Si falla: olvidaste `npm run contracts:generate`
   tras cambiar el contrato; ejecútalo y versiona los cambios.
2. **Jest** (`test:unit`) — si falla: una regla de negocio del backend no se
   cumple.
3. **Typecheck** — si falla: hay errores de tipos (api, api-client o web).
4. **Build** — si falla: algo no compila para producción.
5. **Migraciones** (`prisma migrate deploy`) — si falla: una migración no aplica
   sobre una base limpia.
6. **Playwright** (`test:e2e`) — si falla: el flujo real de usuario se rompió.

CI usa un PostgreSQL de prueba propio (credenciales exclusivas de CI). Es **solo
CI**: no despliega a ningún servidor.

---

## 18. Despliegue

Resumen: producción se empaqueta con **Docker Compose** en un solo servidor,
detrás de **Nginx** como único punto público, con los servicios **web**, **api**
y **PostgreSQL**. Las migraciones se aplican como paso explícito con
`prisma migrate deploy`.

El procedimiento completo (variables, build de imágenes, arranque, migraciones,
logs, backup, rollback, HTTPS) está en **[docs/deployment.md](deployment.md)**.

---

## 19. Qué puede personalizarse

Normalmente, en cada portal:

- nombre, branding, logo, colores,
- módulos y páginas,
- modelos de datos,
- dominio y reglas de negocio,
- integraciones.

---

## 20. Qué NO debe cambiarse sin una decisión

No modifiques de forma arbitraria:

- la arquitectura de monorepo,
- la separación frontend/backend,
- Prisma como ORM,
- PostgreSQL como base,
- el patrón OpenAPI / api-client,
- la estrategia de migraciones,
- Jest / Playwright,
- Docker / Nginx,
- el pipeline de CI.

Si necesitas cambiar algo de lo anterior: usa el agente **Arquitecto** para el
análisis y lleva la decisión al equipo antes de implementarla.

---

## 21. Reglas de oro

1. **Next.js nunca usa Prisma.**
2. **El frontend nunca se conecta directamente a PostgreSQL.**
3. **La lógica de negocio vive en el backend.**
4. **OpenAPI es la fuente del contrato de API.**
5. **No duplicar interfaces** de la API en el frontend.
6. **Los cambios en Prisma requieren migraciones.**
7. **Producción usa `migrate deploy`** (nunca `migrate dev`).
8. **No versionar los `.env` reales.**
9. **No agregar tecnología sin una necesidad real.**
10. **Nunca `docker compose down -v`** sin entender el impacto (borra el volumen
    y, con él, los datos).

---

## 22. Checklist: nuevo proyecto

```
[ ] Crear repo desde el template (Use this template)
[ ] Clonar el repositorio
[ ] npm ci
[ ] Copy-Item .env.example .env
[ ] Copy-Item apps/web/.env.example apps/web/.env.local
[ ] npm run db:up
[ ] npm run prisma:migrate:deploy --workspace apps/api
[ ] npm run dev:api
[ ] npm run dev:web
[ ] Verificar http://localhost:3001/health
[ ] Definir el primer módulo de negocio
[ ] Desarrollar (imitar el módulo catalog)
[ ] npm run test:unit
[ ] npm run typecheck
[ ] npm run build
[ ] Abrir Pull Request
[ ] CI en verde
```

---

## 23. Checklist: Pull Request

```
[ ] El requerimiento está cumplido
[ ] Sin secretos ni .env reales en el commit
[ ] Migración incluida si cambió Prisma
[ ] Contratos regenerados si cambió la API (contracts:generate)
[ ] Pruebas creadas/actualizadas
[ ] npm run typecheck en verde
[ ] npm run build en verde
[ ] npm run test:e2e si cambió un flujo cubierto
[ ] Documentación actualizada si aplica
```

---

## 24. Problemas frecuentes

Estos problemas se encontraron realmente durante la construcción de la
plantilla:

- **Puerto 5432 ocupado**: si ya tienes un PostgreSQL nativo en el host usando el
  5432, el contenedor de la plantilla no podrá publicar ese puerto. Usa un puerto
  de host libre (p. ej. 5433) en `POSTGRES_PORT` y en `DATABASE_URL` de tu `.env`
  local. El puerto interno del contenedor sigue siendo 5432.
- **5432 (plantilla) vs 5433 (local)**: el `.env.example` usa el estándar 5432; un
  equipo con PostgreSQL nativo puede necesitar 5433 solo en su `.env`. Es
  configuración local, no de la plantilla.
- **`DATABASE_URL`**: Prisma 7 no carga `.env` automáticamente; el proyecto lo
  carga explícitamente. Si falta `DATABASE_URL`, el backend falla con un mensaje
  claro ("Database configuration missing"). Revisa tu `.env`.
- **api-client no construido**: si el frontend no resuelve
  `@plantilla-portales/api-client`, reconstrúyelo con
  `npm run build:api-client` (en dev, `dev:web` ya lo hace vía `predev:web`).
- **Olvidar `contracts:generate`**: tras cambiar el contrato HTTP, si no
  regeneras, CI fallará en el paso de contratos. Ejecuta
  `npm run contracts:generate` y versiona los cambios.
- **CORS en desarrollo**: con web en `:3000` y api en `:3001` (orígenes
  distintos), el backend necesita `CORS_ORIGINS=http://localhost:3000` en el
  `.env`. En producción, con Nginx y mismo dominio (`/api`), normalmente no hace
  falta CORS.
- **UUID inválido**: las rutas por id validan UUID; un valor no-UUID responde
  400 (no llega a la base). Es el comportamiento esperado.
- **Docker / `prisma generate` sin `DATABASE_URL`**: la generación del cliente no
  necesita base de datos; la configuración de Prisma está preparada para
  generar sin `DATABASE_URL` (en el build de Docker/CI no hay `.env`).
- **Variables `NEXT_PUBLIC_*` en build**: `NEXT_PUBLIC_API_BASE_URL` se incrusta
  en el build del frontend. En desarrollo es `http://localhost:3001`; en
  producción, por defecto `/api` (mismo dominio vía Nginx).
- **Datos E2E**: las pruebas E2E usan un catálogo reservado (`E2E_CATALOG`) con
  limpieza estrictamente filtrada. No uses datos que puedan parecer reales ni
  borres datos sin filtro.

---

## 25. Dónde pedir cambios a la plantilla

- Si el problema o cambio afecta **solo a tu portal**: resuélvelo en el
  repositorio de ese portal.
- Si el cambio **beneficia a todos los portales**: propónlo en el **repositorio
  de la plantilla** para que se evalúe antes de incorporarlo.

Esto evita que cada portal termine divergiendo hacia arquitecturas distintas.
Las mejoras transversales se consolidan en la plantilla; las particularidades,
en cada portal.

---

## Documentos relacionados

- **[docs/deployment.md](deployment.md)** — manual especializado de despliegue.
- **[docs/README.md](README.md)** — índice de documentación y decisiones técnicas.
