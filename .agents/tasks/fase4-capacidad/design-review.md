# Design review · Fase 4 · Capacidad y asignaciones (control-phari)

Revisión en frío del documento `design.md` (2.ª iteración, que responde a un review previo con
1 HIGH / 4 MEDIUM / 2 NIT). El objetivo es comprobar que el diseño se sostiene por sí solo antes de
implementar: sin ambigüedad, sin huecos que obliguen a adivinar reglas de negocio marcadas `P`, y sin
suposiciones no verificadas contra el SDD y el código heredado de Fases 1–3.

Método: leí el `design.md` completo y lo contrasté leyendo las fuentes reales — `specs/05`, `10`,
`11` (SCR-17), `18`, `19`, `23`, `28` punto 6, `29` fila 17 del SDD, y el código del worktree
(`audit.service.ts`, `current-actor.ts`, `current-user.guard.ts`, `module-matrix.ts`,
`request.service.ts`, `prisma/schema.prisma`, controllers `task/phase/dependency`). No tomé por buena
ninguna afirmación del diseño sin verla en la fuente.

## Veredicto

**APPROVED.** Cero findings HIGH, cero MEDIUM. Las cinco comprobaciones bloqueantes del encargo se
cumplen y están respaldadas por la fuente (ver Suposiciones verificadas). Se dejan 3 NIT que el
implementador puede resolver sin reabrir diseño; ninguno cambia el veredicto.

El diseño no obliga a inventar ninguna regla `P`: fórmula de utilización, bloqueo por sobrecarga,
cero/negativo/fracción, consolidación multiproceso y efecto en el envío del plan quedan como
**decisiones reversibles** explícitas (§12 D4/D5/D6/D3/D10), cada una citando `specs/28` p.6 y
`specs/05` "reglas no asumidas". Esto es exactamente lo que el método exige.

---

## Comprobaciones bloqueantes del encargo (a–e)

- **(a) No inventa reglas `P`.** La fórmula de utilización (`round(comprometido/disponible*100)`,
  D4), el bloqueo duro por sobrecarga (NO se bloquea, se señala, D5), cero/negativo/fracción (enteras
  `>= 0`, cero = "sin disponibilidad", D6) y el efecto de la capacidad sobre el envío del plan
  (gancho informativo, no gate, D10) están todos marcados como decisiones reversibles con "punto a
  reabrir". **Verificado contra `specs/28` p.6** (que lista literalmente "fórmula de utilización,
  límites de sobreasignación, horas cero/negativas/fracciones, consolidación multi-proceso,
  disponibilidad duplicada y efecto en envío del plan") y `specs/11` SCR-17 línea 206 ("Fórmula
  exacta de utilización, sobreasignación y tratamiento de horas negativas/cero **P**"). Cumple.
- **(b) `@@unique` compuesto para disponibilidad; sin unique estricto no confirmado en asignaciones.**
  `MonthlyAvailability` usa `@@unique([userId, month])` (§1.2); `Assignment` **no** lleva unique
  (§1.2 / D3), citando BR-012 "las asignaciones se agregan". **Verificado contra `specs/05` BR-012**
  ("Una disponibilidad se define por persona/mes... asignaciones se agregan por periodo/proceso") y
  `specs/11` línea 202. Cumple.
- **(c) Alcance en el `where` con 404 fuera de alcance.** El helper `scopedUserIds(actor)` y el
  `scopeWhere` de asignación aplican el filtro en el `where` del service; resolución por `:id` fuera
  de alcance → `findFirst` nulo → 404 (§2.4/§2.5/§2.6.1). **Verificado contra `request.service.ts`**:
  el patrón `findFirst({ where: { AND: [{ id }, scopeWhere(actor)] } })`, jefe `{}`, no-jefe
  `mainProcessId in scopedProcessIds`, 404 por `findFirst` nulo, existe tal cual en el repo. Cumple.
- **(d) Auditoría de toda mutación dentro de la transacción con objectTypes nuevos.** §1.5 lista las
  cinco mutaciones (crear/editar disponibilidad; crear/editar/borrar asignación), cada una con
  `AuditService.record(tx,…)` dentro de la `$transaction`, y amplía `AuditObjectType` con
  `MONTHLY_AVAILABILITY` y `ASSIGNMENT`. **Verificado contra `audit.service.ts`**: `record(tx, …)`
  escribe con el `tx` transaccional; el union actual tiene exactamente los 12 tipos que el diseño
  cita; el `action` set (`CREATE|UPDATE|DELETE|REVOKE`) no se toca. Cumple.
- **(e) Frontend solo vía api-client.** §4 convierte el placeholder en SCR-17 consumiendo el wrapper
  `apps/web/src/lib/capacity.ts` (patrón `catalog.ts`/`team.ts`) sobre `@plantilla-portales/
  api-client`; no toca PostgreSQL ni Prisma. Coherente con el steering y con el nuevo endpoint propio
  `GET /capacity/people` (D9) para no ampliar `/users`/`/grants` jefe-only. Cumple.

---

## Findings

### 1 — NIT · `description` como `String?` sin longitud en el modelo mientras el DTO exige `@MaxLength(2000)`

**Dónde:** §1.2 (`description | String?`) vs §3.4 (`description` `@IsString @MaxLength(2000)`).

**Problema:** El DTO limita a 2000, pero la columna Prisma es `String?` sin `@db.VarChar(2000)`,
luego en PostgreSQL mapea a `text` sin tope físico. No es un hueco de regla de negocio (el límite se
respeta en la capa de validación), pero la columna no refleja el contrato. Es consistente, no
contradictorio, por eso es NIT.

**Fix concreto:** declarar la columna como `description String? @db.VarChar(2000)` en el schema para
que el límite viva también en la base, o dejar `text` y documentar en §1.2 que el tope es solo de
aplicación (elegir una; recomendado `@db.VarChar(2000)` por coherencia con el DTO).

### 2 — NIT · Semántica de `GET /capacity/assignments?userId=` para el líder no está explícita

**Dónde:** §2.4, párrafo de lecturas de detalle: "Un `userId?`/`processId?` que caiga fuera del
alcance se intersecta con el `where` de alcance".

**Problema:** El `where` de asignaciones del líder filtra por `processId ∈ scopedProcessIds`, no por
`userId`. Un `userId?` filtro simplemente estrecha dentro del conjunto ya acotado por proceso, lo que
es correcto y no filtra datos; pero el texto habla de "intersecar con el `where` de alcance" sin
aclarar que para asignaciones el alcance es por proceso (no por persona). Un implementador podría
dudar de si debe cruzar `userId?` contra `scopedUserIds`. No hay fuga posible (el filtro de proceso
ya acota), por eso es NIT, no bloqueante.

**Fix concreto:** añadir una frase en §2.4: "para `GET /capacity/assignments` el alcance es por
`processId ∈ scopedProcessIds` (jefe sin filtro); `userId?`/`requestId?` son filtros adicionales que
solo estrechan ese conjunto, nunca lo amplían ni se cruzan con `scopedUserIds`".

### 3 — NIT · Jefe ve `User.active = true`: capacidad histórica de personas inactivas queda fuera

**Dónde:** §2.6.1 / D12 ("Área" = `User.active = true`).

**Problema:** Si una persona se desactiva (`active = false`) tras tener disponibilidad/asignaciones de
un mes pasado, el resumen del jefe para ese mes dejará de incluirla, porque `scopedUserIds = 'ALL'`
hoy significa "sin filtro de `userId`" pero el endpoint `GET /capacity/people` sí restringe a
`active = true`. El resumen (`summary`/`availability`/`assignments`) para el jefe no filtra por
`active` (solo por `month`), así que **sí** vería las filas de un inactivo — pero el **selector**
(`/capacity/people`) no lo ofrecería para crear/editar. Es una pequeña incoherencia entre "quién
aparece en el resumen" y "quién aparece en el selector"; `active` existe en el schema (verificado).
No bloquea porque es un caso borde documentado como reversible (D12) y no obliga a inventar regla.

**Fix concreto:** fijar en §2.6.1 que el resumen del jefe muestra a cualquier persona con datos del
mes (incluidas inactivas, lectura histórica), mientras el selector `/capacity/people` solo lista
activas para escritura; o bien alinear ambos a `active = true`. Dejar la elección escrita evita que
el implementador decida en silencio.

---

## Suposiciones verificadas (leí la fuente)

1. **`AuditObjectType` actual** = los 12 tipos que cita §1.5 (`PROCESS|USER|GRANT|CATALOG_ITEM|
   REQUEST|TRIAGE|PRIORITY_EVALUATION|APPROVAL|PLAN|PLAN_PHASE|TASK|TASK_DEPENDENCY`); ampliar con
   `MONTHLY_AVAILABILITY|ASSIGNMENT` es un cambio aditivo correcto. **Verificado en
   `audit.service.ts`.**
2. **`AuditService.record(tx, input)` escribe dentro del `tx` transaccional** con `before/after` Json
   y `scopeProcessId: string | null`. La forma del `AuditRecordInput` admite `scopeProcessId = null`.
   **Verificado en `audit.service.ts`.**
3. **`AuditService.findMany` filtra a jefe/líder por `scopeProcessId in scopedProcessIds`**, luego los
   eventos de disponibilidad con `scopeProcessId = null` NO aparecen en esa vista para jefe/líder (sí
   para el integrante por `actorUserId`). El diseño **declara** esta consecuencia como decisión
   reversible (§1.5). La afirmación del diseño es exacta. **Verificado en `audit.service.ts`.**
4. **`MODULE_MATRIX.capacity = [JEFE_AREA, LIDER_PROCESO, INTEGRANTE]`** (los tres roles).
   **Verificado en `module-matrix.ts`** y coincide con `specs/10` (fila `capacity: ✓/✓/✓` y
   "Capacidad: Propia" para integrante).
5. **`CurrentActor`** expone `userId`, `scopedProcessIds: Set<string>`, `isJefeArea: boolean` tal como
   los usa el helper `scopedUserIds` y los `where`. **Verificado en `current-actor.ts`.**
6. **Patrón de alcance en el `where` + 404 por `findFirst`** (`{ AND: [{ id }, scopeWhere(actor)] }`,
   jefe `{}`, no-jefe `mainProcessId in scopedProcessIds`). El diseño reutiliza este patrón para
   `requestId` fuera de alcance → 404. **Verificado en `request.service.ts`.**
7. **`Request.mainProcessId`** es `String` **requerido** (no nullable), con FK `onDelete: Restrict`,
   luego resolver una Request por `scopeWhere` y leer su `mainProcessId` es seguro. **Verificado en
   `schema.prisma`.**
8. **`User.active: Boolean @default(true)`** existe en el schema, luego "área = `User.active = true`"
   (D12) es implementable sin inventar columnas. **Verificado en `schema.prisma`.**
9. **Patrón HTTP PATCH 200 + recurso / DELETE `@HttpCode(204)` sin body** existe en
   `task.controller.ts`, `phase.controller.ts`, `dependency.controller.ts`. El contrato de §3.1/D15
   es fiel al repo. **Verificado en los tres controllers del plan.**
10. **FK `onDelete: Restrict`** es el estilo del repo (p. ej. `Request.mainProcess`). Las nuevas FKs
    de §1.2 lo respetan. **Verificado en `schema.prisma`.**
11. **BR-012** ("disponibilidad por persona/mes, no por proyecto; asignaciones se agregan por
    periodo/proceso") respalda `@@unique([userId, month])` y la ausencia de unique en `Assignment`.
    **Verificado en `specs/05`.**
12. **BR-013** ("horas de bitácora son dedicación, no horas reales de tarea") respalda que
    `comprometido` salga SOLO de `Assignment` y nunca de bitácora. El diseño lo respeta por ausencia
    (supuesto 4; Fase 4 no toca bitácora). **Verificado en `specs/05`.**
13. **`specs/28` punto 6** lista exactamente los cinco P que el diseño marca como reversibles
    (fórmula, sobreasignación, cero/negativo/fracción, consolidación multiproceso, duplicada, efecto
    en envío). **Verificado en `specs/28`.**
14. **AC-012** ("Resume por persona/mes; señalar exceso según regla confirmada", con "exceso exacto
    pendiente") respalda señalar-no-bloquear. **AC-013** ("disponibilidad una vez por persona/mes;
    carga agrega asignaciones") respalda el resumen agregado. **AC-025/026** ("denegar sin filtrar
    datos") respaldan el 404 por alcance. **Verificado en `specs/18`.**
15. **`specs/29` fila 17**: Disponibilidad = "mes, proceso/contexto, persona, horas | ... una
    disponibilidad persona/mes | decimales, negativos, duplicados"; Asignación = "mes, proceso,
    persona, solicitud, horas comprometidas | mes/proceso/horas requeridos | límites sobreasignación
    y proceso/persona". Los requeridos del DTO (§3.4) coinciden. **Verificado en `specs/29`.**
16. **`specs/11` SCR-17** (líneas 200–206) confirma `YYYY-MM`, "disponibilidad única por persona/mes,
    no por proyecto; asignaciones se agregan", "Resumen por persona: disponible, comprometido,
    utilización %, libre", "horas comprometidas **enteras** obligatorias", "descripción indica
    distribución de esfuerzo por periodo", "El plan revisa capacidad separadamente de framework" y
    marca `P` la fórmula/sobreasignación/negativas-cero y el alcance del selector proceso/persona.
    **Verificado en `specs/11`.**
17. **FEATURE-005** = "SCR-17, FNC-020, BR-012" (`specs/23`), que es exactamente el corte que el
    diseño cubre. **Verificado en `specs/23`.**
18. **`specs/19`** lista los casos borde ("Disponibilidad cero, horas negativas/fraccionarias,
    asignación duplicada, persona en varios procesos, mes con sobrecarga") y ordena "no completar
    estas reglas por intuición"; el diseño los trata como decisiones reversibles. **Verificado en
    `specs/19`.**

## Suposiciones no verificadas / incorrectas

Ninguna afirmación del diseño resultó incorrecta frente a la fuente. Dos matices menores (no son
afirmaciones falsas, solo precisiones) ya están capturados como NIT 2 y NIT 3:

- El texto "`userId?`/`processId?` se intersecta con el `where` de alcance" para asignaciones es
  técnicamente correcto pero poco preciso sobre que el alcance de asignación es por proceso (NIT 2).
- La definición "área = `User.active = true`" aplica al **selector** (`/capacity/people`), mientras el
  **resumen** del jefe no filtra por `active`; conviene fijar la lectura histórica de inactivos (NIT 3).

No quedó ninguna suposición sin poder verificar: todas las fuentes citadas (specs y código heredado)
estaban presentes y legibles en el worktree y en `SDD_control-phari`.
