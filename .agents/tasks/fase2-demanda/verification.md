# Verificacion · Fase 2 · Flujo de demanda (FEAT-004 frontend + fix de routing)

Worktree: `.worktrees/fase2-demanda` · Rama: `feat/fase2-demanda` ·
Postgres de desarrollo en el puerto **5433** (`docker compose ps` → healthy).

Todos los comandos se corrieron desde el worktree con rutas absolutas y los
scripts reales de `package.json`.

## 1. Verificacion automatizada

| Comando | Resultado |
|---|---|
| `npm run typecheck` (api + api-client + web) | ✅ verde |
| `npm run build` (api + api-client + web, Next.js 16.4.0) | ✅ verde (25 rutas web, incluidas `/demanda/solicitudes`, `/demanda/triage`, `/demanda/priorizacion`, `/administracion/revision`) |
| `npm run test:unit` | ✅ 14 suites / 110 pruebas (antes 13/109; +1 suite y +1 prueba por la regresion de routing) |
| `npm run prisma:migrate status` | ✅ "Database schema is up to date!" (3 migraciones) |
| `npm run prisma:seed` (idempotente) | ✅ "Seed OK: 3 roles, 4 procesos, 4 usuarios, 7 grants, 45 maestras." |
| `npm run contracts:generate` | ✅ sin cambios semanticos; el unico diff es reordenamiento de paths en el JSON (mismos paths/operationIds/schemas), por lo que `openapi.json` y `schema.d.ts` committeados se mantienen |

### Regresion de routing fijada

- Nueva prueba: `apps/api/src/modules/request/request.module.spec.ts` afirma
  que `ApprovalController` (ruta estatica `GET /requests/pending-approval`) se
  registra **antes** que `RequestController` (ruta parametrica `GET
  /requests/:id`) en `RequestModule`.
- Comprobado reproduce → falla → fix → pasa: con el orden anterior la prueba
  **FAIL**; con el orden corregido **PASS**.
- Documentado en `docs/fase2-demanda.md`.

## 2. Verificacion manual con la API arrancada (`npm run start`, puerto 3001)

Actores sembrados (header `X-Actor-Id`):

- `jefe@demo.local` — JEFE_AREA en los 4 procesos (incluye `review`).
- `lider.bi@demo.local` — LIDER_PROCESO solo en FIBI (incluye `review`).
- `lider.ia@demo.local` — LIDER_PROCESO solo en FIAA (incluye `review`).
- `integrante.bi@demo.local` — INTEGRANTE en FIBI (sin `review`, sin triage/priority).

Proceso principal usado: FIBI (`10ab7e2b-5b8c-4918-8bb5-9e4c260d03f1`).

El frontend consume estos mismos endpoints exclusivamente via la instancia `api`
de `apps/web/src/lib/api-client.ts` (wrappers `requests.ts`/`triage.ts`/
`priority.ts`/`approval.ts`); nunca accede a Prisma ni a PostgreSQL.

### 2.1 Flujo feliz (crear → triage Continuar → priorizar → aprobar → Comprometida)

| Paso | Endpoint | Observado |
|---|---|---|
| Crear solicitud | `POST /requests` | estado `REGISTRADA`; `participants = 1` (proceso principal materializado, BR-001) |
| Triage Continuar | `POST /requests/:id/triage` | `decision = CONTINUAR`; estado de la solicitud → `EN_TRIAGE`; `currentTriageDecision = CONTINUAR` |
| Priorizar (8 criterios = 5) | `POST /requests/:id/priority` | `score = 100`, `thresholdLabel = "Muy alta"` (calculado en backend); estado → `BACKLOG_PRIORIZADO` |
| Cola de aprobacion | `GET /requests/pending-approval` | la solicitud aparece en la cola del alcance |
| Aprobar | `POST /requests/:id/approval` | `resultingState = COMPROMETIDA`; estado de la solicitud → `COMPROMETIDA`; sale de la cola |

### 2.2 SCR-20 end-to-end (cola de pendientes, alcance y rol `review`)

Con una solicitud de FIBI llevada a `BACKLOG_PRIORIZADO`:

| Actor | `GET /requests/pending-approval` | Resultado |
|---|---|---|
| `jefe@demo.local` | 200 | ve el item de FIBI (`count = 1`) |
| `lider.bi@demo.local` (review en FIBI) | 200 | ve el item de FIBI (`count = 1`) |
| `lider.ia@demo.local` (review en FIAA) | 200 | **no** ve el item de FIBI (`count = 0`) — aislamiento por alcance |
| `integrante.bi@demo.local` (sin review) | **403** | la cola no es accesible (AC-006) |

Tras `APROBAR` desde la cola, la solicitud pasa a `COMPROMETIDA` y la cola del
jefe vuelve a `count = 0`.

### 2.3 Gates negativos (sin mutacion)

| Caso | Endpoint | Codigo observado |
|---|---|---|
| Crear sin titulo | `POST /requests` | **400** |
| Priorizar sin triage=Continuar | `POST /requests/:id/priority` | **409** |
| Segundo triage sobre `EN_TRIAGE` (1:1 efectivo, HIGH-1) | `POST /requests/:id/triage` | **409** |
| Priorizar sobre `DEVUELTA` | `POST /requests/:id/priority` | **409** |
| Devolver (approval) sin motivo | `POST /requests/:id/approval` | **400** |
| Integrante registra triage | `POST /requests/:id/triage` (integrante) | **403** |
| Integrante consulta la cola | `GET /requests/pending-approval` (integrante) | **403** |
| Lider IA abre solicitud de FIBI (fuera de alcance) | `GET /requests/:id` (lider.ia) | **404** |

### 2.4 Devolucion de aprobacion → re-priorizar → re-aprobar (MEDIUM-3)

| Paso | Observado |
|---|---|
| Devolver con motivo | estado → `EN_TRIAGE` (no re-triage; triage sigue Continuar) |
| Re-priorizar | estado → `BACKLOG_PRIORIZADO` |
| Re-aprobar | estado → `COMPROMETIDA` |

## 3. Mapeo de errores en el frontend (AC-031 y estados UI)

- Wrappers (`requests/triage/priority/approval.ts`) traducen 400/403/404/409 a
  mensajes entendibles con su clase `*Error`, sin exponer JSON ni Prisma
  (patron de `src/lib/catalog.ts`).
- Las vistas implementan loading (Skeleton) / vacio (con accion de crear si el
  rol lo permite) / error (bloque con "Reintentar") / exito (toast de sonner),
  patron de `catalogs-view.tsx`.
- AC-031: el formulario solo se resetea en el camino de exito (200/201); ante
  fallo conserva valores, mantiene el dialog abierto y muestra el error en linea
  + toast (crear/editar solicitud, triage, evaluacion, aprobar/devolver).
- Accesibilidad: `<Label htmlFor>` en cada control, `aria-live="polite"` en las
  regiones de carga, `aria-current` en la navegacion por fases. (La conformidad
  WCAG plena requiere pruebas manuales con lectores de pantalla y revision
  experta; no se afirma aqui.)

## 4. Fase 1 operativa

`navigation.ts` sin cambios; `/catalogs`, `/gobierno/*` y
`/administracion/maestras` siguen compilando y operativos (build web con las 25
rutas en verde). El estado operativo de la solicitud es read-only en la UI
(badge, BR-022) y el proceso principal no se puede quitar de participantes
(BR-001).
