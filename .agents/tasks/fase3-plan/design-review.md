# Revisión de diseño · Fase 3 · Plan y Ejecución (control-phari)

Revisión independiente del `design.md` (iteración 2) contra la especificación AS-IS
(`specs/05,06,11,18,19,23,28`), las convenciones verificadas de Fases 1–2 (código real en
`apps/api`) y el steering de arquitectura. El veredicto es **mecánico**: cualquier finding HIGH o
MEDIUM bloquea (→ `CHANGES_REQUESTED`); cero HIGH/MEDIUM → `APPROVED`.

Método: se leyó el `design.md` completo y se **verificó cada suposición contra la fuente real**
(código de `apps/api`, specs del SDD), no contra la palabra del diseño. Donde el diseño cita un
helper, un enum, una matriz o un patrón de fase previa, se abrió el archivo correspondiente.

---

## Resumen del veredicto

- **HIGH:** 0
- **MEDIUM:** 0
- **NIT:** 3
- **Veredicto:** **APPROVED** (0 HIGH, 0 MEDIUM).

El diseño resuelve la ambigüedad antes de implementar, no inventa nada de lo marcado `P`, y modela
correctamente los mecanismos exigidos por el brief. Las suposiciones críticas sobre el código
existente se verificaron una a una y son exactas. Los 3 findings son NIT (no bloquean).

---

## Findings

### 1. [NIT] La fila AC-007 de §9 depende de una lectura de "parcial" que un implementador podría malinterpretar como cobertura completa

**Dónde:** §9 (tabla de trazabilidad, fila `AC-007 (parcial)`), §2.1/§2.2, §7 (viñeta Frameworks).

**Qué:** AC-007 (`specs/18`) enumera como *Given* "Plan con fase/tarea/responsable/fecha/**control**
pendiente". El diseño implementa las categorías *fechas/fases* y *tareas/responsables* y **difiere**
las tres categorías de contenido `P` (capacidad, evidencias/puertas, controles de framework), que
en Fase 3 **nunca aportan pendientes** y por tanto **no gatean el envío**. La decisión es **correcta
y obligatoria** según el brief ("no inventar lo marcado `P`"): la matriz de controles es `P`
(`28` p.7; BR-016; AC-008/024), de modo que calcular un "control pendiente" sería afirmar reglas no
verificadas. El diseño es honesto: marca AC-007 como *parcial* y replica la nota en §6/§7.

El riesgo residual —y por eso es NIT, no cero— es puramente de **lectura**: la fila dice "parcial"
pero un implementador apurado podría leer "AC-007 cubierto". No es un defecto de diseño ni de
alcance; es claridad de trazabilidad.

**Fix concreto (documental, no cambia alcance):** en la fila AC-007 de §9, anteponer un marcador
inequívoco al inicio de la celda, p. ej.:
`**AC-007 — PARCIAL (2 de 5 categorías; rama "control pendiente" DIFERIDA a FEATURE-008, NO verificada en Fase 3)**`,
y en el plan de implementación añadir un TODO explícito "encender frameworkControls" ligado a
FEATURE-008. No se pide implementar la rama de control (sería inventar `P`).

---

### 2. [NIT] §1.5 llama a `RequestStateService` "único escritor de `operationalState`" aunque el helper no escribe

**Dónde:** §1.5 ("`RequestStateService` ya es el **único escritor** de `operationalState` con
`assertTransition`").

**Qué:** Verificado en `apps/api/src/modules/request/request-state.service.ts`:
`assertTransition(from, to)` **solo valida y devuelve** el estado destino; **no muta**. Quien escribe
`operationalState` es el service de dominio (`tx.request.update(...)`), como se ve en
`approval.service.ts`. El propio diseño lo aclara más abajo ("No muta por sí mismo"), pero la frase
"único escritor … con `assertTransition`" es imprecisa y podría inducir a un implementador a buscar
un `update` dentro del helper que no existe.

**Fix concreto:** reemplazar por "`RequestStateService.assertTransition` es el **único validador** de
las transiciones de `operationalState`; la escritura (`tx.request.update`) la hace el service de
dominio dentro de su `$transaction`, igual que `ApprovalService`/`TriageService`". El
comportamiento diseñado ya es el correcto; es solo redacción.

---

### 3. [NIT] La "precaución Prisma 7 / `findUnique`" sigue ocupando espacio como si fuera un hallazgo de peso

**Dónde:** §1.1, nota de `plan_request_unique` en §1.2, §12 D1, §13 Finding 2.

**Qué:** El diseño ya **suavizó** (iteración 2) la afirmación: la presenta como *precaución no
verificada en el repo* y señala que `findFirst` + `@@unique` como constraint es correcto se cumpla o
no la premisa. Verificado contra `schema.prisma`: las 1:1 efectivas de Fase 2 (`Triage`, `Approval`,
`PriorityEvaluation`) usan `@@index([requestId])`, **no** un `@@unique` de un solo campo consultado
por `findUnique`; y `package.json` confirma Prisma `^7.10.0`. Por tanto la premisa efectivamente no
tiene precedente en el repo. La decisión de usar `findFirst({where:{requestId}})` para `Plan` es
robusta y el `@@unique([requestId])` garantiza el 1:1 a nivel de BD. No hay defecto técnico.

El NIT es de **proporción editorial**: cuatro bloques del documento dedicados a una premisa que el
propio diseño reconoce como no verificada recargan la lectura y pueden hacer que un implementador
crea que hay un riesgo mayor del real.

**Fix concreto:** condensar a una sola nota en §1.1 ("por precaución y porque el repo no tiene
precedente de `findUnique` sobre `@@unique` de un solo campo, se resuelve `Plan` por `requestId` con
`findFirst`; el `@@unique` garantiza el 1:1") y referenciarla desde §1.2/§12 D1 sin repetir el
razonamiento completo. Mantener la prueba unit de §6 que fija el acceso elegido.

---

## Verified Assumptions (comprobadas contra la fuente real)

1. **`RequestState` contiene `COMPROMETIDA`, `EN_PLANIFICACION`, `EN_EJECUCION`.** Verificado en
   `apps/api/src/modules/request/request-state.ts` (enum completo de 15 estados). ✔
2. **`IMPLEMENTED_TRANSITIONS` NO incluye hoy las dos aristas de Fase 3.** Verificado: la lista
   actual llega hasta `BACKLOG_PRIORIZADO → COMPROMETIDA` y `BACKLOG_PRIORIZADO → EN_TRIAGE`; **no**
   existen `COMPROMETIDA → EN_PLANIFICACION` ni `EN_PLANIFICACION → EN_EJECUCION`. El diseño las
   **añade** (§1.5), que es exactamente lo necesario. ✔
3. **`RequestStateService.assertTransition(from: string, to: RequestState)` existe, valida contra
   `isImplementedTransition` y lanza `ConflictException` para transiciones no implementadas.**
   Verificado en `request-state.service.ts`. ✔
4. **`RequestModule` exporta `RequestStateService`.** Verificado (`exports: [RequestStateService]`),
   por lo que `PlanModule` puede reutilizarlo importando `RequestModule`. No se duplica la máquina de
   Request. ✔
5. **`ApprovalService` fija `COMPROMETIDA` al aprobar (`DECISION_TO_STATE.APROBAR`).** Verificado en
   `approval.service.ts`. El supuesto 1 del diseño (la Request llega a `COMPROMETIDA` por el flujo de
   Fase 2) es correcto. ✔
6. **Patrón 403 (rol) / 404 (alcance) de Fase 1.** Verificado en el design de Fase 1 (§2.4) y en el
   código: `@Roles`+`RolesGuard` → 403; alcance en el `where` del service + `NotFoundException` →
   404; `ProcessScopeGuard` es gancho futuro NO implementado. El diseño de Fase 3 (§2.8) sigue este
   patrón **exactamente** (resuelve el scope en el service subiendo `task→phase→plan→request.mainProcessId`).
   ✔
7. **`AuditService.record(tx, input)` con `AuditObjectType` =
   `PROCESS|USER|GRANT|CATALOG_ITEM|REQUEST|TRIAGE|PRIORITY_EVALUATION|APPROVAL` y `AuditAction` =
   `CREATE|UPDATE|DELETE|REVOKE`.** Verificado en `audit.service.ts`. La ampliación propuesta
   (`+ PLAN|PLAN_PHASE|TASK|TASK_DEPENDENCY`, sin tocar `AuditAction`) es un cambio aditivo correcto.
   El patrón "dos eventos en una `$transaction`" (UPDATE PLAN + UPDATE REQUEST) replica exactamente
   lo que hace `ApprovalService` (CREATE APPROVAL + UPDATE REQUEST). ✔
8. **`MODULE_MATRIX`:** `plan` = `[JEFE_AREA, LIDER_PROCESO]`; `review` = `[JEFE_AREA, LIDER_PROCESO]`;
   `task`/`assigned`/`project` = los 3 roles. Verificado en `module-matrix.ts`. La asignación de
   roles del diseño (gestión de plan `plan`; autorizar/devolver `review`; ejecutar tarea `task`;
   mi-trabajo `assigned`) es consistente con la matriz. ✔
9. **Patrón de orden de controllers (ruta estática antes que paramétrica).** Verificado en
   `request.module.ts` (`ApprovalController` antes que `RequestController` por
   `GET /requests/pending-approval` vs `GET /requests/:id`). El diseño de Fase 3 lo respeta eligiendo
   una ruta propia `GET /my-work` para evitar la colisión con `GET /tasks/:id`. ✔
10. **Las 5 categorías de la guía** (fechas/fases, tareas/responsables, capacidad, evidencias/puertas,
    controles de framework) son las de `BR-007` y `specs/11` SCR-06. Verificado literalmente. ✔
11. **5 estados de tarea confirmados, transiciones `P`.** `specs/06` ("Por hacer, En curso,
    Bloqueada, En revisión, Terminada; transiciones P") y `specs/11` SCR-09. El diseño adopta una
    máquina documentada (§1.3/§12 D7) sin afirmarla como del Site. ✔
12. **Gate de predecesoras = "terminada **y** aceptada".** `BR-009`, `AC-010/033`, `specs/11` SCR-06
    ("empieza tras completar y aceptar"). El diseño separa `status=TERMINADA` de `accepted=true`
    (§1.2/§2.7). ✔
13. **Hito = una fecha y cero horas.** `BR-010`, `AC-011`, `specs/11`. El diseño lo enforcea en el
    service (§2.4). ✔
14. **Fase inicial protegida con tareas.** `AC-009`, `specs/11` ("No se permite retirar la primera
    fase observada cuando tiene tareas"). El diseño: inicial = `order` mínimo, 409 si se borra/mueve
    con tareas (§2.5/§12 D4). ✔
15. **Dependencia circular = caso borde a validar.** `specs/19`. El diseño hace detección server-side
    antes de crear la arista (§2.3). ✔
16. **Prisma `^7.10.0` instalado** y 1:1 de Fase 2 con `@@index`, no `@@unique` de un solo campo.
    Verificado en `package.json` y `schema.prisma` (ver Finding 3). ✔

## Unverified / Wrong Assumptions

- **Ninguna suposición del diseño resultó falsa.** Todas las afirmaciones sobre el código existente
  (enum de estados, helper de transición, exportación del módulo, matriz de permisos, servicio de
  auditoría, patrón 403/404, orden de controllers, versión de Prisma y forma de las 1:1 de Fase 2)
  se comprobaron contra la fuente real y son exactas.
- **Elementos deliberadamente no verificables (correctamente marcados `P` y diferidos, no
  inventados):** fórmula de progreso ponderado por esfuerzo (§12 D9); semántica de controles de
  framework y la rama "control pendiente" de AC-007 (§2.2/§7); importación de Excel (§12 D11);
  estados exactos de revisión/devolución/autorización del plan (§12 D8); segregación
  emisor≠autorizador (§12 D8b); plantilla de 13 fases de BI como obligatoria (§12 D3); transiciones
  terminales de la Request (§1.4). En todos los casos el diseño adopta la opción mínima documentada y
  reversible, **sin presentarla como hecho del Site**, cumpliendo el mandato del brief (`28` P = no
  inventar). Esto es lo esperado y **no** constituye finding.
- **El design de Fase 2 (`fase2-demanda/design.md`) no existe en este worktree**; la revisión de las
  convenciones de Fase 2 se hizo contra el **código real** de `apps/api/src/modules/request/*`, que
  es la fuente autoritativa. No afecta el veredicto.

---

## Conclusión

El diseño es implementable sin tomar decisiones de arquitectura adicionales. Resuelve la ambigüedad
antes de implementar, no inventa nada de lo marcado `P`, modela correctamente el gate de envío, la
detección de ciclos, el gate de dependencias (TERMINADA Y ACEPTADA), la protección de fase inicial,
el hito (1 fecha / 0 h) y la separación envío ≠ autorización, y respeta el patrón 403/404 y la
arquitectura del steering (Prisma solo en `apps/api`; frontend solo vía api-client; NestJS dueño de
lógica/autorización; `RequestStateService` no duplicado; auditoría en transacción; TS estricto).

**0 HIGH, 0 MEDIUM, 3 NIT → APPROVED.**
