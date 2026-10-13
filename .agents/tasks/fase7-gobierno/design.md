# Fase 7 · Gobierno de la demanda — Diseño técnico

> Worktree: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase7-gobierno`.
> Fuente de verdad del dominio: `docs/marco-corporativo/FCGR-INS-008-v2.0.txt` (marco FCGR / INS-008 v2.0, Pharitech).
> Esta fase implementa el **ciclo de control corporativo general** del marco (secciones 4, 5, 6 y 7), **acotado al área Analítica** (procesos FIBI/FIID/FIAA + coordinación FMAA ya existentes). No se modela la estructura corporativa (Comité de Portafolio, Dirección, otras áreas) como entidades: las autoridades son texto/rol mapeados a los 3 roles existentes (JEFE_AREA, LIDER_PROCESO, INTEGRANTE).
> **Iteración 4** (tercera revisión aplicada). Las respuestas a cada hallazgo de `design-review.json` están al final (§10).

---

## 0. Resumen ejecutivo

La Fase 7 añade el **gobierno de la demanda** sobre el flujo ya construido en las Fases 2–6, sin reescribir la máquina de estados ni romper `/catalogs`, el flujo de demanda, ni los módulos de plan, capacidad, trabajo y activos. Se compone de cuatro bloques:

- **A. Ajuste de la fórmula de prioridad** (modifica Fase 2, módulo `request/priority/`): alinear umbrales/etiquetas con la sección 4 del marco. El cálculo del `score` ya produce el rango 20–100 correcto; solo cambian los **cortes de etiqueta** (P1/P2/P3/P4) y el **vocabulario** mostrado.
- **B. Ciclo de control GC1–GC5** (núcleo de la fase, sección 5): un módulo nuevo `governance/` que modela los 5 GateCheck por Request con su condición y autoridad del marco, los faltantes pendientes, y que GC4/GC5 **extienden** `RequestStateService` moviendo la Request por los estados que materializan las etapas 7–10 del marco (`EN_VALIDACION` → `LISTA_PARA_LIBERAR` → `EN_ESTABILIZACION` → `OPERATIVA` → `CERRADA`), que ya existen en el enum pero sin transiciones.
- **C. Evidencias y validaciones** (sección 7): registros de validación con los campos del marco y evidencias que pueden fijar una **versión concreta** (`DocumentVersion`) del expediente de Fase 6, no solo el `Document`. Un GC4 con defecto/evidencia bloqueante pendiente **no** puede aprobarse. Registrar evidencia ≠ aprobar el gate.
- **D. Rutas proporcionales** (sección 6): atributo `governanceRoute` de la Request (COMPLETA / SIMPLIFICADA / EXPLORACION) que determina qué controles son exigibles. Elección manual del líder; sin reclasificación automática.

Más la **pantalla de Gobierno/Cumplimiento** que convierte el placeholder `apps/web/src/app/administracion/frameworks/page.tsx`, que es el ítem **"Frameworks"** (`moduleKey: 'frameworks'`) del grupo de navegación **"Administracion"** en `navigation.ts`. No se añade ruta ni ítem de menú ni se toca el grupo "Gobierno" (que agrupa equipo/auditoría/mis-permisos).

El stack queda fijado al estándar del repositorio y de las fases previas: **NestJS + TypeScript estricto** en `apps/api`, **Prisma 7 (prisma-client)** sobre **PostgreSQL**, contrato **OpenAPI** regenerado a `packages/api-client`, **Next.js + TypeScript + Tailwind + shadcn/ui** en `apps/web`, **Jest** para unitarios. No se introduce infraestructura nueva (sin Redis/Kafka/Kubernetes); monolito modular.

---

## 1. Decisiones de modelado y su justificación frente al marco

### 1.1 Bloque A — Ajuste de la fórmula de prioridad (sección 4)

**Hallazgo verificado sobre el código actual** (`request/request-state.service.ts`, `request/priority/priority.service.ts`): la fórmula ya está correcta y produce el rango 20–100, **no** 0–100.

`computeScore` calcula `round( Σ peso_i · (calif_i / 5) )`, que es algebraicamente idéntico a la fórmula exacta del marco `round( Σ(peso_i · calif_i) / 5 )`:

- todas las calificaciones = 1 → `round(100/5) = 20` (mínimo),
- todas = 5 → `round(100) = 100` (máximo).

Los pesos en `PRIORITY_WEIGHTS` (impact 25, alignment 15, riskControl 15, urgency 10, scope 10, dataAvailability 10, feasibility 10, reuse 5) **coinciden** con los del marco. Por tanto **no hay cambio de fórmula ni de pesos ni del rango**: el prompt de la tarea asumió un 0–100 que el código no implementa. Esto se documenta explícitamente para la revisión.

**Lo que sí cambia** son los **umbrales de etiqueta** y el **vocabulario**. Fase 2 implementó cortes 80/65/50 con etiquetas "Muy alta / Alta / Media / Baja". El marco define cuatro tramos de **prioridad orientadora**:

| Puntaje | Prioridad orientadora (marco) | Decisión de planificación (marco) |
|---|---|---|
| 80 a 100 | **P1** | Primera consideración para compromiso |
| 65 a <80 | **P2** | Programación en el horizonte cercano |
| 45 a <65 | **P3** | Planificación ordinaria según capacidad |
| 20 a <45 | **P4** | Reserva de demanda, reformulación o cierre motivado |

Decisiones:

- **D-A1.** `priorityLabel(score)` cambia su corte inferior de **50 → 45** y pasa a devolver las etiquetas del marco. Se decide exponer **ambos**: el **código de banda** `P1..P4` (estable, para lógica/filtros) y una **glosa legible** (`"P1 · Primera consideración"`), para no perder la "decisión de planificación" del marco. El método se renombra conceptualmente a "banda de prioridad"; se conserva el nombre `priorityLabel` para no romper llamadas existentes (`approval.service.ts`, `priority.service.ts`) y se añade un helper `priorityBand(score): 'P1'|'P2'|'P3'|'P4'`. **Reversible**: el texto de la glosa es ajustable sin migración.
- **D-A2.** El `score` sigue calculándose en backend y persistiéndose en `PriorityEvaluation.score` (sin cambios de esquema). La banda/etiqueta es **derivada** (no se persiste): se calcula al leer. Esto evita datos redundantes que se desincronicen si se afina el vocabulario.
- **D-A3.** Se mantiene **BR-006**: guardar la evaluación **no** aprueba el compromiso. La aprobación sigue siendo la acción separada de `ApprovalService` (GC2, ver §1.2). El marco lo refuerza: "El puntaje orienta la decisión y no autoriza por sí mismo el inicio".
- **D-A4 (catálogo `PRIORITY`).** El seed ya tiene la familia `PRIORITY` con `MUY_ALTA/ALTA/MEDIA/BAJA`. Como es un catálogo orientador y la banda real es P1..P4, se **añaden** al seed las 4 bandas `PRIORITY_BAND` (P1..P4 con glosa), dejando `PRIORITY` como está para no romper nada que ya la consuma. **Reversible** (seed, sin migración de datos productivos).

- **D-A5 (corregir JSDoc desactualizado).** El JSDoc actual de `computeScore` en `request-state.service.ts` dice literalmente "Score ponderado **0-100**" y el de `priorityLabel` documenta cortes 80/65/**50**. Al tocar prioridad, actualizar ambos comentarios: `computeScore` → "Score ponderado **20-100**" (rango real) y `priorityLabel` → cortes **80/65/45** con el vocabulario P1–P4. Es corrección de documentación, no de lógica.

**Tests a actualizar** (obligatorio para "compila y pasa validaciones"). **Regla general (NIT-5):** al implementar hay que reemplazar **toda** aserción que compare `priorityLabel`/`thresholdLabel` contra un literal del vocabulario viejo ("Muy alta"/"Alta"/"Media"/"Baja") por la banda/etiqueta P1–P4 en los **tres** specs listados — no solo las aserciones citadas abajo, que son ejemplos verificados. El literal viejo desaparece por completo del backend.
- `request/priority/priority.service.spec.ts` y `request/request-state.service.spec.ts`: toda aserción sobre `priorityLabel` migra al vocabulario P1–P4; en particular el corte 45–49 (antes "Baja" con corte 50) pasa a **P3** por el nuevo corte inferior 45. El cálculo del `score` **no** cambia, así que las aserciones de `computeScore` (20/100 y casos intermedios) se mantienen. En `request-state.service.spec.ts` el `describe` real es `'priorityLabel (design §1.4 cortes 80/65/50)'`; renombrarlo a `'priorityLabel (design §1.1 cortes 80/65/45)'` al tocar el archivo (no solo las aserciones).
- `request/request.service.spec.ts`: verificado que asevera `expect(res.priorityLabel).toBe('Alta')` con `score=72`; con el vocabulario P1–P4, 72 cae en **P2** (65 a <80), así que esa aserción debe pasar a la nueva etiqueta/banda. Revisar el archivo completo por si hay más aserciones de etiqueta.
- `request/approval/approval.service.spec.ts`: si verifica `priorityLabel`/`thresholdLabel` en la cola de aprobación, migrar al vocabulario P1–P4.

**Único `computeScore` (NIT-4 confirmado):** se verificó que el único `computeScore` del backend está en `request/request-state.service.ts`; `priority.service.ts`/`approval.service.ts` solo lo invocan y consumen `priorityLabel` vía `thresholdLabel`, por lo que heredan el nuevo vocabulario automáticamente. El alcance de D-A5 (un solo archivo) es suficiente; no hay un segundo `computeScore` que corregir.

**Frontend (score/etiqueta).** La pantalla de priorización (`apps/web/src/app/demanda/priorizacion`) y la cola de aprobación ya muestran `score` + `priorityLabel` vía `currentScore`/`priorityLabel` del `RequestResponseDto` y `thresholdLabel` del `PriorityEvaluationResponseDto`. Tras regenerar el contrato esos campos siguen existiendo; solo cambia el **texto**. Se añade (opcional, cosmético) la banda `P1..P4` como badge. No hay cambio de forma del contrato salvo que se decida añadir un campo `priorityBand` al response (ver §3.4).

### 1.2 Bloque B — Ciclo de control GC1–GC5 (sección 5)

El marco define 5 puntos de control, cada uno con **condición para avanzar** y **autoridad**. El diseño los modela como un conjunto fijo de 5 `GateCheck` por Request.

| Gate | Condición (texto del marco) | Autoridad (texto del marco) | Mapeo con lo existente |
|---|---|---|---|
| **GC1 Admisión** | Información suficiente y asignación aceptada | Líder del área receptora; comité ante conflicto | **Triage/registro** (Fase 2): el triage CONTINUAR materializa la admisión |
| **GC2 Compromiso** | Prioridad, capacidad, patrocinio y horizonte registrados | Comité o líder con delegación vigente | **Aprobación de compromiso** (Fase 2 `ApprovalService`): lleva a `COMPROMETIDA` |
| **GC3 Ejecución** | Alcance aceptado; diseño, riesgos, recursos y pruebas preparados | Dueño funcional para alcance y líder técnico para solución | **Autorización del plan** (Fase 3): lleva a `EN_EJECUCION` |
| **GC4 Liberación** | Pruebas, aceptación, recuperación, comunicación y soporte listos antes de producción | Autoridad de cambios delegada; comité para cambios mayores o críticos | **NUEVO**: las etapas 7–8 del marco (Validación → Liberación) se materializan en los estados `EN_VALIDACION` → `LISTA_PARA_LIBERAR`; aprobar GC4 autoriza producción pasando a `EN_ESTABILIZACION` |
| **GC5 Cierre** | Estabilidad, transferencia, aceptación y expediente completos | Dueño funcional y responsable operativo; líder registra el cierre | **NUEVO**: las etapas 9–10 del marco (Estabilización → Cierre) se materializan en `EN_ESTABILIZACION` → `OPERATIVA` → `CERRADA` (aprobar GC5 cierra) |

**Decisiones:**

- **D-B1 (modelo explícito, no re-derivado).** Se crea un modelo `GateCheck` con una fila por `(requestId, gateCode)` para los 5 gates. Esto da una fila consultable con `status` (PENDIENTE/CUMPLIDO/NO_APLICA), condición, autoridad, faltantes y auditoría. La alternativa de "derivar GC1/GC2/GC3 del estado de la Request" se descarta: perdería la lista de faltantes y la autoridad concreta que el marco exige registrar, y haría imposible la regla de "controles pendientes". **Se elige el modelo explícito.**
- **D-B2 (no duplicar la máquina de estados).** La verdad del `operationalState` sigue siendo única: **solo** `RequestStateService` escribe `Request.operationalState`. GC4/GC5 **extienden** `RequestStateService` añadiendo transiciones a `IMPLEMENTED_TRANSITIONS` y la lógica de precondición en el nuevo `governance/` service. No se crea una segunda máquina de estados.
- **D-B3 (sincronización gate ↔ estado).** GC1/GC2/GC3 **reflejan** decisiones que ya ocurren en Fase 2/3; para no reescribir esos flujos, el `GateCheck` de GC1/GC2/GC3 se **materializa de forma perezosa (lazy)** al consultar o al operar gobierno sobre una Request: el `governance/` service lee el estado real (triage CONTINUAR, Approval APROBAR, Plan autorizado) y **deriva** el `status` de GC1–GC3, persistiéndolo. Así el expediente de gobierno queda completo sin tocar `ApprovalService`/`PlanService`. GC4/GC5 sí se aprueban desde el nuevo módulo. **Importante (NIT-6):** GC1–GC3 **no** se aprueban desde `governance/`; su `status` se **deriva** de decisiones ya tomadas en Fase 2/3 (triage, Approval, Plan autorizado) y por tanto `governance/` nunca expone un endpoint de "aprobar GC1/GC2/GC3". Su `authorityText` conserva el texto literal del marco —incluida la **autoridad doble de GC3** (dueño funcional + líder técnico)— solo como registro del expediente; esa autoridad doble queda representada operativamente por la autorización del plan de Fase 3 (que ya exige la capacidad `review`). **Reversible**: el momento de materialización (lazy vs. hook en los services de Fase 2/3) se puede cambiar sin alterar el contrato externo.
- **D-B4 (nuevas transiciones y su disparador).** Se añaden a `IMPLEMENTED_TRANSITIONS` (`request/request-state.ts`) las seis parejas siguientes. **Cada transición tiene un disparador explícito** (endpoint + capacidad en §3.4): las de **preparación** NO las dispara `approve` (son acciones previas del equipo), y las de **aprobación de gate** sí las dispara `approve` de GC4/GC5.

  | Transición | Disparador (endpoint §3.4) | Tipo |
  |---|---|---|
  | `EN_EJECUCION → EN_VALIDACION` | `POST .../gates/GC4/request-validation` (capacidad `review`) | preparación |
  | `EN_VALIDACION → LISTA_PARA_LIBERAR` | `POST .../gates/GC4/mark-ready` (capacidad `review`; recomputa: ninguna `blocking` sin resolver **y** validación obligatoria de la ruta presente, §1.5) | preparación |
  | `LISTA_PARA_LIBERAR → EN_ESTABILIZACION` | `POST .../gates/GC4/approve` (**autoridad**, autorización previa a producción) | aprobación GC4 |
  | `EN_ESTABILIZACION → OPERATIVA` | `POST .../gates/GC5/confirm-stabilization` (capacidad `review`; servicio verificado, recepción operativa) | preparación |
  | `OPERATIVA → CERRADA` | `POST .../gates/GC5/approve` (**autoridad**, cierre) | aprobación GC5 |

  **No** se añade ninguna transición hacia/desde `BLOQUEADA` (ver D-B7): el bloqueo se modela como condición transversal, no como estado operativo.

  `OPERATIVA → RETIRADA` se deja **fuera** de Fase 7 (retiro = sección 8, decisión reversible: no se habilita todavía).

  Por qué dos tipos de disparador (y no solo `approve`): el marco separa las **etapas** (preparar validación, dejar listo, confirmar estabilización — trabajo del ejecutor/equipo) de los **puntos de control** (GC4/GC5 — acto de la autoridad). Modelar la preparación como `approve` fusionaría ambas cosas y haría que una Request nunca alcanzara `LISTA_PARA_LIBERAR` (precondición de GC4) ni `OPERATIVA` (precondición de GC5). Por eso las de preparación son endpoints propios con capacidad `review` (no autoridad), y solo GC4/GC5 se "aprueban". Se descartó la **alternativa** de un endpoint único `advance` con mapa `STATE_TO_NEXT` server-side porque mezclaría transiciones con semánticas distintas (preparación vs. autorización) bajo una sola capacidad, perdiendo el control de autoridad diferenciado de GC4/GC5; **se eligen endpoints explícitos por acción**. La precondición de fase de cada transición (p. ej. "no hay evidencia bloqueante" para `mark-ready`/`approve` de GC4) la aplica el `GovernanceStateService` antes de llamar a `assertTransition`.
- **D-B5 (regla de controles pendientes).** Si un gate no se cumple, se registra en `GatePendingItem` (qué falta, quién lo resuelve, fecha de revisión). La Request **permanece en su etapa** (no se llama a `assertTransition`). La UI puede listar los pendientes. "Se pueden adelantar tareas independientes": no se bloquea la operación de otros módulos (plan/trabajo) por tener un gate pendiente; el gate solo bloquea **su propio avance de estado**. Esta separación es intencional y se documenta.
- **D-B6 (autoridad = rol, no entidad).** La `authority` de cada gate es **texto** del marco (campo `authorityText`), y la validación de "quién puede aprobar" se mapea a los roles existentes. **Mecanismo real de autorización (MEDIUM-2):** la barrera se impone exactamente como en `ApprovalController`/`PlanController`, con `@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(RoleCode...)` sobre cada endpoint, más el alcance por proceso en el service. Las "capacidades" que el diseño menciona son **convención de documentación**, no un guard: se materializan así —
  - **`review`** ≡ `@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)` (aprobar gate, preparación, pendientes, ruta, bloqueo),
  - **`frameworks`** ≡ `@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE)` (lectura y registro de validaciones).

  `MODULE_MATRIX`/`allowedModulesFor` **no** es un guard: su único uso es `me.controller.ts` para filtrar el menú (cosmético). Por tanto la separación "leer / registrar validación / aprobar GC4" no es una capacidad granular sino **tres conjuntos de `@Roles` sobre endpoints distintos** + el `GovernanceScopeService`. Un gate cuya autoridad es "comité" o "autoridad de cambios delegada" se mapea a **JEFE_AREA** (jefe de área) o **LIDER_PROCESO** según el gate (patrón de `ApprovalService`/`PlanService`). Se documenta que "comité" → jefe de área en este alcance. El endpoint de aprobación (`POST .../approve`) solo opera sobre **GC4 y GC5** (los gates nuevos); GC1–GC3 se derivan y no se aprueban por ese endpoint (ver D-B3). **Reversible**: el mapeo autoridad→rol vive en una constante del service.
- **D-B7 (Bloqueo = condición transversal, NO estado — MEDIUM-1).** El marco §9 ("Estados comunes") es explícito: *"'Pendiente de información' y 'Bloqueado' son condiciones transversales con acción y fecha; **no borran el estado** ni detienen por sí mismas el cómputo de tiempos."* Modelar `BLOQUEADA` como una transición de `operationalState` (que **reemplaza** `EN_EJECUCION`) contradice el marco: borraría el estado subyacente y solo sería representable desde/hacia ejecución. Se **descarta** usar `BLOQUEADA` como estado operativo en Fase 7. En su lugar, el bloqueo se modela como un **flag transversal aditivo** de la Request que **convive** con el estado real y aplica en cualquier etapa: `blockedReason String?`, `blockedAt DateTime?`, `blockedByUserId` (quién bloqueó) y `blockedResolvedAt`/`blockedResolvedByUserId` para el desbloqueo (sin borrado físico; se conserva la traza). El `operationalState` **no cambia** al bloquear ni al desbloquear, así que una Request bloqueada en validación o estabilización sigue siendo representable y el desbloqueo no asume un retorno fijo a `EN_EJECUCION`. Se documenta que el flag **no** detiene el cómputo de tiempos (fiel al marco). El enum `RequestState.BLOQUEADA` **se deja en el enum** (ya existe, no se elimina para no romper nada) pero **sin transiciones** en `IMPLEMENTED_TRANSITIONS`: queda como valor histórico sin uso operativo en Fase 7, decisión reversible (R5) por si una fase futura decidiera, documentando la divergencia, convertirlo en estado. Los endpoints `block`/`unblock` pasan a **mutar el flag** (no el estado), con `blockReason` requerido al bloquear.

**Renuncia explícita (autoridad GC4 y GC5).** El marco §5 da a GC4 dos autoridades según severidad: "Autoridad de cambios delegada; **comité para cambios mayores o críticos**". El diseño de Fase 7 **no distingue** cambio mayor/crítico para el enrutamiento de la autoridad: tanto "autoridad de cambios delegada" como "comité para cambios mayores o críticos" se mapean a **JEFE_AREA** (con el líder del proceso principal admitido donde el gate lo permite). La distinción por criticidad/complejidad (que existe como concepto en el marco §3 y en el dominio `Triage`) queda **fuera del alcance de Fase 7**; el `authorityText` conserva el texto literal del marco como registro del expediente, pero no cambia el enrutamiento. Es una simplificación consciente, **reversible (R3)**: cuando se requiera, un gate GC4 sobre una Request de criticidad crítica podrá exigir JEFE_AREA (comité) frente a un cambio menor que admita el líder delegado, afinando el mapeo en la constante del service sin tocar el modelo.

De forma **idéntica para GC5** (hallazgo NIT-6): el marco da a GC5 la autoridad "Dueño funcional y responsable operativo; líder registra el cierre". Fase 7 aprueba GC5 por **`review`** (resuelto en el código como `@Roles(JEFE_AREA, LIDER_PROCESO)`, ver D-B6/MEDIUM-2): el "dueño funcional y responsable operativo" y el acto administrativo de "líder registra el cierre" se conservan como `authorityText` del expediente, **no** como enrutamiento de rol diferenciado. Es la **misma renuncia consciente y reversible (R3)** que GC4: no se modela la figura "dueño funcional/responsable operativo" como entidad ni como rol propio, coherente con "no modelar la estructura corporativa".

**Lección aplicada (1):** el alcance por ROL usa `actor.grants[].roleCode === LIDER_PROCESO`, no `scopedProcessIds.size`. Se verificó que `KnowledgeScopeService.requireProcessManager(actor, asset)` opera sobre un `Asset` (`asset.processId`) y **no es reutilizable tal cual** sobre una Request. Por eso `GovernanceScopeService` **escribe un método nuevo**, `requireRequestManager(actor, request)`, que resuelve el proceso desde `request.mainProcessId` (jefe ⇒ ok; líder del proceso principal de la Request ⇒ ok; si no ⇒ 403), más un `requireAreaLead(actor)` para los gates cuya autoridad "comité/cambios mayores" se mapea a **JEFE_AREA**.

### 1.3 Bloque C — Evidencias y validaciones (sección 7)

El marco (sección 7) define 6 tipos de validación y los campos mínimos de cada prueba. Modelado:

- **D-C1 (`ValidationRecord`).** Una fila por prueba registrada, con los campos exactos del marco: `validationTypeCode` (familia `VALIDATION_TYPE`), `testCase` (caso), `version`, `environment` (ambiente), `executedByUserId` (ejecutor), `executedAt` (fecha), `resultCode` (familia `VALIDATION_RESULT`), `evidenceRef`/`evidenceDocumentId` (evidencia), `blocking` (defecto bloqueante sí/no), `notes`. Pertenece a la Request (`requestId`) y opcionalmente a un gate (`gateCheckId`, típicamente GC4).
- **D-C2 (evidencia vinculada a documento versionado, BR-016).** En el esquema de Fase 6 el contenido y el número de versión viven en `DocumentVersion`; `Document` solo tiene `currentVersionId` (puntero móvil a la última versión). Para que la evidencia sea trazable a un **estado inmutable** (marco §7 exige "versión … y evidencia" por prueba, y §9 "no se modifica retrospectivamente la evidencia de cierre"), apuntar solo a `Document` dejaría la evidencia señalando un blanco móvil. Se decide la **opción aditiva**: `ValidationRecord` lleva **ambas** FK opcionales — `evidenceDocumentId` → `Document` (`onDelete: Restrict`, para localizar el documento) y `evidenceDocumentVersionId` → `DocumentVersion` (`onDelete: Restrict`, **fija la versión exacta** que fue la evidencia). Si la evidencia es una URL/nota externa, se usa `evidenceRef` (texto). Se decide **FK a Document + FK a DocumentVersion + texto alternativo** en vez de obligar documento, porque el marco admite "evidencia en el mismo registro de la demanda" para rutas livianas. Al registrar, si se envía `evidenceDocumentVersionId` el service valida que su `documentId` coincida con `evidenceDocumentId` (coherencia). El campo `version` del `ValidationRecord` es la versión **de la solución probada** (del marco), distinto de la versión del documento de evidencia. **Reversible** (se eligió la opción aditiva sobre cambiar la FK a solo `DocumentVersion`, para conservar la navegación al documento padre).
- **D-C3 (regla clave BR-008/AC-008 — importar ≠ aprobar).** Registrar un `ValidationRecord` **no** cambia el estado de ningún gate ni de la Request. La aprobación del gate es una acción separada de la **autoridad** (D-B6). "La aceptación funcional no sustituye la aprobación técnica ni la autorización de producción; ninguna aceptación se presume por silencio." Esto se materializa así:
  - crear/editar validaciones es una capacidad distinta de aprobar GC4;
  - **GC4 no puede aprobarse** si existe algún `ValidationRecord` con un defecto **bloqueante sin resolver** (`blocking = true AND blockingResolved = false`, D-C5), **o** si falta al menos una validación obligatoria según la ruta (tabla de obligatoriedad en §1.5). El `governance/` service recomputa esta condición en el momento de `mark-ready` y de `approve` (fuente de verdad server-side, patrón `PlanGuideService`).
- **D-C4 (defecto no bloqueante).** El marco permite dejar un defecto no bloqueante "con riesgo aceptado, responsable y fecha": se modela como un `GatePendingItem` del gate (reutiliza la estructura de pendientes), no como un campo nuevo. **Reversible.**
- **D-C5 (ciclo de vida del defecto bloqueante — cómo se "resuelve").** El defecto **bloqueante** vive en el propio `ValidationRecord` (`blocking = true`), no como `GatePendingItem`. Para que "sin resolver" sea determinista y GC4 no quede bloqueado para siempre, `ValidationRecord` lleva `blockingResolved Boolean @default(false)`, `blockingResolvedAt DateTime?` y `blockingResolvedByUserId` (quién lo levantó, para auditoría y trazabilidad; coherente con el "sin borrado físico" heredado: no se edita ni borra el registro original, solo se marca resuelto). La **condición de bloqueo de GC4** es exactamente `blocking = true AND blockingResolved = false`; cuando todos los bloqueantes están resueltos, GC4 deja de estar bloqueado por este motivo. El bloqueo se levanta con el endpoint `PATCH /requests/:id/validations/:validationId/resolve-blocking` (capacidad `review`), que setea los tres campos dentro de su `$transaction` y audita un `UPDATE` sobre `VALIDATION_RECORD`. Resolver el bloqueo **no** aprueba GC4 ni cambia el estado de la Request (sigue BR-008); solo retira un impedimento. Se descartó la alternativa de "superar el bloqueante con un `ValidationRecord` posterior aprobatorio" porque exigiría una regla de superación no determinista (¿qué registro gana?); el flag explícito es inequívoco y testeable. **Reversible** (R12): el mecanismo de resolución vive en campos aditivos del modelo.

### 1.4 Bloque D — Rutas proporcionales (sección 6)

- **D-D1 (campo nuevo `governanceRoute`, NO se reutiliza `Triage.routeCode`).** `Triage.routeCode` ya existe y usa la familia `TRIAGE_ROUTE` (BI/INTEGRACIONES/IA/MULTIPROCESO): es la **ruta de proceso/disciplina**, un concepto **distinto** de la **ruta proporcional** del marco (COMPLETA/SIMPLIFICADA/EXPLORACION). Reutilizar ese campo mezclaría dos ejes ortogonales. Se decide **añadir** un campo nuevo. Para no sobrecargar el `Triage`, se añade `Request.governanceRoute` (string, catálogo `GOVERNANCE_ROUTE`, **nullable** hasta que el líder lo elija). **Reversible** (se documenta la alternativa de colgarlo del Triage).
- **D-D2 (la ruta determina los controles exigibles).**
  - **COMPLETA** → los 5 controles exigibles (GC1–GC5).
  - **SIMPLIFICADA** → controles aligerados: GC1, GC2 y GC5 exigibles; GC3/GC4 pueden marcarse `NO_APLICA` **documentando la elección** (`GateCheck.waiverReason`, requerido para pasar a NO_APLICA en ruta simplificada). "El líder documenta su elección."
  - **EXPLORACION** → el resultado **no queda autorizado para producción**: GC4 (liberación) se fuerza a `NO_APLICA` y la Request **no** puede pasar a `OPERATIVA`/producción por esta vía; cierra con evidencia de su resultado (como permite la sección 9: "Las rutas sin despliegue registran la no aplicabilidad y cierran con evidencia").
- **D-D3 (sin reclasificación automática).** No se implementa ninguna regla de reclasificación automática. Cambiar `governanceRoute` es una acción **manual** del líder (endpoint dedicado, auditada). El marco: "Si aumenta el riesgo, se reclasifica antes de continuar" (acción manual). Se documenta.
- **D-D4 (NO SLA, NO catálogo de servicios completo).** Las secciones 8/9 (operación, indicadores, niveles de servicio) **no** se implementan aquí (son Fase 8). Esta fase solo lleva la Request hasta `CERRADA` con el expediente de gates/validaciones.

### 1.5 Validaciones obligatorias por ruta para aprobar GC4 (regla determinista)

El bloqueo de GC4 "si falta al menos una validación obligatoria según la ruta" necesita un conjunto obligatorio **explícito y determinista** para ser testeable. El marco §5 dice que "su profundidad depende del riesgo y la complejidad", así que **no** se exigen siempre los 6 tipos; se fija el mínimo verificable y el resto queda **recomendado** (no bloqueante):

| Ruta | Condición obligatoria para aprobar GC4 |
|---|---|
| **COMPLETA** | Existe al menos un `ValidationRecord` de tipo `FUNCIONAL_ACEPTACION` con `resultCode` aprobatorio (`APROBADA` o `APROBADA_CON_OBSERVACIONES`), **y** no existe ningún `ValidationRecord` con `blocking = true AND blockingResolved = false` (defecto bloqueante sin resolver, D-C5). (Los demás tipos del marco —componente/integración, regresión, información, acceso/seguridad, rendimiento/continuidad— son **recomendados**: la UI los sugiere pero no bloquean.) |
| **SIMPLIFICADA** | Existe al menos un `ValidationRecord` de tipo `FUNCIONAL_ACEPTACION` con `resultCode` aprobatorio, **y** no existe ningún `ValidationRecord` con `blocking = true AND blockingResolved = false` (D-C5). (GC4 puede además marcarse `NO_APLICA` con `waiverReason`, D-D2; en ese caso la obligatoriedad no aplica.) |
| **EXPLORACION** | **N/A** — GC4 se fuerza a `NO_APLICA` (D-D2); no es aprobable y no autoriza producción. |

- **D-C3b (resultado aprobatorio).** "Aprobatorio" = `resultCode` ∈ {`APROBADA`, `APROBADA_CON_OBSERVACIONES`}. Un `FALLIDA`/`BLOQUEADA` no cuenta como validación obligatoria satisfecha. El flag `blocking` es ortogonal al `resultCode` (D-C1/D-C4): cualquier `blocking = true AND blockingResolved = false` (D-C5) bloquea GC4 con independencia de la ruta. **Reversible**: ampliar el conjunto obligatorio por ruta se hace en una constante del service sin migración.

Esta tabla es la fuente de la aserción del spec "GC4 bloqueado por validación obligatoria faltante según ruta" (§6) y es evaluada **server-side** en el momento de aprobar.

---

## 2. Modelo de datos (Prisma)

Todos los modelos nuevos siguen las convenciones heredadas: `id` UUID `@default(uuid()) @db.Uuid`, `@map` snake_case, `created_at`/`updated_at`, índices por FK, enums lógicos como `String` validados en el service (no `enum` de Postgres, consistente con el resto del esquema), catálogos por `code` (String) validados contra `CatalogItem`, **sin borrado físico**.

### 2.1 Enum lógico de gates (TypeScript, no Prisma)

Nuevo archivo `apps/api/src/modules/governance/gate.ts` (análogo a `request-state.ts` / `asset-status.ts`):

```ts
export enum GateCode { GC1 = 'GC1', GC2 = 'GC2', GC3 = 'GC3', GC4 = 'GC4', GC5 = 'GC5' }
export enum GateStatus { PENDIENTE = 'PENDIENTE', CUMPLIDO = 'CUMPLIDO', NO_APLICA = 'NO_APLICA' }
export const GATE_ORDER: readonly GateCode[] = [GateCode.GC1, GateCode.GC2, GateCode.GC3, GateCode.GC4, GateCode.GC5];
// Texto de condición/autoridad del marco por gate (constante del dominio, no configuración):
export const GATE_DEFINITIONS: Record<GateCode, { title: string; conditionText: string; authorityText: string }> = { /* valores exactos del marco, §1.2 */ };
```

Condición y autoridad son **constantes de dominio** (texto literal del marco), no configuración de ambiente (regla de la steering "Datos y configuración").

### 2.2 Modelo `GateCheck`

```prisma
/// Punto de control del ciclo de gobierno (Fase 7 · marco FCGR §5). Una fila por
/// (requestId, gateCode) para los 5 gates. `status` es enum logico GateStatus
/// read-only: solo lo escribe el GovernanceStateService dentro de su $transaction.
model GateCheck {
  id             String    @id @default(uuid()) @db.Uuid
  requestId      String    @map("request_id") @db.Uuid
  gateCode       String    @map("gate_code")          // GateCode (GC1..GC5)
  status         String    @default("PENDIENTE")       // GateStatus
  conditionText  String    @map("condition_text")      // texto del marco (snapshot)
  authorityText  String    @map("authority_text")      // texto del marco (snapshot)
  waiverReason   String?   @map("waiver_reason")       // requerido para NO_APLICA en ruta SIMPLIFICADA/EXPLORACION
  decidedAt      DateTime? @map("decided_at")
  decidedByUserId String?  @map("decided_by_user_id") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  request      Request            @relation(fields: [requestId], references: [id], onDelete: Cascade)
  decidedBy    User?              @relation("GateCheckDecider", fields: [decidedByUserId], references: [id], onDelete: Restrict)
  pendingItems GatePendingItem[]
  validations  ValidationRecord[]

  @@unique([requestId, gateCode], name: "gate_check_request_gate_unique") // compuesto -> usable en findUnique/upsert (Prisma 7, §1.1)
  @@index([requestId])
  @@index([status])
  @@map("gate_checks")
}
```

Nota Prisma 7 (lección 5): el `@@unique` **compuesto** `(requestId, gateCode)` sí sirve para `findUnique`/`upsert` (se usará para materializar lazy GC1–GC3). Un `@@unique` de **un solo** campo con `name` custom NO serviría; aquí no aplica porque es compuesto.

### 2.3 Modelo `GatePendingItem`

```prisma
/// Faltante registrado de un gate no cumplido (marco §5 "Controles pendientes"):
/// que falta, quien lo resuelve y la fecha de revision. Tambien modela el
/// defecto no bloqueante con riesgo aceptado (marco §7, D-C4). Append-only para
/// el alta; se cierra con resolvedAt (soft, sin borrado).
model GatePendingItem {
  id            String    @id @default(uuid()) @db.Uuid
  gateCheckId   String    @map("gate_check_id") @db.Uuid
  description   String                                   // "lo que falta"
  ownerUserId   String?   @map("owner_user_id") @db.Uuid // "quien lo resuelve"
  reviewDate    DateTime? @map("review_date") @db.Date   // "fecha de revision"
  resolved      Boolean   @default(false)
  resolvedAt    DateTime? @map("resolved_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  gateCheck GateCheck @relation(fields: [gateCheckId], references: [id], onDelete: Cascade)
  owner     User?     @relation("GatePendingOwner", fields: [ownerUserId], references: [id], onDelete: Restrict)

  @@index([gateCheckId])
  @@index([resolved])
  @@map("gate_pending_items")
}
```

### 2.4 Modelo `ValidationRecord`

```prisma
/// Registro de una prueba/validacion (marco §7). Campos minimos exactos del
/// marco: caso, version, ambiente, ejecutor, fecha, resultado y evidencia.
/// `blocking` marca defecto bloqueante (impide liberar GC4). La evidencia puede
/// fijar una VERSION concreta de Fase 6 via `evidenceDocumentVersionId` (BR-016,
/// evidencia inmutable §9) ademas de apuntar al `Document` padre, o ser texto.
model ValidationRecord {
  id                        String    @id @default(uuid()) @db.Uuid
  requestId                 String    @map("request_id") @db.Uuid
  gateCheckId               String?   @map("gate_check_id") @db.Uuid     // normalmente el GC4
  validationTypeCode        String    @map("validation_type_code")       // familia VALIDATION_TYPE
  testCase                  String    @map("test_case")                  // "caso"
  version                   String?                                       // "version" de la solucion probada
  environment               String?                                       // "ambiente"
  resultCode                String    @map("result_code")                // familia VALIDATION_RESULT
  blocking                  Boolean   @default(false)                     // defecto bloqueante
  blockingResolved          Boolean   @default(false) @map("blocking_resolved")   // D-C5: defecto bloqueante levantado
  blockingResolvedAt        DateTime? @map("blocking_resolved_at")                // cuando se resolvio
  blockingResolvedByUserId  String?   @map("blocking_resolved_by_user_id") @db.Uuid // quien lo resolvio
  evidenceRef               String?   @map("evidence_ref")                // URL/nota libre
  evidenceDocumentId        String?   @map("evidence_document_id") @db.Uuid         // FK opcional a Document (Fase 6)
  evidenceDocumentVersionId String?   @map("evidence_document_version_id") @db.Uuid // FK opcional a DocumentVersion (fija la version inmutable)
  executedByUserId          String    @map("executed_by_user_id") @db.Uuid // "ejecutor"
  executedAt                DateTime  @map("executed_at")                 // "fecha"
  notes                     String?
  createdAt                 DateTime  @default(now()) @map("created_at")
  updatedAt                 DateTime  @updatedAt @map("updated_at")

  request                 Request          @relation(fields: [requestId], references: [id], onDelete: Cascade)
  gateCheck               GateCheck?       @relation(fields: [gateCheckId], references: [id], onDelete: SetNull)
  evidenceDocument        Document?        @relation("ValidationEvidenceDocument", fields: [evidenceDocumentId], references: [id], onDelete: Restrict)
  evidenceDocumentVersion DocumentVersion? @relation("ValidationEvidenceVersion", fields: [evidenceDocumentVersionId], references: [id], onDelete: Restrict)
  executedBy              User             @relation("ValidationExecutor", fields: [executedByUserId], references: [id], onDelete: Restrict)
  blockingResolvedBy      User?            @relation("ValidationBlockingResolver", fields: [blockingResolvedByUserId], references: [id], onDelete: Restrict)

  @@index([requestId])
  @@index([gateCheckId])
  @@index([validationTypeCode])
  @@index([resultCode])
  @@index([blocking])
  @@index([blockingResolved])
  @@map("validation_records")
}
```

### 2.5 Cambios en modelos existentes (aditivos, no destructivos)

- **`Request`**: añadir `governanceRoute String? @map("governance_route")` (catálogo `GOVERNANCE_ROUTE`, nullable); el **flag transversal de bloqueo** (D-B7, MEDIUM-1): `blockedReason String? @map("blocked_reason")`, `blockedAt DateTime? @map("blocked_at")`, `blockedByUserId String? @map("blocked_by_user_id") @db.Uuid`, `blockedResolvedAt DateTime? @map("blocked_resolved_at")`, `blockedResolvedByUserId String? @map("blocked_resolved_by_user_id") @db.Uuid`; y las relaciones inversas `gateChecks GateCheck[]`, `validationRecords ValidationRecord[]`, más las FK del bloqueo `blockedBy User? @relation("RequestBlockedBy", fields: [blockedByUserId], references: [id], onDelete: Restrict)` y `blockedResolvedBy User? @relation("RequestBlockedResolvedBy", fields: [blockedResolvedByUserId], references: [id], onDelete: Restrict)`. Añadir `@@index([governanceRoute])` y `@@index([blockedAt])`. **El estado operativo no es parte del bloqueo**: el flag convive con `operationalState` y aplica en cualquier etapa (no solo en ejecución). "Request bloqueada" = `blockedAt != null AND blockedResolvedAt == null`.
- **`User`**: relaciones inversas nuevas con `name` propio (Prisma lo exige al haber varias FK User): `gateChecksDecided GateCheck[] @relation("GateCheckDecider")`, `gatePendingOwned GatePendingItem[] @relation("GatePendingOwner")`, `validationsExecuted ValidationRecord[] @relation("ValidationExecutor")`, `validationsBlockingResolved ValidationRecord[] @relation("ValidationBlockingResolver")`, `requestsBlocked Request[] @relation("RequestBlockedBy")`, `requestsBlockResolved Request[] @relation("RequestBlockedResolvedBy")`.
- **`Document`**: relación inversa `validationEvidences ValidationRecord[] @relation("ValidationEvidenceDocument")`.
- **`DocumentVersion`**: relación inversa `validationEvidenceVersions ValidationRecord[] @relation("ValidationEvidenceVersion")`.

Ningún campo existente se elimina ni se renombra: Fases 1–6 no se rompen.

### 2.6 Migración

Una migración nueva **`fase7_gobierno`** (`prisma migrate dev --name fase7_gobierno`), versionada (regla de la steering: no editar migraciones aplicadas, crear nuevas). Contenido: `CREATE TABLE` de `gate_checks`, `gate_pending_items`, `validation_records` (esta última con las dos FK de evidencia, `evidence_document_id` y `evidence_document_version_id`, los campos de defecto bloqueante `blocking_resolved`/`blocking_resolved_at`/`blocking_resolved_by_user_id` de D-C5, y su FK a `users`); `ALTER TABLE requests ADD COLUMN governance_route` y las columnas del **flag transversal de bloqueo** (D-B7): `blocked_reason`, `blocked_at`, `blocked_by_user_id`, `blocked_resolved_at`, `blocked_resolved_by_user_id` con sus FK a `users`; índices y FKs. Es puramente aditiva (ninguna columna existente ni el enum `operationalState` se tocan).

### 2.7 Catálogos nuevos (seed, reversibles)

Se añaden a `apps/api/prisma/seed.ts` (idempotente por `catalog+code`):

- **`GOVERNANCE_ROUTE`**: `COMPLETA` ("Ruta completa"), `SIMPLIFICADA` ("Ruta simplificada"), `EXPLORACION` ("Ruta de exploración").
- **`VALIDATION_TYPE`** (6 tipos exactos del marco §7): `FUNCIONAL_ACEPTACION`, `COMPONENTE_INTEGRACION`, `REGRESION`, `INFORMACION`, `ACCESO_SEGURIDAD`, `RENDIMIENTO_CONTINUIDAD`.
- **`VALIDATION_RESULT`**: `APROBADA` ("Aprobada"), `APROBADA_CON_OBSERVACIONES`, `FALLIDA` ("Fallida"), `BLOQUEADA` ("Bloqueada por defecto"). (El flag `blocking` del registro es ortogonal al resultado; `FALLIDA`+`blocking` es el caso que impide liberar.)
- **`PRIORITY_BAND`** (D-A4): `P1`, `P2`, `P3`, `P4` con glosa de decisión de planificación.

Marcados como seed inicial reversible (ampliables por gestión de maestras sin migración), igual que las familias de Fase 6.

---

## 3. Backend — módulo `governance/`

### 3.1 Estructura

Nuevo módulo `apps/api/src/modules/governance/` (análogo a `knowledge/`):

```
governance/
  gate.ts                         # enums GateCode/GateStatus + GATE_DEFINITIONS + grafo de avance
  governance.module.ts
  governance-scope.service.ts     # alcance por rol/proceso de la Request (reutiliza patron de KnowledgeScopeService)
  governance-state.service.ts     # extiende transiciones GC4/GC5 y recomputa condiciones (fuente de verdad server-side)
  gate-check/
    gate-check.controller.ts
    gate-check.service.ts
    gate-check.service.spec.ts
    dto/ (gate-check-response.dto.ts, approve-gate.dto.ts, create-pending-item.dto.ts, resolve-pending-item.dto.ts, set-route.dto.ts, waive-gate.dto.ts, advance-stage.dto.ts, block-request.dto.ts)
  validation/
    validation.controller.ts
    validation.service.ts
    validation.service.spec.ts
    dto/ (create-validation.dto.ts, validation-response.dto.ts, list-validations.dto.ts, resolve-blocking.dto.ts)
```

`governance.module.ts` importa `PrismaModule`, `AuthModule`, `AuditModule` y, para reutilizar transiciones de estado, importa `RequestModule` (que ya **exporta** `RequestStateService`). Registra ambos controllers (rutas estáticas antes que paramétricas por recurso) y los services. Se registra en `app.module.ts` junto a los demás módulos de fase.

### 3.2 Extensión de `RequestStateService` (sin duplicar la máquina)

En `request/request-state.ts` se **añaden** las parejas de D-B4 a `IMPLEMENTED_TRANSITIONS`. `RequestStateService.assertTransition` ya valida contra ese grafo y lanza `ConflictException` si la transición no está codificada: no cambia su lógica, solo el grafo de datos. El `GovernanceStateService` nuevo encapsula las precondiciones de gobierno (p. ej. "no hay validación bloqueante pendiente") y luego delega el movimiento de estado en `RequestStateService.assertTransition`, escribiendo `operationalState` dentro de su propia `$transaction` (mismo patrón que `PriorityService`/`ApprovalService`). **`RequestStateService` sigue siendo el único escritor del estado.**

### 3.3 Materialización y recomputo de gates (patrón `PlanGuideService`)

`GateCheckService.getForRequest(actor, requestId)`:
1. Alcance de **lectura** por proceso principal con `GovernanceScopeService.requireInScope(actor, requestId)` (patrón `RequestStateService.requireInScope`: jefe ⇒ `{}`; resto ⇒ `mainProcessId in scopedProcessIds`; 404 fuera de alcance). Las mutaciones que exigen ser gestor del proceso usan `GovernanceScopeService.requireRequestManager(actor, request)` (NIT-3: método nuevo que resuelve sobre `request.mainProcessId`, no el `requireProcessManager` de knowledge que recibe un `Asset`).
2. Para cada `GateCode`, `upsert` lazy de su `GateCheck` (clave `requestId+gateCode`), fijando `conditionText`/`authorityText` desde `GATE_DEFINITIONS`.
3. **Deriva** el `status` de GC1/GC2/GC3 del estado real (triage CONTINUAR, Approval APROBAR, Plan autorizado) y lo persiste; respeta `NO_APLICA` según `governanceRoute` (D-D2).
4. Devuelve los 5 gates con sus pendientes y, para GC4, el resumen de validaciones y si hay bloqueo.

El cálculo de "GC4 aprobable" es **server-side** y se recomputa en el momento de aprobar (no se confía en un flag persistido que pueda desincronizarse), igual que `PlanGuideService.compute` recomputa en `submit()`.

### 3.4 Endpoints

Base `/requests/:id/gates` y `/requests/:id/validations` (recurso anidado en la Request, como `priority`/`approval`).

**Autorización (MEDIUM-2):** la columna "Capacidad" es nomenclatura de documentación; en el código se impone con `@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(...)` como en `ApprovalController`, resolviendo `review` ≡ `@Roles(JEFE_AREA, LIDER_PROCESO)` y `frameworks` ≡ `@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)`. `MODULE_MATRIX` no interviene como guard (solo alimenta el menú). El alcance por proceso lo añade `GovernanceScopeService` dentro del service.

| Método | Ruta | Capacidad ⇒ `@Roles` | Descripción |
|---|---|---|---|
| GET | `/requests/:id/gates` | `frameworks` (3 roles) — lectura | Los 5 GateCheck de la Request con condición, autoridad, status, pendientes y resumen de validaciones |
| POST | `/requests/:id/gates/:gateCode/pending-items` | `review` (jefe/líder) | Registrar un faltante (qué/quién/fecha) → el gate queda/permanece PENDIENTE |
| PATCH | `/requests/:id/gates/:gateCode/pending-items/:itemId` | `review` | Resolver/editar un faltante |
| POST | `/requests/:id/gates/GC4/request-validation` | `review` | **Preparación GC4**: solicitar validación → transición `EN_EJECUCION → EN_VALIDACION` (D-B4). No es aprobación de gate |
| POST | `/requests/:id/gates/GC4/mark-ready` | `review` | **Preparación GC4**: marcar lista para liberar → transición `EN_VALIDACION → LISTA_PARA_LIBERAR`. Recomputa server-side: ninguna validación `blocking` sin resolver **y** validación obligatoria de la ruta presente (§1.5); si no se cumple → **409** |
| POST | `/requests/:id/gates/GC5/confirm-stabilization` | `review` | **Preparación GC5**: confirmar estabilización/recepción operativa → transición `EN_ESTABILIZACION → OPERATIVA` (D-B4) |
| POST | `/requests/:id/gates/:gateCode/approve` | **autoridad** (ver D-B6: solo **GC4/GC5**; jefe o líder del proceso; "comité/cambios mayores" → jefe) | Aprobar un control por la autoridad (solo GC4/GC5; GC1–GC3 se derivan y devuelven **409** si se intenta aprobarlos aquí); GC4 (`LISTA_PARA_LIBERAR → EN_ESTABILIZACION`) bloqueado si hay validación bloqueante sin resolver o faltan validaciones obligatorias de la ruta (§1.5); GC5 (`OPERATIVA → CERRADA`); mueve el estado de la Request |
| POST | `/requests/:id/gates/:gateCode/waive` | `review` | Marcar NO_APLICA (requiere `waiverReason`; solo rutas SIMPLIFICADA/EXPLORACION) |
| POST | `/requests/:id/block` | `review` | **Flag transversal** (D-B7, MEDIUM-1): setea `blockedReason`/`blockedAt`/`blockedByUserId`. **No cambia `operationalState`**; aplica en cualquier etapa. Requiere `blockReason`. 409 si ya está bloqueada |
| POST | `/requests/:id/unblock` | `review` | **Flag transversal**: setea `blockedResolvedAt`/`blockedResolvedByUserId`. **No cambia `operationalState`** (no asume retorno a `EN_EJECUCION`). 409 si no está bloqueada |
| PUT | `/requests/:id/governance-route` | `review` | Fijar/cambiar la ruta proporcional (manual, auditado) |
| GET | `/requests/:id/validations` | `frameworks` (3 roles) — lectura | Historial de validaciones de la Request |
| POST | `/requests/:id/validations` | `frameworks` o rol técnico (ver nota) | Registrar una validación/evidencia (NO aprueba ningún gate — BR-008) |
| PATCH | `/requests/:id/validations/:validationId/resolve-blocking` | `review` | Resolver un defecto **bloqueante** de un `ValidationRecord` (D-C5): setea `blockingResolved`/`blockingResolvedAt`; levanta el bloqueo de GC4 |

Nota de autorización para registrar validaciones: el marco distingue "ejecutor" (equipo técnico, un INTEGRANTE) de la "autoridad" que aprueba. Se decide permitir **registrar** validaciones a los 3 roles con alcance en el proceso (`frameworks` ⇒ `@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)`, análogo a crear documentos en Fase 6), y reservar **aprobar** el gate a `review` ⇒ `@Roles(JEFE_AREA, LIDER_PROCESO)`. La separación "registrar ≠ aprobar" es, en el código, **dos conjuntos de `@Roles` sobre endpoints distintos** (no una capacidad granular). Esto implementa literalmente "registrar evidencia ≠ aprobar el gate". **Reversible.**

El avance de estado por aprobación de gate elige el destino con el patrón `DECISION_TO_STATE` de `ApprovalService`:
- GC4 `approve` desde `LISTA_PARA_LIBERAR` → `EN_ESTABILIZACION` (la autorización previa a producción);
- GC5 `approve` desde `OPERATIVA` → `CERRADA`.

Las transiciones de **preparación** que llevan la Request hasta las precondiciones de GC4/GC5 son endpoints propios (no `approve`), con capacidad `review` y su propia transición server-side (constante `STAGE_ADVANCE_TO_STATE` en `gate.ts`):
- `request-validation`: `EN_EJECUCION → EN_VALIDACION`;
- `mark-ready`: `EN_VALIDACION → LISTA_PARA_LIBERAR` (recomputa la obligatoriedad de ruta §1.5 y la ausencia de defecto bloqueante sin resolver antes de permitir el avance);
- `confirm-stabilization`: `EN_ESTABILIZACION → OPERATIVA`.

Cada endpoint de preparación valida que el `operationalState` actual sea el origen esperado y delega en `assertTransition`; si el estado no coincide → **409**. Así la Request recorre `EN_EJECUCION → EN_VALIDACION → LISTA_PARA_LIBERAR → (GC4 approve) → EN_ESTABILIZACION → OPERATIVA → (GC5 approve) → CERRADA` con un disparador explícito en cada paso y GC4/GC5 alcanzables.

Respuesta sugerida de prioridad (D-A1): el `PriorityEvaluationResponseDto` y `RequestResponseDto` **pueden** añadir `priorityBand: 'P1'|'P2'|'P3'|'P4'` junto al `thresholdLabel`/`priorityLabel` ya existentes. Cambio aditivo; no rompe consumidores.

### 3.5 Auditoría (lección 2 — sincronizar en los DOS lugares)

Toda mutación de gobierno audita en `$transaction` con `AuditService.record`. Se añaden los nuevos `objectType`:

- en **`audit.service.ts`** `AuditObjectType`: `'GATE_CHECK' | 'GATE_PENDING_ITEM' | 'VALIDATION_RECORD'`.
- en **`audit/dto/list-audit-events.dto.ts`** `OBJECT_TYPES`: los mismos tres literales.

Si solo se añaden en uno, el filtro `?objectType=` responde 400 pese a registrarse el evento. Además, la transición de estado de la Request por aprobación de gate audita un `UPDATE` sobre `REQUEST` (before/after `operationalState`), igual que `ApprovalService`.

### 3.6 Regeneración del contrato (lección 3)

Tras añadir controllers/DTOs: regenerar OpenAPI → `npm run build:api-client` (en `packages/api-client`) **antes** de `typecheck`, o el web no compila contra el contrato nuevo.

---

## 4. Frontend — pantalla de Gobierno/Cumplimiento

Se convierte el placeholder `apps/web/src/app/administracion/frameworks/page.tsx` (hoy `UnderConstruction`) en la pantalla real. El item de navegación ya existe en `navigation.ts`: ruta `/administracion/frameworks`, label **"Frameworks"**, `moduleKey: 'frameworks'`, dentro del grupo **"Administracion"** (`frameworks` habilitado para los 3 roles en MODULE_MATRIX). **No** se añade ruta nueva, **no** se añade ítem de menú y **no** se toca el grupo "Gobierno" (que agrupa `team`/`audit`/`permissions`). La funcionalidad de gobierno de la demanda vive bajo el ítem "Frameworks" de Administración, por reutilización del placeholder existente.

Contenido (consumiendo `packages/api-client` regenerado, Server/Client Components según patrón de `demanda/priorizacion`):
- **Selector de Request** (dentro del alcance del actor) y su **ruta proporcional** editable (`review`).
- **Tablero de los 5 gates** GC1–GC5: por cada gate, título, condición y autoridad (texto del marco), `status` (PENDIENTE/CUMPLIDO/NO_APLICA con badge), lista de faltantes, y acciones condicionadas al rol (registrar/resolver faltante; aprobar; waive). GC4 muestra el **resumen de validaciones** y, si hay defecto bloqueante, deshabilita "Aprobar" con el motivo visible.
- **Registro de validaciones** (tabla con tipo, caso, versión, ambiente, ejecutor, fecha, resultado, bloqueante, enlace a documento de evidencia si lo hay) y formulario para añadir una validación.
- Badges de **prioridad** con la banda P1–P4 (D-A1) donde se muestre la Request.

Accesibilidad: componentes shadcn/ui (accesibles por defecto), roles ARIA en el tablero, foco visible, textos no dependientes solo de color para el `status`. (La conformidad WCAG completa requiere pruebas manuales con tecnología asistiva y revisión experta.)

---

## 5. Manejo de errores y validación (concreto por operación)

| Operación | Falla | ¿Recuperable? | El llamante recibe | Log |
|---|---|---|---|---|
| GET gates / validations | Request fuera de alcance | sí | **404** "Solicitud no encontrada" (sin confirmar existencia fuera de alcance) | no |
| Aprobar gate | rol/autoridad insuficiente | sí | **403** | no (es control esperado) |
| Aprobar gate | `gateCode` es GC1/GC2/GC3 (se derivan, no se aprueban aquí) | sí | **409** "Este control se deriva de fases previas y no se aprueba desde gobierno" | no |
| Aprobar GC4 / `mark-ready` | existe validación `blocking` sin resolver (D-C5) o falta validación obligatoria de la ruta | sí | **409** con lista de bloqueos (recomputado server-side) | no |
| Preparación (`request-validation`/`mark-ready`/`confirm-stabilization`) | rol/capacidad `review` insuficiente | sí | **403** | no |
| Preparación (`request-validation`/`mark-ready`/`confirm-stabilization`) | `operationalState` actual ≠ origen esperado de la transición | sí | **409** "No se puede pasar de X a Y en esta fase" (de `assertTransition`) | no |
| `block` | `@Roles(JEFE_AREA, LIDER_PROCESO)` insuficiente / fuera de alcance | sí | **403** / **404** | no |
| `block` | la Request ya está bloqueada (`blockedAt != null AND blockedResolvedAt == null`) | sí | **409** "La solicitud ya está bloqueada" | no |
| `block` | falta `blockReason` | sí | **400** | no |
| `unblock` | la Request no está bloqueada | sí | **409** "La solicitud no está bloqueada" | no |
| Resolver bloqueo (`resolve-blocking`) | `@Roles(JEFE_AREA, LIDER_PROCESO)` (`review`) insuficiente | sí | **403** | no |
| Resolver bloqueo (`resolve-blocking`) | `validationId` inexistente o no pertenece a la Request | sí | **404** | no |
| Resolver bloqueo (`resolve-blocking`) | el `ValidationRecord` no tiene `blocking = true` | sí | **400** "El registro no marca un defecto bloqueante" | no |
| Aprobar gate | transición de estado no implementada para el estado actual | sí | **409** "No se puede pasar de X a Y en esta fase" (de `assertTransition`) | no |
| Aprobar gate / avanzar | `operationalState` persistido no es un `RequestState` válido | no (corrupción) | **500** | **sí** (InternalServerError, igual que hoy) |
| Waive gate | ruta no permite NO_APLICA, o falta `waiverReason` | sí | **400** | no |
| Fijar `governanceRoute` | código fuera de catálogo `GOVERNANCE_ROUTE` | sí | **400** "Revisa los datos ingresados" (patrón `assertCatalogCode`) | no |
| Crear validación | `validationTypeCode`/`resultCode` fuera de catálogo | sí | **400** | no |
| Crear validación | `evidenceDocumentId` apunta a Document fuera de alcance/inexistente | sí | **400/404** | no |
| Crear validación | `evidenceDocumentVersionId` cuyo `documentId` no coincide con `evidenceDocumentId` | sí | **400** "La versión no pertenece al documento indicado" | no |
| Registrar/resolver pendiente | gate fuera de alcance | sí | **404** | no |
| Cualquier mutación | fallo de BD en `$transaction` | no para esa petición | **500**; se revierte todo (atomicidad: dominio + auditoría) | **sí** |

**Validación de entradas (reglas por campo):**
- `gateCode` (path): obligatorio, debe ser un `GateCode` conocido; si no → 400.
- `governanceRoute` (PUT): obligatorio en el body, string, debe existir y estar activo en `GOVERNANCE_ROUTE`.
- `approve` body: `authorityNote?` string ≤ 2000 (justificación de la autoridad); opcional.
- preparación (`request-validation`/`mark-ready`/`confirm-stabilization`) body: `note?` string ≤ 2000; opcional (sin payload obligatorio: el origen de la transición se infiere del `operationalState`).
- `block` body: `blockReason` **requerido**, string 1–2000; `unblock` body: `note?` string ≤ 2000.
- `resolve-blocking` body: `resolutionNote?` string ≤ 2000; opcional.
- `waive` body: `waiverReason` **requerido**, string 1–2000.
- `pending-item` body: `description` requerido (1–2000), `ownerUserId?` UUID válido, `reviewDate?` fecha.
- `validation` body: `validationTypeCode` requerido (catálogo), `testCase` requerido (1–2000), `version?`/`environment?` string ≤ 200, `resultCode` requerido (catálogo), `blocking` boolean (default false), `executedByUserId` requerido UUID, `executedAt` requerido fecha, `evidenceDocumentId?` UUID, `evidenceDocumentVersionId?` UUID (si viene, su `documentId` debe coincidir con `evidenceDocumentId`), `evidenceRef?` string ≤ 2000. Límites de longitud consistentes con los DTOs existentes; `body-limit` ya está en 1mb (lección 5), suficiente.

**Invariantes y quién los posee:**
- *Único escritor del `operationalState`*: `RequestStateService` (preservado). El `GovernanceStateService` nunca escribe el estado directo: pasa por `assertTransition`.
- *GC4 no aprobable con bloqueo*: lo posee `GateCheckService` (recomputo server-side de `blocking = true AND blockingResolved = false` + obligatoriedad de ruta), no la UI; la UI solo refleja. El bloqueo se levanta solo vía `resolve-blocking` (D-C5), nunca editando el `operationalState`.
- *Gate es un conjunto fijo de 5 por Request*: lo posee el `upsert` lazy por `(requestId, gateCode)` (unique compuesto).
- *Autoridad = rol*: la **barrera de rol** la posee el `RolesGuard` + `@Roles(RoleCode...)` del controller (MEDIUM-2); el **alcance por proceso** lo posee `GovernanceScopeService.requireRequestManager(actor, request)` sobre `request.mainProcessId` (NIT-3). El mapeo "autoridad del marco → `@Roles`" vive en el controller/constante del service, no en `MODULE_MATRIX`.
- *Bloqueo transversal*: lo posee la Request vía flag (`blockedAt`/`blockedResolvedAt`), nunca el `operationalState` (D-B7). El flag no altera el estado ni participa en `assertTransition`.

---

## 6. Testabilidad

**Unitarios (Jest), con Prisma mockeado como en los spec existentes:**
- `governance-state.service.spec.ts`: cada transición nueva de **preparación** (`request-validation`/`mark-ready`/`confirm-stabilization`) y de **aprobación** (GC4/GC5) permitida desde su origen correcto, y rechazada (409) desde un origen incorrecto; recorrido completo `EN_EJECUCION → … → CERRADA`; único escritor del estado.
- `gate-check.service.spec.ts` (bloqueo transversal, D-B7/MEDIUM-1): `block` setea el flag **sin** cambiar `operationalState` (verificar que una Request en `EN_VALIDACION` sigue en `EN_VALIDACION` tras bloquear); `unblock` setea `blockedResolvedAt` sin forzar `EN_EJECUCION`; 409 al re-bloquear o al desbloquear sin bloqueo previo; `assertTransition` **no** se invoca en block/unblock.
- `gate-check.service.spec.ts`: materialización lazy de los 5 gates; derivación de GC1–GC3 del estado real; GC4 bloqueado por validación `blocking` **sin resolver** (D-C5) y **desbloqueado** tras `resolve-blocking`; `mark-ready` rechazado (409) con bloqueante sin resolver o validación obligatoria faltante; GC4 bloqueado por validación obligatoria faltante según ruta; `waive` requiere motivo y ruta compatible; `NO_APLICA` en EXPLORACION fuerza no-producción; auditoría llamada en `$transaction`.
- `validation.service.spec.ts`: registrar validación **no** cambia estado ni gate (BR-008); `resolve-blocking` setea `blockingResolved`/`blockingResolvedAt`/`blockingResolvedByUserId`, **no** cambia estado ni aprueba gate, y falla **400** si el registro no es `blocking`; FK opcional a Document validada; `evidenceDocumentVersionId` cuyo `documentId` no coincide con `evidenceDocumentId` → 400; catálogos validados (400).
- `gate-check.service.spec.ts` (adicional): intentar aprobar GC1/GC2/GC3 por el endpoint `approve` → 409; obligatoriedad por ruta de §1.5 (COMPLETA/SIMPLIFICADA exigen `FUNCIONAL_ACEPTACION` aprobatoria; EXPLORACION fuerza GC4 NO_APLICA).
- Priority: actualizar `priority.service.spec.ts` y `request-state.service.spec.ts` para los nuevos cortes/etiquetas (§1.1); `computeScore` **sin cambios**.
- `audit`/`module-matrix`: **restricción explícita (NIT-5)** — `module-matrix.spec.ts` afirma exactamente **21 claves**; gobierno **reutiliza** `frameworks` (lectura/registro) y `review` (autoridad) y **no añade** ninguna clave de módulo nueva (p. ej. `governance`), que rompería ese spec. Mantener los conteos esperados.

**Integración (manual o e2e con Playwright, fuera del alcance de este diseño pero contemplado):** recorrido GC1→GC5 de una Request COMPLETA; una SIMPLIFICADA con GC3/GC4 en NO_APLICA; una EXPLORACION que cierra sin producción.

Diseño pensado para test: toda la lógica de condición/bloqueo vive en services puros (recibe `actor` + `prisma`), sin lógica en controllers; los textos del marco son constantes testables.

---

## 7. Alcance y exclusiones

**Dentro:** ajuste de etiquetas de prioridad (A); modelo y módulo de gates GC1–GC5 (B); validaciones/evidencias con FK opcional a Document (C); ruta proporcional (D); extensión de transiciones GC4/GC5; pantalla de Gobierno/Cumplimiento; auditoría y migración `fase7_gobierno`.

**Fuera (explícito):** estructura corporativa como entidades (Comité/Dirección) — son texto/rol; frameworks por proceso FIBI/FIID/FIAA/FMAA — ciclo corporativo general único; reclasificación automática de ruta; SLA y niveles de servicio; catálogo de servicios completo e indicadores (secciones 8/9 → Fase 8); retiro (`RETIRADA`); emergencias/cambios de emergencia (sección 6, no solicitado para esta fase). No se rompen Fases 1–6, `/catalogs` ni el flujo de demanda más allá del ajuste intencional de etiqueta.

---

## 8. Decisiones reversibles (marcadas)

- **R1** Glosa/vocabulario de bandas P1–P4 (texto, sin migración).
- **R2** Momento de materialización de GC1–GC3 (lazy vs. hook en services de Fase 2/3).
- **R3** Mapeo autoridad→rol ("comité" → JEFE_AREA) en constante del service.
- **R4** `governanceRoute` colgado de `Request` vs. de `Triage` (se eligió Request).
- **R5** Bloqueo como **flag transversal** (D-B7) frente a estado `BLOQUEADA`: se eligió el flag por fidelidad al marco §9. El enum `BLOQUEADA` se conserva sin transiciones; convertirlo a estado en una fase futura (documentando la divergencia) es reversible. El flag mismo puede diferirse si complica el alcance.
- **R6** No habilitar `RETIRADA` en Fase 7.
- **R7** Evidencia por FK a Document **o** texto libre (no se obliga documento).
- **R8** Permitir a los 3 roles **registrar** validaciones; **aprobar** reservado a `review`/autoridad.
- **R9** Añadir `priorityBand` al response (aditivo) vs. solo texto en `priorityLabel`.
- **R10** Evidencia con doble FK (`Document` + `DocumentVersion`) vs. cambiar la FK a solo `DocumentVersion` (se eligió la doble, aditiva, para conservar navegación al documento padre; MEDIUM-2).
- **R11** Conjunto obligatorio de validaciones por ruta (§1.5): mínimo `FUNCIONAL_ACEPTACION`; ampliable en constante del service sin migración.
- **R12** Mecanismo de resolución del defecto bloqueante (D-C5): flag `blockingResolved` en el `ValidationRecord` + endpoint `resolve-blocking`, frente a la alternativa de "superación por registro posterior". Campos aditivos, reversible.
- **R13** Disparadores de etapa como **endpoints explícitos** (`request-validation`/`mark-ready`/`confirm-stabilization`) frente a un endpoint único `advance` con mapa server-side (HIGH-1): se eligieron endpoints explícitos para diferenciar capacidad/autoridad por paso; el grafo de transiciones es el mismo, así que cambiar a `advance` no tocaría el modelo.

---

## 9. Verificación antes de dar por terminado (al implementar)

1. `prisma migrate dev --name fase7_gobierno` + `prisma generate`.
2. Actualizar `seed.ts` (catálogos nuevos) y re-ejecutar seed (idempotente).
3. `npm run build:api-client` (regenerar contrato) **antes** de typecheck.
4. `typecheck` de api y web (TypeScript estricto, sin `any` injustificado).
5. `jest` (api): specs nuevos + specs de prioridad actualizados en verde.
6. Sincronizar `AuditObjectType` **y** `OBJECT_TYPES` (los dos lugares).
7. `build` de api y web.

---

## 10. Respuestas a la revisión de diseño

### 10.1 Iteración 4 — tercera revisión (`design-review.json` vigente)

Veredicto previo: `CHANGES_REQUESTED` (**0 HIGH, 2 MEDIUM, 4 NIT**). Todos los hallazgos se **atienden** (ninguno backlog ni ignorado); cada uno se verificó contra el código real antes de resolverse: `request-state.ts` (enum `BLOQUEADA` sin transiciones), `approval.controller.ts` (`@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(JEFE_AREA, LIDER_PROCESO)`), `knowledge-scope.service.ts` (`requireProcessManager` recibe un `Asset`), y el marco §9 ("Bloqueado … no borra el estado").

| Hallazgo | Severidad | Resolución | Dónde |
|---|---|---|---|
| **1** "Bloqueado" modelado como estado operativo contradice el marco §9 (condición transversal que no borra el estado) | **MEDIUM** | **Corregido con la opción (a) recomendada.** Se descarta `BLOQUEADA` como transición de `operationalState`. El bloqueo pasa a **flag transversal aditivo** de la Request (`blockedReason`/`blockedAt`/`blockedByUserId` + `blockedResolvedAt`/`blockedResolvedByUserId`) que **convive** con el estado real y aplica en cualquier etapa; `block`/`unblock` mutan el flag, **no** el estado (unblock ya no asume retorno a `EN_EJECUCION`). El enum `BLOQUEADA` se conserva sin transiciones (no se elimina, no rompe nada), documentando la divergencia. Se documenta que el flag no detiene el cómputo de tiempos. | §1.2 D-B7, §2.5, §2.6, §3.4, §5, §6, R5 |
| **2** El diseño autoriza por "capacidad" (MODULE_MATRIX) pero el código impone por `RolesGuard` + `@Roles`; el mecanismo real nunca se nombra | **MEDIUM** | **Corregido.** Se fija el mecanismo en D-B6 y en el encabezado de la tabla §3.4: autorización = `@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(RoleCode...)` como en `ApprovalController`/`PlanController`; `review` ≡ `@Roles(JEFE_AREA, LIDER_PROCESO)`, `frameworks` ≡ `@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)`. `MODULE_MATRIX` solo alimenta el menú (cosmético), no es guard. La separación leer/registrar/aprobar = tres conjuntos de `@Roles` + `GovernanceScopeService`. | §1.2 D-B6, §3.4, §5 |
| **3** Nombrar el método nuevo de alcance de gobierno (no "método análogo" a `requireProcessManager`, que recibe un `Asset`) | **NIT** | **Corregido.** El método se nombra `GovernanceScopeService.requireRequestManager(actor, request)` (resuelve sobre `request.mainProcessId`), más `requireInScope`/`requireAreaLead`. Se documenta que `KnowledgeScopeService.requireProcessManager` opera sobre `Asset` y no es reutilizable tal cual. | §1.2, §3.3, §5 |
| **4** JSDoc "0-100" de `computeScore`: confirmado un único lugar; D-A5 suficiente | **NIT** | **Confirmado, sin cambio de alcance.** Se documenta en §1.1 que el único `computeScore` está en `request-state.service.ts`; no hay un segundo que corregir. | §1.1 D-A5 |
| **5** Migrar TODAS las aserciones de etiqueta de prioridad al vocabulario P1–P4, no solo las citadas | **NIT** | **Corregido.** §1.1 añade la regla general: reemplazar todo literal "Muy alta/Alta/Media/Baja" por la banda/etiqueta P1–P4 en los **tres** specs (`request.service.spec.ts`, `priority.service.spec.ts`, `request-state.service.spec.ts`); `score=72 → P2` confirmado. | §1.1 |
| **6** Extender la renuncia explícita de autoridad a GC5 (hoy solo documentada para GC4) | **NIT** | **Corregido.** D-B6 documenta que GC5 se aprueba por `review` (jefe/líder); "dueño funcional y responsable operativo" queda como `authorityText` del expediente, no como enrutamiento de rol — misma renuncia consciente y reversible (R3) que GC4. | §1.2 D-B6 |

### 10.2 Iteración 3 — segunda revisión (histórico)

Veredicto: `CHANGES_REQUESTED` (**1 HIGH, 1 MEDIUM, 3 NIT**). Resumen de cómo se atendió cada hallazgo:

| Hallazgo | Resolución | Dónde |
|---|---|---|
| **HIGH-1** Transiciones de preparación GC4/GC5 sin endpoint/DTO/autoridad → GC4/GC5 inalcanzables | **Corregido.** D-B4 con disparador explícito por transición; endpoints de preparación `request-validation`/`mark-ready`/`confirm-stabilization` (capacidad `review`); `approve` solo para autorización. Request recorre `EN_EJECUCION → … → CERRADA`. | §1.2 D-B4, §3.1, §3.4, §5, §6, R13 |
| **MEDIUM-2** No se define cómo "resolver" un defecto bloqueante de GC4 | **Corregido.** `ValidationRecord` gana `blockingResolved`/`blockingResolvedAt`/`blockingResolvedByUserId` (D-C5); condición de bloqueo = `blocking = true AND blockingResolved = false`; endpoint `resolve-blocking` que no aprueba gate ni cambia estado (BR-008). | §1.3 D-C5, §1.5, §2.4–2.6, §3.4, §5, §6, R12 |
| **NIT-3/4/5** cross-ref del `describe`, `request.service.spec.ts`, autoridad GC4 | **Corregidos/documentados.** | §1.1, §1.2 D-B6 |

### 10.3 Iteración 2 — primera revisión (histórico)

Veredicto: `CHANGES_REQUESTED` (0 HIGH, 3 MEDIUM, 6 NIT). Resumen de cómo se atendió cada hallazgo:

| Hallazgo | Resolución | Dónde |
|---|---|---|
| **MEDIUM-1** (navegación: `frameworks` está en grupo "Administracion", no "Gobierno") | **Corregido.** §0 y §4 reescritas: la pantalla reutiliza el placeholder `administracion/frameworks/page.tsx`, ítem "Frameworks" del grupo **"Administracion"** (`moduleKey: 'frameworks'`). No se añade ruta ni ítem de menú ni se toca el grupo "Gobierno" (team/audit/permissions). Verificado contra `navigation.ts`. | §0, §4 |
| **MEDIUM-2** (FK de evidencia apunta a `Document`, no fija versión) | **Corregido** con la opción (a) recomendada: `ValidationRecord` lleva **ambas** FK opcionales — `evidenceDocumentId`→`Document` y `evidenceDocumentVersionId`→`DocumentVersion` (`onDelete: Restrict`), fijando la versión inmutable. Validación de coherencia `documentId` de la versión = `evidenceDocumentId`. | §0 (bloque C), §1.3 D-C2, §2.4, §2.5, §2.6, §5, R10 |
| **MEDIUM-3** (validaciones obligatorias por ruta no especificadas) | **Corregido.** §1.5 con tabla determinista de obligatoriedad por ruta. | §1.3 D-C3, §1.5, §3.4, §5, §6 |
| **NIT-1** (numeración etapas marco vs. estados enum) | **Corregido.** El mapeo GC4/GC5 se describe por nombre de estado. | §0, §1.2 |
| **NIT-2** (JSDoc "0-100" contradice 20-100) | **Corregido.** D-A5: actualizar JSDoc a "20-100" y cortes 80/65/45. | §1.1 D-A5 |
| **NIT-3** (`requireProcessManager` recibe un Asset) | **Corregido.** `GovernanceScopeService` usa un método análogo sobre `request.mainProcessId`. | §1.2 |
| **NIT-4** (sincronizar `AuditObjectType` y `OBJECT_TYPES`) | **Sin cambio** (recordatorio en §3.5 y checklist §9). | §3.5, §9 |
| **NIT-5** (no alterar las 21 claves de MODULE_MATRIX) | **Reforzado** como restricción explícita en §6. | §6 |
| **NIT-6** ("comité"→JEFE_AREA, autoridad doble de GC3) | **Documentado** en D-B3/D-B6. | §1.2, §3.4, §5 |

Las decisiones añadidas en esta iteración (R12, R13; D-C5; endpoints de preparación/`block`/`resolve-blocking`) son reversibles y coherentes con los requisitos originales: materializan el ciclo de control GC1→GC5 del marco §5 (ahora completamente recorrible), preservan la máquina de estados única (solo `RequestStateService` escribe el estado), y mantienen la regla "registrar evidencia ≠ aprobar el gate" (BR-008) también para la resolución del defecto bloqueante.
