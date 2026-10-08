# Diseño técnico · Fase 1 · Fundaciones (control-phari)

> Revisión 3. La Revisión 2 incorporó 2 HIGH, 4 MEDIUM y 2 NIT; esta Revisión 3 resuelve los
> 3 hallazgos restantes de `design-review.json` (1 HIGH + 2 MEDIUM): procesos huérfanos del
> jefe, `ProcessScopeGuard` sin punto de montaje, y AC-031 (conservar la entrada ante error).
> Al final, §10 "Respuestas a la revisión" detalla cómo se resolvió cada hallazgo.

## Visión general

Esta fase construye las fundaciones del portal del área Analítica sobre la plantilla
existente (monorepo npm workspaces): identidad funcional de usuarios, procesos, roles
fijos y asignaciones (grants), autorización server-side por rol **y** alcance de proceso,
auditoría transversal de mutaciones, y un esqueleto de frontend con navegación agrupada
filtrada por permisos. Cubre BL-001/BL-002 (estructura de área, procesos, identidades,
asignaciones, permisos y catálogos) más la auditoría transversal BL-014, en el orden que
indica `specs/25-build-order.md` (punto 1 y punto 4: "auditoría transversal BL-014 debe
acompañar todas las mutaciones desde la primera feature").

El diseño respeta estrictamente los límites del steering del repo: NestJS es dueño de
lógica de negocio, validaciones, autorización, persistencia, API REST y OpenAPI; Prisma
solo vive en `apps/api`; el frontend consume el backend **exclusivamente** vía
`@plantilla-portales/api-client` y nunca accede a PostgreSQL ni a Prisma. Se extiende el
patrón ya probado del módulo `catalog` (controller fino → service con lógica → DTOs con
class-validator → P2002 traducido a `ConflictException`) y de la pantalla `/catalogs`
(estados loading/vacío/error/éxito, componentes shadcn, cliente tipado).

Se reutiliza el modelo `CatalogItem` existente para toda maestra; **no** se duplica. El
contexto de usuario de desarrollo es una capa explícitamente separada y reemplazable (no
se reconstruye autenticación real: `specs/28` punto 10, `specs/00-product.md`).

### Mapa rápido decisión → spec

| Decisión | Respaldo en spec |
|---|---|
| Entidades Process/User/Role/Grant/AuditEvent | `07-domain-model.md`, `08-data-dictionary.md`, `15-audit.md`, `20-master-data.md` |
| 3 roles fijos (Jefe de área, Líder de proceso, Integrante) | `10-roles-permissions.md`, `02-modules.md`, SCR-22 |
| Multi-grant por usuario (cardinalidad **P**: decisión de Fase 1, §1.2) | `07` ("cardinalidad multi-grant **P**"), `10` ("no elevar automáticamente"; coexistencia de grants/roles **P**) |
| Autorización rol + alcance de proceso en servidor | BR-019, `10` reglas de autorización, AC-025/026/027/029, SCR-23 |
| Dos planos: recurso-por-proceso vs. administración de área (Process/User/Grant = Plano B) | `10` ("jefe gestiona el área"; integrante/líder con alcance de proceso), §2.4 |
| 403 (rol) vs 404 (alcance de proceso) sin filtrar datos | `10` controles negativos 1–4, AC-025/026 |
| Endpoint "mis permisos" (SCR-23 / FNC-026) | `10` matriz de módulos, SCR-23, FEATURE-001 |
| AuditEvent en toda mutación | BR-024, `15-audit.md`, AC-028, `25` punto 4 |
| Contexto de usuario dev vía header (capa separada) | `00-product.md`, `01-domain.md` ("Área…separada"), `10` ("acceso al Site es condición separada"), `28` punto 10 |
| Navegación agrupada filtrada por rol | UI-01/UI-07, `02-modules.md`, `00-product.md` |
| Reutilizar CatalogItem para maestras | `20-master-data.md`, `07` ("Catálogo") |
| Procesos BI/FIBI, Integraciones/FIID, IA/FIAA, FMAA | `20-master-data.md`, BR-003 |

> Nota (Hallazgo 1): **BR-001** ("Proceso principal de solicitud siempre forma parte de los
> participantes") es una regla de la entidad **Solicitud** (FEATURE-002, fase posterior) y
> **no** respalda la cardinalidad de Grant ni "proceso principal participa". No se usa aquí.

---

## 1. Modelo de datos

### 1.1 Principios

- Esquema físico en `apps/api/prisma/schema.prisma`. Modelos en PascalCase; columnas en
  `snake_case` vía `@map`/`@@map`; PK `String @id @default(uuid()) @db.Uuid` como en
  `CatalogItem`. Timestamps `created_at`/`updated_at` en toda tabla mutable
  (`@default(now())` / `@updatedAt`), igual que `CatalogItem`.
- Solo se modelan entidades confirmadas para esta fase. No se crean tablas para Solicitud,
  Plan, Tarea, Framework, Área, etc. (fases posteriores, y marcadas parcial/**P** en el SDD).
- `User` es **identidad funcional**, no credenciales. No hay `password`, `token`, ni tabla
  de sesión (`specs/28` punto 10). El vínculo con el acceso al Site es una capa separada
  no reconstruida.
- `Role` es un catálogo fijo de 3 filas, no editable por API (los roles no se crean/borran:
  `10` y `02-modules.md` confirman exactamente tres perfiles). Se modela como tabla propia
  (no `CatalogItem`) porque el `code` del rol gobierna la lógica de autorización y debe ser
  un conjunto cerrado y tipado, no un valor administrable como las maestras de negocio.
- **"Área"**: `01-domain.md`/`07` describen Área como contenedor organizativo configurable
  (Área 1:N Procesos), pero el SDD no confirma atributos de Área ni una entidad administrable
  en Fase 1. **Decisión de Fase 1**: no se crea tabla `Area`; "el área" se modela como el
  **conjunto de procesos activos**. El Jefe de área administra toda el área = todos los
  procesos (ver §2.4, Hallazgo 5). Si una fase posterior requiere multi-área, se introduce
  `Area` y una FK `Process.areaId` sin romper lo existente.

### 1.2 Entidades y relaciones

```
Process (1) ──< (N) Grant       User (1) ──< (N) Grant       Role (1) ──< (N) Grant
User    (1) ──< (N) AuditEvent (actor, opcional)
Process (0..1) ──< (N) AuditEvent (scopeProcessId, opcional)
```

#### Process

Proceso de gestión del área (BI, Integraciones, IA) y la coordinación multiproceso FMAA.

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| code | `String` | `code` | **único**; estable; MAYÚSCULAS (FIBI/FIID/FIAA/FMAA) |
| name | `String` | `name` | requerido |
| framework | `String?` | `framework` | marco asociado observado (INS-006/005/004/007); opcional |
| kind | `String` | `kind` | `PROCESS` \| `COORDINATION`; FMAA = `COORDINATION` |
| active | `Boolean @default(true)` | `active` | estado |
| sortOrder | `Int @default(0)` | `sort_order` | orden de presentación |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | auditoría técnica |

Índices: `@@unique([code], name: "process_code_unique")`, `@@index([active])`,
`@@index([sortOrder])`, `@@map("processes")`.

`code` se almacena normalizado a MAYÚSCULAS (igual criterio que `CatalogItem.catalog/code`,
vía `normalizeKey`). `framework` se guarda como texto porque el SDD lo trata como referencia
observada: `20-master-data.md` lista INS-006/005/004/007 como marcos por proceso, pero **no**
se modela una tabla de frameworks ni su matriz de aplicabilidad (matriz completa marcada **P**
en `28` punto 7). `kind` distingue FMAA (`COORDINATION`) sin hardcodear el code en la lógica.

#### User

Identidad funcional de una persona del área.

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| identifier | `String` | `identifier` | **único**; identificador funcional (p. ej. email corporativo). NO es credencial |
| name | `String` | `name` | requerido |
| active | `Boolean @default(true)` | `active` | usuario activo |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | |

Índices: `@@unique([identifier], name: "user_identifier_unique")`, `@@index([active])`,
`@@map("users")`.

`identifier` es único y es la clave que el header de dev resuelve (ver §3). Se usa un
identificador funcional, no un login: no hay password ni hash (SDD prohíbe reconstruir
auth). `email` queda cubierto por `identifier`; no se añade un campo `email` separado para
no sugerir un flujo de credenciales inexistente.

#### Role

Catálogo cerrado de 3 perfiles.

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| code | `String` | `code` | **único**; enum lógico: `JEFE_AREA`, `LIDER_PROCESO`, `INTEGRANTE` |
| name | `String` | `name` | etiqueta visible: "Jefe de área", "Líder de proceso", "Integrante" |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | |

Índices: `@@unique([code], name: "role_code_unique")`, `@@map("roles")`.

Los 3 codes se definen como un `enum`/constante TypeScript compartida (`RoleCode`) en el
backend; la tabla espeja esos codes. La API **no** expone create/delete de roles. Esto
refleja `10` (exactamente tres perfiles) y `02-modules.md` ("Equipo y permisos" lista Jefe
de área, Líder de proceso, Integrante).

#### Grant

Asignación de un usuario a un rol dentro de un proceso. Es el corazón del alcance.

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| userId | `String @db.Uuid` | `user_id` | FK → User (`onDelete: Restrict`) |
| roleId | `String @db.Uuid` | `role_id` | FK → Role (`onDelete: Restrict`) |
| processId | `String @db.Uuid` | `process_id` | FK → Process (`onDelete: Restrict`) |
| active | `Boolean @default(true)` | `active` | revocar = `active=false` (soft, por auditoría) |
| createdAt / updatedAt | `DateTime` | `created_at`/`updated_at` | |

Relaciones: `user User @relation(...)`, `role Role @relation(...)`, `process Process @relation(...)`.
Índices y restricciones:
- `@@unique([userId, roleId, processId], name: "grant_user_role_process_unique")` — un grant por combinación.
- `@@index([userId])`, `@@index([processId])`, `@@index([roleId])`, `@@index([active])`.
- `@@map("grants")`.

**Nota sobre cardinalidad (Hallazgo 2 — regla P):** `07-domain-model.md` marca la
"cardinalidad multi-grant" como **P** (no verificada), y `10` marca como **P** "el modelo
exacto de coexistencia de múltiples grants/roles por persona". El SDD por tanto **no**
confirma la cardinalidad exacta. **Decisión de Fase 1 (elección de diseño, no afirmación del
spec):** se permite **un grant por combinación única `(userId, roleId, processId)`**; un
usuario sí puede tener varios grants con distinto `roleId` y/o `processId`. La coexistencia
de **duplicados exactos** `(user, rol, proceso)` con atributos distintos (p. ej. vigencia),
la delegación temporal, el escalamiento y el permiso por campo quedan **fuera de alcance**
(todos **P** en `10`). Si un cotejo futuro del Site revela duplicados legítimos, el
`@@unique` deberá revisarse; se documenta aquí como el punto exacto a reabrir.

Decisiones derivadas:
- **No se eleva automáticamente** líder de un proceso a líder de todos (`10`): el alcance es
  exactamente el conjunto de `processId` con grant activo.
- **Revocar es soft-delete** (`active=false`), no `DELETE` físico, para conservar
  trazabilidad (`10` control negativo 6: "quitar grant impide futuras lecturas y mutaciones";
  AC-027). El `@@unique` se mantiene aunque haya grants inactivos: reactivar un grant previo
  actualiza `active=true` en vez de crear otro (algoritmo único en §4.2.1).

#### AuditEvent

Registro append-only de cada mutación.

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| actorUserId | `String? @db.Uuid` | `actor_user_id` | FK → User; opcional (null si actor del sistema/seed) |
| action | `String` | `action` | `CREATE` \| `UPDATE` \| `DELETE` \| `REVOKE` (verbo de la mutación) |
| objectType | `String` | `object_type` | `PROCESS` \| `USER` \| `GRANT` \| `CATALOG_ITEM` |
| objectId | `String` | `object_id` | id del objeto afectado (texto; no FK para no acoplar) |
| scopeProcessId | `String? @db.Uuid` | `scope_process_id` | FK → Process; alcance del evento (null si no aplica) |
| before | `Json?` | `before` | estado previo (null en CREATE) |
| after | `Json?` | `after` | estado posterior (null en DELETE físico; en REVOKE refleja `active=false`) |
| createdAt | `DateTime @default(now())` | `created_at` | timestamp (sin updatedAt: inmutable) |

Relaciones: `actor User? @relation(...)`, `scopeProcess Process? @relation(...)`.
Índices: `@@index([objectType, objectId])`, `@@index([actorUserId])`, `@@index([scopeProcessId])`,
`@@index([createdAt])`, `@@map("audit_events")`.

Decisiones y respaldo (`15-audit.md`, `08` fila Auditoría, BR-024):
- Campos actor / acción / tipo de objeto / id / proceso-alcance / timestamp / before / after,
  exactamente lo corroborado en `15` ("actor, acción, registro, before, after y timestamp").
- `before`/`after` como `Json` (columna `jsonb`) permiten la vista "Ver cambio" (`15`).
- `15` marca como **P** "si cada mutación genera before/after". **Decisión de Fase 1:** en las
  entidades de esta fase (todas simples) se registran before/after en cada mutación; esto es
  una elección de diseño alineada con BR-024, no una afirmación del spec sobre el Site real.
- **No** se modela retención, filtros avanzados, exportación, timezone preciso, borrado ni
  anonimización (todo **P** en `15` / `28` punto 8). El tope de 500 eventos visibles es un
  límite de **consulta de UI** (`take` en la query de lectura), no una política de retención.
- Append-only: el service nunca actualiza ni borra `AuditEvent`.

### 1.3 Estrategia de migración

Una única migración versionada creada con el comando real del repo (nunca `db push`):

```
npx prisma migrate dev --name fase1_fundaciones
```

ejecutado desde `apps/api` (según steering). Para dejar el comando documentado y reproducible
como el resto del flujo, se añade también `"prisma:migrate:dev": "prisma migrate dev"` a
`apps/api/package.json` (NIT 3 de la revisión). Produce
`apps/api/prisma/migrations/<timestamp>_fase1_fundaciones/migration.sql` con las 5 tablas
(`processes`, `users`, `roles`, `grants`, `audit_events`), sus FKs, uniques e índices,
siguiendo el formato de la migración existente `20261007161124_create_catalog_items`. Se
ejecuta `npm run prisma:generate` (ya existe) para regenerar el client tipado en
`src/generated/prisma`. `CatalogItem` **no** se toca (su migración queda intacta).

### 1.4 Seed sintético

Script `apps/api/prisma/seed.ts` (TypeScript, ejecutado con `tsx`, que ya es devDependency).
El seed se cablea mediante la clave **`migrations.seed`** dentro del `defineConfig` de Prisma 7
en `apps/api/prisma.config.ts` (NO `prisma.seed`, que es el mecanismo legado de Prisma ≤5 y no
existe en Prisma 7):

```ts
// apps/api/prisma.config.ts
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
```

Además se añade un script npm real `"prisma:seed": "tsx prisma/seed.ts"` en
`apps/api/package.json` como atajo (no se inventan comandos: se declara en package.json). El
seed es **idempotente** (`upsert` por clave única) para poder re-ejecutarse sin duplicar;
garantiza siempre las 3 filas de `Role` (ver Hallazgo 6).

Contenido sintético (nada productivo; **sin** los valores de prueba/"ruido" como "aa" que
`20-master-data.md` prohíbe copiar; sin datos personales reales):

- **Roles** (3): `JEFE_AREA`/"Jefe de área", `LIDER_PROCESO`/"Líder de proceso",
  `INTEGRANTE`/"Integrante".
- **Procesos** (4): `FIBI`/"BI" (framework INS-006, kind PROCESS), `FIID`/"Integraciones"
  (INS-005), `FIAA`/"IA" (INS-004), `FMAA`/"Coordinación multiproceso" (INS-007,
  kind COORDINATION) — datos de `20-master-data.md`.
- **Usuarios** sintéticos (dominio ficticio `demo.local`): `jefe@demo.local`/"Ana Jefa",
  `lider.bi@demo.local`/"Beto Líder BI", `integrante.bi@demo.local`/"Carla Integrante BI",
  `lider.ia@demo.local`/"Diego Líder IA".
- **Grants** que ejercitan los controles negativos de `10`:
  - Jefa: grant `JEFE_AREA` en los 4 procesos (control de área completa).
  - Líder BI: `LIDER_PROCESO` solo en `FIBI` (sin grant en FIID/FIAA → debe fallar cross-proceso).
  - Integrante BI: `INTEGRANTE` solo en `FIBI`.
  - Líder IA: `LIDER_PROCESO` solo en `FIAA`.
- **Maestras base** en `CatalogItem` (reutilizando el modelo existente), con familias y
  valores representativos **confirmados** de `20-master-data.md` (sin valores de prueba):
  `TRIAGE_DECISION` (Continuar/Devolver/Rechazar), `CRITICALITY`
  (Baja/Media/Alta/Crítica), `DATA_AVAILABILITY` (Sí/Parcial/No), `PRIORITY`
  (Muy alta/Alta/Media/Baja), `TASK_STATUS` (Por hacer/En curso/Bloqueada/En revisión/Terminada),
  `DOC_STATUS` (Borrador/Vigente/Archivada), `DEMAND_TYPE`
  (Desarrollo/Evolución/Soporte-Incidente/Deuda técnica/Exploración), `ASSET_TYPE`
  (Modelo de datos/Dashboard/Integración/API/Agente/Modelo de IA/Pipeline/Base de datos/Reporte/Otro).
  Solo maestras base de la fundación; no se crean maestras de fases futuras no usadas.

El seed registra sus escrituras **sin** `actorUserId` (actor del sistema).

---

## 2. Autorización por rol + proceso/alcance (NestJS)

### 2.1 Modelo de decisión

La autorización se evalúa **siempre en servidor**, en cada lectura y escritura; ocultar el
menú no es control suficiente (`10`, BR-019, UI-07, SCR-23). Dos dimensiones combinadas:

1. **Rol requerido**: la operación exige uno de un conjunto de roles (p. ej. administrar
   grants exige `JEFE_AREA`).
2. **Alcance de proceso**: para recursos ligados a un proceso, el actor debe tener un grant
   **activo** en ese proceso (salvo administración de área, §2.4).

### 2.2 Contexto del actor (`CurrentActor`)

Un objeto resuelto por petición (ver §3) y disponible vía `@CurrentActor()` param-decorator:

```ts
interface ActorGrant { processId: string; roleCode: RoleCode; }
interface CurrentActor {
  userId: string;
  grants: ActorGrant[];           // solo grants activos
  roleCodes: Set<RoleCode>;       // unión de roles sobre todos los grants
  scopedProcessIds: Set<string>;  // procesos con grant activo
  isJefeArea: boolean;            // tiene algún grant JEFE_AREA
}
```

El Jefe de área administra **el área** (`10`: "Jefe gestiona el área, aprobación, equipo/roles,
auditoría y capacidad global"). Como en Fase 1 "área = conjunto de procesos" (§1.1), modelamos
el alcance del jefe en **dos planos** explícitos (resolviendo así la contradicción del
Hallazgo 5, detallada en §2.4): para recursos ligados a proceso, su alcance son sus
`scopedProcessIds` (procesos con grant Jefe); para la **administración de área** (gestión de
`User` y concesión/revocación de grants en cualquier proceso), basta `isJefeArea`. No se
infiere un rol global que ignore asignaciones (`02-modules.md`/`10`): el jefe sigue
necesitando grants, y el seed le otorga grant Jefe en los 4 procesos.

### 2.3 Guards y decorators (reutilizables por fases siguientes)

Todo bajo `apps/api/src/modules/auth/` (módulo transversal, exportado):

- **`CurrentUserGuard`**: resuelve el header de identidad (§3) a un `CurrentActor` y lo
  adjunta a `request.actor`. Si no hay header o el usuario no existe / está inactivo →
  `401 Unauthorized` (en dev esto significa "no seleccionaste usuario").

  **Registro (Hallazgo 3 — decisión):** se aplica **a nivel de cada módulo de dominio**
  (`providers: [{ provide: APP_GUARD, ... }]` **NO** se usa). Se declara como guard de módulo
  (`@UseGuards(CurrentUserGuard)` a nivel de controller) en: `process`, `user`, `grant`,
  `audit`, `me` y `catalog`. **No** se registra `APP_GUARD` global, para no tener que
  exceptuar rutas públicas de forma frágil.

  **Rutas exentas del guard (públicas):**
  - `GET /health` (debe seguir abierta).
  - `GET /dev/actors` (ruta de **arranque** del selector dev; ver Hallazgo 4 y §3.4).

- **`@Roles(...codes: RoleCode[])`** + **`RolesGuard`**: exige que el actor tenga al menos
  uno de los roles indicados (en cualquier grant activo). Falla → `403 Forbidden`.

- **`@CurrentActor()`**: param-decorator que inyecta `request.actor`.

> **Alcance de proceso en Fase 1 (Hallazgo 2 — decisión).** En Fase 1 **no** existe un guard de
> alcance de proceso. El alcance del **Plano A** (recursos ligados a proceso) se garantiza
> **exclusivamente** por la cláusula `where` del service (filtrado por `scopedProcessIds`), que
> produce el 404 natural descrito en §2.4. No hay un segundo mecanismo. El decorator/guard
> `@ProcessScope`/`ProcessScopeGuard` **queda fuera de alcance de Fase 1** y se documenta en §8
> como gancho reutilizable para Solicitud/Tarea de fases siguientes, donde un recurso llega por
> `:id` y necesita resolver su `processId` antes de tocar el service. No se crea ni se prueba en
> esta fase para no dejar código sin punto de montaje.

Los guards de Fase 1 (`CurrentUserGuard`, `RolesGuard`) leen metadata con `Reflector` (patrón
estándar NestJS). Orden en un controller: `CurrentUserGuard` → `RolesGuard`. Son clases sin
estado, inyectables, 100% unit-testeables con un `ExecutionContext` simulado.

### 2.4 Dos planos de autorización y política 403 vs 404 (sin filtrar datos)

Para resolver el Hallazgo 5, se distinguen **explícitamente** dos planos:

**Plano A — recursos ligados a proceso** (lectura de `Grant`, `AuditEvent`, y futuros
Solicitud/Tarea): el alcance efectivo del actor es `scopedProcessIds`. Reglas (`10` controles
negativos 1–2, 4, AC-025/026):
- Los **listados** se filtran siempre por `scopedProcessIds` (o por `actorUserId` en auditoría
  de integrante); un listado nunca incluye registros fuera de alcance; el estado vacío es
  legítimo (AC-030). El Jefe ve los grants/eventos de los procesos donde tiene grant Jefe
  (en el seed, los 4).
- Un **detalle** de un recurso de un proceso sin grant → el service consulta filtrando por
  `scopedProcessIds`; si no aparece lanza `NotFoundException` → **404** (no 403), para no
  confirmar que el recurso existe en otro proceso ("denegar sin filtrar datos", control 2).

**Plano B — administración de área** (`Process` como entidad, `User`, y **concesión/revocación
de grants**): no son recursos "dentro de" un proceso. `User` no pertenece a un proceso; `Process`
es el **catálogo de procesos del área**, cuya administración es competencia del jefe (`10`
"Jefe gestiona el área … equipo/roles"); y la concesión de grants es un acto de administración
de área. Reglas:
- Requieren rol `JEFE_AREA` (`isJefeArea`), verificado por `@Roles(JEFE_AREA)` → si no, **403**
  (acción conocida, prohibida al rol: controles 1/3, AC-027/029).
- **No** se filtran por `scopedProcessIds`: el jefe de área administra toda el área
  (= todos los procesos, §1.1). Por eso `POST /grants` puede conceder un grant en cualquier
  proceso; `GET /users` devuelve todos los usuarios; y `GET /processes`, `GET /processes/:id`,
  `PATCH /processes/:id` devuelven/editan **cualquier** proceso del área para el jefe, incluido
  **el que acaba de crear con `POST /processes`** (resuelve el Hallazgo 1: el proceso recién
  creado es visible y editable por su creador sin necesidad de un grant propio, porque la
  entidad `Process` no se filtra por `scopedProcessIds`). Esto hace coherentes §2.2 y §2.4:
  el filtro por `scopedProcessIds` aplica al Plano A, **no** al Plano B.

**Lectura de `Process` para roles no-jefe (sin filtrar datos).** `GET /processes` y
`GET /processes/:id` también son accesibles a líder/integrante (necesitan ver sus procesos),
pero para rol **no-jefe** el service filtra por `scopedProcessIds`: el listado devuelve solo
sus procesos y el detalle de un proceso fuera de alcance da **404** (control 2). Así, el jefe
administra todos los procesos (sin filtro) y el no-jefe sólo ve los suyos. La escritura de
procesos (`POST`/`PATCH`) exige `JEFE_AREA` → 403 para no-jefe (control 1, AC-029).

**Resumen operativo (Decisión de Fase 1).** El mapeo concreto a códigos HTTP es una decisión
de diseño: ningún spec menciona 403/404; `specs/18` AC-025 y `specs/10` control negativo 2 solo
exigen "denegar sin filtrar datos no autorizados". De ahí se deriva: 403 = "sabés qué es, no
podés" (rol insuficiente, Plano B o escritura); 404 = "no te mostramos siquiera que existe"
(recurso de proceso fuera de alcance, Plano A, o `Process` de un no-jefe fuera de su alcance). **Único mecanismo de alcance en Fase 1:** el
filtrado por `scopedProcessIds` se hace en la cláusula `where` de Prisma dentro del service,
nunca en un guard (no existe `ProcessScopeGuard` en esta fase, §2.3), para que un recurso
fuera de alcance resulte naturalmente en 404 sin confirmar su existencia.

**Auditoría (lectura, Plano A con matices de rol, `10`/`15`):** integrante lee solo sus
propios eventos (`actorUserId = actor.userId`); líder, los de sus procesos
(`scopeProcessId ∈ scopedProcessIds`); jefe, los de sus procesos de área. Un integrante nunca
ve auditoría ajena (control negativo 4, AC-025).

### 2.5 Testabilidad

- **Unit (Jest)**: `RolesGuard` con `ExecutionContext` y `Reflector` simulados — decisiones
  permitir/403. (No hay `ProcessScopeGuard` en Fase 1; §2.3.) Services con `PrismaService`
  mockeado, igual que `catalog.service.spec.ts`, verificando el filtrado por `scopedProcessIds`
  dentro del `where` (Plano A y `Process` de no-jefe) y el no-filtrado del Plano B (jefe ve
  todos los procesos/usuarios).
- **E2E (Playwright)**: los controles negativos 1–4 de `10` como flujos: integrante→triage/
  admin (403), líder A→recurso B (404), líder→conceder grant (403), integrante→auditoría ajena.
  Mapean a AC-025/026/027/029.

---

## 3. Contexto de usuario actual para desarrollo

### 3.1 Mecanismo

El frontend envía la cabecera **`X-Actor-Id`** con el `identifier` del usuario seleccionado
(selector de "usuario actual", §5). El backend la resuelve en `CurrentUserGuard`:

1. Lee `X-Actor-Id` del request.
2. Busca `User` activo por `identifier` (único) + sus `Grant` activos con `role` y `process`
   (`findUnique({ where: { identifier }, include: { grants: { where: { active: true }, include: { role: true, process: true } } } })`).
3. Construye `CurrentActor` (§2.2) y lo adjunta a `request.actor`.
4. Si falta la cabecera o el usuario no existe/está inactivo → `401`.

Se usa `identifier` (no el UUID) en el header para que el selector de dev sea legible y
estable frente a reseeds.

### 3.2 Por qué es una capa separada y reemplazable

`specs/00-product.md`, `01-domain.md` y `10` establecen que el acceso al Site es una
condición separada del permiso funcional, y `specs/28` punto 10 marca autenticación/provisión
como **pendiente**: no se debe reconstruir. Por eso:

- La resolución de identidad vive aislada en un **único proveedor** (`DevActorResolver` dentro
  de `auth/`), detrás de una interfaz `ActorResolver`. `CurrentUserGuard` depende de la
  interfaz, no del header. El día que exista auth real, se sustituye el provider (p. ej. uno
  que lea un JWT/sesión) sin tocar guards, decorators ni servicios de dominio.
- Está documentada en código y en `docs/` como **solo desarrollo**: el header es confiable
  únicamente porque en dev no hay frontera de seguridad real. En `.env` se expone
  `AUTH_MODE=dev-header` (configurable, no hardcodeado) para dejar explícito el modo; otro
  `AUTH_MODE` elegiría otro resolver.
- No se crean endpoints de login, invitación ni provisión (`28` punto 10). El `User` es solo
  identidad funcional.

### 3.3 Endpoint "Mis permisos" (SCR-23 / FNC-026)

`GET /me/permissions` (requiere actor; cualquier rol). Devuelve, para el actor actual:

- `userId`, `name`, `identifier`.
- `grants`: lista `{ processId, processCode, processName, roleCode, roleName }` (grants activos).
- `allowedModules`: lista de `moduleKey` permitidos, derivada de la **matriz de módulos** de
  `10` cruzando el/los rol(es) del actor. La matriz se codifica como una constante
  `MODULE_MATRIX: Record<ModuleKey, RoleCode[]>` en `auth/` (fuente única), usando las claves
  exactas de `10`: `demandOverview`, `dashboard`, `requests`, `triage`, `priority`, `plan`,
  `portfolio`, `project`, `assigned`, `task`, `log`, `meeting`, `asset`, `docs`, `capacity`,
  `admin`, `frameworks`, `review`, `audit`, `team`, `permissions`. Ejemplos de `10`:
  `admin: [JEFE_AREA]`, `team: [JEFE_AREA]`, `triage: [JEFE_AREA, LIDER_PROCESO]`,
  `permissions: [JEFE_AREA, LIDER_PROCESO, INTEGRANTE]`, `audit: [todos con alcance]`.

Este endpoint es el que consume el frontend para filtrar el menú (§5), de modo que el gating
de UI y el server-side comparten la misma matriz (una sola fuente de verdad, sin duplicar
reglas: steering).

### 3.4 Endpoint de arranque del selector dev (Hallazgo 4)

`GET /dev/actors` — **ruta pública de arranque**, **exenta** de `CurrentUserGuard`
(resuelve la dependencia circular: el selector elige el actor que puebla `X-Actor-Id`, así que
no puede exigir actor para listar los actores disponibles). Características:

- Activa **solo** cuando `AUTH_MODE=dev-header`. Con cualquier otro `AUTH_MODE`, el controller
  responde `404 Not Found` (la ruta no existe funcionalmente fuera de dev).
- Devuelve `[{ identifier, name }]` de **usuarios activos**, sin datos sensibles (no expone
  grants, auditoría ni otros campos). Lectura mínima pensada para poblar el `Select` del
  selector de dev.
- Vive en `auth/DevActorsController`; su lógica consulta `User` activos ordenados por `name`.
  Como es parte de la capa de dev reemplazable (§3.2), desaparece junto con el modo
  `dev-header` cuando exista auth real.

---

## 4. API REST + OpenAPI

### 4.1 Convenciones (heredadas del módulo catalog)

- Controllers finos: reciben HTTP, aplican DTOs y delegan en el service.
- DTOs con `class-validator`/`class-transformer`; `ValidationPipe` global ya activo
  (whitelist + forbidNonWhitelisted + transform, confirmado en `app.config.ts`).
  `@Transform(trim)` en strings.
- `@nestjs/swagger` en todos los endpoints (`@ApiTags/@ApiOperation/@ApiResponse/@ApiBody/
  @ApiParam/@ApiQuery`), como en `catalog.controller.ts`.
- Response DTOs separados del modelo Prisma (no filtrar forma de persistencia).
- P2002 → `ConflictException`; `findOne` inexistente → `NotFoundException` (patrón del service,
  confirmado en `catalog.service.ts`).
- `DELETE` se agrega a `methods` de CORS en `app.config.ts` (hoy `['GET','POST','PATCH']`;
  pasa a `['GET','POST','PATCH','DELETE']`).

### 4.2 Endpoints

Todos los de dominio pasan por `CurrentUserGuard` (salvo las exentas de §2.3). Admin = `JEFE_AREA`.

**Procesos** (`processes`) — entidad **Plano B** (administración de área; §2.4, Hallazgo 1)
| Método | Ruta | Rol | Alcance | Notas |
|---|---|---|---|---|
| GET | `/processes` | todos | jefe: **todos** los procesos del área; no-jefe: filtra a `scopedProcessIds` | lista procesos |
| GET | `/processes/:id` | todos | jefe: cualquiera; no-jefe: solo con grant → 404 fuera de alcance | detalle |
| POST | `/processes` | JEFE_AREA | área (no requiere grant previo) | crea proceso; audita CREATE. El creador lo ve/edita de inmediato (Plano B, sin filtro) |
| PATCH | `/processes/:id` | JEFE_AREA | área (cualquier proceso) | edita name/framework/active/sortOrder; audita UPDATE |

**Usuarios** (`users`) — Plano B (administración de área; no se filtra por proceso)
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/users` | JEFE_AREA | lista todos los usuarios (gestión de equipo, SCR-22) |
| GET | `/users/:id` | JEFE_AREA | detalle con sus grants |
| POST | `/users` | JEFE_AREA | crea identidad funcional; audita CREATE |
| PATCH | `/users/:id` | JEFE_AREA | edita name/active; audita UPDATE |

**Grants** (`grants`) — concesión/revocación = Plano B; lectura = Plano A
(SCR-22; líder NO concede grants: AC-027, BR-020)
| Método | Ruta | Rol | Alcance | Notas |
|---|---|---|---|---|
| GET | `/grants` | JEFE_AREA | lectura filtrada por `scopedProcessIds` del jefe | filtros `userId`/`processId` opcionales |
| POST | `/grants` | JEFE_AREA | área (cualquier proceso del área) | algoritmo §4.2.1; audita CREATE |
| DELETE | `/grants/:id` | JEFE_AREA | área | revoca (soft: active=false); audita REVOKE |

**Mis permisos** (`me`)
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/me/permissions` | todos | §3.3; rol+procesos+módulos permitidos |

**Auditoría** (`audit`) — lectura con alcance (`10`, `15`)
| Método | Ruta | Rol | Alcance | Notas |
|---|---|---|---|---|
| GET | `/audit-events` | todos | integrante=propios; líder/jefe=sus procesos | `take` ≤ 500 (tope de UI); orden `createdAt desc` |

**Dev** (`dev`) — solo arranque dev
| Método | Ruta | Rol | Notas |
|---|---|---|---|
| GET | `/dev/actors` | público (exento) | §3.4; solo `AUTH_MODE=dev-header`; `[{identifier,name}]` |

**Catálogos** (`catalog-items`) — ya existe; se preserva. En Fase 1 se le aplica
`CurrentUserGuard` y se exige `JEFE_AREA` para POST/PATCH (SCR-18: configuración/maestras solo
jefe, matriz `admin`), manteniendo GET para lectura. Las mutaciones de catálogo pasan a
auditarse (AuditEvent `objectType=CATALOG_ITEM`, `scopeProcessId=null`). GET de catálogos
permanece disponible como hoy para que `/catalogs` siga funcionando.

#### 4.2.1 Algoritmo de `POST /grants` (único lugar — Hallazgo 8)

Dado `{ userId, roleCode, processId }` validado por DTO:

1. Resolver `roleCode → Role` con `findUnique({ where: { code: roleCode } })`. Si la fila no
   existe (BD sin seed) → `500` genérico (fallo de datos del sistema, no de entrada; §4.4,
   Hallazgo 6).
2. Verificar que existen `User` y `Process` referidos; si falta alguno → `404 NotFound` del
   referido.
3. Buscar grant por `(userId, roleId, processId)`:
   - **Existe y `active=true`** → `409 Conflict` ("el grant ya existe y está activo").
   - **Existe e `active=false`** → `update active=true` dentro de la transacción +
     `AuditEvent action=CREATE` (se trata la reactivación como un alta lógica: el efecto es
     "el grant vuelve a existir"; `before={active:false}`, `after={active:true}`). Se elige
     `CREATE` y **no** se añade un `REACTIVATE` para no inflar el enum del `action`; el
     `before/after` deja la reactivación perfectamente trazable.
   - **No existe** → `create` + `AuditEvent action=CREATE` (`before=null`).

`DELETE /grants/:id`: `update active=false` + `AuditEvent action=REVOKE`
(`before={active:true}`, `after={active:false}`). Si el grant no existe → `404`.

### 4.3 DTOs (validaciones por entrada externa)

Toda entrada externa se valida con DTO. Reglas (requerido/opcional, tipo, límites, fallo):

- **CreateProcessDto**: `code` string requerido, trim, `MaxLength(50)`, normalizado a
  MAYÚSCULAS en service; `name` requerido `MaxLength(255)`; `framework?` string `MaxLength(50)`;
  `kind?` `@IsEnum(['PROCESS','COORDINATION'])` (default `PROCESS`); `sortOrder?` int `Min(0)`.
  Fallo de validación → 400. `code` duplicado → 409.
- **UpdateProcessDto**: `name?`, `framework?`, `active?` bool, `sortOrder?` int `Min(0)`.
  `code` y `kind` no editables (estables).
- **CreateUserDto**: `identifier` requerido, trim, `MaxLength(255)` (se usa
  `@IsString`+`MaxLength` y **no** `@IsEmail` para no imponer formato email, ya que el SDD
  habla de "email/identificador"); `name` requerido `MaxLength(255)`. `identifier` duplicado → 409.
- **UpdateUserDto**: `name?`, `active?`.
- **CreateGrantDto**: `userId` `@IsUUID`, `roleCode` `@IsEnum(RoleCode)`, `processId` `@IsUUID`.
  `roleCode` se recibe como code (no uuid) por legibilidad y se resuelve a `roleId` en el
  service (§4.2.1). Validación cruzada y errores en §4.2.1 / §4.4.
- **ListGrantsDto / ListAuditEventsDto / ListProcessesDto**: filtros opcionales
  (`userId?`, `processId?`, `active?`, `objectType?`), validados con `@IsOptional` +
  `@IsUUID`/`@IsBoolean`/`@IsString`. `take` de auditoría fijado por el service a ≤ 500.
- Respuestas: `ProcessResponseDto`, `UserResponseDto`, `GrantResponseDto`,
  `MyPermissionsResponseDto`, `AuditEventResponseDto`, `DevActorResponseDto`, todos con
  `@ApiProperty`. Fechas como `date-time`. `before`/`after` como `object` nullable en swagger.

### 4.4 Códigos de estado y manejo de errores

| Situación | Código | Detalle |
|---|---|---|
| Lectura / PATCH ok | 200 | — |
| POST ok | 201 | recurso creado |
| DELETE (revoke) ok | 200 | devuelve el grant actualizado (para que el api-client tipe el resultado; consistente con el resto) |
| Validación DTO | 400 | detalles de campo de class-validator |
| Sin actor / usuario inválido | 401 | header `X-Actor-Id` ausente o usuario inactivo |
| Rol insuficiente (Plano B o acción) | 403 | `RolesGuard` |
| Recurso inexistente o fuera de alcance (Plano A) | 404 | 404 también para cross-proceso, sin filtrar |
| Conflicto de unicidad | 409 | P2002 → `ConflictException`; grant activo duplicado |
| `roleCode` válido por enum pero fila `Role` ausente (BD sin seed) | 500 | genérico, sin detalle Prisma (fallo de datos del sistema; Hallazgo 6) |
| Error Prisma no previsto / BD caída | 500 | genérico, **sin** stack ni detalle Prisma |
| Fallo al escribir AuditEvent dentro de la tx | 500/409 | la mutación completa hace rollback (atomicidad, §6) |

Ningún error de Prisma se expone al cliente (steering): solo P2002→409 y mensajes de negocio;
el resto se mapea a 404/400/500 genéricos. El frontend nunca ve stack ni JSON interno
(`lib/catalog.ts` ya establece el patrón de traducción por status).

### 4.5 Regeneración de contrato

Cada cambio de contrato se acompaña de `npm run contracts:generate` (ya existe:
`openapi:generate` + `api-client:generate`), y se committean `apps/api/openapi/openapi.json`
y `packages/api-client/src/generated/*`. `generate-openapi.ts` usa `app.config.ts` y no abre
conexión a BD, así que funciona sin PostgreSQL. El frontend consume **solo** vía
`@plantilla-portales/api-client` (confirmado en `apps/web/src/lib/api-client.ts`).

---

## 5. Frontend (apps/web)

### 5.1 Estructura de rutas (App Router)

Se amplía `apps/web/src/app/` manteniendo `/catalogs` operativo e integrándolo como
"Configuración / maestras":

```
app/
  layout.tsx                 ← layout base con sidebar agrupado + selector de usuario + Toaster
  page.tsx                   ← redirige a /inicio (hoy redirige a /catalogs; se actualiza)
  inicio/page.tsx            ← placeholder "Control del área" (SCR-01)
  mi-trabajo/page.tsx        ← placeholder (SCR-02)
  demanda/.../page.tsx       ← placeholders por pantalla (solicitudes, triage, ...)
  seguimiento/.../page.tsx   ← placeholders
  activos/.../page.tsx       ← placeholders
  administracion/
    maestras/page.tsx        ← SCR-18 Configuración/maestras = vista de /catalogs reubicada
  gobierno/
    equipo/page.tsx          ← SCR-22 Equipo y permisos (funcional, solo jefe) [grupo Gobierno, per 02-modules.md]
    auditoria/page.tsx       ← lectura con alcance (SCR-21)
    mis-permisos/page.tsx    ← SCR-23 funcional (todos)
  catalogs/page.tsx          ← se mantiene operativo (reexporta la misma CatalogsView)
```

Decisión: `/catalogs` se **mantiene** como ruta funcional (no romper nada) y además se
enlaza desde el grupo Administración → Configuración/maestras reutilizando la vista existente
(`CatalogsView`) sin duplicar código. Las pantallas no construidas son placeholders claros
("En construcción") pero **el menú y el gating son reales**.

### 5.2 Layout y navegación agrupada

El sidebar refleja los 6 grupos de `02-modules.md`/`00-product.md`: **Inicio, Demanda,
Seguimiento, Activos, Administración, Gobierno** (UI-01). Cada ítem declara su `moduleKey`
(la misma clave de la matriz de `10`). El layout:

- Lee el actor actual del contexto de cliente (§5.3) y su `allowedModules` desde
  `GET /me/permissions`.
- **Filtra** los ítems del menú por `allowedModules` (UI-07): un integrante no ve Triage,
  Admin ni Team; solo Jefe ve Administración (`admin`/`team`). El filtrado de menú es
  cosmético — el control real es server-side (§2), pero el menú no debe mostrar lo prohibido.
- HTML semántico: `<nav aria-label>`, `<ul>/<li>`, `<a>`; estados de foco de los componentes
  shadcn; `aria-current` en la ruta activa.

### 5.3 Selector de "usuario actual" (dev)

Componente en el layout (header del sidebar): un `Select` (shadcn) poblado desde
`GET /dev/actors` (§3.4), que **no** requiere actor (resuelve el arranque; Hallazgo 4). Al
elegir un usuario:

- Se guarda el `identifier` en `localStorage` (`actorId`).
- Un **middleware de request** de `openapi-fetch` (`client.use({ onRequest })` en
  `apps/web/src/lib/api-client.ts`) añade `X-Actor-Id` leyendo `localStorage` en cada
  petición (decisión: middleware, para no recrear el cliente al cambiar de actor; confirmado
  compatible con `createApiClient`).
- Documentado como mecanismo exclusivo de desarrollo (§3.2).

### 5.4 Pantallas funcionales de Fase 1

- **Mis permisos (SCR-23)**: consume `GET /me/permissions`; muestra rol(es), procesos/alcance
  y módulos permitidos, con texto de acciones no permitidas derivado de la matriz. Estados
  loading/error/éxito.
- **Equipo y permisos (SCR-22)** — grupo **Gobierno** (per `02-modules.md`), solo jefe: lista usuarios y sus grants
  (`GET /users`, `GET /grants`), permite crear usuario, crear grant (user+rol+proceso) y
  revocar grant (`POST /users`, `POST /grants`, `DELETE /grants/:id`). Básica pero funcional.
- **Configuración / maestras (SCR-18)** — solo jefe: la vista `/catalogs` existente,
  integrada en el grupo Administración. CRUD de `CatalogItem` ya implementado; se preserva.
- **Auditoría (SCR-21)**: lectura con alcance (`GET /audit-events`); tabla con fecha, actor,
  proceso, acción, objeto y "Ver cambio" (before/after). Integrante ve solo lo propio.

### 5.5 Estados UI obligatorios

Toda vista con datos implementa **loading / vacío / error / éxito** (UI-02/UI-06, AC-030/031),
siguiendo el patrón de `catalogs-view.tsx`: `Skeleton` en loading, bloque de error con
"Reintentar", bloque de estado vacío con acción si el rol permite crear, `toast` (sonner) en
éxito/error de mutaciones. Errores HTTP se traducen a mensajes entendibles como en
`lib/catalog.ts` (`messageForStatus`: 400/401/403/404/409), **sin** exponer JSON crudo ni
detalles de Prisma. 403/404 se comunican como "No tienes acceso" / "No existe o fue removido"
sin revelar datos. Accesibilidad: labels asociados (`<Label htmlFor>`), `aria-live` en
regiones de carga, HTML semántico.

**Conservación de la entrada ante error (AC-031).** En las pantallas con formularios de
mutación —Equipo y permisos (crear usuario, crear grant), Configuración/maestras (crear/editar
`CatalogItem`)— cuando la mutación falla (`POST`/`PATCH`/`DELETE` devuelve 400/409/500), el
formulario **no se limpia ni se cierra**: conserva los valores que el usuario ya ingresó,
mantiene el foco accesible y muestra el mensaje de error (toast + mensaje en línea cuando el
error es de un campo), de modo que el usuario corrija y reintente sin reescribir. Esto cubre
expresamente AC-031 ("comunica error **y conserva datos ingresados recuperables**"). En la
práctica, el estado del formulario (React state / `react-hook-form`) solo se reinicia en el
camino de **éxito** (201/200); el `onError` del cliente de mutación nunca llama al `reset`.
Patrón consistente con `catalogs-view.tsx`, que no vacía el formulario en el fallo.

---

## 6. AuditEvent: integración en mutaciones

### 6.1 Dónde se registra

Toda mutación (`POST`/`PATCH`/`DELETE`) de Process, User, Grant y CatalogItem debe producir
un `AuditEvent` (BR-024, `15`, AC-028, `25` punto 4). **Decisión:** el registro se hace en el
**service**, dentro de la **misma transacción Prisma** que la mutación
(`prisma.$transaction(async (tx) => { ... })`), para garantizar atomicidad: o se escriben el
cambio y su evento, o ninguno. No se usa un interceptor global porque necesita el `before`
(estado previo) y el `scopeProcessId`, específicos de cada operación; un interceptor no conoce
el estado previo sin duplicar lecturas.

Se encapsula en un **`AuditService`** (módulo `audit/`, inyectable) con un método
`record(tx, { actorUserId, action, objectType, objectId, scopeProcessId, before, after })` que
recibe el cliente transaccional. Cada service de dominio lo invoca tras construir before/after.

### 6.2 Contenido

- `actorUserId`: del `CurrentActor` (null en seed).
- `before`/`after`: snapshot del registro antes y después; en CREATE `before=null`, en REVOKE
  `after={active:false}`.
- `scopeProcessId`: Process → su propio id; Grant → su `processId`; CatalogItem → null; User → null.
- `action`: CREATE/UPDATE/DELETE/REVOKE (la reactivación de grant usa CREATE, §4.2.1).

### 6.3 Invariante y su dueño

**Invariante**: "ninguna mutación de dominio sin su AuditEvent". **Dueño**: la capa de service
del backend (único lugar con acceso a Prisma y al actor). Se refuerza con la transacción y se
verifica con pruebas unitarias que afirman que, tras una mutación, se llamó a
`AuditService.record` con los campos correctos. El frontend no participa de este invariante.

### 6.4 Manejo de errores de las operaciones

| Operación | Falla posible | Recuperable/fatal | Qué recibe el caller | Log |
|---|---|---|---|---|
| create (unique) | P2002 | recuperable | 409 ConflictException | no (esperado) |
| create/update ref inexistente | FK / findOne null | recuperable | 404 NotFoundException | no |
| `roleCode` sin fila Role (BD sin seed) | findUnique null | fatal (datos del sistema) | 500 genérico | error (server) |
| actor sin header/usuario | — | recuperable | 401 | warn (dev) |
| rol insuficiente | — | recuperable | 403 | no (esperado) |
| recurso fuera de alcance (Plano A) | where sin match | recuperable | 404 (no 403, no filtra) | no |
| validación DTO | class-validator | recuperable | 400 con detalles de campo | no |
| BD caída / error no previsto | PrismaClient error ≠ P2002 | fatal | 500 genérico, **sin** detalle Prisma | error (server) |
| fallo al escribir AuditEvent | error en tx | fatal (rollback) | la mutación completa falla → 500/409 según causa | error |

---

## 7. Pruebas (estrategia por capa)

Según steering de pruebas (Jest unit backend + Playwright E2E; se usan `npm run test:unit`,
`npm run test:e2e`, `npm run test:all` ya declarados).

**Unit (Jest, `apps/api`)** — prioridad: permisos, reglas, validaciones, errores:
- `RolesGuard`: permitir vs 403 (ExecutionContext simulado). (No hay `ProcessScopeGuard` en
  Fase 1; §2.3.)
- `*Service` con Prisma mockeado (patrón `catalog.service.spec.ts`): filtrado por
  `scopedProcessIds` en el `where` (Plano A y `Process` de no-jefe), no-filtrado del Plano B
  (jefe ve todos los procesos/usuarios, y el proceso recién creado por `POST /processes` es
  legible/editable por el jefe sin grant propio — Hallazgo 1), P2002→409, findOne→404,
  `roleCode` sin fila→500, grant duplicado activo→409, reactivación de grant inactivo→CREATE,
  revoke soft→REVOKE, invocación de `AuditService.record` en cada mutación.
- `MODULE_MATRIX` / resolución de `allowedModules` por rol.
- Seed idempotente (función pura de construcción de datos).

**E2E (Playwright, `/e2e`)** — flujos críticos y controles negativos de `10`:
- AC-025: integrante abre URL de triage/admin → denegado sin datos.
- AC-026: líder A pide recurso de proceso B → 404.
- AC-027: líder intenta conceder grant → 403.
- AC-028: jefe muta recurso → aparece en auditoría con actor/acción/fecha.
- AC-029: no-jefe intenta configuración → denegado.
- AC-030: estado vacío de un listado sin registros, con acción de crear si el rol lo permite.
- AC-031 (preservación de la entrada): el jefe envía el formulario de crear usuario (o grant)
  con un `identifier`/combinación **duplicada** → `409`; se verifica que la UI muestra el error
  **y** que los campos del formulario conservan los valores ingresados (no se limpian), de modo
  que el jefe puede corregir y reintentar.
- AC-028: tras `POST /processes` el jefe ve y edita el proceso recién creado (Hallazgo 1).
- Menú filtrado: el sidebar de un integrante no muestra Administración/Triage.
- Arranque: con `AUTH_MODE=dev-header`, el selector carga `GET /dev/actors` sin actor previo.

---

## 8. Fuera de alcance (explícito)

Respetando `specs/28` (todo lo marcado **P**) y el enunciado de Fase 1:

- **Autenticación/login/invitación/provisión reales** (`28` punto 10): solo header de dev.
- **`@ProcessScope`/`ProcessScopeGuard`** (Hallazgo 2): guard de alcance de proceso para
  recursos que llegan por `:id` y requieren resolver su `processId` antes de tocar el service
  (Solicitud, Tarea, Plan de fases 2+). En Fase 1 el alcance se resuelve **solo** en el `where`
  del service (§2.4), así que el guard **no se crea ni se prueba** aquí; queda como gancho
  reutilizable documentado para la primera feature que exponga recursos por proceso vía `:id`.
- **Entidad Área administrable / multi-área** (`07`/`01` describen Área pero sin atributos
  confirmados): en Fase 1 "área = conjunto de procesos"; no hay tabla `Area`.
- **Cardinalidad multi-grant exacta, coexistencia de grants duplicados, delegación temporal,
  escalamiento, permiso por campo** (`07`/`10` "No determinado", **P**): decisión mínima en §1.2.
- **BR-001 "proceso principal participa"** (regla de Solicitud, FEATURE-002): fase posterior.
- **Fórmula de prioridad, umbrales exactos, detalle de Excel, transiciones terminales, matriz
  completa de frameworks** (`28` puntos 4,5,7; BR-005).
- **Entidades de fases posteriores**: Solicitud, Triage, Prioridad, Plan, Fase, Tarea,
  Capacidad, Bitácora, Novedad, Reunión, Compromiso, Activo, Documento, Framework/control,
  Aprobación (fases 2+; `25-build-order.md`). Solo **placeholders** de pantalla.
- **Notificaciones, SLA, correo, integración externa, firma electrónica, tareas programadas**
  (`specs/03`, `00-product.md` límites AS-IS).
- **Retención/paginación real/exportación/anonimización/timezone de auditoría** (`15`/`28`
  punto 8 "No determinado"): solo tope de lectura ≤ 500 y before/after.
- **KPIs/métricas/fórmulas de Control del área** (SCR-01 **P**): placeholder.

---

## 9. Resumen de archivos a crear/modificar

**apps/api**
- `prisma/schema.prisma` — + Process, User, Role, Grant, AuditEvent.
- `prisma/migrations/<ts>_fase1_fundaciones/migration.sql` — vía `prisma migrate dev`.
- `prisma/seed.ts` + `prisma.config.ts` (seed) + `package.json` (`prisma:seed`).
- `src/modules/auth/` — `RoleCode`, `MODULE_MATRIX`, `ActorResolver`/`DevActorResolver`,
  `CurrentUserGuard`, `RolesGuard`, decorators (`@Roles`, `@CurrentActor`),
  `MeController` (`/me/permissions`), `DevActorsController` (`/dev/actors`, exento del guard).
  (Sin `ProcessScopeGuard`/`@ProcessScope` en Fase 1; §2.3 y §8.)
- `src/modules/audit/` — `AuditService`, `AuditController` (`/audit-events`), DTOs.
- `src/modules/process/`, `src/modules/user/`, `src/modules/grant/` — controller+service+dto+spec.
- `src/modules/catalog/` — aplicar `CurrentUserGuard` + `@Roles(JEFE_AREA)` en POST/PATCH +
  auditar mutaciones (sin romper GET).
- `src/app.module.ts` — registrar módulos nuevos.
- `src/app.config.ts` — añadir `DELETE` a métodos CORS.

**packages/api-client** — regenerado con `npm run contracts:generate` (committear artefactos).

**apps/web**
- `src/app/layout.tsx` — sidebar agrupado + selector de usuario + provider de actor.
- `src/app/page.tsx` — redirección a `/inicio`.
- rutas de grupos con placeholders + `administracion/maestras`, `gobierno/equipo` (SCR-22),
  `gobierno/mis-permisos`, `gobierno/auditoria`; `catalogs` sigue operativo.
- `src/lib/api-client.ts` — middleware `onRequest` que inyecta `X-Actor-Id`.
- `src/lib/me.ts`, `src/lib/team.ts`, `src/lib/audit.ts`, `src/lib/dev-actors.ts` — wrappers
  tipados (patrón `catalog.ts`).
- componentes shadcn ya presentes; añadir los que falten solo si el stack actual no basta.

Verificación de cierre (steering): `npm run typecheck`, `npm run build`, `npm run test:unit`
y `npm run test:e2e` deben pasar; `npm run contracts:generate` con artefactos committeados;
`/catalogs` sigue operativo.

---

## 10. Respuestas a la revisión (`design-review.json`)

### Revisión 4 (hallazgos de la tercera ronda — cerrados por el orquestador)

La tercera ronda de revisión salió con **0 HIGH, 2 MEDIUM, 2 NIT**. Los cuatro se resolvieron
directamente (correcciones de documento, sin rediseño) y con esto el diseño queda APROBADO para
implementación:

| # | Sev | Hallazgo | Resolución |
|---|---|---|---|
| 1 | MEDIUM | SCR-22 "Equipo y permisos" bajo Administración contradice `02-modules.md` (va en Gobierno) | **Corregido.** La pantalla se movió al grupo **Gobierno** (`gobierno/equipo/page.tsx`) en §5.1, §5.4 y §9, alineando con `02-modules.md`. Administración queda solo con Configuración/maestras (SCR-18). |
| 2 | MEDIUM | El seed se declaraba con `prisma.seed`, campo inexistente en Prisma 7 | **Corregido.** §1.4 ahora cablea el seed con `migrations.seed` dentro de `defineConfig` (Prisma 7), con el bloque de código correcto, y mantiene `prisma:seed` como atajo npm. |
| 3 | NIT | `prisma migrate dev` no era script versionado | **Corregido.** §1.3 añade `"prisma:migrate:dev": "prisma migrate dev"` a `apps/api/package.json`. |
| 4 | NIT | Política 403/404 presentada como regla del spec | **Corregido.** §2.4 ahora la antepone con "Decisión de Fase 1" y la deriva de AC-025 / control negativo 2 ("denegar sin filtrar datos"), no de un código HTTP del spec. |

### Revisión 3 (hallazgos de la segunda ronda)

| # | Sev | Hallazgo | Resolución |
|---|---|---|---|
| 1 | HIGH | Procesos creados por el jefe quedan huérfanos (invisibles/ineditables para su creador) | **Corregido — Opción A.** La **entidad `Process`** se trata como **Plano B** (administración de área): `GET /processes`, `GET /processes/:id` y `PATCH /processes/:id` para el jefe **no** se filtran por `scopedProcessIds`, así el proceso recién creado por `POST /processes` es visible y editable por su creador sin grant propio. Para rol no-jefe, la lectura de `Process` sigue filtrada por `scopedProcessIds` (404 fuera de alcance), manteniendo "denegar sin filtrar datos". Reescrito §2.4 (nuevo bloque "Lectura de `Process` para roles no-jefe") y las 4 filas de la tabla "Procesos" de §4.2, ahora internamente consistentes. Añadido E2E AC-028 (crear→ver/editar) en §7. |
| 2 | MEDIUM | `ProcessScopeGuard` especificado/probado/listado pero sin punto de montaje | **Corregido — Opción A.** Se **elimina `ProcessScopeGuard`/`@ProcessScope` de Fase 1**. §2.3 declara que el único mecanismo de alcance es el `where` del service (404 natural), sin segundo mecanismo. Se quitó el guard de §2.3 (orden de guards ahora `CurrentUserGuard → RolesGuard`), de las pruebas unit de §2.5 y §7, y de la lista de archivos de §9; se movió a §8 (Fuera de alcance) como gancho reutilizable para Solicitud/Tarea de fases siguientes. §2.4 reafirma el único punto de enforcement. |
| 3 | MEDIUM | AC-031 (conservar datos ingresados recuperables) no cubierto en frontend | **Corregido.** §5.5 añade regla explícita: ante error de mutación (400/409/500) el formulario **no se limpia ni se cierra**; conserva los valores ingresados, mantiene el foco y muestra el error para corregir y reintentar; el `reset` solo ocurre en el camino de éxito. §7 añade un caso E2E que, tras un `POST` fallido por duplicado (409), verifica que los campos conservan el valor ingresado. |

### Revisión 2 (primera ronda)

| # | Sev | Hallazgo | Resolución |
|---|---|---|---|
| 1 | MEDIUM | BR-001 citada erróneamente para Grant | **Corregido.** Se eliminó BR-001 de la fila de Grant del mapa decisión→spec; ahora apunta a `07` ("cardinalidad multi-grant **P**") y `10` ("no elevar automáticamente"; coexistencia **P**). Se añadió nota explícita bajo el mapa y en §8 marcando BR-001 como regla de Solicitud, fuera de alcance. |
| 2 | MEDIUM | Multi-grant es **P**, se cerraba como si el spec lo respaldara | **Corregido.** §1.2 (bloque "Nota sobre cardinalidad") ahora declara que la cardinalidad está marcada **P** en `07`/`10` y que el `@@unique([userId,roleId,processId])` es una **decisión de Fase 1**, no una afirmación del spec; documenta el punto exacto a reabrir si el cotejo del Site revela duplicados legítimos. |
| 3 | MEDIUM | Registro de `CurrentUserGuard` ambiguo | **Corregido.** §2.3 decide: guard **por módulo** (`process`, `user`, `grant`, `audit`, `me`, `catalog`), **no** `APP_GUARD` global. Lista rutas exentas: `GET /health` y `GET /dev/actors`. |
| 4 | HIGH | Deadlock de arranque del selector dev | **Corregido.** Nuevo §3.4: `GET /dev/actors` es ruta pública **exenta** de `CurrentUserGuard`, activa solo con `AUTH_MODE=dev-header`, devuelve `[{identifier,name}]` de usuarios activos y responde 404 con otros modos. Añadida a la lista de exentas (§2.3) y a las pruebas de arranque (§7). |
| 5 | HIGH | Contradicción jefe-de-área vs. filtrado por `scopedProcessIds` | **Corregido.** §2.4 define **dos planos**: Plano A (recursos por proceso) filtrado por `scopedProcessIds` con política 404; Plano B (administración de área: `User` y concesión/revocación de grants) que exige rol `JEFE_AREA` y **no** se filtra por proceso. §1.1 define "área = conjunto de procesos" en Fase 1 (sin tabla `Area`). Se marcaron los endpoints `/users` y `/grants` por plano en §4.2. |
| 6 | MEDIUM | Resolución `roleCode→roleId` y su error | **Corregido.** §4.2.1 y §4.4: el service resuelve `roleCode→Role` con `findUnique({where:{code}})`; fila ausente (BD sin seed) → `500` genérico (fallo de datos del sistema), no 404; seed idempotente garantiza las 3 filas. |
| 7 | NIT | Cita no literal de `20-master-data.md` | **Corregido.** §1.2 Process reemplaza la comilla por paráfrasis: `20-master-data.md` lista INS-006/005/004/007 como marcos observados; no se modela tabla de frameworks (matriz **P** en `28`). |
| 8 | NIT | Algoritmo de `POST /grants` repartido | **Corregido.** Nuevo §4.2.1 concentra el algoritmo (buscar → activo=409 → inactivo=reactivar+AuditEvent → no existe=create+AuditEvent) y decide el `action` de la reactivación = `CREATE` (justificado), evitando chocar con el `@@unique`. |

Todas las correcciones son de documento y mantienen las fortalezas verificadas por la revisión
(límites de arquitectura, no reintroducir auth real, AuditEvent completo, política 403/404 para
recursos por proceso). No implican rediseño.
