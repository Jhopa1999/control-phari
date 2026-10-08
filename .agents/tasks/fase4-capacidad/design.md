# Diseño técnico · Fase 4 · Capacidad y asignaciones (control-phari)

> **Segunda iteración (revisión del design-review).** Existe `design-review.json`
> (CHANGES_REQUESTED, 1 HIGH / 4 MEDIUM / 2 NIT). Este documento ha sido **reescrito** para resolver
> cada finding; las respuestas puntuales están en §13 "Respuestas al design-review". Los cambios de
> fondo son: (F1) se fija el helper `scopedUserIds(actor)` y el `where` **concreto** de lectura de
> disponibilidad y resumen (nunca filas fuera de alcance); (F2) el `where` del jefe = `User.active =
> true` (área única); (F3) `requestId` fuera de alcance/inexistente → **404**, no 400; (F4) el
> resumen del líder marca `cargaParcial` y el jefe ve la carga total agregada; (F5) PATCH → **200**
> con body, DELETE → **204** sin body (patrón task/phase/dependency); (F6) integrante que crea con
> `userId` ajeno → **403**, que lee/edita/borra ajeno por `:id` → **404**; (F7) `description` es texto
> libre informativo. Esta fase construye la **capacidad mensual por persona** (disponibilidad) y las
> **asignaciones de horas por mes/proceso/solicitud**, más un **resumen de carga server-side**
> (disponible / comprometido / utilización % / libre) por persona para un mes `YYYY-MM`, sobre lo ya
> construido en Fase 1 (identidad, roles/grants, autorización por rol + alcance, auditoría
> transversal), Fase 2 (flujo de demanda, `Request`/`RequestState`, política 403/404) y Fase 3 (plan
> y ejecución, patrón de módulo raíz + submódulos, `PlanStateService`, categoría gancho `capacity` en
> la guía del plan). Cubre el corte **FEATURE-005** (SCR-17, FNC-020, BR-012) de `specs/23`, el caso
> **UC-011**, la historia **US-007**, el flujo **FLOW-007** y los criterios **AC-012/AC-013** de
> `specs/18`, respetando `specs/28` punto 6 (todo lo marcado `P`).
>
> **Autoridad y método.** El steering del repo manda: NestJS es dueño de la lógica de negocio,
> validaciones, autorización, persistencia, API REST y OpenAPI; Prisma vive **solo** en `apps/api`;
> el frontend consume **exclusivamente** vía `@plantilla-portales/api-client` y nunca toca PostgreSQL
> ni Prisma. Se **extiende tal cual** el patrón probado en Fases 1–3 (controller fino → service con
> lógica y `$transaction` → DTOs `class-validator` request/response separados →
> `AuditService.record(tx,…)` dentro de la transacción → P2002 → `ConflictException` → `findFirst`
> fuera de alcance → `NotFoundException` → política **403 rol / 404 alcance** → pantallas con estados
> loading/vacío/error/éxito y conservación de la entrada ante error). No se introduce microservicio,
> Kubernetes, Kafka, Redis ni ninguna infra nueva; se mantiene el monolito modular.
>
> **Todo lo que el SDD marca `P`** (pendiente de cotejo contra el Site, `specs/28` punto 6) se
> concentra en §12 "DECISIONES de diseño" y se marca en el punto donde aparece. **Ninguna decisión P
> se presenta como hecho del Site**: se adopta la opción mínima, documentada y **reversible**. En
> particular, el brief y `specs/05`/`specs/28` prohíben inventar la fórmula de utilización impuesta
> por el Site, los límites o el bloqueo duro de sobreasignación, y las reglas exactas de
> cero/negativo/fracción: todo eso queda como **decisión reversible** explícita, no como regla
> afirmada.

## Visión general

La capacidad se modela con **dos entidades nuevas** y **un cálculo** (no una tercera tabla):

- **`MonthlyAvailability` (Disponibilidad)** — una fila por **persona + mes** (`@@unique` compuesto).
  Guarda las **horas disponibles** de esa persona en ese mes. **No** se captura por proyecto/proceso
  (BR-012; FLOW-007; SCR-17): la disponibilidad es un atributo de la persona en el periodo.
- **`Assignment` (Asignación)** — N filas por persona/mes: horas **enteras comprometidas** en un
  **proceso** (requerido), opcionalmente ligadas a una **solicitud** (`Request`). Las asignaciones
  **se agregan** por periodo/proceso (BR-012; SCR-17): una persona puede tener varias asignaciones el
  mismo mes en distintos procesos o solicitudes.
- **Resumen de carga** — **cálculo server-side** por persona/mes, **no una tabla**: `disponible`
  (de la disponibilidad), `comprometido` (suma de horas de las asignaciones de esa persona/mes),
  `utilizacion` (%) y `libre` (= disponible − comprometido). La **sobrecarga** (`libre < 0`) se
  **señala** pero **no se bloquea** (el bloqueo duro es `P`, `specs/28` p.6 / `specs/05` "no se afirma
  que las horas asignadas no puedan exceder disponibilidad").

El módulo backend nuevo es `apps/api/src/modules/capacity/` (patrón de módulo de Fase 1–3). El
alcance se aplica **en el `where` del service** (Plano A, heredado): integrante → su propia
capacidad; líder → su(s) proceso(s); jefe → global del área. **No** hay `ProcessScopeGuard` (Fase 1
lo dejó como gancho; nunca se construyó). Fuera de alcance → **404** sin filtrar datos; rol
insuficiente → **403**. El frontend convierte el placeholder `apps/web/src/app/activos/capacidad/
page.tsx` (hoy `UnderConstruction`) en **SCR-17** real, consumiendo solo vía api-client.

### Mapa rápido decisión → fuente

| Decisión | Respaldo |
|---|---|
| `MonthlyAvailability` por persona/mes, `@@unique([userId, month])` | BR-012; FLOW-007; SCR-17; `29` fila 17 Disponibilidad; §12 D1 |
| Formato del mes = **`DateTime` al primer día del mes (UTC)** | FLOW-007 `YYYY-MM`; §12 D2 (decisión reversible) |
| `Assignment` N por persona/mes; proceso req., solicitud opcional, horas enteras | BR-012; SCR-17; `29` fila 17 Asignación; §12 D3 |
| **Sin** `@@unique` estricto en `Assignment` (se agregan) | BR-012 "asignaciones se agregan"; `19`; §12 D3 |
| Resumen = cálculo server-side (sin tabla) | SCR-17 "resumen por persona"; AC-012; §2.4 |
| Alcance por persona = helper único `scopedUserIds(actor)` (jefe `'ALL'` = `active:true`; líder = él + grants de sus procesos; integrante = él) | AC-025/026; §2.6.1; §12 D12 |
| Resumen del líder con carga fuera de alcance → `cargaParcial`, util/libre `null`; jefe ve el total | AC-013; US-007; §1.4/§2.4; §12 D13 |
| Contrato HTTP: POST 201, PATCH 200 + DTO, DELETE 204 sin body | patrón task/phase/dependency; §3.1; §12 D15 |
| `requestId` fuera de alcance/inexistente → 404 (nunca 400) | política 404 del repo; §2.2; §12 D14 |
| **Fórmula de utilización** = `round(comprometido/disponible*100)` (decisión reversible) | SCR-17 "utilización % `P`"; `28` p.6; §12 D4 |
| `disponible = 0` → utilización `null` ("sin disponibilidad"), sin división por cero | `19` "disponibilidad cero"; §12 D4 |
| `libre = disponible − comprometido`; negativo = **sobrecarga señalada, no bloqueada** | `05` reglas no asumidas; `28` p.6; §12 D5 |
| Horas: enteras `>= 0`; negativas → 400; cero permitido ("sin disponibilidad") | `19`; SCR-17; `29`; §12 D6 (decisión reversible) |
| Disponibilidad duplicada → **409** por el `@@unique`; **PATCH** para editar la existente | SCR-17 "única persona/mes"; `19`; §12 D7 |
| Auditar toda mutación vía `AuditService` dentro de `$transaction`; nuevos `objectType` | Fase 1 §6 / Fase 3 §1.6; §1.5 |
| Autorización: `capacity` = los 3 roles **con alcance**; integrante solo lo suyo | `specs/10` matriz `capacity`; MODULE_MATRIX; §2.5 |
| Quién registra capacidad **de otra persona** = líder/jefe en su alcance; integrante solo la suya | SCR-17 "Capacidad: Propia" `P`; §12 D8 (decisión reversible) |
| Endpoint propio de **personas en alcance** (porque `/users` y `/grants` son solo jefe) | `user.controller.ts`/`grant.controller.ts`; §2.6; §12 D9 |
| Categoría `capacity` de la guía del plan = **gancho informativo**, no bloqueo | Fase 3 §2.2/§12 D5; BR-007; §12 D10 (decisión reversible) |
| `findFirst` para resolver por campo único con `name` custom; `@@unique` compuesto como `where` | Fase 3 §1.1 (precaución Prisma 7); §1.1 |

### Supuestos explícitos

1. **La disponibilidad es de la persona, no del proceso** (BR-012, FLOW-007, SCR-17): aunque SCR-17
   lista "proceso/contexto" en el formulario de disponibilidad, el SDD es explícito en que "no se
   captura por proyecto" y la unicidad es **persona/mes**. Se modela la disponibilidad **sin**
   `processId` (el "contexto de proceso" del formulario sirve solo para **resolver el alcance de
   lectura/escritura**, no se persiste como dimensión de la disponibilidad). Ver §12 D1.
2. **El alcance de una persona** se deriva de sus **grants activos** (Fase 1): una persona
   "pertenece" a un proceso si tiene un grant activo en él. El líder del proceso P ve/gestiona la
   disponibilidad de las personas con grant activo en P; el jefe ve el área completa. Ver §2.5/§2.6.
3. **El alcance de una asignación** es su `processId` (Plano A directo): líder del proceso P ve/
   gestiona asignaciones con `processId = P`. El `requestId` opcional **no** amplía el alcance (igual
   que en Fase 3 participar no amplía scope); si se informa, debe pertenecer a un proceso en alcance.
4. **No se implementa** nada de Bitácora/Activos/Documentos/Frameworks/Portafolio (fases 5+). En
   particular, BR-013 (horas de bitácora ≠ horas de capacidad) se respeta por **ausencia**: la Fase 4
   no toca bitácora; `comprometido` se calcula **solo** de `Assignment`, nunca de horas registradas.
5. El `X-Actor-Id` y el `CurrentUserGuard`/`RolesGuard` ya existen (Fase 1) y se reutilizan sin
   cambios; el api-client ya inyecta `X-Actor-Id`.

---

## 1. Modelo de datos (Prisma)

### 1.1 Principios heredados (sin cambios)

- Esquema físico en `apps/api/prisma/schema.prisma`. Modelos PascalCase; columnas `snake_case` vía
  `@map`/`@@map`; PK `String @id @default(uuid()) @db.Uuid`; timestamps `created_at`
  (`@default(now())`) / `updated_at` (`@updatedAt`) en toda tabla mutable, igual que `Request`/`Task`.
- **Robustez ante `findUnique` con `@@unique` (precaución Prisma 7, heredada de Fase 3 §1.1):** por
  precaución ante el comportamiento de `findUnique`/`upsert` con un `@@unique` de **un solo campo**
  con `name` custom en Prisma 7, toda resolución **por un solo campo** se hace con **`findFirst`**.
  Los `@@unique` **compuestos** sí se usan como `where` de `findUnique`/`upsert`. En Fase 4 esto
  aplica así: `MonthlyAvailability` tiene un `@@unique` **compuesto** `([userId, month])`, de modo que
  **sí** puede resolverse/escribirse con `findUnique`/`upsert` por esa clave (es el caso favorable del
  hallazgo). La resolución de una `Assignment` por `id` es por PK (`findFirst`/`findUnique` por `id`
  es seguro); se usa `findFirst` por consistencia con el patrón del repo cuando se filtra por `id` +
  alcance. La elección es correcta se cumpla o no la premisa; una prueba unit (§6) fija el acceso.
- Solo se modelan las entidades confirmadas para esta fase (`MonthlyAvailability`, `Assignment`). No
  se crea tabla de resumen (es cálculo, §2.4) ni entidades de fases 5+.

### 1.2 Entidades nuevas y relaciones

```
User    (1) ──< (N) MonthlyAvailability     [una por persona/mes — @@unique([userId, month])]
User    (1) ──< (N) Assignment              [N por persona/mes]
Process (1) ──< (N) Assignment              [proceso de la asignación, requerido]
Request (1) ──< (0..N) Assignment           [solicitud opcional de la asignación]
```

Las entidades nuevas añaden su relación inversa en `User`, `Process` y `Request` sin alterar campos
existentes de Fases 1–3.

#### MonthlyAvailability (Disponibilidad)

Disponibilidad de horas de una persona en un mes (BR-012; FLOW-007; SCR-17; `29` fila 17).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| userId | `String @db.Uuid` | `user_id` | FK → User (`onDelete: Restrict`); la persona |
| month | `DateTime @db.Date` | `month` | **primer día del mes** (UTC); `YYYY-MM-01` (§12 D2) |
| availableHours | `Int` | `available_hours` | **requerido**; `>= 0` (§12 D6) |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

Relaciones: `user User @relation(fields:[userId], references:[id], onDelete: Restrict)`.
Índices: `@@unique([userId, month], name: "monthly_availability_user_month_unique")` (**compuesto →
usable como `where` de `findUnique`/`upsert`**, §1.1), `@@index([month])`,
`@@map("monthly_availabilities")`.

> **Formato del mes (DECISIÓN §12 D2, reversible).** Se elige **`DateTime @db.Date` fijado al primer
> día del mes en UTC** (`2025-03-01`) en lugar de un `String 'YYYY-MM'`. Razones: (a) permite
> comparar/ordenar/filtrar por rango de mes de forma nativa en SQL sin parsing; (b) evita formatos
> ambiguos o inválidos en la columna (`'2025-3'`, `'2025-13'`) porque el service normaliza siempre al
> primer día; (c) `@db.Date` no arrastra zona horaria/hora, lo que elimina el riesgo de que un
> `DateTime` con hora caiga en otro mes. El **contrato de la API usa `YYYY-MM`** (string) hacia afuera
> (FLOW-007/SCR-17): el service convierte `'YYYY-MM'` ⇄ fecha del primer día del mes en los DTOs
> (helper `monthStringToDate`/`dateToMonthString`), de modo que el frontend nunca ve una fecha. Si el
> Site confirmara que debe persistirse el string, se reabre cambiando el tipo de columna sin tocar el
> contrato externo. La disponibilidad **no** lleva `processId` (supuesto 1 / §12 D1).

#### Assignment (Asignación)

Horas comprometidas de una persona en un mes, en un proceso y (opcional) una solicitud (BR-012;
SCR-17; `29` fila 17).

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| userId | `String @db.Uuid` | `user_id` | FK → User (`onDelete: Restrict`); la persona |
| month | `DateTime @db.Date` | `month` | primer día del mes (UTC), mismo formato que disponibilidad |
| processId | `String @db.Uuid` | `process_id` | FK → Process (`onDelete: Restrict`); **requerido** (SCR-17/`29`) |
| requestId | `String? @db.Uuid` | `request_id` | FK → Request (`onDelete: Restrict`); **opcional** |
| committedHours | `Int` | `committed_hours` | **requerido**; entero `>= 0` (§12 D6) |
| description | `String?` | `description` | distribución del esfuerzo por periodo (SCR-17); opcional |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

Relaciones:
`user User @relation("AssignmentUser", fields:[userId], references:[id], onDelete: Restrict)`,
`process Process @relation(fields:[processId], references:[id], onDelete: Restrict)`,
`request Request? @relation(fields:[requestId], references:[id], onDelete: Restrict)`.
Índices: `@@index([userId, month])` (consulta del resumen por persona/mes),
`@@index([processId])` (alcance), `@@index([requestId])`, `@@map("assignments")`.

> **`description` es texto libre informativo (FINDING 7).** SCR-17 dice que la descripción "indica la
> distribución del esfuerzo por periodo"; se modela como `String?` ≤ 2000 **sin estructura**. Ninguna
> regla de cálculo (resumen §1.4, validación §2.3, auditoría §1.5) la interpreta: **no** se infiere un
> reparto por semanas ni ninguna semántica de "distribución" que el Site no confirma. Es un campo
> puramente descriptivo.

> **Sin `@@unique` estricto (DECISIÓN §12 D3, reversible).** BR-012 dice literalmente que **"las
> asignaciones se agregan por periodo/proceso"**: una persona puede tener **varias** asignaciones el
> mismo mes (en procesos distintos, en solicitudes distintas, o incluso varias en el mismo proceso
> como partidas separadas de esfuerzo). Imponer un `@@unique([userId, month, processId])` o
> `([userId, month, processId, requestId])` **contradría** la agregación y rechazaría un caso válido
> del SDD. Por eso **no se impone ningún unique** que el SDD no confirma (`specs/28` p.6 trata la
> consolidación multiproceso como `P`). El resumen (§2.4) **suma** todas las asignaciones de la
> persona/mes, que es exactamente "agregar". Si el Site confirmara una partida única por
> persona/mes/proceso/solicitud, se reabre añadiendo el `@@unique` compuesto (usable como `where`,
> §1.1) sin cambiar la semántica del resumen.

### 1.3 Normalización del mes (helper de dominio)

En `apps/api/src/modules/capacity/month.ts` se definen dos funciones puras, 100% unit-testeables:

- `monthStringToDate('YYYY-MM'): Date` — valida el patrón `^\d{4}-(0[1-9]|1[0-2])$`; si no cumple →
  el DTO lo rechaza antes (400). Devuelve `Date.UTC(yyyy, mm-1, 1)` (primer día del mes, UTC, sin
  hora).
- `dateToMonthString(d: Date): 'YYYY-MM'` — formatea en UTC.

El patrón de mes se valida en el **DTO** con `@Matches(/^\d{4}-(0[1-9]|1[0-2])$/)` (entrada externa,
§3.4); el service usa el helper para normalizar antes de persistir/consultar. Así el contrato externo
es `YYYY-MM` y la columna es una fecha canónica (§12 D2).

### 1.4 Cálculo del resumen de carga (sin tabla)

El resumen **no se persiste**: lo computa `CapacityService.summary(actor, month, filtros)` (§2.4) a
partir de `MonthlyAvailability` y la **suma** de `committedHours` de `Assignment` por persona/mes,
siempre acotado al alcance. Reglas (todas en el service, §2.4):

- `disponible` = `availableHours` de la disponibilidad de esa persona/mes, o `null` si no la hay.
- `comprometido` = `SUM(committedHours)` de las asignaciones de esa persona/mes **en alcance**.
- `utilizacion` = `disponible` presente y `> 0` → `round(comprometido / disponible * 100)`; si
  `disponible` es `0` o `null` → `utilizacion = null` con `estado = 'SIN_DISPONIBILIDAD'`
  (**sin división por cero**, §12 D4).
- `libre` = `disponible − comprometido` cuando hay disponibilidad; puede ser **negativo**
  (= sobrecarga). `null` si no hay disponibilidad.
- `sobrecargado` = `true` cuando `libre < 0`. **Se señala, no se bloquea** (§12 D5).
- `cargaParcial` (FINDING 4) = `true` solo para líder/integrante cuando la persona tiene **alguna**
  asignación ese mes **fuera** del alcance del actor (detectado por una consulta de existencia, sin
  revelar horas/procesos ajenos). En ese caso `comprometido` es parcial, por lo que `utilizacion` y
  `libre` se devuelven **`null`** con `estado = 'CARGA_PARCIAL'` (no se mezcla `disponible` total con
  `comprometido` parcial). Para el jefe `cargaParcial` siempre es `false` (ve el total agregado,
  AC-013).

### 1.5 Auditoría: nuevos objectType

`AuditService.record(tx,…)` se usa **tal cual**. Se amplía `AuditObjectType` en `audit.service.ts`
para incluir **`MONTHLY_AVAILABILITY`** y **`ASSIGNMENT`** (hoy el union ya tiene
`PROCESS|USER|GRANT|CATALOG_ITEM|REQUEST|TRIAGE|PRIORITY_EVALUATION|APPROVAL|PLAN|PLAN_PHASE|TASK|
TASK_DEPENDENCY`). El set de `action` (`CREATE|UPDATE|DELETE|REVOKE`) **no cambia**.

**Invariante (hereda Fase 1 §6 / Fase 3 §1.6):** toda mutación de dominio de Fase 4 escribe su
`AuditEvent` **dentro de la misma `$transaction`**, con:

| Mutación | action | objectType | objectId | scopeProcessId | before / after |
|---|---|---|---|---|---|
| crear disponibilidad | CREATE | MONTHLY_AVAILABILITY | availability.id | **null** (§abajo) | null / snapshot |
| editar disponibilidad | UPDATE | MONTHLY_AVAILABILITY | availability.id | null | antes / después |
| crear asignación | CREATE | ASSIGNMENT | assignment.id | **assignment.processId** | null / snapshot |
| editar asignación | UPDATE | ASSIGNMENT | assignment.id | assignment.processId | antes / después |
| borrar asignación | DELETE | ASSIGNMENT | assignment.id | assignment.processId | snapshot / null |

> **`scopeProcessId` de la disponibilidad = `null` (DECISIÓN §12 D1 derivada).** La disponibilidad
> **no tiene proceso** (es por persona, BR-012). Por coherencia con el modelo, su evento de auditoría
> lleva `scopeProcessId = null`. Consecuencia conocida: la lectura de auditoría de Fase 1
> (`AuditService.findMany`) filtra a líder/jefe por `scopeProcessId ∈ scopedProcessIds`, así que los
> eventos de disponibilidad con `scopeProcessId = null` **no** aparecerán en esa vista para líder/
> jefe (sí para el **integrante**, que ve sus propios eventos por `actorUserId`). Se documenta como
> **decisión reversible**: si el Site exige que la auditoría de disponibilidad sea visible por
> proceso, se puede (a) ampliar `findMany` para incluir eventos sin scope del propio actor, o (b)
> registrar un `scopeProcessId` representativo; **no** se hace ahora porque la disponibilidad no tiene
> proceso canónico y asignar uno sería inventar una dimensión que BR-012 niega. La **asignación** sí
> lleva `scopeProcessId = processId`, de modo que su auditoría es visible por proceso para líder/jefe
> (consistente con AC-025/026 y la auditoría de Fases 2–3).

### 1.6 Estrategia de migración

Una única migración versionada nueva, con el comando real del repo (nunca `db push`), desde
`apps/api`:

```
npm run prisma:migrate:dev -- --name fase4_capacidad
```

Produce `apps/api/prisma/migrations/<timestamp>_fase4_capacidad/migration.sql` con las tablas
`monthly_availabilities` y `assignments`, sus FKs, el `@@unique` compuesto y los índices, en el
formato de las migraciones existentes. Luego `npm run prisma:generate` regenera el client tipado en
`src/generated/prisma`. Las tablas de Fases 1–3 **no se tocan**. No se añaden filas de seed
obligatorias (no hay catálogo nuevo); el seed existente se mantiene idempotente sin cambios.

---

## 2. Lógica de negocio y alcance (server-side)

Todas las reglas y el alcance se evalúan **siempre en el service** (NestJS dueño de las reglas).
Ocultar un control en la UI no es seguridad (BR-019): el backend **rechaza** la operación aunque la
UI la permita. La separación de códigos es la heredada: **400** = validación de dato de entrada;
**409** = conflicto de estado/constraint (disponibilidad duplicada); **403** = rol insuficiente;
**404** = fuera de alcance / inexistente (sin filtrar datos).

### 2.1 Registrar / editar disponibilidad

- **Crear** (`POST /capacity/availability`): el service normaliza `month` (§1.3), valida
  `availableHours >= 0` (DTO + service, §12 D6), resuelve el **alcance de escritura** sobre la persona
  objetivo (§2.5/§2.6, FINDING 6): integrante con `userId` del body ≠ el suyo → **403**; persona fuera
  del `scopedUserIds` del líder → **404**. Si ya existe disponibilidad para `(userId,
  month)` → **409** (constraint `@@unique`; P2002 → `ConflictException`) con mensaje "ya existe
  disponibilidad para esa persona y mes; edítala" (§12 D7). Mutación + `AuditEvent CREATE
  MONTHLY_AVAILABILITY` en una `$transaction`.
- **Editar** (`PATCH /capacity/availability/:id`): resuelve la fila por `id` dentro de alcance
  (`findFirst` + 404 si fuera de alcance), valida `availableHours >= 0`, actualiza + `AuditEvent
  UPDATE` en `$transaction`. **No** se permite cambiar `userId`/`month` por PATCH (cambiarían la
  identidad persona/mes; para "mover" se borra/crea). El cuerpo solo admite `availableHours`.

> **Política de duplicado (DECISIÓN §12 D7).** La unicidad persona/mes es del SDD (SCR-17 "única por
> persona/mes"; `29` fila 17 "una disponibilidad persona/mes"). Un segundo `POST` para el mismo
> persona/mes → **409**; el camino para cambiar las horas es el **PATCH** sobre la fila existente. No
> se usa `upsert` silencioso en el POST para no ocultar al cliente que ya existía (coherente con el
> patrón P2002→409 del repo); la UI, ante el 409, ofrece "editar la existente". Nota: aunque el
> `@@unique` compuesto permitiría un `upsert` (§1.1), se prefiere POST-crea / PATCH-edita por claridad
> de contrato y auditoría (CREATE vs UPDATE distinguibles).

### 2.2 Crear / editar / borrar asignación

- **Crear** (`POST /capacity/assignments`): normaliza `month`, valida `committedHours` entero `>= 0`,
  exige `processId` (requerido) y resuelve su alcance (§2.5): integrante con `userId` del body ≠ el
  suyo → **403**; `processId` o persona fuera del alcance del líder → **404**. **`requestId` (FINDING 3
  resuelto):** si el formato no es UUID → **400** (lo rechaza el DTO). Si es UUID pero la Request **no
  existe** o su `mainProcessId` **no está en el alcance** del actor → **404** (se resuelve con
  `findFirst` aplicando el **mismo `scopeWhere`** que `request.service.ts`: `{ AND: [{ id: requestId },
  scopeWhere(actor)] }`; "no existe para ti", sin filtrar ni confirmar la existencia de un recurso
  fuera de alcance). **Nunca 400** para "fuera de alcance". Valida que la **persona** objetivo esté en
  alcance (§2.6). Mutación +
  `AuditEvent CREATE ASSIGNMENT` (`scopeProcessId = processId`) en `$transaction`. **No** hay gate de
  sobreasignación (§12 D5): se permite crear aunque exceda la disponibilidad.
- **Editar** (`PATCH /capacity/assignments/:id`): resuelve por `id` en alcance (404 si no), permite
  cambiar `committedHours`, `requestId` (set/clear), `description` y `processId` (revalidando alcance
  del nuevo proceso). `userId`/`month` no editables por PATCH (misma razón que disponibilidad).
  Actualiza + `AuditEvent UPDATE` en `$transaction`.
- **Borrar** (`DELETE /capacity/assignments/:id`): resuelve por `id` en alcance (404 si no), borra +
  `AuditEvent DELETE` en `$transaction`. (La disponibilidad **no** se borra en Fase 4: se edita; si el
  Site confirma borrado de disponibilidad, se reabre — decisión reversible.)

### 2.3 Validaciones de horas (postura conservadora, DECISIÓN §12 D6, reversible)

El SDD marca `P` las reglas de cero/negativo/fracción (`specs/28` p.6; `19` "disponibilidad cero,
horas negativas/fraccionarias"). Postura conservadora documentada, **reversible**:

- **Enteras:** `availableHours` y `committedHours` son `Int` en el modelo y `@IsInt` en el DTO. Una
  fracción (`3.5`) → **400** ("las horas deben ser un número entero"). (SCR-17 dice explícitamente que
  las horas comprometidas son **enteras**; se extiende la misma regla a disponibilidad por
  simplicidad y porque el Site no confirma fracciones.)
- **No negativas:** `>= 0` (`@Min(0)` en el DTO + revalidación en el service). Negativas → **400**.
- **Cero permitido:** `availableHours = 0` es válido y significa **"sin disponibilidad"** ese mes
  (se refleja en el resumen como `utilizacion = null`, `estado = 'SIN_DISPONIBILIDAD'`, §1.4/§12 D4);
  `committedHours = 0` también es válido (una asignación placeholder). No se bloquea el cero.

Punto a reabrir: si el Site confirma fracciones (p. ej. medias jornadas) o un mínimo distinto, se
cambia el tipo a `Decimal`/`Float` y se ajusta la validación sin tocar el resto del diseño.

### 2.4 Resumen de carga por persona/mes

`GET /capacity/summary?month=YYYY-MM` devuelve, para **cada persona en alcance** con disponibilidad o
asignaciones ese mes, un `CapacitySummaryRowDto` (§3.4) con `disponible`, `comprometido`,
`utilizacion`, `libre`, `estado`, `sobrecargado` y `cargaParcial`, calculados según §1.4. Reglas:

- **Alcance (en el `where`, FINDING 1 resuelto):** el conjunto de personas visibles lo resuelve el
  helper `scopedUserIds(actor)` (§2.6.1), **compartido** por `people`, `availability`, `assignments`
  y `summary`. El `where` **concreto** del resumen es: `month = monthDate`; y si
  `scopedUserIds !== 'ALL'` entonces `userId ∈ scopedUserIds`. La disponibilidad (que **no** tiene
  `processId`) se filtra **siempre** por `scopedUserIds`; **nunca** se devuelven filas de personas
  fuera del alcance (AC-025/026).
- **Agregación (FINDING 4 resuelto).** `comprometido` suma las asignaciones **visibles en el alcance
  del actor** (`processId ∈ scopedProcessIds` para el líder; sin filtro de proceso para el jefe).
  Para evitar un `libre`/`utilizacion` engañosos (porque `disponible` es por persona = total, mientras
  el `comprometido` del líder sería **parcial** si la persona tiene asignaciones en procesos fuera de
  su alcance), el resumen aplica la **Opción A** elegida: la fila lleva una bandera
  `cargaParcial: boolean`. Semántica fijada:
  - **Jefe (`isJefeArea`):** ve el total agregado real del área (AC-013); `cargaParcial` siempre
    `false`; `utilizacion`/`libre` se calculan con el `comprometido` total.
  - **Líder/integrante:** `comprometido` suma solo lo visible en su alcance. El service calcula, en el
    **mismo `where`** acotado, si la persona tiene **alguna** asignación ese mes **fuera** del alcance
    del actor (consulta de **existencia** `count > 0` sobre `userId = persona, month, processId ∉
    scopedProcessIds`, que **no** revela las horas ni los procesos ajenos). Si existe →
    `cargaParcial = true`, y en ese caso `utilizacion` y `libre` se devuelven como **`null`** con
    `estado = 'CARGA_PARCIAL'` (porque mezclar `disponible` total con `comprometido` parcial no es
    significativo); se expone `comprometido` parcial y `disponible` como informativos. Si no existe
    carga fuera de alcance → `cargaParcial = false` y `utilizacion`/`libre` se calculan normalmente.
    Así el líder nunca ve un "OK" engañoso para alguien sobrecargado en total, y el **jefe** es la
    autoridad de la carga agregada (US-007/AC-013).
- **Sin división por cero:** `disponible` `0`/ausente → `utilizacion = null`,
  `estado = 'SIN_DISPONIBILIDAD'` (§1.4/§12 D4).
- **Sobrecarga:** `libre < 0` → `sobrecargado = true`, `estado = 'SOBRECARGA'`; se **señala**, no se
  bloquea (§12 D5). Estados posibles del resumen: `OK` (0 ≤ util ≤ 100), `SOBRECARGA` (util > 100 /
  libre < 0), `SIN_DISPONIBILIDAD` (disponible 0/ausente), `CARGA_PARCIAL` (líder/integrante con
  carga fuera de su alcance; util/libre `null`).

También se exponen lecturas de detalle para la pantalla:
`GET /capacity/availability?month=YYYY-MM` (disponibilidades en alcance: `where` = `month` +
`userId ∈ scopedUserIds` salvo jefe) y `GET /capacity/assignments?month=YYYY-MM` (asignaciones en
alcance: `where` = `month` + `processId ∈ scopedProcessIds` salvo jefe, filtrables además por
`processId?`, `userId?`, `requestId?`), ambas filtradas por el `where` de alcance. Un `userId?`/
`processId?` que caiga fuera del alcance se intersecta con el `where` de alcance (no amplía), de modo
que nunca expone datos fuera de alcance.

### 2.5 Autorización por rol y alcance (`specs/10`, módulo `capacity`)

`MODULE_MATRIX.capacity = [JEFE_AREA, LIDER_PROCESO, INTEGRANTE]` (verificado en
`module-matrix.ts`): **los tres roles** tienen el módulo, **con alcance**. Reutiliza **exactamente**
el mecanismo de Fases 1–3 (`@Roles` + `RolesGuard` → 403; alcance en el `where` del service → 404).
**No** se crea `ProcessScopeGuard`.

| Operación | Rol requerido (`@Roles`) | Alcance aplicado |
|---|---|---|
| Ver resumen / disponibilidad / asignaciones | los 3 (`capacity`) | integrante: solo su `userId`; líder: sus procesos + sus personas; jefe: área |
| Crear/editar disponibilidad | los 3 (`capacity`) | integrante: solo su propia (`userId = actor.userId`); líder/jefe: personas en su alcance (§2.6) |
| Crear/editar/borrar asignación | los 3 (`capacity`) | integrante: solo asignaciones **suyas**; líder: asignaciones de **sus procesos**; jefe: área |

- **Alcance de la asignación (Plano A directo):** el `where` filtra por `processId ∈
  scopedProcessIds` para líder (jefe sin filtro; integrante además `userId = actor.userId`). Resolver
  una asignación por `:id` fuera de alcance → **404** (sin filtrar datos). Si el DTO trae un
  `processId` fuera del alcance del actor al crear/editar → **404** (el proceso "no existe para ti").
- **Rol:** los tres roles pasan `@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)`; la diferencia de
  **qué** puede tocar cada uno es por **alcance en el service**, no por `@Roles` (los tres tienen
  `capacity`). Un actor sin ningún grant con `capacity` ni siquiera pasa el guard → **403**.

> **Quién registra la capacidad de OTRA persona (DECISIÓN §12 D8, reversible).** SCR-17 marca el
> alcance del selector proceso/persona como `P` y `specs/10` indica "Capacidad: **Propia**" para el
> integrante. Decisión conservadora: **el integrante solo consulta/registra la SUYA** (disponibilidad
> y asignaciones con `userId = actor.userId`). **Política 403 vs 404 fijada (FINDING 6):** como el
> integrante **sí** tiene el módulo `capacity` (pasa `@Roles`), la distinción es predecible:
> **CREAR** disponibilidad/asignación con `userId` del body **≠** `actor.userId` → **403** (violación
> explícita de la regla "solo la suya", decidida en el service; no es "no existe"); **LEER / EDITAR /
> BORRAR** por `:id` un recurso cuyo `userId` **≠** el suyo → **404** (el recurso ajeno "no existe
> para él"; `findFirst` acotado por `scopedUserIds` no lo encuentra, sin filtrar datos). **Líder y
> jefe registran dentro
> de su alcance**: el líder, para personas de sus procesos (§2.6) y asignaciones de sus procesos; el
> jefe, para toda el área. No se inventa que un líder pueda tocar la disponibilidad de alguien ajeno a
> sus procesos. Punto a reabrir si el Site confirma otro reparto (p. ej. que el integrante registre su
> disponibilidad pero no sus asignaciones, o que el líder registre asignaciones de personas que no son
> de su proceso).

### 2.6 Resolución de "personas en alcance" (helper + endpoint propio)

#### 2.6.1 Helper `scopedUserIds(actor)` — fuente única de verdad del alcance por persona (FINDING 1 / FINDING 2)

Todas las lecturas que dependen de "qué personas ve el actor" (`people`, `availability`,
`assignments`, `summary`) usan **un solo** helper en `capacity-scope.service.ts`, de modo que la
disponibilidad —que **no tiene `processId`** (D1)— se filtra siempre por el **mismo** conjunto de
`userId`, sin posibilidad de exponer filas fuera de alcance:

```ts
// Devuelve 'ALL' (sin filtro de userId) para el jefe, o la lista de userId visibles.
async scopedUserIds(tx, actor: CurrentActor): Promise<'ALL' | string[]> {
  // Jefe de area: ve el area completa. 'Area' = todos los usuarios activos
  //   (no existe multi-area en el modelo; specs/28 confirma area unica Analitica;
  //    User.active existe en el schema). Su where NO filtra por userId.
  if (actor.isJefeArea) return 'ALL';

  const ids = new Set<string>();
  // Integrante (y cualquier rol con capacity): siempre se ve a si mismo.
  ids.add(actor.userId);

  // Lider de proceso: ademas, las personas con grant ACTIVO en alguno de sus procesos.
  if (actor.scopedProcessIds.size > 0) {
    const grants = await tx.grant.findMany({
      where: { active: true, processId: { in: [...actor.scopedProcessIds] } },
      select: { userId: true },
      distinct: ['userId'],
    });
    for (const g of grants) ids.add(g.userId);
  }
  return [...ids];
}
```

Aplicación en cada lectura (siempre en el `where`, nunca en memoria):

```ts
const scoped = await scopedUserIds(tx, actor);
const where: Prisma.MonthlyAvailabilityWhereInput = { month: monthDate };
if (scoped !== 'ALL') where.userId = { in: scoped }; // jefe => sin filtro de userId
```

- **Jefe (FINDING 2 resuelto):** `scopedUserIds` devuelve `'ALL'`, por lo que el `where` del jefe
  para disponibilidad/resumen **no filtra por `userId` ni `processId`**, solo por `month` (+ filtros
  opcionales de query, que se intersectan). "Área" = `User.active = true`: no existe dimensión de área
  distinta de "todos los usuarios activos" (área única Analítica, `specs/28`); si en el futuro hubiera
  multi-área, se añadiría la dimensión aquí sin cambiar el resto.
- **Líder:** `userId ∈ { él mismo } ∪ { personas con grant activo en sus procesos }`.
- **Integrante (sin grant de líder, `scopedProcessIds` vacío):** `userId ∈ { él mismo }` (una sola
  persona: él). Esto, combinado con la regla de escritura D8, garantiza que el integrante solo
  consulta su propia capacidad.

#### 2.6.2 Endpoint propio `GET /capacity/people`

**Hallazgo de código:** `GET /users` (`user.controller.ts`) y `GET /grants` (`grant.controller.ts`)
están protegidos con `@Roles(RoleCode.JEFE_AREA)` — **solo jefe**. El selector de persona de SCR-17
lo necesitan también **líder** e **integrante** (dentro de su alcance). Por tanto, **no** se puede
reutilizar `/users` para el selector sin romper su contrato (ni ampliar su rol, que afectaría a Fase
1). **DECISIÓN §12 D9 (reversible):** el módulo `capacity` expone su **propio** endpoint de solo
lectura `GET /capacity/people` que resuelve las personas visibles con el helper `scopedUserIds`
(§2.6.1) y devuelve `{ id, name, identifier }` por persona (sin exponer datos sensibles):

- **integrante** → solo él mismo (una fila);
- **líder** → él mismo + usuarios con **grant activo** en alguno de sus `scopedProcessIds` (distinct);
- **jefe** → todos los usuarios con `active = true`.

Así el frontend consume **solo** api-client y respeta el alcance server-side, sin tocar `/users` (que
sigue siendo jefe-only y mantiene Fase 1 intacta). Punto a reabrir: si Fase 1 abre un `/users` con
alcance, `GET /capacity/people` podría delegar en él; por ahora es propio del módulo para no acoplar
fases.

### 2.7 Qué NO hace la lógica de Fase 4 (respeta `P`)

- **No** impone límite ni bloqueo de sobreasignación (`libre < 0` se señala, no bloquea; §12 D5).
- **No** inventa la fórmula de utilización del Site: adopta `round(comprometido/disponible*100)` como
  **decisión reversible** (§12 D4).
- **No** deriva `comprometido` de horas de bitácora (BR-013): solo de `Assignment` (supuesto 4).
- **No** convierte la categoría `capacity` de la guía del plan (Fase 3) en bloqueo real: queda
  informativa (§12 D10).
- **No** implementa consolidación multiproceso "exótica": el resumen suma lo visible en alcance
  (§2.4); la consolidación multiproceso completa es `P` (`28` p.6) y se difiere.

---

## 3. API REST + OpenAPI

### 3.1 Convenciones (heredadas, sin cambios)

Controllers finos con `@UseGuards(CurrentUserGuard, RolesGuard)`; `@Roles(...)` por endpoint;
`@CurrentActor()` inyecta el actor; DTOs `class-validator` con `ValidationPipe` global
(whitelist + forbidNonWhitelisted + transform); **DTOs request y response separados**;
`@nestjs/swagger` en todos los endpoints (`@ApiTags/@ApiOperation/@ApiResponse/@ApiBody/@ApiParam/
@ApiQuery`); P2002 → `ConflictException`; `findFirst` fuera de alcance → `NotFoundException` (404);
ningún error de Prisma se expone al cliente. **Contrato HTTP de mutaciones (FINDING 5, alineado con
task/phase/dependency de Fase 3):** `POST` → **201** con el `*ResponseDto` creado; `PATCH` → **200**
con el `*ResponseDto` actualizado en el body; `DELETE` → **204** sin body (`@HttpCode(204)`). El
api-client generado y el wrapper `capacity.ts` dependen de este contrato (PATCH devuelve objeto,
DELETE devuelve `void`). Cada cambio de contrato → `npm run contracts:generate`
(= `openapi:generate` + `api-client:generate`) y **committear** `apps/api/openapi/openapi.json` +
`packages/api-client/src/generated/*`.

### 3.2 Estructura del módulo NestJS

Módulo plano `capacity/` (no necesita submódulos: dos entidades estrechamente relacionadas que
comparten alcance y resumen; un controller fino basta, igual que `catalog`/`user`):

```
apps/api/src/modules/capacity/
  capacity.module.ts            ← imports: PrismaModule, AuthModule, AuditModule
  capacity.controller.ts        ← disponibilidad, asignaciones, resumen, people
  capacity.service.ts           ← lógica + alcance (where) + resumen + $transaction + audit
  capacity-scope.service.ts     ← resuelve personas/alcance (grants) para people y para los where
  month.ts                      ← helpers puros monthStringToDate / dateToMonthString (§1.3)
  dto/
    create-availability.dto.ts   update-availability.dto.ts   availability-response.dto.ts
    create-assignment.dto.ts     update-assignment.dto.ts     assignment-response.dto.ts
    list-availability.dto.ts     list-assignments.dto.ts
    summary-query.dto.ts         capacity-summary-row.dto.ts
    capacity-person.dto.ts
  capacity.service.spec.ts       capacity.module.spec.ts       month.spec.ts
```

Se registra `CapacityModule` en `app.module.ts` junto a los existentes, sin tocarlos.

**Orden de controllers (hallazgo heredado de Fases 2–3):** las rutas estáticas se declaran **antes**
que las paramétricas que comparten prefijo. Aquí se evita por diseño: `summary`, `people`,
`availability`, `assignments` son prefijos distintos; los `:id` cuelgan de `availability/:id` y
`assignments/:id` (no colisionan con `summary`/`people`). Un `capacity.module.spec.ts` fija el
contrato de rutas como en Fases 2–3.

### 3.3 Endpoints

Todos pasan por `CurrentUserGuard` + `RolesGuard` con `@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)`
(módulo `capacity` = los 3 roles); la diferencia de alcance se aplica en el service (§2.5/§2.6).

| Método | Ruta | Notas |
|---|---|---|
| GET | `/capacity/summary?month=YYYY-MM` | resumen por persona en alcance (§2.4); `month` requerido (400 si falta/mal formado) |
| GET | `/capacity/people` | personas en alcance para los selectores (§2.6) |
| GET | `/capacity/availability?month=YYYY-MM` | disponibilidades en alcance; `month` requerido |
| POST | `/capacity/availability` | crea disponibilidad `{ userId, month, availableHours }`; 409 si duplicada (§2.1) |
| PATCH | `/capacity/availability/:id` | edita `{ availableHours }` en alcance (404 si fuera); **200** + `AvailabilityResponseDto` |
| GET | `/capacity/assignments?month=YYYY-MM&processId?&userId?&requestId?` | asignaciones en alcance; `month` requerido |
| POST | `/capacity/assignments` | crea `{ userId, month, processId, requestId?, committedHours, description? }`; 201 |
| PATCH | `/capacity/assignments/:id` | edita `{ processId?, requestId?, committedHours?, description? }` en alcance; **200** + `AssignmentResponseDto` |
| DELETE | `/capacity/assignments/:id` | borra una asignación en alcance (404 si fuera); **204** sin body (`@HttpCode(204)`) |

No se expone endpoint para borrar disponibilidad en Fase 4 (se edita; §2.2, decisión reversible).

### 3.4 DTOs (validación por entrada externa)

Toda entrada externa se valida con DTO (requerido/opcional, tipo, límites, fallo → 400):

- **CreateAvailabilityDto:** `userId` `@IsUUID` **req.**; `month` `@Matches(/^\d{4}-(0[1-9]|1[0-2])$/)`
  **req.**; `availableHours` `@IsInt @Min(0)` **req.**
- **UpdateAvailabilityDto:** `availableHours` `@IsInt @Min(0)` **req.** (único campo editable).
- **CreateAssignmentDto:** `userId` `@IsUUID` **req.**; `month` `@Matches(...)` **req.**; `processId`
  `@IsUUID` **req.**; `requestId` `@IsUUID @IsOptional`; `committedHours` `@IsInt @Min(0)` **req.**;
  `description` `@IsString @MaxLength(2000) @IsOptional`.
- **UpdateAssignmentDto:** `processId?` `@IsUUID`; `requestId?` `@IsUUID` (o `null`/clear vía campo
  dedicado); `committedHours?` `@IsInt @Min(0)`; `description?` `@IsString @MaxLength(2000)`. Todos
  `@IsOptional`. (`userId`/`month` **no** figuran: no editables, §2.2.)
- **SummaryQueryDto / ListAvailabilityDto:** `month` `@Matches(...)` **req.**
- **ListAssignmentsDto:** `month` `@Matches(...)` **req.**; `processId?`/`userId?`/`requestId?`
  `@IsUUID @IsOptional`.
- **Response DTOs** separados, con `@ApiProperty`:
  - **AvailabilityResponseDto:** `{ id, userId, month: 'YYYY-MM', availableHours, createdAt,
    updatedAt }` (el service convierte la fecha de columna a `YYYY-MM` con `dateToMonthString`).
  - **AssignmentResponseDto:** `{ id, userId, month, processId, requestId|null, committedHours,
    description|null, createdAt, updatedAt }`.
  - **CapacityPersonDto:** `{ id, name, identifier }`.
  - **CapacitySummaryRowDto:** `{ userId, userName, month, disponible: number|null, comprometido:
    number, utilizacion: number|null, libre: number|null, estado: 'OK'|'SOBRECARGA'|
    'SIN_DISPONIBILIDAD'|'CARGA_PARCIAL', sobrecargado: boolean, cargaParcial: boolean }`
    (`cargaParcial = true` solo para líder/integrante con asignaciones de la persona fuera de su
    alcance; en ese caso `utilizacion`/`libre` son `null`, FINDING 4 / §2.4).

### 3.5 Códigos de estado y manejo de errores

Cada operación que puede fallar, su condición, recuperable/fatal, qué recibe el caller y si se
loguea (patrón Fases 1–3; ningún detalle Prisma se expone):

| Situación | Código | Recuperable | Log |
|---|---|---|---|
| Lectura / resumen / people ok | 200 | — | no |
| POST ok (disponibilidad / asignación) | 201 | — | no |
| PATCH ok (disponibilidad / asignación) | **200** + `*ResponseDto` actualizado en el body | — | no |
| DELETE ok (asignación) | **204** sin body (`@HttpCode(204)`, patrón task/phase/dependency) | — | no |
| Validación DTO (mes mal formado, horas no enteras/negativas, UUID inválido, falta requerido) | 400 | sí | no |
| `month` ausente en query que lo exige | 400 | sí | no |
| `requestId` con formato no-UUID | 400 (DTO) | sí | no |
| `requestId` UUID inexistente o con `mainProcessId` fuera de alcance | **404** (findFirst + scopeWhere; nunca 400) | sí | no (AC-025/026) |
| Sin actor / usuario inválido | 401 | sí | warn (dev) |
| Rol sin `capacity`; integrante **crea** con `userId` del body ≠ `actor.userId` (regla "solo la suya") | 403 | sí | no (esperado) |
| Disponibilidad / asignación inexistente o **fuera de alcance**; `processId` fuera de alcance; integrante **lee/edita/borra** por `:id` recurso con `userId` ≠ el suyo | 404 | sí | no (AC-025/026) |
| **Disponibilidad duplicada** (persona/mes ya existe) — P2002 | 409 | sí | no (AC-013) |
| Fallo al escribir `AuditEvent` dentro de la tx | 500 | fatal (rollback total) | error |
| Error Prisma no previsto / BD caída | 500 genérico sin stack | fatal | error |

- **Atomicidad:** cada mutación (crear/editar/borrar disponibilidad o asignación) hace la mutación +
  su `AuditEvent` en **una** `$transaction`; si algo falla, rollback total (invariante §1.5).
- **Sobrecarga NO es error:** `libre < 0` nunca produce 4xx; es un **estado** del resumen
  (`sobrecargado = true`), no un bloqueo (§12 D5).

### 3.6 Regeneración de contrato

Tras definir endpoints/DTOs: `npm run contracts:generate`, y **committear**
`apps/api/openapi/openapi.json` + `packages/api-client/src/generated/*`. El frontend consume solo vía
`@plantilla-portales/api-client`, que ya inyecta `X-Actor-Id` (Fase 1) — **sin cambios** en ese
mecanismo.

---

## 4. Frontend (apps/web, solo vía api-client)

Convierte el **placeholder** `apps/web/src/app/activos/capacidad/page.tsx` (hoy `UnderConstruction`)
en **SCR-17** real, manteniendo Fases 1–3 operativas. Nuevo wrapper tipado
`apps/web/src/lib/capacity.ts` siguiendo el patrón de `catalog.ts`/`team.ts` (clase `CapacityError`,
`messageForStatus` que traduce 400/403/404/409 a mensajes legibles **sin exponer JSON/Prisma**,
funciones `listCapacitySummary`, `listAvailability`, `createAvailability`, `updateAvailability`,
`listAssignments`, `createAssignment`, `updateAssignment`, `deleteAssignment`, `listCapacityPeople`).
Tipos de retorno acordes al contrato HTTP (§3.1/FINDING 5): `createAvailability`/`updateAvailability`
→ `AvailabilityResponseDto`; `createAssignment`/`updateAssignment` → `AssignmentResponseDto`;
`deleteAssignment` → `void` (204 sin body).

### 4.1 Pantalla SCR-17 (`/activos/capacidad`)

- **Selector de mes `YYYY-MM`:** control de mes (nativo `<input type="month">` con `<label>`
  asociado, o Select año+mes); al cambiar, recarga resumen/disponibilidad/asignaciones del mes.
- **Resumen por persona** (tabla accesible): columnas **persona, disponible, comprometido,
  utilización %, libre**, con **señal visual de sobrecarga** cuando `sobrecargado = true` (badge
  "Sobrecarga" + `aria-label`; **aviso, no error bloqueante**), "Sin disponibilidad" cuando
  `estado = 'SIN_DISPONIBILIDAD'`, y **"Carga parcial"** cuando `estado = 'CARGA_PARCIAL'`
  (`cargaParcial = true`): en ese caso se muestran `disponible` y `comprometido` como informativos,
  `utilización`/`libre` aparecen como "—" (son `null`), y una nota accesible aclara "Esta persona
  tiene asignaciones en procesos fuera de tu alcance; la carga total la ve el jefe de área" (FINDING
  4). La utilización se explica sin jerga (tooltip/nota: "Porcentaje de las horas disponibles que ya
  están comprometidas; más de 100% significa que hay más horas asignadas que disponibles").
- **Formulario de disponibilidad:** `mes` (del selector), `persona` (Select alimentado por
  `GET /capacity/people`, acotado al alcance), `horas disponibles` (**requerido**, entero `>= 0`).
  Para el integrante, la persona viene fijada a sí mismo (campo bloqueado). Ante 409 (duplicada),
  mensaje "Ya hay disponibilidad para esa persona y mes; edítala" y la UI ofrece cargar la existente
  para PATCH.
- **Formulario de asignación:** `mes` (**req.**), `proceso` (**req.**, Select de procesos en
  alcance), `persona` (Select de `people`), `solicitud` (**opcional**, Select de Requests en
  alcance), `horas comprometidas` (**req.**, entero `>= 0`), `descripción` (opcional). Lista de
  asignaciones del mes con editar/borrar (acotado al alcance; el backend reconfirma).
- **Estados loading / vacío / error / éxito** (UI-02/06, AC-030): `Skeleton` en carga, bloque de
  error con "Reintentar", estado vacío ("Aún no hay disponibilidad/asignaciones este mes") con acción
  de crear si el rol/alcance lo permite, `toast` (sonner) en éxito/error.
- **AC-031 (conservar la entrada ante error):** el `reset` del formulario solo ocurre en el camino de
  **éxito** (200/201). Ante fallo (400/403/404/409/500) el formulario **no se limpia ni se cierra**:
  conserva valores, mantiene el foco accesible y muestra el error (toast + mensaje en línea).
- **Accesibilidad:** HTML semántico (`<table>` con `<th scope>`, `<form>`, `<fieldset>` donde
  aplique), `<Label htmlFor>` en cada control, `aria-live` en regiones de carga/resultado,
  `aria-label` en los badges de sobrecarga. (La conformidad WCAG plena requiere pruebas manuales con
  lectores de pantalla y revisión experta; no se afirma conformidad completa.)

### 4.2 Explicación sin jerga (requisito del brief)

La pantalla explica en lenguaje llano **utilización** y **sobrecarga** (ejemplo arriba) y aclara que
"la disponibilidad se registra una vez por persona y mes" y que "las asignaciones de distintos
procesos se suman" (AC-013), para que el usuario entienda por qué una persona con dos procesos
muestra la carga agregada.

### 4.3 Mantener Fases 1–3 y /catalogs

El sidebar, el selector de usuario dev, `/catalogs`, `/catalog-items`, `/gobierno/*`,
`/administracion/*`, las pantallas de demanda (Fase 2) y de plan/tareas/mi-trabajo/revisión (Fase 3)
siguen operativas sin cambios. Solo se reemplaza el contenido de `/activos/capacidad` (que hoy es
`UnderConstruction`); su `moduleKey` ya es `capacity` y coincide con `MODULE_MATRIX` (gating de menú
cosmético; el control real es server-side). No se toca ninguna otra ruta ni wrapper existente.

---

## 5. AuditEvent: forma e invariante en Fase 4

**Invariante:** ninguna mutación de dominio de Fase 4 sin su `AuditEvent`, dentro de la misma
`$transaction`. **Dueño:** la capa de service (único con Prisma y actor), igual que Fases 1–3. La
forma de los eventos está en §1.5. Consecuencia de visibilidad: la auditoría de **asignación**
(`scopeProcessId = processId`) es visible por proceso para líder/jefe; la de **disponibilidad**
(`scopeProcessId = null`) es visible para el **actor** (integrante por `actorUserId`), no por proceso
— decisión reversible documentada (§1.5).

---

## 6. Testabilidad (estrategia por capa)

**Unit (Jest, `apps/api`)** — prioridad: helpers de mes, resumen (fórmula/casos borde), alcance,
validaciones, auditoría, duplicado (patrón `*.service.spec.ts` con `PrismaService` mockeado):

- `month`: `monthStringToDate('2025-03')` → `2025-03-01` UTC; `'2025-13'`/`'2025-3'` → el DTO los
  rechaza (regex); `dateToMonthString` inverso; round-trip.
- **Resumen (AC-012/013, §1.4):**
  - disponible 160 / comprometido 120 → `utilizacion 75`, `libre 40`, `estado OK`,
    `sobrecargado false`.
  - comprometido > disponible → `libre < 0`, `estado SOBRECARGA`, `sobrecargado true` (señala, **no**
    lanza error).
  - `disponible 0` o ausente → `utilizacion null`, `libre null`, `estado SIN_DISPONIBILIDAD` (sin
    división por cero).
  - **AC-013 + FINDING 4:** persona con asignaciones en **dos procesos** → para el **jefe**,
    `comprometido` suma ambos, `cargaParcial = false`, `utilizacion`/`libre` calculados sobre el total;
    para un **líder** que solo ve uno de los procesos, `comprometido` suma solo ese, se detecta carga
    fuera de alcance → `cargaParcial = true`, `estado = 'CARGA_PARCIAL'`, `utilizacion = null`,
    `libre = null` (no se expone el proceso/horas ajenas); la disponibilidad se cuenta **una** vez por
    persona/mes. Caso líder sin carga fuera de alcance → `cargaParcial = false` y util/libre normales.
- **Validaciones (§2.3):** horas fraccionarias → 400; negativas → 400; `0` permitido (disponibilidad
  "sin disponibilidad" / asignación placeholder).
- **Duplicado (§2.1/AC-013):** segundo POST de disponibilidad para misma persona/mes → 409 (P2002);
  PATCH edita la existente.
- **Alcance (§2.5/§2.6, FINDING 1/2/3/6):** integrante **crea** disponibilidad/asignación con
  `userId` del body ≠ el suyo → **403**; integrante **lee/edita/borra** por `:id` recurso ajeno →
  **404**; integrante resumen → solo su fila; líder resuelve asignación de proceso ajeno por `:id` →
  404; líder crea asignación con `processId` fuera de alcance → 404; `POST assignment` con `requestId`
  de una Request fuera de alcance → **404** (no 400); `GET /capacity/people` devuelve el conjunto
  correcto por rol (integrante=él; líder=él + personas de sus procesos; jefe=`User.active=true`);
  `scopedUserIds` para el jefe = `'ALL'` (sin filtro de `userId`); lectura de disponibilidad **nunca**
  devuelve filas de personas fuera del `scopedUserIds` del actor.
- **Sobreasignación NO bloquea (§12 D5):** crear asignación que deja `libre < 0` → 201 (no error).
- **Auditoría (§1.5):** cada mutación invoca `AuditService.record` con el `objectType` correcto
  (`MONTHLY_AVAILABILITY`/`ASSIGNMENT`), `scopeProcessId` correcto (null para disponibilidad,
  `processId` para asignación) y before/after; todo dentro de `$transaction`.
- **Acceso Prisma (§1.1):** `MonthlyAvailability` se resuelve/escribe por la clave compuesta
  `([userId, month])`; resolución por `id` + alcance con `findFirst`.

**E2E (Playwright, `/e2e`)** — flujo FLOW-007 / UC-011 / US-007 y controles negativos:

- UC-011/US-007: elegir mes `YYYY-MM`; registrar disponibilidad de una persona (una vez); crear
  asignaciones en uno o dos procesos; ver el **resumen** con disponible/comprometido/utilización/libre
  (AC-012); una persona con dos procesos muestra la carga **agregada** (AC-013).
- Sobrecarga: asignar más horas que las disponibles → la fila se marca **sobrecarga** (aviso), **no**
  bloquea el guardado (AC-012 "señalar exceso según regla confirmada" — aquí señalado, no bloqueado,
  por ser `P`).
- Duplicado: intentar registrar disponibilidad dos veces para la misma persona/mes → mensaje de
  conflicto y opción de editar (409).
- Controles negativos (FINDING 6): integrante intenta **crear** capacidad de otra persona → 403;
  integrante intenta **ver/editar** una capacidad ajena por `:id` → 404; líder abre una asignación de
  otro proceso → 404; horas negativas/fraccionarias → 400 con el formulario conservando valores
  (AC-031).
- Contrato HTTP (FINDING 5): `PATCH` disponibilidad/asignación responde **200** con el DTO
  actualizado; `DELETE` asignación responde **204** sin body (el wrapper `capacity.ts` tipa
  `deleteAssignment` como `void`).
- AC-030: resumen/listas vacíos → estado vacío con acción de crear si el rol permite.
- AC-028: cada mutación aparece en auditoría (reusa la vista de Fase 1), con la salvedad documentada
  de la disponibilidad sin scope (§1.5).
- Fases 1–3 siguen operativas (`/catalogs`, demanda, plan/tareas/mi-trabajo/revisión).

**Verificación de cierre (steering):** `npm run typecheck`, `npm run build`, `npm run test:unit`,
`npm run test:e2e` pasan; `npm run contracts:generate` con artefactos committeados; migración
`fase4_capacidad` aplicada; Fases 1–3, `/catalogs` y `/catalog-items` intactas.

---

## 7. Fuera de alcance (explícito)

Respetando `specs/28` punto 6 (todo lo marcado `P`) y el brief:

- **Fórmula de utilización impuesta por el Site** (`28` p.6; SCR-17 `P`): se adopta
  `round(comprometido/disponible*100)` como **decisión reversible** (§12 D4); no se afirma la del
  Site.
- **Límites / bloqueo duro de sobreasignación** (`05` reglas no asumidas; `28` p.6): **no** se
  implementa; la sobrecarga se **señala**, no se bloquea (§12 D5).
- **Reglas exactas de cero/negativo/fracción** (`19`; `28` p.6): postura conservadora (enteras `>= 0`,
  cero = "sin disponibilidad") como **decisión reversible** (§12 D6); no se afirma la del Site.
- **Categoría `capacity` de la guía del plan (Fase 3) como bloqueo real** (BR-007; Fase 3 §2.2): queda
  **informativa**, no gatea el envío del plan (§12 D10, reversible).
- **Consolidación multiproceso "exótica"** / denominador compartido (`28` p.6 "disponibilidad
  compartida"; `28` Inferido): el resumen suma lo visible en alcance (§2.4); la consolidación completa
  es `P` y se difiere.
- **Bitácora / registro diario-semanal** (FEATURE-006, BR-013/015): no se implementa; `comprometido`
  **solo** proviene de `Assignment`, nunca de horas de bitácora (frontera BR-013 respetada por
  ausencia).
- **Activos / Documentos / Frameworks / Portafolio** (FEATURE-004 vistas, 007, 008): fuera de Fase 4.
- **Borrado de disponibilidad / "mover" persona-mes**: no se expone en Fase 4 (se edita horas);
  decisión reversible (§2.2).
- **Ampliar `/users` o `/grants` a no-jefes**: no se toca Fase 1; el selector usa el endpoint propio
  `GET /capacity/people` (§2.6/§12 D9).

---

## 8. Resumen de archivos a crear/modificar

**apps/api**
- `prisma/schema.prisma` — + `MonthlyAvailability`, `Assignment`; relaciones inversas en `User`,
  `Process`, `Request`.
- `prisma/migrations/<ts>_fase4_capacidad/migration.sql` — vía `prisma migrate dev`.
- `src/modules/audit/audit.service.ts` — + `MONTHLY_AVAILABILITY | ASSIGNMENT` en `AuditObjectType`.
- `src/modules/capacity/` — módulo nuevo: `capacity.module.ts`, `capacity.controller.ts`,
  `capacity.service.ts`, `capacity-scope.service.ts`, `month.ts`, DTOs (§3.2), specs
  (`capacity.service.spec.ts`, `capacity.module.spec.ts`, `month.spec.ts`).
- `src/app.module.ts` — registrar `CapacityModule`.

**packages/api-client** — regenerado con `npm run contracts:generate` (committear artefactos).

**apps/web**
- `src/app/activos/capacidad/page.tsx` — SCR-17 real (selector de mes, resumen, formularios).
- `src/lib/capacity.ts` — wrapper tipado (patrón `catalog.ts`/`team.ts`).
- componentes shadcn ya presentes (Select, Input, Table, Badge, Skeleton, toast); añadir solo los que
  falten.

**Verificación de cierre (steering):** `npm run typecheck`, `npm run build`, `npm run test:unit`,
`npm run test:e2e` pasan; contratos regenerados y committeados; Fases 1–3, `/catalogs` y
`/catalog-items` siguen operativas.

---

## 9. Trazabilidad a specs / AC

| Elemento SDD | Dónde se cubre |
|---|---|
| **FLOW-007** (seleccionar mes → disponibilidad una vez persona/mes → distribuir horas por asignación/proceso/solicitud → revisar disponible/comprometido/uso/libre) | §Visión general; §2.1/§2.2/§2.4; §4.1 |
| **UC-011** (consultar disponibilidad por persona/mes y asignaciones por proceso/solicitud) | §2.4; §3.3 (summary/availability/assignments); §4.1 |
| **US-007** (líder/jefe autorizado consulta disponibilidad y asignaciones mensuales para evaluar la carga) | §2.4/§2.5; §4.1 |
| **FEATURE-005** (SCR-17, FNC-020, BR-012) | todo el documento |
| **SCR-17** (selección `YYYY-MM`; resumen disponible/comprometido/utilización/libre; forms disponibilidad y asignación; capacidad separada de framework; fórmula/sobreasignación/negativas `P`) | §1.2 (modelo); §2.4 (resumen); §3.3/§3.4 (API/DTO); §4.1 (UI); §12 D4/D5/D6 (los `P`) |
| **BR-012** (disponibilidad por persona/mes, no por proyecto; asignaciones se agregan por periodo/proceso) | §1.2 (`@@unique([userId,month])`; `Assignment` sin unique estricto); §2.4 (suma); §12 D1/D3 |
| **BR-013** (horas de bitácora ≠ horas de capacidad) | supuesto 4; §2.7; §7 (comprometido solo de `Assignment`) |
| **AC-012** (resume por persona/mes; señalar exceso según regla confirmada) | §2.4; §4.1 (sobrecarga señalada); §12 D5 (exceso = `P`, se señala no bloquea) |
| **AC-013** (persona con dos procesos: disponibilidad una vez; carga agrega asignaciones) | §2.4; §6 (test); §4.2 (explicación) |
| **AC-025/026** (403 por rol, 404 por alcance sin filtrar datos) | §2.5/§2.6; §3.5 |
| **AC-028** (toda mutación trazable) | §1.5; §5 (con salvedad disponibilidad sin scope) |
| **AC-030** (estados vacíos con acción si el rol permite) | §4.1 |
| **AC-031** (conservar valores ante error; reset solo en éxito) | §4.1 |
| **`specs/10`** (matriz `capacity` = los 3 roles con alcance) | §2.5 (verificado en `module-matrix.ts`) |
| **`specs/19`** (disponibilidad cero, negativas/fraccionarias, duplicada, persona en varios procesos, sobrecarga) | §10 (mapa de casos borde) |
| **`specs/28` p.6** (fórmula, sobreasignación, cero/negativas/fracciones, consolidación, duplicada, efecto en envío) | §7; §12 D4/D5/D6/D10 (todos como decisiones reversibles) |
| **`specs/29`** fila 17 (Disponibilidad: mes/proceso-contexto/persona/horas; una por persona/mes · Asignación: mes/proceso/persona/solicitud/horas; mes/proceso/horas req.) | §1.2 (modelo y requeridos); §3.4 (DTOs) |

---

## 10. Mapa de casos borde (`specs/19`) → tratamiento

| Caso borde | Tratamiento Fase 4 |
|---|---|
| Disponibilidad cero | `availableHours = 0` válido → resumen `utilizacion null`, `estado SIN_DISPONIBILIDAD`; sin división por cero (§1.4/§12 D4) |
| Horas negativas | 400 (`@Min(0)` + service) (§2.3/§12 D6) |
| Horas fraccionarias | 400 (`@IsInt` + service) (§2.3/§12 D6) — decisión reversible |
| Asignación duplicada | **No** se bloquea: las asignaciones se agregan (BR-012); varias por persona/mes son válidas y se suman (§1.2/§12 D3). (La **disponibilidad** sí es única → 409, §2.1/§12 D7) |
| Persona en varios procesos | Disponibilidad una vez por persona/mes; `comprometido` suma asignaciones de los procesos **en alcance** del actor (AC-013; §2.4) |
| Mes con sobrecarga | `libre < 0` → `sobrecargado true`, `estado SOBRECARGA`; **se señala, no se bloquea** (§12 D5) |
| Persona/proceso fuera de alcance | 404 sin filtrar datos (§2.5/§2.6) |
| Mes mal formado | 400 (regex del DTO) (§1.3/§3.4) |

> Los casos marcados `P` en el SDD (fórmula, sobreasignación, negativas/cero/fracción, consolidación)
> se tratan con la opción mínima documentada y **reversible**; no se completan por intuición
> (`19`/`28` p.6).

---

## 11. Casos de uso / historias / flujo cubiertos

- **UC-011 (revisar capacidad):** consultar disponibilidad por persona/mes y asignaciones por
  proceso/solicitud (§2.4; §3.3).
- **US-007 (capacidad):** líder/jefe autorizado consulta disponibilidad y asignaciones mensuales para
  evaluar la carga (§2.4/§2.5; §4.1).
- **FLOW-007 (capacidad):** seleccionar mes → disponibilidad una vez por persona/mes → distribuir
  horas por asignación/proceso/solicitud → revisar disponible/comprometido/uso/libre (§Visión
  general; §4.1).
- **FEATURE-005 (Capacidad):** SCR-17, FNC-020, BR-012 (todo el documento).

---

## 12. DECISIONES de diseño (todo lo marcado `P`)

Cada decisión adopta la opción **mínima, documentada y REVERSIBLE**; **ninguna** se presenta como
hecho del Site.

| # | Tema (marca SDD) | Decisión (reversible salvo indicación) | Punto a reabrir |
|---|---|---|---|
| **D1** | Dimensión de la disponibilidad (BR-012; SCR-17 lista "proceso/contexto") | **Decisión reversible.** La disponibilidad es por **persona/mes**, **sin** `processId` en el modelo; el "contexto de proceso" del formulario solo resuelve alcance, no se persiste. `scopeProcessId` de su auditoría = `null` (§1.5) | Si el Site confirma disponibilidad por proceso → añadir `processId` y `@@unique([userId, month, processId])` |
| **D2** | Formato del mes (FLOW-007 `YYYY-MM`) | **Decisión reversible.** Columna `DateTime @db.Date` = primer día del mes (UTC); contrato externo `YYYY-MM` (string) con conversión en el service (§1.3) | Persistir el string si el Site lo exige (sin tocar el contrato externo) |
| **D3** | ¿`@@unique` en `Assignment`? (BR-012 "se agregan"; `19` "asignación duplicada") | **Decisión reversible.** **Sin** `@@unique` estricto: varias asignaciones por persona/mes son válidas y se **suman** (§1.2/§2.4) | Añadir `@@unique([userId, month, processId(, requestId)])` si el Site confirma partida única |
| **D4** | Fórmula de utilización + división por cero (SCR-17 `P`; `28` p.6) | **Decisión reversible.** `utilizacion = round(comprometido/disponible*100)`; `disponible` 0/ausente → `utilizacion null`, `estado SIN_DISPONIBILIDAD` (sin división por cero) (§1.4) | Cambiar fórmula/redondeo/denominador cuando el Site lo confirme |
| **D5** | Sobreasignación: ¿bloquear? (`05` reglas no asumidas; `28` p.6) | **Decisión reversible.** `libre < 0` = sobrecarga **señalada** (`sobrecargado true`, `estado SOBRECARGA`), **nunca** bloqueada (no 4xx) (§1.4/§2.7) | Introducir gate/límite de sobreasignación si el Site lo confirma |
| **D6** | Cero/negativo/fracción (`19`; `28` p.6) | **Decisión reversible.** Enteras `>= 0`; negativas → 400; fracciones → 400; cero = "sin disponibilidad" (§2.3) | Cambiar a `Decimal`/`Float` o mínimo distinto si el Site confirma fracciones |
| **D7** | Disponibilidad duplicada (SCR-17 "única"; `19`) | **Decisión.** `@@unique([userId, month])` → segundo POST = **409**; editar vía **PATCH** sobre la fila existente (no `upsert` silencioso) (§2.1) | — (la unicidad es del SDD) |
| **D8** | Quién registra capacidad de otra persona (SCR-17 "Capacidad: Propia" `P`; `specs/10`) | **Decisión reversible.** Integrante: solo la suya — **crear** con `userId` ajeno → **403**; **leer/editar/borrar** ajeno por `:id` → **404** (§2.5, FINDING 6). Líder: personas/asignaciones de sus procesos. Jefe: área | Ajustar reparto si el Site confirma otro (p. ej. integrante registra disponibilidad pero no asignaciones) |
| **D12** | Definición de "área" del jefe (no hay dimensión de área en el modelo) | **Decisión reversible.** "Área" = `User.active = true` (área única Analítica, `specs/28`; `User.active` existe en el schema). El `where` del jefe no filtra por `userId`/`processId` (`scopedUserIds = 'ALL'`), solo por `month`/filtros opcionales (§2.6.1, FINDING 2) | Añadir dimensión de área si el modelo pasa a multi-área |
| **D13** | Resumen del líder con carga fuera de su alcance (AC-013 vs "no filtrar datos") | **Decisión reversible (Opción A).** `comprometido` del líder es parcial; si la persona tiene asignaciones fuera del alcance → `cargaParcial = true`, `estado = 'CARGA_PARCIAL'`, `utilizacion`/`libre` = `null`; el **jefe** ve la carga total agregada (§2.4/§1.4, FINDING 4) | Cambiar a Opción B (resumen "carga en mis procesos" sin util/libre) o a un cálculo global para líder si el Site lo confirma |
| **D14** | `requestId` fuera de alcance/inexistente en asignación | **Decisión.** No-UUID → 400 (DTO); UUID inexistente o `mainProcessId` fuera de alcance → **404** (findFirst + scopeWhere), nunca 400 (no confirma existencia) (§2.2, FINDING 3) | — (política 404 del repo) |
| **D15** | Contrato HTTP de PATCH/DELETE | **Decisión.** `PATCH` → 200 + `*ResponseDto`; `DELETE` → 204 sin body (`@HttpCode(204)`, patrón task/phase/dependency) (§3.1, FINDING 5) | — (convención del repo) |
| **D9** | Selector de personas en alcance (`/users` y `/grants` son solo jefe) | **Decisión reversible.** Endpoint propio `GET /capacity/people` acotado por grants/alcance; no se amplía `/users` (no se toca Fase 1) (§2.6) | Delegar en un `/users` con alcance si Fase 1 lo abre |
| **D10** | Categoría `capacity` de la guía del plan (Fase 3 §2.2; BR-007) | **Decisión reversible.** Queda **informativa**: la guía puede mostrar un enlace/estado de capacidad, pero **no** convierte `capacity` en pendiente que bloquee el envío del plan (sería inventar la regla `P` de "efecto en envío", `28` p.6) | Conectar como gate real cuando el Site confirme el efecto de capacidad sobre el envío |
| **D11** | Borrado de disponibilidad / "mover" persona-mes | **Decisión reversible.** No se expone borrado de disponibilidad en Fase 4 (se edita horas); asignaciones sí se borran (§2.2) | Exponer DELETE de disponibilidad si el Site lo confirma |

---

> **Resolución de ambigüedades primero (requerido por el método).** Las decisiones de modelado
> (D1 disponibilidad por persona/mes sin proceso; D2 formato de mes; D3 sin unique en asignaciones),
> de cálculo (D4 utilización + división por cero; D5 sobrecarga señalada no bloqueada), de validación
> (D6 enteras `>= 0`, cero permitido; D7 duplicado 409 + PATCH), de autorización (D8 reparto por rol;
> §2.5/§2.6 alcance en el `where`) y de integración (D9 endpoint propio de personas; D10 gancho
> informativo de la guía del plan) quedan **resueltas y documentadas** arriba, cada una marcada como
> **decisión reversible** con su punto a reabrir. Los supuestos están explícitos en §Visión general.
> El diseño es implementable sin tomar decisiones de arquitectura adicionales y respeta el steering
> (NestJS dueño de la lógica; Prisma solo en `apps/api`; frontend solo vía api-client; monolito
> modular; sin infra nueva; comandos existentes intactos).

---

## 13. Respuestas al design-review (2.ª iteración)

Veredicto previo: **CHANGES_REQUESTED** (1 HIGH, 4 MEDIUM, 2 NIT). Cada finding se **resuelve** (no se
hace backlog de ninguno; todos son huecos de especificación acotados, no rediseño).

| Finding | Sev. | Resolución |
|---|---|---|
| **1** — Alcance de LECTURA de la disponibilidad para el líder no operativo | HIGH | **Resuelto.** Se añade el helper `scopedUserIds(actor)` (§2.6.1) como fuente única de verdad: `'ALL'` para el jefe, `[actor.userId]` para el integrante, y `él + distinct userId de Grant activo ∈ scopedProcessIds` para el líder. El `where` **concreto** de disponibilidad y resumen (`userId ∈ scopedUserIds` salvo `'ALL'`) queda escrito como código, no prosa (§2.4, §2.6.1). La disponibilidad **nunca** devuelve filas fuera de alcance (AC-025/026). |
| **2** — `where` del jefe para "área" indefinido | MEDIUM | **Resuelto.** Verificado en el schema que `User.active` existe; "área" = `User.active = true` (área única Analítica, `specs/28`). `scopedUserIds` devuelve `'ALL'` para el jefe → su `where` no filtra por `userId`/`processId`, solo por `month`/filtros opcionales (§2.6.1, D12). |
| **3** — `requestId` inválido/fuera de alcance 400 vs 404 | MEDIUM | **Resuelto.** No-UUID → 400 (DTO); UUID inexistente o con `mainProcessId` fuera de alcance → **404** (`findFirst` con el mismo `scopeWhere` de `request.service.ts`), nunca 400. Eliminado el "400 (o 404)" de §3.5; fijado en §2.2 y D14. |
| **4** — Agregación del resumen del líder vs AC-013 (comprometido parcial vs disponible total) | MEDIUM | **Resuelto (Opción A).** Nueva bandera `cargaParcial`: para líder/integrante con asignaciones fuera de su alcance, `estado = 'CARGA_PARCIAL'` y `utilizacion`/`libre` = `null` (no se mezcla disponible total con comprometido parcial, no se revelan los procesos ajenos); el **jefe** ve la carga total agregada (AC-013). Reflejado en §1.4, §2.4, §3.4 (DTO), §4.1 (UI), §6 (tests), D13. |
| **5** — Código de PATCH/DELETE ambiguo (`200 / 204`) | MEDIUM | **Resuelto.** Verificado el patrón del repo (task/phase/dependency usan `@HttpCode(204)` en DELETE; PATCH devuelve el recurso): `PATCH` → **200** + `*ResponseDto`; `DELETE` → **204** sin body. Fijado en §3.1, §3.3, §3.5, §4 (wrapper `deleteAssignment: void`), D15. |
| **6** — 403/404 del integrante sobre capacidad ajena mezcla políticas | NIT | **Resuelto.** Regla única: **crear** con `userId` ajeno → **403** (viola "solo la suya"); **leer/editar/borrar** por `:id` recurso ajeno → **404** (fuera de alcance). Fijado en §2.5 (D8), §3.5 y §6. |
| **7** — `description` sin formato definido | NIT | **Resuelto.** Añadida nota en §1.2: `description` es texto libre informativo; ninguna regla de cálculo lo interpreta (no se infiere estructura de "distribución"). |

Suposiciones verificadas por el reviewer (AuditObjectType, MODULE_MATRIX.capacity, `/users` y `/grants`
jefe-only, patrón de alcance en el `where`, forma de `CurrentActor`, gancho `capacity` de la guía,
BR-012/013, SCR-17, AC-012/013, `specs/28` p.6) se mantienen intactas: el diseño no las contradice. Las
decisiones `P` siguen marcadas como **reversibles** en §12 (D1–D15), sin afirmar ninguna regla del
Site.
