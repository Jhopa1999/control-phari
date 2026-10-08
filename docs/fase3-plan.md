# Fase 3 · Plan y ejecucion — notas de implementacion

Resumen de lo construido en la Fase 3 (plan por fases/tareas con dependencias,
guia de pendientes que gatea el envio, autorizacion del plan y ejecucion de
tareas respetando predecesoras). El diseno completo esta en
`.agents/tasks/fase3-plan/design.md`.

La fase se entrego en tres incrementos:

- **FEAT-001** backend (modelo Prisma + migracion, modulo `plan/`, gates
  server-side, pruebas unitarias).
- **FEAT-002** regeneracion del contrato (OpenAPI + api-client).
- **FEAT-003** frontend (wrappers tipados + pantallas), verificacion integral y
  esta documentacion.

## Entidades

Sobre una `Request` en estado `COMPROMETIDA` se crea un `Plan` (1:1 con la
Request). El plan se compone de `PlanPhase` (fases ordenadas por `order`) y cada
fase agrupa `Task` (tareas con responsable, fechas, estimacion, hito, criterios
de aceptacion, estado, progreso y evidencia). Entre tareas de un mismo plan hay
`TaskDependency` (predecesoras, grafo dirigido sin ciclos). Tablas fisicas:
`plans`, `plan_phases`, `tasks`, `task_dependencies`
(migracion `apps/api/prisma/migrations/20261008145320_fase3_plan`).

## Maquinas de estado

- **Request** (`RequestStateService`, unico escritor de `operationalState`):
  Fase 3 solo habilita dos aristas ya modeladas:
  `COMPROMETIDA → EN_PLANIFICACION` (al crear el plan) y
  `EN_PLANIFICACION → EN_EJECUCION` (al autorizar el plan).
- **Plan** (`PlanStatus`): `BORRADOR → EN_AUTORIZACION → AUTORIZADO`, con
  `EN_AUTORIZACION → DEVUELTO` y `DEVUELTO → EN_AUTORIZACION`. El estado del plan
  es read-only para el cliente; solo lo escribe el helper del backend.
- **Tarea** (`TaskStatus`): `POR_HACER`, `EN_CURSO`, `BLOQUEADA`, `EN_REVISION`,
  `TERMINADA`, con las transiciones de la tabla de §1.3 del diseno. La UI
  (`tareas-view.tsx`) solo ofrece las transiciones permitidas; el backend es el
  control real y rechaza con 409 cualquier transicion no permitida.

## Endpoints (bajo CurrentUserGuard + RolesGuard)

Gestion y envio del plan (roles `JEFE_AREA`, `LIDER_PROCESO`):

- `POST/GET/PATCH /requests/:requestId/plan`
- `GET /requests/:requestId/plan/guide`
- `POST /requests/:requestId/plan/submit`

Autorizacion del plan (capacidad `review`):

- `POST /requests/:requestId/plan/authorize`
- `POST /requests/:requestId/plan/return` (motivo obligatorio)

Fases: `GET/POST /plans/:planId/phases`,
`PATCH /plans/:planId/phases/reorder` (declarada antes que la parametrica),
`PATCH/DELETE /plans/:planId/phases/:phaseId`.

Tareas: `GET /plans/:planId/tasks`, `POST /phases/:phaseId/tasks`,
`GET/PATCH/DELETE /tasks/:id`, `PATCH /tasks/:id/status`,
`PATCH /tasks/:id/accept`, y la ruta propia `GET /my-work`.

Dependencias: `GET/POST /tasks/:id/dependencies`,
`DELETE /tasks/:id/dependencies/:predecessorTaskId`.

## Gates (resueltos server-side)

- **Guia de pendientes y envio (AC-007).** `GET .../plan/guide` enumera los
  pendientes por categoria (`datesPhases`, `tasksResponsibles`) y expone
  `canSubmit`. El envio solo procede con cero pendientes; si hay pendientes el
  backend rechaza con 409. La guia de `plan-view.tsx` deshabilita "Enviar"
  mientras `canSubmit=false` y, ante 409, recomputa y muestra los pendientes.
- **Regla de hito (BR-010/AC-011).** Un hito tiene una sola fecha efectiva y 0
  horas; la UI lo fuerza y el backend valida (400 si es incoherente).
- **Fase inicial protegida (AC-009) y borrado de fase con tareas (D12).** No se
  mueve ni se borra la fase de menor `order` cuando tiene tareas; en la UI el
  candado se explica (UI-04), no se presenta como error.
- **Dependencias.** Auto-dependencia, cruce de planes y ciclos → 400; duplicado
  → 409 (constraint compuesto). El gate de ejecucion impide pasar a `EN_CURSO`
  si alguna predecesora no esta `TERMINADA` y aceptada (AC-010/033); al recibir
  409, `tareas-view.tsx` muestra las predecesoras que bloquean.

## Frontend (apps/web, solo via @plantilla-portales/api-client)

- Wrappers tipados `src/lib/plan.ts`, `plan-phases.ts`, `tasks.ts`,
  `task-dependencies.ts`, `my-work.ts`, cada uno con clase de error de dominio
  (`PlanError`) y `messageForStatus` (400/403/404/409), siguiendo el patron de
  `requests.ts`. Los tipos salen de `components['schemas'][...]`; no se
  redeclara ningun contrato.
- Pantallas: SCR-06 `/seguimiento/plan` (`plan-view.tsx` + `phase-dialog.tsx` +
  `task-dialog.tsx`), SCR-09 `/seguimiento/tareas` (`tareas-view.tsx`), SCR-02
  `/mi-trabajo` (`mi-trabajo-view.tsx`).
- `/administracion/revision` suma una seccion de autorizacion de planes
  (`plan-authorization-section.tsx`) **sin** tocar la cola de compromiso de Fase
  2. Un usuario sin capacidad `review` no ve la seccion (filtrado cosmetico; el
  control real sigue server-side).
- Estados loading/vacio/error/exito en todas las vistas y AC-031 (los
  formularios conservan los valores ante error; solo se resetean en exito).

## Correccion tecnica: emision del schema del api-client a `dist/`

**Sintoma.** Al tipar el frontend contra el contrato, los tipos del paquete
`@plantilla-portales/api-client` colapsaban a `any` (p. ej. `task.predecessors`
quedaba sin tipar), lo que disparaba errores `noImplicitAny` en los `.map` de
las vistas nuevas.

**Causa.** `packages/api-client/dist/index.d.ts` reexporta `paths`, `components`
y `operations` desde `./generated/schema`, pero `tsc` no copia archivos `.d.ts`
de entrada hacia `outDir`. Como `dist/generated/schema.d.ts` no se generaba, el
import quedaba sin resolver y, con `skipLibCheck`, los tipos del contrato se
degradaban a `any` en todos los consumidores (incluido lo construido en Fase 2).

**Correccion (minima).** El script `build` de `packages/api-client` copia el
schema generado a `dist/generated/schema.d.ts` tras `tsc`
(`scripts/copy-schema.mjs`). Con esto, `paths`/`components`/`operations`
resuelven y el frontend queda tipado de verdad contra el contrato. No cambia
runtime (solo tipos) ni el contrato; `npm run contracts:generate` no deja
diffs.

## Configuracion de entorno y E2E

- `AUTH_MODE=dev-header` debe estar presente en el `.env` de la raiz del
  worktree para habilitar la identidad por cabecera y el selector dev. El `.env`
  no se versiona; `.env.example` ya documenta la variable.
- La suite E2E seedea el actor de desarrollo (`jefe@demo.local`) en
  `localStorage` mediante `e2e/global-setup.ts` + `storageState` en
  `playwright.config.ts`. Asi el navegador envia `X-Actor-Id` y la suite valida
  la autorizacion real del backend (sin esto, el backend responde 401, que es el
  comportamiento correcto ante una peticion sin actor).

## Fuera de alcance (ganchos documentados)

Las categorias de guia `capacity`, `evidenceGates` y `frameworkControls` existen
como ganchos que siempre devuelven cero pendientes (se encienden en fases
posteriores: Capacidad FEATURE-005, Frameworks FEATURE-008). Las vistas
Tablero/Cronograma/Carga del plan quedan diferidas (D14). La evidencia es un
campo URL/texto, no un modulo de documentos (D10).
