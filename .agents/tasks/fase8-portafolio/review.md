# Revisión Fase 8 · Portafolio y control del área — APPROVED

Rama `feat/fase8-portafolio` (worktree `.worktrees/fase8-portafolio`), 2 commits, 28 archivos, +4245/-21. `schema.prisma` NO está en el diff.

## Veredicto

APPROVED — 0 hallazgos HIGH, 0 MEDIUM.

## Reglas duras del encargo (todas verificadas contra el código real)

1. **Indicadores §9 con fórmula exacta o "No aplica" honesto** — `area-control.service.ts`:
   - `evaluationTime`: mediana de `daysBetween(registeredAt, triage.decidedAt)` con triage decidido en `[from,to)`; descarta días negativos; `pendingCount` = `triages: { none: {} }` sin filtro de periodo (siempre reportado, 0 válido); muestra vacía → `applicable:false, reason`.
   - `milestoneCompliance`: `due` = Task `isMilestone` con `endDate` en periodo dentro de `taskScope`; `met` = `status==='TERMINADA' && accepted && acceptedAt<=endDate`; `percentage(met,due)`; `due===0 → applicable:false, "Sin hitos con vencimiento en el periodo"`.
   - `deliveryTime`: Request CERRADA en `requestScope`; compromiso = `initialCommitmentDate ?? Approval.decidedAt (resultingState='COMPROMETIDA' más antiguo)`; cierre vía `auditEvent.findFirst` con `after:{path:['operationalState'],equals:'CERRADA'}` + fallback en memoria; sin compromiso/cierre → `unmeasurableClosed`; muestra vacía → `applicable:false`.
   - `blocks`: `blockedRequests` + `openBlockingIssues`; `applicable:true` SIEMPRE (0 bloqueos es dato legítimo).
   - `failedChanges`/`recovery`/`adoptionValue`: `applicable:false` + `reason` + `futureDataNote`. **Nunca 0 inventado.**

2. **"Comprometida" solo por operationalState explícito** — `portfolio.service.ts` expone `operationalState` tal cual; sin heurística por score/fechas en ningún punto.

3. **Alcance por rol en el `where`** — `portfolio-scope.service.ts`: `requestScope` = jefe `{}`; no-jefe `mainProcessId ∈ scopedProcessIds` (unión de todos los grants, sin filtrar por `roleCode`). `taskScope` vía `phase.plan.request`; `issueScope` por `processId`. Integrante → **403** en `/area-control/indicators` por `@Roles(JEFE_AREA, LIDER_PROCESO)`; verificado en `area-control.controller.spec.ts` (integrante→403, jefe/líder→ok; demand-summary y portfolio→3 roles ok).

4. **"Bloqueo abierto" de Issue por RecordState real** — `CLOSED_ISSUE_STATES = [RecordState.COMPLETADO, RecordState.ARCHIVADO]`; `state: { notIn: CLOSED_ISSUE_STATES }`. El enum `RecordState` (coordination/record-state.ts) NO contiene 'TERMINADA'. El texto del diseño §2.4 (`state != 'TERMINADA'`) es incorrecto contra el enum; la implementación siguió correctamente la regla dura y documentó la desviación en FEAT-001.

5. **Contrato regenerado y committeado** — `npm run contracts:generate` deja git status LIMPIO (sin diff en `openapi.json` ni `schema.d.ts`); ambos committeados (437c5de). Los 3 schemas de respuesta + anidados presentes.

6. **Frontend solo vía api-client** — `lib/area-control.ts` y `lib/portfolio.ts` derivan tipos de `components['schemas'][...]` y usan `api.GET`; cero `fetch`/`PrismaClient`/`@prisma`/`next/` en las vistas y wrappers de Fase 8.

7. **Sin migración / escritura / AuditEvent** — `schema.prisma` intacto (fuera del diff); sin `.create/.update/.delete/.upsert/$transaction/AuditService/audit.record` en `modules/portfolio/**`.

## Verificaciones reales (todas verdes)

- `npm run typecheck` → exit 0 (api + api-client + web).
- `npm run test:unit` → 49 suites, **415/415** tests, incluye indicators/period/area-control.service/portfolio.service/area-control.controller.
- `npm run contracts:generate` → regeneración idéntica, git status limpio.
- `npm run build` → exit 0; las 3 rutas (`/inicio`, `/demanda/resumen`, `/seguimiento/portafolio`) compilan.

## Supuestos verificados

- `Triage.decidedAt` es `DateTime @default(now())` (NO nullable) → `triages: { none: {} }` ≡ `currentTriage == null` del diseño.
- `priorityBand(score)` devuelve solo `P1|P2|P3|P4` (nunca null/SIN_PRIORIZAR); el service pone `SIN_PRIORIZAR`/null cuando `currentPriorityEvaluation == null`.
- Campos de `Request` referenciados existen (operationalState, blockedAt, blockedResolvedAt, functionalOwner, initialCommitmentDate, governanceRoute).
- `RecordState` = {BORRADOR, EN_CURSO, BLOQUEADO, COMPLETADO, ARCHIVADO}; sin TERMINADA.

## Supuestos no verificados / corregidos

- El filtro JSON `after: { path: ['operationalState'], equals: 'CERRADA' }` solo se ejercita en unit test con mock; no se ha corrido contra PostgreSQL real. No bloqueante: existe fallback en memoria (try/catch) también cubierto por test. Reconfirmar en QA de integración runtime.
- El diseño §2.4 dice `state != 'TERMINADA'` (incorrecto). La implementación lo corrigió a `NOT IN (COMPLETADO, ARCHIVADO)` conforme a la regla dura del encargo; la discrepancia es del texto del diseño, no del código.
