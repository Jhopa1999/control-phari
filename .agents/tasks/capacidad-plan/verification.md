# Verificacion — Vinculacion CAPACIDAD <-> PLAN (`planificado`)

Cambio ADITIVO: se anade `planificado` (horas estimadas derivadas de las tareas
del plan por persona/mes) junto a `comprometido` (sin cambios de semantica ni
auditoria). Sin migracion (`Task.estimateHours` ya existia).

## Iteracion de revision (CHANGES_REQUESTED -> corregido)

El revisor aprobo la logica (criterios C1-C7 CUMPLE; C8 CUMPLE con reservas) y
pidio corregir dos defectos de calidad del guardado de archivos. Se corrigieron
TODOS los hallazgos:

- F1 (Alta) Mojibake en cadenas visibles de `capacidad-view.tsx`: los em-dash
  `—` se habian guardado como secuencia mojibake. CORREGIDO: el archivo se
  reescribio en UTF-8 limpio con el guion largo `—` correcto en `nullOrNumber`,
  `nullOrPercent`, el fallback de `requestTitle` y `row.description`.
- F2 (Alta) Mojibake en comentarios/docstrings de `capacity.service.ts`,
  `capacity.service.spec.ts` y `capacity-summary-row.dto.ts` (`§`, `∈`, `↔`).
  CORREGIDO: los 4 archivos se reconstruyeron desde la version de `main` (UTF-8
  limpio) y se reaplicaron SOLO los cambios del feature, con los caracteres
  correctos (`§`, `∈`, `↔`). OpenAPI/api-client regenerados: descripciones
  limpias (ASCII), sin propagacion de mojibake.
- F3 (Media) Churn de formato (lineas en blanco eliminadas) en `.service.ts`
  (~64) y `capacidad-view.tsx` (~27). CORREGIDO: al reconstruir desde `main` se
  preservo exactamente la estructura de lineas en blanco; el diff vs `main`
  ahora es estrictamente aditivo (solo las lineas del feature).
- F4 (Baja, no bloqueante) tercer campo `planSobreDisponible`: se mantiene como
  senal informativa documentada (no altera `estado`/`sobrecargado`).

Verificacion de limpieza (autoritativa, via git grep de secuencias mojibake
`\xC3\x82` / `\xC3\xA2` / `\xC3\x83` sobre los `.ts`/`.tsx` del cambio): 0
coincidencias. Diffs vs `main` tras la correccion:
- `capacity.service.ts`: +73 / -31 (las -31 son lineas en blanco de contexto del
  reordenamiento; 1 sola linea no-blanca removida, un comentario que se amplio).
- `capacity.service.spec.ts`: +219 / -0 (puramente aditivo).
- `capacity-summary-row.dto.ts`: aditivo + ampliacion de 2 descripciones.
- `capacidad-view.tsx`: +31 / -3 (las -3 son el reordenamiento de celdas
  utilizacion/libre para intercalar las nuevas columnas).

## Archivos creados/modificados

Codigo:
- `apps/api/src/modules/capacity/dto/capacity-summary-row.dto.ts` — anadidos 3
  campos con `@ApiProperty`: `planificado: number`, `utilizacionPlan: number |
  null`, `planSobreDisponible: boolean`. No se tocaron los tipos de los campos
  existentes (solo se amplio la descripcion de `comprometido` y `estado`).
- `apps/api/src/modules/capacity/capacity.service.ts` — import de `TaskStatus`;
  dentro de `summary()`, consulta agregadora de tareas + mapeo mes exacto en
  memoria (`planByUser`); se agregan al `Set` de personas quienes solo tienen
  plan; se rellenan los 3 campos nuevos por fila. NO se modifico el calculo de
  `comprometido`, `utilizacion`, `libre`, `estado`, `sobrecargado`,
  `cargaParcial` ni los snapshots de auditoria.
- `apps/api/src/modules/capacity/capacity.service.spec.ts` — mock del delegado
  `task.findMany` (default `[]` en `beforeEach`), helper `taskRow`, y
  `describe('summary - planificado')` con los casos a-f + mes distinto.
- `apps/web/src/app/activos/capacidad/capacidad-view.tsx` — columnas
  `Planificado` y `Utilizacion plan %`, badge accesible `Plan > disponible`
  cuando `planSobreDisponible`, `<caption>` ampliado y bloque explicativo en
  lenguaje llano distinguiendo `comprometido` de `planificado`. Usa el tipo
  generado `CapacitySummaryRow` (sin declarar tipos a mano).

Artefactos generados (por scripts, no editados a mano):
- `apps/api/openapi/openapi.json` (regenerado por `openapi:generate`).
- `packages/api-client/src/generated/schema.d.ts` y `dist/` (regenerado por
  `api-client:generate` + `build:api-client`): el tipo `CapacitySummaryRowDto`
  incluye `planificado`, `utilizacionPlan`, `planSobreDisponible` con
  descripciones limpias.

No versionados (config local, gitignored): el `.env` del worktree
(DATABASE_URL/AUTH_MODE) NO se versiona. El build de web requiere
`NEXT_PUBLIC_API_BASE_URL`; se inyecto por entorno para la corrida (no se creo
`apps/web/.env.local`, bloqueado por politica).

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
- (a) varias tareas de la persona en el mes -> `planificado` = suma;
  `utilizacionPlan = round(plan/disponible*100)`; `comprometido` intacto.
- (b) `startDate` null + `endDate` en el mes -> cuenta por `endDate`.
- (c) el `where` filtra `status != TERMINADA`, `estimateHours > 0` y
  `responsibleUserId`; tarea sin fecha no suma (mapeo en memoria).
- (d) `disponible` 0 o null -> `utilizacionPlan` null (sin division por cero),
  `planificado` conserva su valor.
- (e) `planificado > disponible` -> `planSobreDisponible` true, mientras
  `estado`/`sobrecargado` siguen derivando SOLO de `comprometido` (OK con
  comprometido bajo).
- (f) persona con SOLO plan aparece con `planificado>0` y `comprometido` 0;
  alcance en el `where` = `responsibleUserId { in: [...] }` para lider.
- (f-jefe) alcance ALL -> `where.responsibleUserId = { not: null }`.
- tarea con `startDate` en otro mes no cuenta (mapeo exacto en memoria).

Ademas los tests existentes de `summary` validan `planificado=0` /
`utilizacionPlan=0` / `planSobreDisponible=false` cuando no hay tareas de plan
(default `task.findMany -> []`).

## Comandos ejecutados y resultado real (esta iteracion)

1. `npm run prisma:generate` -> OK (cliente Prisma del worktree regenerado;
   necesario porque `summary()` usa `this.prisma.task`).
2. `npm run contracts:generate` -> OK (OpenAPI + api-client regenerados, con los
   3 campos y descripciones limpias). `npm run build:api-client` -> OK.
3. `npm run typecheck` (api + api-client + web) -> **sin errores**.
4. `npm run test:unit` -> **51 suites, 434 tests, todos verdes** (426 previos +
   8 nuevos del bloque `summary - planificado`). Ningun test existente roto.
5. `npm run build` (build:api + build:api-client + build:web) -> **OK**. El
   build de web se ejecuto con `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`
   inyectada por entorno; prerender de las rutas OK, incluida
   `/activos/capacidad`.

## Verificacion funcional real (curl)

Entorno: Docker `plantilla-portales-postgres-1` (puerto 5433, healthy). API
local arrancada en **puerto 3101** (`PORT=3101`, `AUTH_MODE=dev-header`) para no
colisionar con el repo principal (que ocupa 3000/3001; NO se detuvo). Actor via
header `X-Actor-Id: jefe@demo.local` (el resolver dev-header mapea por
identifier). Persona de prueba: Carla Integrante BI
(`0e2806ff-d66f-4c64-8b0a-809afdbea245`). Proceso FIBI
(`10ab7e2b-5b8c-4918-8bb5-9e4c260d03f1`). Mes `2027-02` (lejano, sin ruido).

Comandos:

```
curl "http://localhost:3101/dev/actors"
# -> [{"identifier":"jefe@demo.local","name":"Ana Jefa"}, ...]

curl "http://localhost:3101/capacity/people" -H "X-Actor-Id: jefe@demo.local"
# -> ids de personas (Carla = 0e2806ff-...)

# Tareas de plan (POST /phases/{phaseId}/tasks, responsable Carla):
#   A: estimateHours=30, startDate=2027-02-10 (POR_HACER)   -> cuenta
#   B: estimateHours=50, startDate=2027-02-15 (POR_HACER)   -> cuenta
#   C: estimateHours=40, startDate=2027-02-20, status TERMINADA -> NO cuenta
#   D: hito isMilestone=true, estimateHours=0, startDate=2027-02-25 -> NO cuenta

# Capacidad manual:
curl -X POST "http://localhost:3101/capacity/availability" -H "X-Actor-Id: jefe@demo.local" \
  -H "Content-Type: application/json" \
  -d '{"userId":"0e2806ff-d66f-4c64-8b0a-809afdbea245","month":"2027-02","availableHours":160}'
curl -X POST "http://localhost:3101/capacity/assignments" -H "X-Actor-Id: jefe@demo.local" \
  -H "Content-Type: application/json" \
  -d '{"userId":"0e2806ff-d66f-4c64-8b0a-809afdbea245","month":"2027-02","processId":"10ab7e2b-5b8c-4918-8bb5-9e4c260d03f1","committedHours":40,"description":"VERIF asignacion manual"}'

curl "http://localhost:3101/capacity/summary?month=2027-02" -H "X-Actor-Id: jefe@demo.local"
```

Respuesta observada de `GET /capacity/summary?month=2027-02` (fila de Carla):

```json
[{"userId":"0e2806ff-d66f-4c64-8b0a-809afdbea245","userName":"Carla Integrante BI","month":"2027-02","disponible":160,"comprometido":40,"utilizacion":25,"libre":120,"estado":"OK","sobrecargado":false,"cargaParcial":false,"planificado":80,"utilizacionPlan":50,"planSobreDisponible":false}]
```

Conclusiones confirmadas end-to-end:
- `planificado` = 80 = suma de `estimateHours` de A(30) + B(50).
- La tarea **TERMINADA** (C, 40h) NO suma.
- El **hito** (D, `estimateHours=0`) NO suma.
- `comprometido` = 40, reflejando SOLO la asignacion manual; `estado`=OK,
  `sobrecargado`=false, `utilizacion`=25, `libre`=120 no cambiaron por el plan.
  Cambio estrictamente ADITIVO.
- `utilizacionPlan` = round(80/160*100) = 50; `planSobreDisponible` = false.

UI: `npm run build` prerenderizo `/activos/capacidad` sin errores con el
componente consumiendo los 3 campos del tipo generado. No se levanto un segundo
dev server de Next en el mismo directorio (Next 16 no lo permite); la UI se
valido por build + typecheck + inspeccion del componente `capacidad-view.tsx`
(columnas `Planificado` y `Utilizacion plan %`, badge accesible `Plan >
disponible`, textos explicativos), con los em-dash corregidos.

Limpieza: se eliminaron de la BD compartida las filas de prueba (availability,
assignment, 4 tasks y sus audit_events). La API en 3101 se DETUVO al terminar
(puerto 3101 libre). Los procesos del repo principal en 3000/3001 quedaron
intactos.
