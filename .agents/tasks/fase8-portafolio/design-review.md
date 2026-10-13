# Revisión del diseño — Fase 8 · Portafolio y control del área

> Documento revisado: `.agents/tasks/fase8-portafolio/design.md` (iteración 3).
> Revisión en frío: contrastado contra marco FCGR INS-008 v2.0 §9, SDD (`specs/11, 02, 23, 10`), steering y el código real del worktree `.worktrees/fase8-portafolio`.
> Veredicto mecánico: cualquier hallazgo HIGH o MEDIUM bloquea. Resultado: **0 HIGH, 0 MEDIUM, 3 NIT → APPROVED.**

---

## Resumen

El diseño es sólido y, salvo detalles menores, autosuficiente. Verifiqué cada campo y entidad que el diseño asume contra `schema.prisma` y los servicios reales: **todos existen** con el nombre y la semántica que el diseño declara. Las tres reglas rectoras del encargo se cumplen:

1. **Cada indicador del marco §9 está cubierto** con fórmula exacta; los 3 sin dato (cambios fallidos, recuperación, adopción/valor) quedan `applicable=false` con `reason` + `futureDataNote`, **sin inventar** valores. La distinción "No aplica" ≠ `0` está explícita (§2.8).
2. **No se infiere "comprometido" por heurística:** se usa el estado explícito `COMPROMETIDA` del enum `RequestState` (verificado que existe) y los posteriores.
3. **No se diseñó scheduling/cron:** el periodo lo elige el usuario; las instancias del marco solo etiquetan la UI (§2, §5.4, §11).

Los 3 NITs no bloquean, pero conviene corregirlos para que el implementador no herede imprecisiones.

---

## Hallazgos

### 1. (NIT) `CapacityService` citado como ejemplo del patrón de lectura por proceso es inexacto

En **§4** el diseño lista `CapacityService` entre los servicios cuyo `where` de lectura es `jefe => {} / resto => mainProcessId ∈ scopedProcessIds`. Verificado en `capacity-scope.service.ts`: el alcance de capacidad es **por persona** (`scopedUserIds`), no por `mainProcessId`, y **sí** distingue rol (líder ve a las personas de sus procesos vía `leaderProcessIds`; integrante solo a sí mismo). El propio diseño, más abajo, cita correctamente a capacidad como **autoridad de gestión/escritura** que usa `leaderProcessIds` — las dos afirmaciones conviven y la primera es engañosa.

**Fix concreto:** en §4, quitar `CapacityService` de la lista de servicios que ejemplifican el `where` de lectura por `mainProcessId`. La lista correcta y verificada es: `RequestStateService`, `RequestService`, `GovernanceScopeService`, `PlanStateService`, `ApprovalService`, `TaskService`. Dejar la mención a capacidad **solo** en el párrafo que explica que `leaderProcessIds` es autoridad de escritura.

### 2. (NIT) La referencia a `month.ts` como helper del periodo `[from, to)` es ilustrativa, no reutilizable tal cual

En **§2** ("Convención de periodo") el default se describe como "coherente con... el helper `month.ts` de Fases 4–7". Verificado: `apps/api/src/modules/capacity/month.ts` solo expone `monthStringToDate(month: string)` y `dateToMonthString(date)`, que operan sobre strings `YYYY-MM` y devuelven el **primer día del mes** — **no** calculan el rango semiabierto `[from, to)` ni el "primer día del mes siguiente". El diseño describe correctamente la aritmética que necesita (`Date.UTC`), pero el lector podría creer que reutiliza una función que no existe.

**Fix concreto:** aclarar en §2 que el helper de rango `[from, to)` es **nuevo** (p. ej. `period.ts` dentro de `portfolio/`, o funciones puras en `indicators.ts`), y que de `month.ts` solo se toma la convención UTC/primer-día, no una función de rango. Añadir el default de `to` (`primer día del mes siguiente`) como cálculo propio y cubrirlo con unit test.

### 3. (NIT) SCR-08 pertenece a FEATURE-010 pero el diseño no lo menciona ni lo excluye explícitamente

Verificado en `specs/23-feature-slices.md`: **FEATURE-010 = "Portafolio/control → SCR-01/07/08"**. El diseño cubre SCR-01 (`demandOverview`) y SCR-07 (`portfolio`) pero **no nombra SCR-08** ("Proyectos y entregables", moduleKey `project`, ruta `/seguimiento/proyectos`). La §11 ("Qué NO se hace") afirma que "no queda ningún placeholder `demandOverview`/`dashboard`/`portfolio` sin convertir" — correcto, pero omite que SCR-08 (parte de la misma feature) **no** es alcance de esta fase. No es un vacío funcional (SCR-08 es otro módulo/ruta), pero el silencio invita a confusión sobre si la fase cierra FEATURE-010 completa.

**Fix concreto:** añadir una línea en §0 o §11 declarando que **SCR-08 (`project`, `/seguimiento/proyectos`) queda fuera del alcance de la Fase 8** (es un módulo aparte, no una de las tres superficies de control/portafolio), para que el cierre de FEATURE-010 quede acotado sin ambigüedad.

---

## Suposiciones verificadas (contra el código del worktree)

Todas confirmadas; ninguna es una suposición incorrecta.

**Campos/entidades del esquema (`apps/api/prisma/schema.prisma`):**
- `Request.registeredAt` (`@map registered_at`) — **existe**.
- `Request.initialCommitmentDate`, `targetDate`, `functionalOwner`, `operationalState` (String, no enum nativo), `governanceRoute`, `blockedReason`, `blockedAt`, `blockedResolvedAt` — **existen** (Fase 2 + Fase 7).
- `Triage.decidedAt` (`@default(now())`), `Triage.criticalityCode`, `Triage.sizeCode`, `Triage.decision` — **existen**.
- `Task.isMilestone` (`@default(false)`), `Task.endDate`, `Task.status`, `Task.accepted`, `Task.acceptedAt` — **existen**; alcance vía `phase → plan → request.mainProcessId` confirmado por el modelo relacional.
- `Approval.resultingState`, `Approval.decidedAt` (`@default(now())`), `Approval.createdAt` — **existen**; la distinción `decidedAt`=dominio vs `createdAt`=metadato es correcta.
- `AuditEvent.after` (`Json?`), `objectType`, `objectId`, `action`, `createdAt` — **existen** (append-only, sin `updatedAt`).
- `PriorityEvaluation.score` — **existe**.
- `Issue.typeCode` (default `BLOQUEO`), `Issue.state` (default `EN_CURSO`), `Issue.date` (`@db.Date`), `Issue.title`, `Issue.processId` — **existen**. (Nota: no hay estado `TERMINADA` explícito en el esquema; `state` es maestra `RECORD_STATE` texto libre — ver "parcialmente verificado" abajo.)

**Enum lógico `RequestState` (`request-state.ts`):** existe como `enum` TS con `COMPROMETIDA`, `EN_PLANIFICACION`, `EN_EJECUCION`, `CERRADA`, etc. — confirma el uso de estado explícito, no heurística.

**Servicios y métodos:**
- `RequestStateService.scopeWhere` es `private` (`request-state.service.ts:61`), igual que en `request.service.ts:42` y `approval.service.ts:43` → la decisión de **replicar** el patrón en `PortfolioScopeService` es correcta.
- `RequestStateService.priorityBand(score)` devuelve **siempre** `'P1'|'P2'|'P3'|'P4'` (nunca null ni `SIN_PRIORIZAR`) — confirmado (`request-state.service.ts:175`). La asignación de `SIN_PRIORIZAR` por el service antes de llamar al helper es coherente.
- `RequestStateService.currentTriage` / `currentPriorityEvaluation` — **existen** y resuelven la fila vigente por `findFirst` orden desc.
- `CurrentActor.scopedProcessIds` = unión de **todos** los grants activos, **sin** filtrar por `roleCode` (`dev-actor.resolver.ts:57-86`); `isJefeArea` derivado de `roleCodes`. Confirma que líder e integrante comparten el `where` de lectura.
- `CurrentActor.grants[].roleCode` (`ActorGrant`) — **existe**.

**Evento de cierre (clave para §2.3):** verificado en `governance/gate-check/gate-check.service.ts` que la aprobación GC5 (`OPERATIVA → CERRADA`, confirmado en `gate.ts` y `governance-state.service.spec.ts`) audita `after: { operationalState: nextState }`; y que block/unblock/ruta usan `after` sin `operationalState` (`{ blocked... }`, `{ governanceRoute }`). Por tanto el filtro `after: { path: ['operationalState'], equals: 'CERRADA' }` acotado por `objectId` **sí** aísla el evento de cierre. La ruta del archivo citada en §2.3 es correcta.

**Frontend / navegación:**
- `navigation.ts`: `/inicio → dashboard`, `/demanda/resumen → demandOverview`, `/seguimiento/portafolio → portfolio` — **coinciden exactamente** con lo que el diseño afirma; no se tocan claves.
- `listProcesses()` existe en `apps/web/src/lib/team.ts`.

**SDD:**
- `specs/11-ui-behavior.md`: SCR-01 = "Control del área / demandaOverview", Jefe/líder; SCR-07 = Portafolio, los tres roles. **Coincide.**
- `specs/10-roles-permissions.md`: `demandOverview = — / líder ✓ / jefe ✓`; `dashboard = ✓/✓/✓`; "Portafolio/proyecto: Consulta según alcance" para integrante. **Coincide** con el gating por guard de §4.1 y con la decisión D-S1 (where simple sin recorte por participación).

**Marco §9:** los 7 indicadores y la regla rectora ("si no hay casos o denominador, se reporta 'No aplica'"; consolidación **mensual**, no cron) coinciden literalmente con `FCGR-INS-008-v2.0.txt` líneas 368-393. Las definiciones de cada indicador citadas en §2 (tiempo de evaluación, cumplimiento de hitos, tiempo de entrega, bloqueos, cambios fallidos, recuperación, adopción y valor) coinciden con el texto del marco.

---

## Suposiciones parcialmente verificadas / a reconfirmar al implementar

Ninguna invalida el diseño; se dejan como notas de implementación, no como hallazgos bloqueantes.

- **`Issue.state != 'TERMINADA'` como "bloqueo abierto" (§2.4):** `Issue.state` es texto de maestra `RECORD_STATE` (default `EN_CURSO`), no un enum fijo en el esquema. El diseño asume que el estado cerrado es `TERMINADA`. No pude confirmar el conjunto exacto de códigos de `RECORD_STATE` desde el esquema (vive en seed/maestra). Al implementar, confirmar el código de cierre real de `RECORD_STATE` (p. ej. `record-state.ts` del front o el seed) en lugar de hardcodear `'TERMINADA'`. No cambia el enfoque, solo el literal.
- **Filtro JSON `after: { path: ['operationalState'], equals: 'CERRADA' }` (§2.3):** el diseño ya lo marca como "a reconfirmar al implementar" con fallback en memoria. Correcto; la factibilidad depende de Prisma 7.10 + `@prisma/adapter-pg` en runtime, no verificable por lectura estática. El fallback descrito es razonable.

---

## Veredicto

**APPROVED.** 0 HIGH, 0 MEDIUM. Los 3 hallazgos son NIT (precisión documental); no bloquean la implementación. Todas las entidades, campos y comportamientos que el diseño asume fueron verificados contra el código real y existen con la semántica declarada. Las tres reglas duras del encargo (cobertura de indicadores con "No aplica" honesto, estado `COMPROMETIDA` explícito sin heurística, ausencia de scheduling) se cumplen.
