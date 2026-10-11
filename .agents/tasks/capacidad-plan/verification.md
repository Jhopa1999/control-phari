# Verificacion — Vinculacion CAPACIDAD ↔ PLAN (`planificado`)

Cambio ADITIVO: se anade `planificado` (horas estimadas derivadas de las tareas
del plan por persona/mes) junto a `comprometido` (sin cambios de semantica ni
auditoria). Sin migracion (`Task.estimateHours` ya existia).

## Archivos creados/modificados

Codigo:
- `apps/api/src/modules/capacity/dto/capacity-summary-row.dto.ts` — anadidos 3
  campos con `@ApiProperty`: `planificado: number`, `utilizacionPlan: number |
  null`, `planSobreDisponible: boolean`. No se tocaron campos existentes.
- `apps/api/src/modules/capacity/capacity.service.ts` — import de `TaskStatus`;
  dentro de `summary()`, consulta agregadora de tareas + mapeo mes exacto en
  memoria (`planByUser`); se agregan al `Set` de personas quienes solo tienen
  plan; se rellenan los 3 campos nuevos por fila. NO se modifico el calculo de
  `comprometido`, `utilizacion`, `libre`, `estado`, `sobrecargado`,
  `cargaParcial` ni los snapshots de auditoria.
- `apps/api/src/modules/capacity/capacity.service.spec.ts` — mock del delegado
  `task.findMany` (default `[]` en `beforeEach`), helper `taskRow`, y
  `describe('summary - planificado')` con los casos a–f + mes distinto.
- `apps/web/src/app/activos/capacidad/capacidad-view.tsx` — columnas
  `Planificado` y `Utilizacion plan %`, badge accesible `Plan > disponible`
  cuando `planSobreDisponible`, `<caption>` ampliado y bloque explicativo en
  lenguaje llano distinguiendo `comprometido` de `planificado`. Usa el tipo
  generado `CapacitySummaryRow` (sin declarar tipos a mano).

Artefactos generados (por scripts, no editados a mano):
- `apps/api/openapi/openapi.json` (regenerado por `openapi:generate`).
- `packages/api-client/src/generated/schema.d.ts` y `dist/` (regenerado por
  `api-client:generate` + `build:api-client`): el tipo `CapacitySummaryRowDto`
  incluye `planificado`, `utilizacionPlan`, `planSobreDisponible`.

No versionados (config local, gitignored): se dejo un `apps/web/.env.local` NO
creado por politica; en su lugar el build de web se ejecuto con
`NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_AUTH_MODE` inyectadas por entorno. El
`.env` del worktree (DATABASE_URL/AUTH_MODE) NO se versiona.

## Consulta Prisma usada para derivar `planificado` y por que es eficiente

```ts
const monthStart = monthDate; // monthStringToDate(query.month) — 1er dia UTC
const nextMonth = new Date(
  Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
);
const planTasks = await this.prisma.task.findMany({
  where: {
    responsibleUserId: userIn ? { in: userIn } : { not: null },
    status: { not: TaskStatus.TERMINADA },
    estimateHours: { gt: 0 },
    OR: [
      { startDate: { gte: monthStart, lt: nextMonth } },
      { AND: [{ startDate: null }, { endDate: { gte: monthStart, lt: nextMonth } }] },
    ],
  },
  select: { responsibleUserId: true, estimateHours: true, startDate: true, endDate: true },
});
```

Eficiencia:
- Filtra en BD por `responsibleUserId` (indexado) y `status` (indexado), que
  recortan la mayor parte de las filas, y por `estimateHours > 0` (excluye hitos
  en BD). El rango de fechas `[monthStart, nextMonth)` acota a las tareas que
  tocan el mes por `startDate` o por `endDate`.
- `select` trae solo 4 columnas (no entidades completas).
- Reusa el mismo `userIn` (de `scopedUserIds`) que el resto de `summary()`; no
  introduce una frontera de proceso distinta (planificado es carga de la
  PERSONA). Para jefe (`ALL`) usa `responsibleUserId: { not: null }`.
- El `where` por fechas es una COTA amplia; el mapeo mes exacto (regla
  startDate-o-endDate, sin prorratear) se resuelve en memoria sumando por
  `responsibleUserId` en un `Map`, evitando doble conteo. Es una sola consulta
  adicional O(n) sobre un conjunto ya acotado.

## Tests anadidos (en `capacity.service.spec.ts`)

`describe('summary - planificado')`:
- (a) varias tareas de la persona en el mes → `planificado` = suma;
  `utilizacionPlan = round(plan/disponible*100)`; `comprometido` intacto.
- (b) `startDate` null + `endDate` en el mes → cuenta por `endDate`.
- (c) el `where` filtra `status != TERMINADA`, `estimateHours > 0` y
  `responsibleUserId`; tarea sin fecha no suma (mapeo en memoria).
- (d) `disponible` 0 o null → `utilizacionPlan` null (sin division por cero),
  `planificado` conserva su valor.
- (e) `planificado > disponible` → `planSobreDisponible` true, mientras
  `estado`/`sobrecargado` siguen derivando SOLO de `comprometido` (OK con
  comprometido bajo).
- (f) persona con SOLO plan aparece con `planificado>0` y `comprometido` 0;
  alcance en el `where` = `responsibleUserId { in: [...] }` para lider.
- (f-jefe) alcance ALL → `where.responsibleUserId = { not: null }`.
- tarea con `startDate` en otro mes no cuenta (mapeo exacto en memoria).

Ademas se validaron los tests existentes de `summary` para confirmar que
`planificado=0` / `utilizacionPlan=0` / `planSobreDisponible=false` cuando no
hay tareas de plan (default `task.findMany -> []`).

## Comandos ejecutados y resultado real

1. `npm run prisma:generate` → OK (el cliente Prisma no estaba generado en el
   worktree; se genero `src/generated/prisma`). Necesario para compilar/tests.
2. `npm run test:unit` → **51 suites, 434 tests, todos verdes** (426 previos +
   8 nuevos del bloque `summary - planificado`).
3. `npm run contracts:generate` → OK (OpenAPI + cliente regenerados).
   `npm run build:api-client` → OK. Confirmado en el schema generado que
   `CapacitySummaryRowDto` incluye `planificado`, `utilizacionPlan`,
   `planSobreDisponible`.
4. `npm install` en el worktree → necesario: el worktree no tenia `node_modules`
   propio y resolvia `@plantilla-portales/api-client` al paquete del repo
   PRINCIPAL (dist viejo), por lo que el typecheck de web no veia los campos
   nuevos. Tras instalar, el symlink apunta al paquete del worktree.
5. `npm run typecheck` (api + api-client + web) → **sin errores**.
6. `npm run build` (build:api + build:api-client + build:web) → **OK**. El build
   de web requiere `NEXT_PUBLIC_API_BASE_URL`; se inyecto por entorno (no se
   creo `.env.local` por politica). Prerender de las 29 rutas OK, incluida
   `/activos/capacidad`.

## Verificacion funcional real (curl / Invoke-RestMethod)

Entorno: Docker `plantilla-portales-postgres-1` (puerto 5433, healthy). API
local arrancada en **puerto 3101** (`PORT=3101`, `AUTH_MODE=dev-header`) para no
colisionar con el repo principal (que ocupa 3000/3001; NO se detuvo). Actor via
header `X-Actor-Id: jefe@demo.local` (el resolver dev-header mapea por
identifier). `GET /dev/actors` devolvio los usuarios del seed; `GET
/capacity/people` dio los ids. Persona de prueba: `integrante.bi@demo.local`
(Carla, id `0e2806ff-...`). Proceso FIBI (`10ab7e2b-...`). Mes `2025-03`.

Flujo (ver `verify-flow.ps1`, script temporal usado para la corrida):
1. `POST /capacity/availability` → disponibilidad 160h para Carla en 2025-03.
2. `POST /capacity/assignments` → asignacion manual `committedHours=40`.
3. `POST /requests` → request FIBI (REGISTRADA).
4. `POST /requests/{id}/triage` `{decision: CONTINUAR}` → BACKLOG_PRIORIZADO.
5. `POST /requests/{id}/priority` (8 criterios en 5) → score 100.
6. `POST /requests/{id}/approval` `{decision: APROBAR}` → COMPROMETIDA.
7. `POST /requests/{id}/plan` → EN_PLANIFICACION (planId).
8. `POST /plans/{planId}/phases` → fase (phaseId).
9. `POST /phases/{phaseId}/tasks` x5, todas con responsable Carla:
   - A: `estimateHours=30`, `startDate=2025-03-05` (POR_HACER) → cuenta.
   - B: `estimateHours=50`, `startDate=2025-03-10` (POR_HACER) → cuenta.
   - C: hito `isMilestone=true`, `estimateHours=0`, `startDate=2025-03-12` → NO cuenta.
   - D: `estimateHours=99`, `startDate=2025-04-02` (otro mes) → NO cuenta.
   - E: `estimateHours=70`, `startDate=2025-03-15` (POR_HACER) → cuenta de inicio.

Respuestas observadas de `GET /capacity/summary?month=2025-03` (fila de Carla):

ANTES de terminar la Tarea E (planificado = 30+50+70 = 150):
```json
{"userId":"0e2806ff-d66f-4c64-8b0a-809afdbea245","userName":"Carla Integrante BI","month":"2025-03","disponible":160,"comprometido":40,"utilizacion":25,"libre":120,"estado":"OK","sobrecargado":false,"cargaParcial":false,"planificado":150,"utilizacionPlan":94,"planSobreDisponible":false}
```

Luego Tarea E: `PATCH /tasks/{E}/status` POR_HACER→EN_CURSO→EN_REVISION→TERMINADA.

DESPUES de terminar la Tarea E (planificado = 30+50 = 80):
```json
{"userId":"0e2806ff-d66f-4c64-8b0a-809afdbea245","userName":"Carla Integrante BI","month":"2025-03","disponible":160,"comprometido":40,"utilizacion":25,"libre":120,"estado":"OK","sobrecargado":false,"cargaParcial":false,"planificado":80,"utilizacionPlan":50,"planSobreDisponible":false}
```

Conclusiones confirmadas end-to-end:
- `planificado` refleja la suma de `estimateHours` de las tareas del plan
  asignadas a la persona ese mes (150 → 80 al terminar E).
- Una tarea **TERMINADA** deja de sumar (E: 70 salio de 150 → 80).
- Un **hito** (`estimateHours=0`) y una tarea de **otro mes** (abril) NO suman.
- `comprometido` siguio reflejando SOLO la asignacion manual (40) en ambos
  cortes; `estado`/`sobrecargado`/`utilizacion`/`libre` no cambiaron por el
  plan. Cambio estrictamente ADITIVO.
- `utilizacionPlan` coherente: round(150/160*100)=94, round(80/160*100)=50.

Verificacion de la UI: `npm run build` prerenderizo `/activos/capacidad` sin
errores con el componente ya consumiendo los 3 campos del tipo generado. No se
levanto un segundo dev server de Next en el mismo directorio (Next 16 no lo
permite); la UI se valido por build + typecheck + inspeccion del componente
`capacidad-view.tsx` (columnas `Planificado` y `Utilizacion plan %`, badge
accesible, textos explicativos).

Procesos: la API en 3101 se DETUVO al terminar (PID liberado; puerto 3101
libre). Los procesos del repo principal en 3000/3001 quedaron intactos.
