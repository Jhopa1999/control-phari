# Fase 8 · Portafolio y control del área — Diseño técnico

> Worktree: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase8-portafolio`.
> Fuente de verdad del dominio: `docs/marco-corporativo/FCGR-INS-008-v2.0.txt` (marco FCGR / INS-008 v2.0, Pharitech), **sección 9 "Trazabilidad, seguimiento e indicadores"**.
> Esta es la **última fase funcional**. Las Fases 1–7 ya están en `main`; esta fase **construye encima**, no las rehace.
> **Iteración 3** (revisión del diseño): corrige los 4 hallazgos de la revisión vigente `design-review.json` / `design-review.md` (1 HIGH + 1 MEDIUM + 2 NIT). Ver "Respuestas a la revisión" al final. (La iteración 2 había resuelto una tanda previa de 2 MEDIUM + 4 NIT, documentada también al final.)
> Alcance: área Analítica (procesos FIBI/FIID/FIAA + coordinación FMAA ya existentes). Se aplica el **ciclo e indicadores corporativos generales**; no se modelan procesos corporativos externos (Comité, Dirección) como entidades.

---

## 0. Resumen ejecutivo

La Fase 8 añade **lectura y agregación read-only** sobre las entidades que ya construyeron las Fases 2–7. No crea nuevas entidades de negocio, no muta datos, y **no requiere migración de esquema** (ver §6). Compone dos superficies:

- **Control del área — indicadores (SCR-01, `demandOverview`):** panel de indicadores del marco §9 computados server-side sobre `Request`/`Triage`/`Task`/`Issue`/`GateCheck`. Para cada indicador sin dato o sin denominador se reporta **"No aplica"** (regla del marco §9), honestamente, nunca un `0` inventado. Vive en la ruta `/demanda/resumen` (jefe/líder), que es la pantalla SCR-01 del SDD.
- **Panorama de demanda (`dashboard`):** conteos de demanda por `RequestState` y por banda de prioridad P1–P4 + `SIN_PRIORIZAR`, más bloqueadas activas. Accesible a los 3 roles; vive en `/inicio`.
- **Portafolio (SCR-07, `portfolio`):** vista de conjunto de las iniciativas/solicitudes dentro del alcance del actor, con columnas confirmables (título, proceso, estado operativo, banda de prioridad, ruta de gobierno, responsable, fechas clave) y filtros por proceso/estado/prioridad. Vive en `/seguimiento/portafolio` (3 roles).

Las tres superficies se montan en **las tres rutas que `navigation.ts` ya reserva**, sin tocar la navegación ni las claves de módulo (ver §9, "Mapa de rutas").

Decisión de módulo backend: **un módulo nuevo `portfolio/`** (controller fino + services de agregación + response DTOs), que **reutiliza** `RequestStateService` (bandas de prioridad, triage/evaluación vigentes) y **replica** (no importa) el patrón de alcance de **lectura** por `where` ya probado en `RequestStateService` / `RequestService` / `ApprovalService` (jefe sin filtro; resto por `scopedProcessIds`, sin filtrar por rol). Nota: el método `scopeWhere` de esos servicios es `private` y no es invocable entre módulos; por eso el patrón se **replica** en un `PortfolioScopeService` propio. Justificación en §1; detalle del alcance en §4.

El stack queda fijado al estándar del repositorio y de las fases previas: **NestJS + TypeScript estricto** en `apps/api`, **Prisma 7 (`prisma-client`)** sobre **PostgreSQL** (Prisma solo en `apps/api`), contrato **OpenAPI** regenerado a `packages/api-client`, **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** en `apps/web` consumiendo **solo** `@plantilla-portales/api-client`, **Jest** para unitarios. Sin infraestructura nueva (sin Redis/Kafka/Kubernetes, sin cron ni tareas programadas); monolito modular. **Este stack queda bloqueado al aprobarse el diseño.**

---

## 1. Decisión de módulo backend y su justificación

**Opción A — módulo nuevo `portfolio/`.** Un módulo dedicado con dos áreas de endpoint: control del área (indicadores) y portafolio (listado agregado).
**Opción B — ampliar `request/`.** Añadir endpoints de agregación al módulo de demanda existente.
**Opción C — un módulo `dashboard/`** separado del portafolio.

**Elección: Opción A, módulo nuevo `portfolio/`.** Razones:

1. **Cohesión por responsabilidad (steering backend / monolito modular).** El módulo `request/` concentra el **CRUD y la máquina de estados** de la demanda (escritura, gates de transición). Mezclar ahí agregaciones read-only de indicadores diluiría esa responsabilidad. La Fase 8 es conceptualmente "lectura agregada del portafolio", una funcionalidad distinta → módulo propio.
2. **No duplicar lógica.** El módulo reutiliza `RequestStateService` (ya expone `priorityBand`, `priorityLabel`, `currentTriage`, `currentPriorityEvaluation`) importando su provider, en lugar de reimplementar bandas o vigencia. La lógica de negocio sigue siendo única y vive en el backend.
3. **Un solo módulo para las dos pantallas (A sobre C).** SCR-01 y SCR-07 comparten las mismas entidades fuente, el mismo alcance por rol y el mismo mapeo a bandas/estados. Separarlas en dos módulos duplicaría los helpers de alcance y de mapeo. Dentro de `portfolio/` se separan en **dos services** (`AreaControlService`, `PortfolioService`) y **dos controllers** finos, para mantener los casos de uso acotados.

**Nombre de las claves de módulo (MODULE_MATRIX, NO se tocan las 21 claves):** la pantalla SCR-01 "Control del área / demandaOverview" (los **indicadores de demanda** del marco §9, jefe/líder, no integrante) se expone con la clave **`demandOverview`** y se monta en la ruta `/demanda/resumen`; el **panorama** accesible a los 3 roles usa la clave **`dashboard`** y se monta en `/inicio`. La pantalla SCR-07 Portafolio usa **`portfolio`** (3 roles con alcance) en `/seguimiento/portafolio`. Estas tres claves y sus tres rutas **ya existen** en `MODULE_MATRIX` y `navigation.ts`; esta fase no añade ni cambia claves ni rutas (ver §9, "Mapa de rutas").

Estructura de archivos (patrón de módulo del repo: controller fino + service + response DTOs + `@nestjs/swagger`):

```
apps/api/src/modules/portfolio/
├── portfolio.module.ts
├── area-control.controller.ts        # GET /area-control/*  (demandOverview + dashboard)
├── area-control.service.ts           # agregación de indicadores + conteos
├── portfolio.controller.ts           # GET /portfolio       (portfolio)
├── portfolio.service.ts              # listado agregado + filtros
├── portfolio-scope.service.ts        # where de alcance por rol (compartido por ambos services)
├── indicators.ts                     # fórmulas puras (mediana, %), tipadas y testeables
└── dto/
    ├── area-control-query.dto.ts
    ├── area-control-response.dto.ts
    ├── list-portfolio.dto.ts
    └── portfolio-item-response.dto.ts
```

Registro en `app.module.ts`: añadir `PortfolioModule` a `imports` (junto a los módulos de Fases 1–7). `PortfolioModule` importa `AuthModule` (guards/decorator), `RequestModule` o reexporta `RequestStateService`, y usa `PrismaService` + `AuditService` del patrón común. **No** se registra `AuditService` para escritura: la Fase 8 es read-only y **no** emite `AuditEvent` (nada muta).

---

## 2. Indicadores del marco §9: fórmula exacta y computabilidad HOY

El marco §9 define 7 indicadores + la **regla rectora**: *"Se acuerdan metas tras establecer la línea base; si no hay casos o denominador, se reporta 'No aplica'"*. Esta fase implementa esa regla literalmente: cada indicador devuelve un contrato con `applicable: boolean` y, cuando `applicable=false`, un `reason` legible (p. ej. `"Sin casos en el periodo"`). **Nunca** se devuelve `0` ni un valor inventado para representar ausencia de dato.

Las **instancias de seguimiento** del marco (evaluación de demanda semanal, seguimiento de entrega semanal, portafolio y cambios mensual, revisión operativa mensual, revisión de valor trimestral) **solo informan el agrupamiento visual** de la pantalla (ver §5). **No** generan scheduling: no hay cron, jobs ni tareas programadas; el periodo lo elige el usuario con un filtro.

### Convención de "periodo"

El periodo es un rango **semiabierto** `[from, to)` opcional (query params `from`/`to`, `YYYY-MM-DD`), con `from` **inclusivo** y `to` **exclusivo**. Si no se envían, el default es el **mes natural en curso** en UTC, resuelto así (coherente con la convención `@db.Date`/UTC y el helper `month.ts` de Fases 4–7):

- `from` por defecto = **primer día del mes en curso** a las `00:00:00.000Z` (inclusivo).
- `to` por defecto = **primer día del mes siguiente** a las `00:00:00.000Z` (**exclusivo**), **no** "fin de mes".

Todos los filtros temporales usan ese semiabierto: `decidedAt >= from AND decidedAt < to`, `endDate >= from AND endDate < to`, cierre `createdAt >= from AND createdAt < to`. Precisión deliberada para no implementar por error `<= finDeMes` (que doble-contaría la frontera o perdería el último día). Las fechas se interpretan en UTC.

### 2.1 Tiempo de evaluación — **COMPUTABLE HOY**

- **Definición marco:** días desde registro hasta decisión inicial; reportar **mediana** y **casos pendientes**.
- **Fórmula exacta:** para cada `Request` cuyo `Triage` vigente tiene `decidedAt` dentro del periodo, `dias = floor((triage.decidedAt − request.registeredAt) / 86_400_000)` (días calendario, no negativos; si fuese negativo por dato sucio se descarta y se cuenta como anomalía, no se incluye en la mediana). La **mediana** se calcula sobre esa muestra (orden ascendente; par → promedio de los dos centrales, redondeado con `Math.round`). **Casos pendientes** = `Request` dentro del alcance **sin ninguna decisión inicial de triage tomada**, es decir `currentTriage == null` (no hay `Triage` vigente con `decidedAt`), **independiente del estado operativo** y **sin** filtro de periodo (un pendiente lo es "a hoy"). Se define por la **ausencia de decisión**, no por el estado, a propósito: según `triage.service.ts`, la decisión `CONTINUAR` deja la Request en `EN_TRIAGE` pero **con** un `Triage` ya decidido (`decidedAt` seteado), por lo que condicionar a `estado ∈ {REGISTRADA, EN_TRIAGE}` haría el conteo inestable (una Request `EN_TRIAGE` casi siempre tiene triage decidido). Usando solo `currentTriage == null` el conteo de "pendiente de decisión inicial" es estable y no depende de un estado que ya implica decisión. En la práctica esto equivale casi siempre a `REGISTRADA`, pero la condición es sobre la decisión, no sobre el estado.
- **"Decisión inicial" = `Triage.decidedAt`:** el triage es la primera decisión del ciclo (GC1, marco §5 etapa 2). Se usa `RequestStateService.currentTriage(requestId)` para resolver el triage vigente (1:1 efectivo). La decisión puede ser CONTINUAR/DEVOLVER/RECHAZAR: las tres cuentan como "decisión inicial tomada".
- **"No aplica"** cuando la muestra de días está vacía (ninguna decisión en el periodo). En ese caso `median` es `applicable=false` con `reason`, pero `pendingCount` **siempre** se reporta (es un conteo, no una mediana): puede ser `0` legítimamente.

### 2.2 Cumplimiento de hitos — **COMPUTABLE HOY (con "No aplica" si denom. 0)**

- **Definición marco:** `hitos cumplidos a tiempo ÷ hitos con vencimiento en el periodo × 100`.
- **Fórmula exacta:** `Task` con `isMilestone=true` cuyo `endDate` (fecha de vencimiento planificada del hito) cae en el periodo = **denominador**. De ellos, "cumplidos a tiempo" = `status === 'TERMINADA'` **y** `accepted === true` **y** `acceptedAt <= endDate` = **numerador**. Resultado `= round(num / den × 100)`.
- **Alcance de los hitos:** `Task` pertenece a `PlanPhase` → `Plan` → `Request`. El alcance por rol se aplica resolviendo la `Request` dueña (join `phase.plan.request.mainProcessId ∈ scope`). Se filtra con `where` anidado de Prisma (`phase: { plan: { request: { mainProcessId: { in: [...] } } } }`); el jefe no filtra.
- **"No aplica"** cuando el **denominador es 0** (ningún hito con vencimiento en el periodo): regla explícita del marco. Se reporta `applicable=false`, `reason="Sin hitos con vencimiento en el periodo"`. No se reporta `0%`.
- **Línea base/revisiones:** el marco pide "conservar línea base y revisiones". Fase 8 **no** persiste línea base (eso excede el read-only y no hay dato); se documenta como **dato futuro** y el indicador solo refleja el cálculo del periodo. No se inventa una meta.

### 2.3 Tiempo de entrega — **COMPUTABLE HOY (solo si hay cerradas)**

- **Definición marco:** días desde compromiso hasta cierre; **separar ruta y complejidad**.
- **Fórmula exacta:** `Request` que entraron a `CERRADA` **en el periodo** y tienen fecha de compromiso. Días `= floor((cierre − compromiso) / 86_400_000)`.
  - **Fecha de compromiso (desambiguada, una sola fuente de respaldo):** `Request.initialCommitmentDate` si no es `null`; en su ausencia, **`Approval.decidedAt`** del `Approval` con `resultingState='COMPROMETIDA'` más antiguo (orden `decidedAt asc`). Se fija `decidedAt` —y **no** `createdAt`— porque es la columna de dominio que marca la fecha semántica de la decisión de compromiso (`Approval` es append-only y `decidedAt` tiene `@default(now())`, pero `createdAt` es metadato de fila, no la fecha de negocio). Si no existe ningún `Approval` con `resultingState='COMPROMETIDA'`, la Request se excluye de la muestra (no se puede medir) y se cuenta en `unmeasurableClosed` ("sin compromiso registrable").
  - **Fecha de cierre (consulta exacta, desambiguada):** no hay columna `closedAt`. Se usa `AuditEvent` como fuente del cierre. **Problema a evitar:** en `apps/api/src/modules/governance/gate-check/gate-check.service.ts` (ruta real anidada en `gate-check/`) hay **varios** `audit.record` con `action='UPDATE'` y `objectType='REQUEST'` cuyo `after` tiene formas distintas — transición/GC5 `after:{ operationalState }` (líneas ~469/539, aproximadas), `block` `after:{ blocked:true, blockedReason }` (~634), `unblock` `after:{ blocked:false }` (~674), cambio de ruta `after:{ governanceRoute }` (~706). Tomar "el UPDATE/REQUEST más reciente" traería el evento equivocado (p. ej. un `block`). Por eso el cierre se consulta con un **filtro por path JSON** sobre la columna `after` (`Json?`), que descarta block/unblock/ruta (no llevan `operationalState`):

    ```ts
    // Por cada Request CERRADA dentro del alcance (resueltas antes, en el where de alcance),
    // se obtiene su createdAt del evento de cierre:
    const closeEvent = await this.prisma.auditEvent.findFirst({
      where: {
        objectType: 'REQUEST',
        objectId: requestId,                       // acota a ESTA Request
        action: 'UPDATE',
        after: { path: ['operationalState'], equals: 'CERRADA' }, // descarta block/unblock/ruta
      },
      orderBy: { createdAt: 'desc' },              // el más reciente que puso CERRADA
      select: { createdAt: true },
    });
    // cierre = closeEvent?.createdAt
    ```

    **Dónde se aplica el alcance:** NO sobre `AuditEvent` (su `scopeProcessId` es informativo). El alcance se aplica **primero** resolviendo el conjunto de Request `operationalState='CERRADA'` dentro del `where` de alcance (§4); solo para esas Request se busca el evento de cierre por `objectId`. Así el alcance queda garantizado por el `where` de la Request, no por el del evento.

    **Asunción de factibilidad (verificada en el entorno):** Prisma 7.10 (`@prisma/client`/`prisma` `^7.10.0`) con `@prisma/adapter-pg` sobre PostgreSQL soporta el filtro `after: { path: ['operationalState'], equals: 'CERRADA' }` sobre una columna `Json?` (operador JSON estándar de Prisma + Postgres, forma `path: string[]`). Debe reconfirmarse al implementar ejecutando la consulta real; si el proveedor rechazara el filtro `path`, el fallback es traer los `AuditEvent` `UPDATE/REQUEST` de esas Request y filtrar en memoria por `after.operationalState==='CERRADA'` (acotado a pocas filas por el alcance).

    Alternativa descartada: añadir `closedAt` (migración) — se evita por ser read-only (ver §6, decisión D-M1). Si no hay evento de cierre auditado (dato legado anterior a la auditoría de Fase 7), la Request se excluye de la muestra y se cuenta en `unmeasurableClosed`.
  - **Separación por ruta/complejidad:** se agrupa por `Request.governanceRoute` (COMPLETA/SIMPLIFICADA/EXPLORACION/`null`) y por `Triage.criticalityCode`/`sizeCode` del triage vigente (complejidad ≈ `sizeCode`, maestra). El indicador devuelve la **mediana global** y un desglose `byRoute[]` y `byComplexity[]` (cada grupo con su propia mediana y conteo; grupos sin casos no aparecen).
- **"No aplica"** cuando **ninguna** Request cerrada en el periodo es medible (muestra vacía): `applicable=false`, `reason`. El marco lo exige: sin casos → No aplica.

### 2.4 Bloqueos — **COMPUTABLE HOY**

- **Definición marco:** número de solicitudes bloqueadas y **días acumulados por causa**.
- **Fuentes (dos señales, Fase 7 + Fase 5):**
  1. **`Request` con bloqueo activo (Fase 7):** `blockedAt != null AND blockedResolvedAt == null`. Días acumulados por solicitud `= floor((now − blockedAt) / 86_400_000)`. Causa = `Request.blockedReason` (texto libre). Se agrupa por `blockedReason` para el desglose "por causa".
  2. **`Issue` abiertas tipo bloqueo (Fase 5):** `typeCode='BLOQUEO'` y `state != 'TERMINADA'` (estado abierto de la máquina `RECORD_STATE`). Días acumulados `= floor((now − issue.date) / 86_400_000)` (la novedad usa `date` `@db.Date` como inicio del bloqueo). Causa = `Issue.title` o un code de causa si existiera (no existe maestra de causa → se agrupa por `title`).
- **Fórmula exacta:** `blockedRequests = count(Request bloqueada)`, `openBlockingIssues = count(Issue bloqueo abierta)`, y `byCause[]` con `{ cause, count, accumulatedDays }` fusionando ambas señales (se reporta el **origen** de cada causa: `REQUEST_FLAG` o `ISSUE`, para no mezclar semánticas distintas). Alcance por rol: `Request.mainProcessId ∈ scope`; `Issue.processId ∈ scope`.
- **Computable siempre:** es un conteo. Si no hay bloqueos, `applicable=true` con `blockedRequests=0`, `openBlockingIssues=0`, `byCause=[]` (ausencia de bloqueos **sí** es un dato legítimo: "cero bloqueos" no es lo mismo que "sin denominador"). Se documenta esta distinción explícita (ver §2.8).

### 2.5 Cambios fallidos — **"NO APLICA" (dato futuro)**

- **Definición marco:** `liberaciones que causan incidente o reversión ÷ liberaciones del periodo × 100`.
- **Por qué No aplica HOY:** no existe la entidad "liberación" como objeto con fecha propia ni un vínculo tipado "incidente causado por liberación / reversión". La aproximación por `GateCheck` GC4 aprobado da el **denominador** (liberaciones ≈ GC4 `CUMPLIDO` en el periodo), pero el **numerador** (incidente/reversión atribuible a esa liberación) **no es computable**: un `Issue` tipo `INCIDENTE` no tiene relación tipada a la liberación que lo causó, y no hay señal de "reversión". Fabricar un numerador por heurística violaría la regla del marco de no inventar.
- **Contrato:** `applicable=false`, `reason="Requiere registrar liberaciones e incidentes/reversiones vinculados (dato futuro)"`, y una **nota de dato futuro** (`futureDataNote`) que explica qué faltaría capturar. No se reporta ningún porcentaje.

### 2.6 Recuperación — **"NO APLICA" (dato futuro)**

- **Definición marco:** promedio desde inicio conocido de afectación hasta restablecimiento; **separar severidad**.
- **Por qué No aplica HOY:** aunque `Issue` tipo `INCIDENTE` tiene `date` (inicio) y podría tener `resolution`/estado `TERMINADA`, **no** persiste la **hora/fecha de restablecimiento** como instante medible (solo `updatedAt`, que no es semánticamente "restablecido"), ni un campo de **severidad** del incidente (el marco pide separar severidad; la maestra de criticidad vive en `Triage`, no en `Issue`). Medir con `updatedAt` sería inventar la fecha de restablecimiento.
- **Contrato:** `applicable=false`, `reason="Requiere fecha de restablecimiento y severidad del incidente (dato futuro)"`, `futureDataNote`.

### 2.7 Adopción y valor — **"NO APLICA" (dato futuro)**

- **Definición marco:** resultado observado frente a **meta y línea base** definidas por el dueño funcional.
- **Por qué No aplica HOY:** no existe captura de meta, línea base ni medición de valor/adopción en el modelo (ninguna de las Fases 1–7 la introdujo; el marco §8 la describe como responsabilidad del dueño funcional "en el horizonte acordado"). Sin esos tres datos no hay nada que comparar.
- **Contrato:** `applicable=false`, `reason="Requiere meta, línea base y medición de adopción/valor (dato futuro)"`, `futureDataNote`.

### 2.8 Resumen de computabilidad

| Indicador | Estado | Denominador / fuente | "No aplica" cuando |
|---|---|---|---|
| Tiempo de evaluación | **Computable** | `Triage.decidedAt − Request.registeredAt` | mediana: muestra vacía; `pendingCount` siempre se reporta |
| Cumplimiento de hitos | **Computable** | `Task.isMilestone` con `endDate` en periodo | denominador = 0 (regla explícita) |
| Tiempo de entrega | **Computable** | compromiso → cierre (`AuditEvent` CERRADA) | ninguna cerrada medible en periodo |
| Bloqueos | **Computable** | `Request.blockedAt` + `Issue` BLOQUEO abierta | nunca: cero bloqueos es dato legítimo (`applicable=true`, conteos 0) |
| Cambios fallidos | **No aplica** | — (sin numerador tipado) | siempre, hoy (dato futuro) |
| Recuperación | **No aplica** | — (sin fecha restablecimiento ni severidad) | siempre, hoy (dato futuro) |
| Adopción y valor | **No aplica** | — (sin meta/línea base) | siempre, hoy (dato futuro) |

**Distinción clave que el diseño garantiza:** "No aplica" (sin denominador / sin casos / sin dato) ≠ `0`. Los indicadores de conteo (pendientes de evaluación, bloqueos) devuelven `0` cuando realmente hay cero elementos; los indicadores de razón/mediana devuelven `applicable=false` cuando el denominador o la muestra está vacío. La UI muestra ambos de forma distinta (§5).

### 2.9 Fórmulas puras y testeabilidad (`indicators.ts`)

Las operaciones numéricas puras — `median(nums: number[]): number | null`, `percentage(num: number, den: number): { applicable: boolean; value: number | null }`, `daysBetween(a: Date, b: Date): number` — viven en `indicators.ts` **sin dependencias de Prisma ni Nest**, para **unit test** directo (casos: muestra vacía → `null`; par/impar; den=0 → `applicable:false`; redondeo). Los services las consumen tras obtener los datos de Prisma. Esto separa el cálculo (unit test puro) de la agregación (integration test con Prisma mockeado), siguiendo el patrón de `capacity.service` + `month.ts`.

---

## 3. Conteos de demanda (Control del área)

Además de los 7 indicadores, SCR-01 muestra la **composición de la demanda** dentro del alcance:

- **Por estado operativo:** `groupBy(Request.operationalState)` → `{ state: RequestState, count }[]`, incluyendo **todos** los estados del enum `RequestState` con `count=0` cuando no hay (para que la UI muestre la columna completa y estable). Se filtra por alcance.
- **Por banda de prioridad P1–P4:** el service decide la banda en **dos pasos**, en este orden: (1) resuelve `currentPriorityEvaluation` de la Request; **si es `null` → la banda es `SIN_PRIORIZAR`** (categoría explícita, no se fuerza a P4) y **no** se llama al helper; (2) solo si hay evaluación vigente, mapea `evaluation.score` con `RequestStateService.priorityBand(score)`. Importante: `priorityBand(score)` **siempre** devuelve una de las 4 bandas no nulas `'P1'|'P2'|'P3'|'P4'` (nunca `null` ni `SIN_PRIORIZAR`, verificado en `request-state.service.ts`); `SIN_PRIORIZAR` lo produce el service, no el helper. Resultado `{ band: 'P1'|'P2'|'P3'|'P4'|'SIN_PRIORIZAR', count }[]`.
- **Bloqueadas (resaltado):** `count(Request con blockedAt activo)` dentro del alcance, para el encabezado del panel.

Estos conteos son **siempre computables** (son conteos): un conteo de 0 es un dato válido y se muestra como `0`, no como "No aplica".

---

## 4. Alcance por rol (el `where` del service)

Se **replica** (no se importa) **el mismo patrón de alcance de LECTURA** ya probado en `RequestStateService.scopeWhere` / `RequestService.scopeWhere` / `GovernanceScopeService` / `ApprovalService` / `PlanStateService` / `TaskService` / `CapacityService`. **Importante:** `scopeWhere` es un método `private` en cada uno de esos servicios (verificado: `request-state.service.ts:61`, `request.service.ts:42`, `approval.service.ts:43`), así que **no** puede invocarse desde `portfolio/`; lo que se reutiliza es **el patrón**, replicado en un `PortfolioScopeService` propio (misma forma, no la misma función). Verificado contra el código del worktree: **todos** esos servicios resuelven el `where` de lectura exactamente así (y **no** filtran por `roleCode`):

```ts
// patrón de lectura canónico del repo (p. ej. request-state.service.ts:62, request.service.ts:43,
// governance-scope.service.ts:26, plan-state.service.ts:53, approval.service.ts:44):
if (actor.isJefeArea) return {};                                  // jefe: sin filtro, ve toda el área
return { mainProcessId: { in: Array.from(actor.scopedProcessIds) } }; // resto: TODOS sus grants
```

`scopedProcessIds` (`dev-actor.resolver.ts:58-85`) es la **unión de todos los grants activos** del actor, **sin** mirar el `roleCode`. El filtro por `LIDER_PROCESO` (`leaderProcessIds`) existe en el repo **solo** como **autoridad de gestión/escritura** (`GovernanceScopeService.requireRequestManager`, `CapacityService`), que produce **403** al mutar — **no** es el alcance de lectura. Esta es una distinción deliberada y consistente en Fases 2–7 (ver el comentario de precedente en `coordination-scope.service.ts:165`, "usa `scopedProcessIds`, TODOS los grants"). La Fase 8 es **100% lectura**, así que replica ese `where` de lectura tal cual, **sin** filtrar por rol. `PortfolioScopeService` expone un método público (p. ej. `requestScope(actor): Prisma.RequestWhereInput`) con esta misma forma, para que `AreaControlService` y `PortfolioService` lo consuman sin duplicarlo (el `scopeWhere` original de los otros módulos es `private` y no se importa).

- **Jefe de área (`actor.isJefeArea`):** sin filtro → ve toda el área (`return {}`).
- **Líder de proceso y Integrante (resto):** ambos usan **el mismo** `where` de lectura: `mainProcessId ∈ scopedProcessIds` (la unión de **todos** sus grants, sin filtrar por rol). La diferencia entre líder e integrante **no** vive en el `where` sino en el **guard de ruta**: el líder puede entrar a `demandOverview` (indicadores) y el integrante no (ver §4.1). Esto es exactamente lo que hacen `RequestService.findMany`, `TaskService` y `GovernanceScopeService` hoy; no se introduce semántica nueva.

  **Consecuencia explícita y deseada** del actor mixto (p. ej. `LIDER_PROCESO` en el proceso A **e** `INTEGRANTE` en el proceso B): ve A **y** B, porque ambos grants están en `scopedProcessIds`. No se recorta a "solo donde es líder": eso contradiría el patrón probado y dejaría indefinido el alcance de integrante del mismo actor.

- **Entidades hijas (Task, Issue) y su proyección al alcance:** el `where` de alcance se aplica sobre la entidad dueña del proceso: `Issue.processId ∈ scopedProcessIds`; `Task` vía su Request (`phase.plan.request.mainProcessId ∈ scopedProcessIds`), tal como lo resuelve `TaskService` (`task.service.ts:425-430`). El jefe no filtra en ninguno de los dos casos.

- **Decisión D-S1 (RESUELTA, portafolio del integrante):** el portafolio del integrante usa el `where` **simple** `mainProcessId ∈ scopedProcessIds`, **sin** acotar adicionalmente por "participación real" (ser responsable/aceptante de una `Task` o autor de bitácora). Razones: (a) es el patrón canónico del repo (coherencia con §4 y con `RequestService`); (b) `specs/10` solo exige "Portafolio/proyecto: Consulta según alcance" y `specs/11` SCR-07 "filtrado por alcance", sin exigir un recorte por participación; (c) acotar por participación introduce joins y complejidad (y una semántica distinta de "lo suyo" por pantalla) que el SDD no pide. La variante "acotada por participación" queda **descartada** para esta fase; si una regla futura del SDD la exigiera, sería una restricción aditiva sobre este `where` base. Así, "lo suyo" del integrante = las Request de los procesos en los que tiene grant.

### 4.1 demandOverview NO para integrante (403): la frontera por rol vive en el guard

La separación líder/integrante **no** se hace en el `where` (ambos comparten el mismo alcance de lectura, §4) sino **a nivel de ruta**. El **Control del área con indicadores** (SCR-01 parte `demandOverview`) se protege con `@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)` — mismo mecanismo que la Fase 7. Un integrante que llame al endpoint de indicadores recibe **403** (sin filtrar datos, sin tocar el `where`). El panorama `dashboard` y el `portfolio` permiten los 3 roles (con alcance en el `where`). Esto respeta la `MODULE_MATRIX`: `demandOverview = [JEFE, LIDER]`, `dashboard`/`portfolio = [JEFE, LIDER, INTEGRANTE]`. Un actor que sea `LIDER_PROCESO` en algún proceso pasa el `@Roles` de `demandOverview`; dentro, los indicadores se calculan sobre su `scopedProcessIds` completo (§4), no solo sobre los procesos donde lidera.

### No inferir "comprometido" por heurística

El marco distingue "Priorizado" (no implica capacidad) de "Comprometido" (exige GC2). El estado **`COMPROMETIDA`** es explícito en el enum `RequestState`. El portafolio y los indicadores que hablan de compromiso usan **ese estado explícito** (y los posteriores que lo presuponen: `EN_PLANIFICACION`, `EN_EJECUCION`, …), **nunca** una heurística sobre score o fechas. "Comprometida" = `operationalState` ∈ estados a partir de `COMPROMETIDA`.

### Alcance en el `where`, no post-filtrado

Todo el alcance se aplica en el `where` de Prisma (igual que Fases 2–7): fuera de alcance la fila **no existe** para el actor (no se confirma su existencia). Las agregaciones (`groupBy`, `count`, `findMany`) incluyen el `where` de alcance desde el primer query; nunca se trae todo y se filtra en memoria.

---

## 5. Endpoints y DTOs de respuesta propuestos

Base del contrato: todos los endpoints son **GET**, read-only, protegidos por `CurrentUserGuard` (401 sin actor) + `RolesGuard`. `@ApiTags` por controller; `@ApiResponse` con los DTOs; `@ApiQuery` para filtros. Nombres de campo en `camelCase`, estilo de las Fases 2–7.

### 5.1 Control del área — indicadores (`demandOverview`)

```
GET /area-control/indicators?from=YYYY-MM-DD&to=YYYY-MM-DD
Roles: JEFE_AREA, LIDER_PROCESO        (integrante -> 403)
200 -> AreaIndicatorsResponseDto
403 -> rol insuficiente
```

```ts
// Envoltura común "No aplica": applicable=false => value/median null + reason.
class IndicatorStatusDto {
  applicable!: boolean;              // false => "No aplica"
  reason!: string | null;           // motivo legible cuando applicable=false
  futureDataNote!: string | null;   // qué falta capturar (indicadores futuros)
}

class EvaluationTimeIndicatorDto {
  medianDays!: number | null;       // null si applicable=false
  pendingCount!: number;            // SIEMPRE presente (conteo real, puede ser 0)
  sampleSize!: number;              // nº de decisiones en el periodo
  status!: IndicatorStatusDto;
}

class MilestoneComplianceIndicatorDto {
  percentage!: number | null;       // null si denominador 0
  met!: number;                     // numerador
  due!: number;                     // denominador (hitos con vencimiento en periodo)
  status!: IndicatorStatusDto;      // applicable=false si due===0
}

class DeliveryTimeGroupDto { key!: string; label!: string; medianDays!: number; count!: number; }
class DeliveryTimeIndicatorDto {
  medianDays!: number | null;
  count!: number;                   // nº de cerradas medibles
  unmeasurableClosed!: number;      // cerradas sin compromiso/cierre registrable
  byRoute!: DeliveryTimeGroupDto[];
  byComplexity!: DeliveryTimeGroupDto[];
  status!: IndicatorStatusDto;
}

class BlockCauseDto { cause!: string; origin!: 'REQUEST_FLAG' | 'ISSUE'; count!: number; accumulatedDays!: number; }
class BlocksIndicatorDto {
  blockedRequests!: number;         // conteo real (0 válido)
  openBlockingIssues!: number;      // conteo real (0 válido)
  byCause!: BlockCauseDto[];
  status!: IndicatorStatusDto;      // applicable=true salvo error; conteos 0 NO son "No aplica"
}

class FutureIndicatorDto {          // Cambios fallidos / Recuperación / Adopción y valor
  status!: IndicatorStatusDto;      // applicable=false + futureDataNote
}

class AreaIndicatorsResponseDto {
  periodFrom!: string;              // YYYY-MM-DD (eco del periodo resuelto)
  periodTo!: string;
  evaluationTime!: EvaluationTimeIndicatorDto;
  milestoneCompliance!: MilestoneComplianceIndicatorDto;
  deliveryTime!: DeliveryTimeIndicatorDto;
  blocks!: BlocksIndicatorDto;
  failedChanges!: FutureIndicatorDto;
  recovery!: FutureIndicatorDto;
  adoptionValue!: FutureIndicatorDto;
}
```

### 5.2 Control del área — panorama de demanda (`dashboard`)

```
GET /area-control/demand-summary?from=&to=
Roles: JEFE_AREA, LIDER_PROCESO, INTEGRANTE   (alcance en el where)
200 -> DemandSummaryResponseDto
```

```ts
class StateCountDto { state!: string; count!: number; }       // todos los RequestState, incl. 0
class BandCountDto { band!: string; count!: number; }         // P1..P4 + SIN_PRIORIZAR
class DemandSummaryResponseDto {
  total!: number;
  blockedActive!: number;
  byState!: StateCountDto[];
  byPriorityBand!: BandCountDto[];
}
```

> Se separan `indicators` (demandOverview, jefe/líder) y `demand-summary` (dashboard, 3 roles) para que el gating por rol sea limpio a nivel de ruta: el integrante consume `demand-summary` (en `/inicio`) y nunca toca `indicators` (en `/demanda/resumen`). Esta separación de endpoints es la que permite montar cada superficie en su ruta real sin tocar `navigation.ts` (§9, "Mapa de rutas").

### 5.3 Portafolio (`portfolio`)

```
GET /portfolio?mainProcessId=<uuid>&state=<RequestState>&band=<P1|P2|P3|P4|SIN_PRIORIZAR>
Roles: JEFE_AREA, LIDER_PROCESO, INTEGRANTE   (alcance en el where)
200 -> PortfolioItemResponseDto[]
```

Filtros opcionales (DTO `ListPortfolioDto`, validados con `class-validator`, mismos tipos que `ListRequestsDto`): `mainProcessId` (`@IsUUID`), `state` (`@IsEnum(RequestState)`), `band` (`@IsIn(['P1','P2','P3','P4','SIN_PRIORIZAR'])`). Los filtros **intersectan** con el alcance, nunca lo amplían (patrón `capacity.listAssignments`).

```ts
class PortfolioItemResponseDto {
  id!: string;
  title!: string;
  mainProcessId!: string;
  mainProcessCode!: string;         // resuelto para la UI (evita N llamadas)
  mainProcessName!: string;
  operationalState!: string;        // estado operativo explícito (no inferido)
  priorityBand!: string | null;     // 'P1'..'P4' si hay evaluación vigente; null cuando SIN_PRIORIZAR
                                    // (el service pone null ANTES de llamar a priorityBand; el helper nunca devuelve null)
  priorityLabel!: string | null;    // glosa legible del marco §4
  currentScore!: number | null;     // score vigente o null
  governanceRoute!: string | null;  // COMPLETA/SIMPLIFICADA/EXPLORACION o null
  responsibleName!: string | null;  // functionalOwner (texto) de la Request
  registeredAt!: string;            // fecha clave: registro
  targetDate!: string | null;       // fecha clave: objetivo
  initialCommitmentDate!: string | null; // fecha clave: compromiso inicial
  blocked!: boolean;                // flag transversal activo (Fase 7)
  blockedReason!: string | null;
}
```

**Columnas del portafolio y su justificación (SCR-07 + marco):**

| Columna | Campo | Justificación |
|---|---|---|
| Título | `title` | Identifica la iniciativa (SCR-03/07). |
| Proceso | `mainProcessName` | Alcance y lectura por proceso (specs/10). |
| Estado operativo | `operationalState` | Estados comunes del marco §9; explícito, no inferido. |
| Banda de prioridad | `priorityBand` + `priorityLabel` | Prioridad orientadora P1–P4 del marco §4 (vigente). |
| Ruta de gobierno | `governanceRoute` | Ruta proporcional del marco §6 (Fase 7); `null` si no elegida. |
| Responsable | `responsibleName` (`functionalOwner`) | Responsabilidad explícita (marco §1). |
| Fechas clave | `registeredAt`, `targetDate`, `initialCommitmentDate` | Registro, objetivo y compromiso: trazabilidad del ciclo. |
| Bloqueo | `blocked` + `blockedReason` | Condición transversal del marco §9 (resaltado). |

Orden por defecto: `registeredAt desc, createdAt desc` (igual que `RequestService.findMany`), estable y reproducible. La agrupación visual la hace la UI (§5.4); el backend devuelve la lista plana con los campos para agrupar.

### 5.4 Mapeo con las instancias de seguimiento (solo visual)

La pantalla SCR-01 agrupa los indicadores en bloques que **nombran** las instancias del marco §9 (p. ej. "Evaluación de demanda", "Seguimiento de entrega", "Portafolio y cambios", "Revisión operativa", "Revisión de valor"). Esto es **etiquetado de UI**: no implica scheduling ni frecuencia forzada. El backend no conoce estas agrupaciones (devuelve indicadores sueltos); la UI los organiza.

---

## 6. Esquema y migración

**Decisión D-M1: NO se crea migración.** Los 7 indicadores computables, los conteos y el portafolio se resuelven **íntegramente** con lectura/agregación sobre columnas y relaciones ya existentes (`Request`, `Triage`, `Task`, `Issue`, `GateCheck`, `Approval`, `AuditEvent`, `Process`, `PriorityEvaluation`). No se necesita ningún campo nuevo:

- "Tiempo de entrega" usa `AuditEvent` (CERRADA) como fecha de cierre en vez de añadir `Request.closedAt`. **Alternativa evaluada y descartada:** añadir `closedAt` daría una lectura más directa, pero (a) es escritura de dominio que correspondería a la máquina de estados de Fase 7, no a una fase read-only; (b) habría que backfillear datos existentes; (c) `AuditEvent` ya registra el cambio de estado de forma fiable (Fase 7 audita cada transición). Si en una fase futura se decidiera persistir `closedAt`, sería una migración **aditiva** (columna nullable) sin romper nada. Por ahora **no** se hace.
- Los indicadores "No aplica" (cambios fallidos, recuperación, adopción/valor) **no** se fuerzan a existir añadiendo tablas vacías: se reportan honestamente como dato futuro. Introducir tablas sin datos ni flujo de captura sería configuración/entidad muerta, contra el steering ("no agregar dependencias/estructura si no se necesita").

Por tanto `apps/api/prisma/schema.prisma` **no cambia** y no hay nuevo paso de `prisma migrate`. Sí se ejecuta la regeneración de contrato por los **DTOs nuevos** (§8).

---

## 7. Manejo de errores y validación (concreto por operación)

Todas las operaciones son GET read-only; los modos de fallo son acotados:

| Operación | Condición de fallo | Recuperable/fatal | Qué recibe el caller | Log |
|---|---|---|---|---|
| Cualquier endpoint sin actor | Falta `X-Actor-Id`/actor no resoluble | Recuperable (reautenticar dev-actor) | **401** (de `CurrentUserGuard`) | No (flujo normal) |
| `/area-control/indicators` por integrante | Rol insuficiente | Fatal para ese rol | **403** `RolesGuard`, sin filtrar datos | No |
| Filtro `from`/`to` mal formado | No es `YYYY-MM-DD` o `from > to` | Recuperable | **400** `BadRequestException` "Revisa el rango de fechas." | No |
| Filtro `state` fuera del enum | Valor no en `RequestState` | Recuperable | **400** (`@IsEnum`) | No |
| Filtro `band` inválido | No en `P1..P4/SIN_PRIORIZAR` | Recuperable | **400** (`@IsIn`) | No |
| `mainProcessId` no UUID | Formato inválido | Recuperable | **400** (`@IsUUID`) | No |
| Error de Prisma inesperado | Fallo de BD | Fatal | **500** genérico (sin stack ni detalle interno, steering "Errores") | Sí, nivel error (Nest logger) |
| Dato sucio (días negativos, estado fuera de enum en BD) | Integridad | Se **omite** del cálculo, no rompe la respuesta | 200 con el indicador calculado sobre la muestra válida | Sí, nivel warn (anomalía de datos) |

**Validación de cada entrada externa:**

- `from`, `to`: opcionales; tipo `string` formato fecha; regla: ambos o ninguno (si llega solo uno, se completa el otro con el límite del mes/día; si `from > to` → 400). Default: mes natural en curso (UTC).
- `mainProcessId`: opcional, `@IsUUID`. Un proceso fuera del alcance **no** amplía nada: el `where` de alcance se mantiene y el filtro se intersecta; resultado vacío (no 404, no error) si el proceso no está en alcance.
- `state`: opcional, `@IsEnum(RequestState)`. Valida solo el filtro de lectura (como `ListRequestsDto`).
- `band`: opcional, `@IsIn([...])`.

**Invariantes y quién los hace cumplir:**

- **Alcance por rol** → lo impone `PortfolioScopeService` en el `where` (nunca el cliente, nunca la UI). Mismo nivel que Fases 2–7.
- **"No aplica" vs 0** → lo impone cada service al construir el DTO: razón/mediana con `applicable=false` cuando el denominador/muestra está vacío; conteos devuelven el número real. La UI solo refleja el contrato (no decide).
- **"Comprometida" explícito** → lo impone el service usando `operationalState`, no heurística.
- **Read-only** → el módulo no inyecta ningún método de escritura; no hay endpoints de mutación ni `$transaction` de escritura ni `AuditEvent`.

---

## 8. Contrato OpenAPI y api-client

Al añadir DTOs de respuesta nuevos, tras implementar hay que **regenerar el contrato y committearlo**, siguiendo el steering y el patrón de Fases 2–7:

```
npm run contracts:generate      # openapi:generate (apps/api) + api-client:generate (packages/api-client)
npm run build:api-client
```

Y **committear** `apps/api/openapi.json` (o la ruta donde el repo lo emite) y `packages/api-client/src/generated/*`. El frontend consume **solo** `@plantilla-portales/api-client`; los tipos del dominio en `apps/web/src/lib/api-client.ts` se derivan de `components['schemas'][...]` (p. ej. `AreaIndicatorsResponseDto`, `DemandSummaryResponseDto`, `PortfolioItemResponseDto`), nunca interfaces manuales. Nuevos wrappers en `apps/web/src/lib/`:

- `apps/web/src/lib/area-control.ts` → `getAreaIndicators(from?, to?)`, `getDemandSummary(from?, to?)` (patrón de `governance.ts`: `api.GET`, `toApiError`, `ApiError`).
- `apps/web/src/lib/portfolio.ts` → `listPortfolio(filters)`.

---

## 9. Pantallas (frontend)

Se convierten **tres placeholders** en pantallas reales, consumiendo solo el api-client, con estados **loading/vacío/error/éxito**, HTML semántico y labels accesibles (steering frontend). Se reutilizan los componentes shadcn/ui ya presentes (`Table`, `Card`, `Badge`, `Skeleton`, `Select`, `Input`, `Button`) y el patrón de `capacidad-view.tsx` (vista cliente + `useActor` para gating cosmético; el control real es server-side).

### Mapa de rutas (coherente con `navigation.ts`, que NO se toca)

La navegación implementada (`apps/web/src/lib/navigation.ts`) ya reserva **tres rutas distintas**, cada una con su `moduleKey` de `MODULE_MATRIX`. El diseño respeta ese mapeo tal cual y convierte **cada** placeholder en su pantalla, **sin** mezclar superficies en una sola ruta y **sin** dejar placeholders huérfanos:

| Ruta (App Router) | `moduleKey` (menú) | Roles (MODULE_MATRIX) | Endpoint que consume | Pantalla |
|---|---|---|---|---|
| `/inicio` | `dashboard` | Jefe, líder, integrante | `GET /area-control/demand-summary` | Panorama de demanda (§9.1) |
| `/demanda/resumen` | `demandOverview` | Jefe, líder | `GET /area-control/indicators` | **SCR-01** Control del área / indicadores (§9.2) |
| `/seguimiento/portafolio` | `portfolio` | Jefe, líder, integrante | `GET /portfolio` | **SCR-07** Portafolio (§9.3) |

Esta separación por ruta es la que el menú ya hace (ver `navigation.ts`): no se cambia ni la clave de módulo de `/inicio` (`dashboard`) ni la de `/demanda/resumen` (`demandOverview`). Los **indicadores del marco §9** (jefe/líder) viven en `/demanda/resumen` (la pantalla SCR-01 del SDD, "Control del área / demandaOverview", alcance jefe/líder); el **panorama** de 3 roles vive en `/inicio`. Se descarta montar ambos bloques en `/inicio`: hacerlo descuadraría el gating cosmético del menú (el `moduleKey` de `/inicio` es `dashboard`, de 3 roles, mientras los indicadores son `demandOverview`, de jefe/líder) y dejaría `/demanda/resumen` como placeholder huérfano, incumpliendo el cierre funcional de la fase. Tras esta fase **no queda** ningún placeholder `demandOverview`/`dashboard`/`portfolio` sin convertir.

### 9.1 Panorama de demanda — `apps/web/src/app/inicio/page.tsx` (`dashboard`, 3 roles)

- Pasa de `UnderConstruction` a una vista real. `page.tsx` queda fino (metadata + render de `<DashboardView />`); la lógica cliente vive en `inicio/dashboard-view.tsx` (`'use client'`).
- **Consume solo `GET /area-control/demand-summary`** (3 roles, alcance en el `where`). **No** renderiza indicadores: esos viven en `/demanda/resumen`.
- **Bloques:** tarjetas con total y bloqueadas activas; tabla por estado operativo (todos los `RequestState`, incl. `0`) y por banda P1–P4 + `SIN_PRIORIZAR`. Conteos `0` se muestran como `0` (no "No aplica").
- **Selector de periodo:** `Input type="month"` o dos `type="date"` (from/to); default mes en curso; al cambiar, recarga (patrón `capacidad-view`).
- **Estados:** `loading` (Skeleton), `error` (mensaje + "Reintentar"), `vacío` ("Aún no hay demanda registrada en el periodo"), `éxito`. `aria-live="polite"` en las regiones que se recargan; `caption`/`scope` en tablas; headings jerárquicos.

### 9.2 Control del área — indicadores — `apps/web/src/app/demanda/resumen/page.tsx` (`demandOverview`, SCR-01, jefe/líder)

- Pasa de `UnderConstruction` ("Resumen de demanda") a la pantalla SCR-01 real. `page.tsx` fino (metadata + render de `<DemandOverviewView />`); lógica cliente en `demanda/resumen/demand-overview-view.tsx` (`'use client'`).
- **Consume solo `GET /area-control/indicators`** (jefe/líder; integrante → 403 desde el backend). El menú ya oculta este item al integrante (`moduleKey: 'demandOverview'`), pero el **backend es la autoridad**: si un integrante forzara la ruta, el endpoint responde 403 y la vista muestra un aviso entendible, no datos. La UI usa `useActor()`/`permissions.allowedModules` solo para el gating cosmético y para mostrar el aviso de "sin acceso" sin romper.
- **Bloques (agrupamiento visual por instancias del marco §9):** una tarjeta por indicador, agrupadas bajo los rótulos de las instancias del marco ("Evaluación de demanda", "Seguimiento de entrega", "Portafolio y cambios", "Revisión operativa", "Revisión de valor") — etiquetado de UI, sin scheduling (§5.4). Los **computables** muestran el valor (mediana en días, %, conteos, desglose por ruta/complejidad). Los que son **"No aplica"** muestran explícitamente la etiqueta **"No aplica"** + el `reason`/`futureDataNote` (texto del marco), **nunca** `0` ni un número inventado. Se usa un `Badge` "No aplica" distinto del `0`.
- **Selector de periodo:** igual que §9.1 (default mes en curso; recarga al cambiar).
- **Estados:** `loading` (Skeleton), `error` (mensaje + "Reintentar"), `vacío` (periodo sin casos → cada indicador cae a su "No aplica" propio; no hay un "vacío" global que oculte la pantalla), `éxito`. `aria-live="polite"`; tablas con `caption`/`scope`; headings jerárquicos.

### 9.3 Portafolio — `apps/web/src/app/seguimiento/portafolio/page.tsx` (SCR-07)

- Pasa de `UnderConstruction` a vista real (`seguimiento/portafolio/portafolio-view.tsx`, `'use client'`). Consume solo `GET /portfolio` (3 roles, alcance en el `where`).
- **Tabla** con las columnas de §5.3 (`caption` sr-only, `scope="col"`, filas con `Badge` para banda/estado/bloqueo). Banda P1–P4 con color; `SIN_PRIORIZAR` neutro; `blocked` con `Badge destructive` y `aria-label` explicativo.
- **Filtros** (proceso/estado/prioridad) con `Select` de shadcn/ui; el filtro de proceso se puebla con `listProcesses()` (ya existe en `lib/team.ts`), acotado por el alcance que devuelve el backend (filtro intersecta, no amplía).
- **Estados:** loading (Skeleton de filas), vacío ("No hay iniciativas en tu alcance con estos filtros"), error (reintentar), éxito. Accesible por teclado.
- **Honestidad del dato:** `governanceRoute`, `priorityBand`, `responsibleName`, fechas `null` se muestran como "—" (sin inventar). No se infiere "comprometido": se muestra el `operationalState` tal cual.

---

## 10. Pruebas (qué unitario vs integración)

Siguiendo el steering de pruebas (Jest unitario para servicios/reglas; priorizar reglas de negocio, permisos, validaciones, errores):

**Unitario puro (`indicators.spec.ts`):** `median` (vacío→null, impar, par con redondeo), `percentage` (den=0→applicable:false; redondeo), `daysBetween`. Sin Prisma.

**Unitario de services (Prisma mockeado, patrón `capacity.service.spec.ts` / `gate-check.service.spec.ts`):**
- `area-control.service.spec.ts`: tiempo de evaluación (mediana + pendientes; muestra vacía→No aplica, pendientes=0 válido); cumplimiento de hitos (den=0→No aplica; cálculo con acceptedAt<=endDate); tiempo de entrega (cerradas vía AuditEvent; sin cerradas→No aplica; desglose por ruta); bloqueos (fusión Request flag + Issue; cero bloqueos→applicable:true conteos 0); los 3 futuros→applicable:false con futureDataNote. Conteos por estado (todos los estados, incl. 0) y por banda (SIN_PRIORIZAR separado).
- `portfolio.service.spec.ts`: listado con mapeo de banda/label; filtros que intersectan el alcance; "comprometida" por estado explícito.
- **Permisos / alcance (§4):** `demandOverview` por integrante → 403 (test del guard/ruta, como Fase 7). Alcance de lectura: jefe (sin filtro, `where = {}`) vs no-jefe (`mainProcessId ∈ scopedProcessIds`, idéntico para líder e integrante) → el `where` correcto en cada caso. Caso **actor mixto** (líder en A, integrante en B): el `where` incluye A **y** B (unión de grants), confirmando que el alcance de lectura no filtra por `roleCode` y que la frontera líder/integrante es solo el guard de ruta.
- **Errores:** `from>to`→400; `state`/`band` inválidos→400; proceso fuera de alcance→resultado vacío (no 404).

**Integración/E2E (Playwright, flujo crítico, opcional según alcance del repo):** cargar `/inicio` y `/seguimiento/portafolio` como jefe y como integrante y verificar el gating visual y los estados loading/vacío. Un diseño que fuese difícil de testear se evitó manteniendo las fórmulas puras separadas de la agregación.

**Verificación de cierre (steering 00 "antes de terminar: compila y pasa validaciones"):** `npm run typecheck`, `npm run test:unit`, `npm run contracts:generate` + `npm run build:api-client`, `npm run build`. Committear `openapi.json` + `packages/api-client/src/generated/*`.

---

## 11. Qué NO se hace (límites explícitos)

- **No** se tocan las 21 claves de `MODULE_MATRIX` ni `navigation.ts` (las claves `demandOverview`/`dashboard`/`portfolio` ya existen).
- **No** se rompe nada de Fases 1–7: el módulo es aditivo, read-only, importa providers existentes sin modificarlos.
- **No** hay cron, jobs ni scheduling (las frecuencias del marco solo informan el agrupamiento visual).
- **No** se inventan valores: los indicadores sin dato/denominador reportan "No aplica" con motivo.
- **No** se infiere "comprometido" ni ningún estado por heurística: se usa el `operationalState` explícito.
- **No** se crea migración (lectura/agregación sobre lo existente; `AuditEvent` como fuente del cierre).
- **No** se escribe en BD ni se emite `AuditEvent` (fase read-only).

---

## 12. Respuestas a la revisión (iteración 3 — revisión vigente)

Hallazgos de la revisión vigente `design-review.json` / `design-review.md` (veredicto `CHANGES_REQUESTED`: 1 HIGH + 1 MEDIUM + 2 NIT). Cada uno se verificó contra el código del worktree antes de corregir.

- **Hallazgo 1 (HIGH) — el frontend ubicaba `demandOverview` en `/inicio` e ignoraba `/demanda/resumen` — ADDRESSED.** Verificado en `apps/web/src/lib/navigation.ts`: `/inicio` → `moduleKey: 'dashboard'`, `/demanda/resumen` → `moduleKey: 'demandOverview'`, `/seguimiento/portafolio` → `moduleKey: 'portfolio'`; y en `apps/web/src/app/demanda/resumen/page.tsx` que ese placeholder (`UnderConstruction` "Resumen de demanda") seguía sin convertir. También confirmado en `SDD_control-phari/specs/11-ui-behavior.md` que **SCR-01 = "Control del área / demandaOverview"**, alcance **Jefe/líder**. Se adoptó la **opción recomendada por la revisión: separar por ruta** (sin tocar `navigation.ts`). Se reescribió **§9** con un "Mapa de rutas" explícito que nombra las **tres rutas reales** y el endpoint que consume cada una: `/inicio` (`dashboard`, 3 roles) → `GET /area-control/demand-summary`; `/demanda/resumen` (`demandOverview`, jefe/líder) → `GET /area-control/indicators` (**SCR-01**); `/seguimiento/portafolio` (`portfolio`, 3 roles) → `GET /portfolio`. Se añadieron las subsecciones §9.1 (panorama en `/inicio`), §9.2 (indicadores en `/demanda/resumen`) y §9.3 (portafolio), y se dejó por escrito que **ningún** placeholder `demandOverview`/`dashboard`/`portfolio` queda sin convertir. Se alinearon §0, §1 y la nota de §5.2 con esta separación. No se cambia ninguna clave de `MODULE_MATRIX` ni `navigation.ts`.

- **Hallazgo 2 (MEDIUM) — fecha de compromiso ambigua (`Approval.decidedAt` vs `Approval.createdAt`) — ADDRESSED.** En **§2.3** se eliminó la doble referencia y se fijó **una sola** fuente de respaldo: `Request.initialCommitmentDate` si no es `null`; en su ausencia, **`Approval.decidedAt`** del `Approval` con `resultingState='COMPROMETIDA'` más antiguo (orden `decidedAt asc`), con la justificación de por qué `decidedAt` (columna de dominio) y no `createdAt` (metadato de fila). Si no existe ninguno, la Request se excluye y se cuenta en `unmeasurableClosed`.

- **Hallazgo 3 (NIT) — `RequestStateService.scopeWhere` es `private`; se replica, no se importa — ADDRESSED.** Verificado que `scopeWhere` es `private` en `request-state.service.ts:61`, `request.service.ts:42`, `approval.service.ts:43`. Se aclaró en **§0** y **§4** que el patrón de alcance de lectura se **replica** en un `PortfolioScopeService` propio (con un método público `requestScope(actor)` de la misma forma), no se invoca el método privado de otros módulos.

- **Hallazgo 4 (NIT) — ruta de `gate-check.service.ts` imprecisa — ADDRESSED.** En **§2.3** se corrigió la ruta a `apps/api/src/modules/governance/gate-check/gate-check.service.ts` (anidada en `gate-check/`) y se marcaron los números de línea como aproximados. Las formas de `after` citadas coinciden con el código, así que el razonamiento del query de cierre no cambia.

---

## 12.bis Respuestas a la revisión (iteración 2 — histórico)

Hallazgos de la tanda previa (2 MEDIUM + 4 NIT). Se conservan como registro; ya estaban resueltos antes de esta iteración.

- **Hallazgo 1 (MEDIUM) — alcance del líder contradecía el patrón de lectura probado — ADDRESSED.** Verificado: `request-state.service.ts:62`, `request.service.ts:43`, `governance-scope.service.ts:26`, `plan-state.service.ts:53`, `approval.service.ts:44` y `task.service.ts:428` resuelven el alcance de lectura como `jefe => {}` / `resto => mainProcessId ∈ scopedProcessIds`, **sin** filtrar por `roleCode`. El filtro `leaderProcessIds`/`LIDER_PROCESO` solo aparece en autoridad de escritura (`requireRequestManager`, `CapacityService`), que da 403. Se reescribió **§4** (y §0, §4.1, §10): líder e integrante comparten el mismo `where` de lectura (`scopedProcessIds`, unión de todos los grants); la frontera por rol la pone **solo** el guard de ruta de `demandOverview`. Se documentó explícitamente el caso del actor mixto (líder en A + integrante en B → ve A y B).

- **Hallazgo 2 (MEDIUM) — desambiguación del cierre vía `AuditEvent` — ADDRESSED.** Verificado en `gate-check.service.ts`: coexisten `UPDATE/REQUEST` con `after` de formas distintas (`operationalState` en transición/GC5; `blocked`/`blockedReason` en block; `blocked` en unblock; `governanceRoute` en ruta). Se especificó en **§2.3** la consulta exacta con filtro por path JSON `after: { path: ['operationalState'], equals: 'CERRADA' }` acotada por `objectId`, `orderBy createdAt desc`; se aclaró que el alcance se aplica resolviendo primero las Request `CERRADA` dentro del `where` de alcance (no sobre `AuditEvent`), y se dejó por escrito la asunción de factibilidad (Prisma 7.10 + `@prisma/adapter-pg` + PostgreSQL soportan el filtro `path`, confirmado en `package.json`) con un fallback en memoria si el proveedor lo rechazara.

- **Hallazgo 3 (NIT) — `priorityBand` nunca produce `SIN_PRIORIZAR` — ADDRESSED.** Verificado: `priorityBand(score)` devuelve siempre `P1..P4`. Se aclaró en **§3** y **§5.3** que el service asigna `SIN_PRIORIZAR` (banda `null` en el item) **cuando `currentPriorityEvaluation == null`, antes** de llamar al helper, y que las 4 salidas del helper son no nulas.

- **Hallazgo 4 (NIT) — alcance "en las que participa" del integrante excedía el SDD — ADDRESSED.** Se resolvió la decisión **D-S1** en **§4** a favor del `where` simple `mainProcessId ∈ scopedProcessIds` (coherente con el Hallazgo 1 y el resto del repo), descartando el acotado por participación por Task/bitácora. La elección quedó explícita y justificada contra `specs/10`/`specs/11`.

- **Hallazgo 5 (NIT) — "casos pendientes" ambiguo frente al triage — ADDRESSED.** Verificado en `triage.service.ts` que `CONTINUAR` deja `EN_TRIAGE` con `Triage` decidido. Se redefinió en **§2.1** "pendiente de decisión inicial" como `currentTriage == null`, **independiente del estado**, para un conteo estable.

- **Hallazgo 6 (NIT) — límites del periodo `[from, to)` — ADDRESSED.** Se precisó en **§2** que el default es `from` = primer día del mes en curso (inclusivo, `00:00:00.000Z`) y `to` = primer día del mes siguiente (exclusivo, `00:00:00.000Z`), con todos los filtros temporales usando `>= from AND < to`, coherente con `month.ts` de Fases 4–7.
