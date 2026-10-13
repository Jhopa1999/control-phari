# Revisión de diseño · Fase 2 · Flujo de Demanda (control-phari)

Revisor: subagente de revisión de diseño (lectura en frío del `design.md` Revisión 3).
Alcance: ambigüedad, vacíos, supuestos no verificados, viabilidad, scope creep, conflictos
internos, manejo de errores y validación — contrastado contra Fase 1, el SDD
(`specs/05/06/10/11/16/18/20/23/28/29`), el código real del worktree y el steering de arquitectura.

Método: se leyó el diseño completo y se verificó cada afirmación de reutilización contra el
código y los specs reales, no contra la palabra del documento. Las verificaciones concretas están
en las secciones "Supuestos verificados" y "Supuestos no verificados / incorrectos".

---

## Veredicto

**APPROVED.** 0 HIGH, 0 MEDIUM, 3 NIT.

El diseño cierra correctamente los seis objetivos del encargo:
(a) reutiliza Fase 1 sin rehacerla (patrón de módulo, `AuditService.record(tx,…)`, política
403/404, `MODULE_MATRIX`, scope en el `where`); (b) implementa SOLO las transiciones confirmadas
(registro→triage→prioridad→compromiso con devolver/rechazar) y modela —sin implementar— las
posteriores; (c) mantiene guardar/evaluar separado de aprobar (BR-006), reforzado por la
precondición de estado del gate de priorización; (d) aplica los gates server-side y la política
404 por alcance / 403 por rol; (e) documenta como DECISIÓN —no como hecho del Site— todo lo
marcado P (fórmula de prioridad 25/15/15/10/10/10/10/5, requeridos por fase, cola/estados de
aprobación); (f) audita toda mutación dentro de la `$transaction` con los nuevos `objectType`.

Las tres observaciones son NIT (precisión documental), no bloqueantes y sin bifurcación de
comportamiento que incumpla un requisito.

---

## Hallazgos

### NIT-1 — Ambigüedad: ¿quién escribe `operationalState = REGISTRADA` en el alta?

**Dónde:** §1.2 (nota de `operationalState`) vs. §1.3 (tabla de transiciones, fila "(alta) →
REGISTRADA" y párrafo "Validación de escritura del estado").

**Problema:** §1.2 dice que el `@default("REGISTRADA")` vive **únicamente** en el schema y que "el
service **no** lo repite al crear" — es decir, en el alta el estado lo pone el default de la BD,
no el helper. Pero §1.3 lista "(alta) → REGISTRADA" como una **transición implementada** y afirma
que "el único camino para escribir `operational_state` es un helper de transición en
`RequestStateService`", sin exceptuar explícitamente el `create`. Leído literalmente, las dos
frases se contradicen: o el alta pasa por el helper (y entonces el service sí escribe el estado,
contradiciendo §1.2) o el alta usa el default de la BD (y entonces no todo paso de estado pasa por
el helper, contradiciendo §1.3). La ambigüedad afecta a si el `CREATE` de la Request emite o no un
evento de transición de estado y a cómo se enuncia el invariante.

**Razón por la que es NIT y no mayor:** el comportamiento observable no cambia (la Request nace
`REGISTRADA` por cualquiera de los dos caminos y el `AuditEvent action=CREATE` ya se registra en
§6 con `after` que incluye el estado); es un conflicto de redacción entre dos secciones, no un
fork que incumpla un requisito.

**Fix concreto:** reescribir el párrafo de §1.3 para carvar el alta explícitamente, por ejemplo:
"La columna `operational_state` solo se escribe (a) por el `@default` del schema en el **alta** y
(b) por el helper de transición de `RequestStateService` en **toda mutación posterior**; nunca por
un `update` directo ni por el DTO. El alta no es una transición del helper: '(alta) → REGISTRADA'
describe el estado inicial, no una llamada al helper." Y en la tabla de §1.3, anotar la fila
"(alta) → REGISTRADA" con "(estado inicial por `@default`, no vía helper)".

### NIT-2 — Supuesto impreciso: forma del import del api-client en `apps/web`

**Dónde:** "Visión general" — "el frontend consume el backend exclusivamente vía
`@plantilla-portales/api-client` (el import real es `./api-client` que reexporta el paquete)".

**Problema:** verificado contra `apps/web/src/lib/api-client.ts`: ese archivo **no reexporta** el
paquete. Importa `createApiClient` y `components` de `@plantilla-portales/api-client`, construye
una instancia `api` y le monta un middleware `onRequest` que inyecta `X-Actor-Id`; además exporta
alias de tipos (`CatalogItem`, `Process`, …). La frase "reexporta el paquete" describe mal lo que
hace el módulo.

**Razón por la que es NIT:** la **sustancia** es correcta y está verificada (el frontend consume
solo vía el paquete generado desde OpenAPI; `X-Actor-Id` se inyecta por middleware sin recrear el
cliente; no se accede a Prisma/PostgreSQL). Solo la descripción del mecanismo de reexport es
inexacta; no cambia ninguna tarea de implementación.

**Fix concreto:** sustituir el paréntesis por: "el módulo `apps/web/src/lib/api-client.ts`
instancia `createApiClient(...)` del paquete y expone esa instancia `api` más alias de tipos; el
middleware `onRequest` inyecta `X-Actor-Id` desde `localStorage` (Fase 1 §5.3). No se reexporta el
paquete en bloque." Al añadir los wrappers `requests.ts`/`triage.ts`/… (§4), usar esa misma
instancia `api`.

### NIT-3 — Vacío: etiqueta de prioridad informativa (`priorityLabel`/`thresholdLabel`) sin tabla de mapeo explícita

**Dónde:** §1.4 (umbrales 80/65/50 + tramo `<50`), §3.4 (`priorityLabel`/`thresholdLabel` en los
response DTO) y §11 D7.

**Problema:** el diseño fija los cortes (`>=80`, `>=65`, `>=50`, `<50`) y la inclusividad `>=`
como DECISIÓN D7, pero **no** fija las **cadenas de etiqueta** que devuelve el backend para cada
tramo (p. ej. ¿"Muy alta/Alta/Media/Baja", "Prioridad 1..4", o reutiliza la familia `PRIORITY` del
seed de Fase 1?). `11-ui-behavior.md` SCR-05 solo confirma los umbrales; `20-master-data.md` tiene
una familia `PRIORITY` (Muy alta/Alta/Media/Baja) ya sembrada, lo que invita a dos lecturas
posibles del implementador. Al ser "solo etiqueta informativa sin efecto en transiciones", el
riesgo es bajo, pero la ausencia del literal es una decisión que el implementador tendría que
inventar.

**Razón por la que es NIT:** la etiqueta no dispara ninguna transición ni aprobación (verificado:
BR-005 "no se afirma que ≥80 se apruebe automáticamente"; `28` punto 4 cortes P), así que una
elección u otra no incumple ningún requisito ni rompe un gate; es un hueco de especificación
cosmético.

**Fix concreto:** añadir a §1.4/§3.4 el mapeo exacto, por ejemplo: "`priorityLabel`:
`score>=80 → 'Muy alta'`, `>=65 → 'Alta'`, `>=50 → 'Media'`, `<50 → 'Baja'`, derivada en backend;
es solo texto informativo del response (no persiste decisión) y NO se vincula a la familia
`PRIORITY` del catálogo (esa es una maestra administrable, no un derivado del score). Marcada como
parte de la DECISIÓN D7; reabrir si el Site confirma literales distintos." Fijar un único juego de
literales evita que la UI y el backend diverjan.

---

## Supuestos verificados

Cada ítem fue comprobado leyendo la fuente real (código del worktree o spec), no el diseño.

1. **`AuditService.record(tx, input)` y `AuditObjectType`** — verificado en
   `.worktrees/fase2-demanda/apps/api/src/modules/audit/audit.service.ts`. La firma es
   `record(tx: Prisma.TransactionClient, input: AuditRecordInput)` y hoy
   `AuditObjectType = 'PROCESS' | 'USER' | 'GRANT' | 'CATALOG_ITEM'`. El plan de §1.7 (ampliar el
   tipo con `REQUEST | TRIAGE | PRIORITY_EVALUATION | APPROVAL` sin tocar `action`) es exacto y
   viable: `object_type` se persiste como string, así que extender el tipo TS no requiere migración
   de datos.
2. **`AuditAction` no cambia** — verificado: `'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE'`. El diseño
   mapea aprobar/triage/evaluar como `CREATE` del sub-objeto + `UPDATE` de la Request; coherente.
3. **Scripts npm reales** — verificados en `apps/api/package.json`: `prisma:migrate:dev`,
   `prisma:migrate:deploy`, `prisma:generate`, `prisma:seed`. En el `package.json` raíz:
   `contracts:generate` (= `openapi:generate` + `api-client:generate`), `test:unit`, `test:e2e`.
   §1.6 (`npm run prisma:migrate:dev -- --name fase2_demanda`) y §3.6/§5 usan comandos existentes;
   no se inventan comandos ni se usa `db push`.
4. **Seed y constante `CATALOG_ITEMS`** — verificado en `apps/api/prisma/seed.ts`: existe la
   constante `CATALOG_ITEMS` y ya siembra `TRIAGE_DECISION` (Continuar/Devolver/Rechazar),
   `CRITICALITY`, `DATA_AVAILABILITY`, `DEMAND_TYPE` (y otras). El plan de §1.5 de **extender** esa
   constante con `TRIAGE_ROUTE` y `TRIAGE_SIZE` de forma idempotente es exacto. El seed ya usa
   `upsert` por `catalog_code_unique` y `findFirst` para uniques de un solo campo (confirma el
   hallazgo de Prisma 7 citado en §1.1/§10).
5. **Módulos existentes** — verificado: `apps/api/src/modules` contiene `audit, auth, catalog,
   grant, process, user`; **no** existe `request`, así que crear `request/` con submódulos (§3.2)
   no colisiona y respeta "monolito modular" (steering `10-backend-nestjs.md`).
6. **Steering de arquitectura** — verificado en `.worktrees/fase2-demanda/.kiro/steering/`:
   `10-backend-nestjs.md` (NestJS dueño de lógica/validación/autorización/persistencia; Prisma solo
   en apps/api; OpenAPI como contrato; api-client generado desde OpenAPI) y `40-datos-y-config.md`
   (PostgreSQL/Prisma estándar, migraciones versionadas, no modificar migración aplicada, datos de
   dev ficticios, secretos fuera del repo). El diseño cumple los cuatro ejes del encargo.
7. **Frontend solo vía api-client** — verificado en `apps/web/src/lib/api-client.ts`: se consume
   `@plantilla-portales/api-client` y se inyecta `X-Actor-Id` por middleware; no hay Prisma ni
   acceso directo a BD (ver matiz en NIT-2 sobre la palabra "reexporta").
8. **SDD · pesos y criterios de prioridad** — verificado en `11-ui-behavior.md` SCR-05 y BR-005:
   8 criterios Impacto 25 / Alineación 15 / Riesgo-control 15 / Urgencia 10 / Alcance 10 /
   Disponibilidad 10 / Viabilidad 10 / Reutilización 5. Los campos del diseño
   (`impact/alignment/riskControl/urgency/scope/dataAvailability/feasibility/reuse`) mapean 1:1 con
   esos pesos. Fórmula, redondeo, cortes inclusivos y "efecto de revaluar" están marcados P (BR-005,
   `28` punto 4, SCR-05 "No determinado"); el diseño los trata como DECISIÓN D7/D4, no como hecho.
9. **SDD · BR-006 (guardar ≠ aprobar)** — verificado en BR-006, SCR-05, SCR-20, `16` UC-003
   ("la autorización se ejecuta aparte"), `06` ("Evaluación guardada y aprobación son
   estados/acciones separados"). El diseño mantiene `POST .../priority` separado de
   `POST .../approval` y añade la precondición de estado (HIGH-2 de su propia revisión) que impide
   que re-guardar una evaluación revierta `COMPROMETIDA` — refuerzo correcto de BR-006.
10. **SDD · transiciones confirmadas vs. P** — verificado en `06-state-machines.md`: confirmadas
    Triage→priorización (Continuar), Triage→devolución (retorno exacto P), Triage→rechazo
    (terminal/reapertura P), Evaluación→aprobación (detalle de estados P); el resto
    (Plan/Ejecución/Validación/cierre/reapertura) P. El diseño implementa exactamente las
    confirmadas y solo **modela** (enum, sin acción) las posteriores (§1.3, §8). Correcto.
11. **SDD · FLOW-001 "Devolver requiere corrección" vs. `06` "retorno exacto P"** — verificado:
    `04-user-flows.md` dibuja `Triage --Devolver--> Solicitud`, pero `06` marca el retorno exacto
    como P. El diseño reconcilia esto (MEDIUM-4 de su revisión) adoptando `DEVUELTA` como estado
    sin salida implementada y declarándolo punto a reabrir. Es la opción conservadora correcta ante
    conflicto fuente-vs-fuente.
12. **SDD · roles/permisos y matriz** — verificado en `10-roles-permissions.md`: `triage`/`priority`
    = [Líder, Jefe]; `review` = [Líder, Jefe]; `requests` = los 3; `team`/`admin` = [Jefe];
    integrante no hace triage ni revisión (BR-020). El mapeo de §2.5 (`@Roles(JEFE_AREA,
    LIDER_PROCESO)` para triage/priority/review; `requests` para los 3 con alcance) coincide con la
    matriz. BR-001 ("principal siempre participa") confirmada en `10` y BR-001.
13. **SDD · política 403/404** — verificado: ningún spec fija códigos HTTP; AC-025/AC-026 y el
    control negativo 2 de `10` exigen "denegar sin filtrar datos". El diseño hereda de Fase 1 la
    DECISIÓN 403=rol / 404=alcance / 409=precondición de fase y lo etiqueta como decisión, no como
    requisito literal (§3.5, nota NIT-2 de §9). Alineado con Fase 1 §2.4.
14. **SDD · AC-001..006** — verificados en `18-acceptance-criteria.md` y mapeados correctamente en
    §9 (AC-001 título requerido; AC-002 candado por precondición de flujo; AC-003 decisión de
    triage + solo Continuar prioriza; AC-004 8 valores/score 0–100; AC-005 pendiente hasta
    autorización; AC-006 sin review → denegado sin mutación).
15. **SDD · requeridos de SCR-03** — verificado en `11-ui-behavior.md` SCR-03 y `29`: solo Título y
    Proceso principal son "Sí"; Área/Solicitante/Dueño/Objetivo/Enlace/Resultado "No confirmado";
    Estado operativo "Solo lectura/derivado". El diseño hace exactamente eso (campos opcionales,
    estado read-only fuera del DTO, BR-022) y no inventa requeridos P (`28` punto 3).
16. **SDD · maestras de triage (`20-master-data.md`)** — verificado: "tamaño" es familia de
    catálogo pero sin valores exactos listados; rutas BI/Integraciones/IA/FMAA confirmadas por
    BR-003. El diseño siembra `TRIAGE_ROUTE` con las 4 rutas confirmadas y `TRIAGE_SIZE` con una
    escala S/M/L/XL **marcada provisional** (D8), sin afirmar que sean los valores del Site. `20`
    prohíbe copiar valores de ruido ("aa"); el diseño lo respeta.
17. **SDD · SCR-20 cola de aprobación** — verificado en `11` SCR-20 y `28` punto 2: "Cola, campos
    de decisión, motivos, rechazo, devolución y reenvío exactos P". El diseño expone
    `GET /requests/pending-approval` restringido a `review` + alcance como DECISIÓN D6 (no entidad
    "cola", no reenvío/doble decisión), correctamente marcado P.
18. **SDD · FEATURE-002/003** — verificado en `23-feature-slices.md`: FEATURE-002 (Solicitud y
    triage, BR-001–004) y FEATURE-003 (Prioridad y revisión, BR-005/006) son exactamente el alcance
    de Fase 2. Sin scope creep hacia FEATURE-004+ (Plan/Tarea/Capacidad) — §8 los excluye
    explícitamente.
19. **Auditoría dentro de la transacción con `scopeProcessId = mainProcessId`** — coherente con la
    lectura por alcance de Fase 1: `AuditService.findMany` filtra por `scopeProcessId ∈
    scopedProcessIds` para líder/jefe (verificado en el código), así que los eventos de Fase 2 serán
    visibles al líder del proceso principal. El test NIT-8 de §5 cubre esta visibilidad.

---

## Supuestos no verificados / incorrectos

1. **"El import real es `./api-client` que reexporta el paquete"** — **incorrecto** (ver NIT-2). El
   módulo instancia y configura el cliente; no reexporta el paquete en bloque. La afirmación de
   fondo (consumo solo vía el paquete, inyección de `X-Actor-Id` por middleware) sí es correcta.

2. **Literales de `priorityLabel`/`thresholdLabel`** — **no especificados** por el diseño ni
   fijados por el SDD (ver NIT-3). No es un supuesto incorrecto, sino un hueco: el implementador
   debe elegir las cadenas de cada tramo; el diseño debería fijarlas para evitar divergencia UI↔API.

3. **Comportamiento de escritura del estado en el alta** — **ambiguo** entre §1.2 (default de BD) y
   §1.3 (solo vía helper) (ver NIT-1). No se pudo determinar desde el diseño cuál de los dos caminos
   es el canónico; ambos producen el mismo estado observable, pero la especificación debería elegir
   uno para que el invariante y la auditoría del `CREATE` queden sin ambigüedad.

Fuera de estos tres puntos, no se encontraron supuestos presentados como hecho que contradigan el
código real o el SDD. En particular, todas las afirmaciones de reutilización de Fase 1 (patrón de
módulo, `AuditService`, política 403/404, `MODULE_MATRIX`, scope en el `where`, hallazgo de uniques
de Prisma 7) y todas las marcas P (fórmula, requeridos por fase, cola/estados de aprobación,
retorno desde `DEVUELTA`, reapertura de triage, alcance por participante) fueron verificadas como
correctamente atribuidas a DECISIONES de Fase 2 y no a hechos del Site.
