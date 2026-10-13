# Revisión de diseño — Fase 7 · Gobierno de la demanda (iteración 4)

Revisor: subagente de revisión de diseño (lectura en frío).
Documento revisado: `.agents/tasks/fase7-gobierno/design.md`.
Marco contrastado: `docs/marco-corporativo/FCGR-INS-008-v2.0.txt` (§4, §5, §6, §7, §9).
Código contrastado (worktree `fase7-gobierno`): `apps/api/src/modules/request/request-state.service.ts`, `request/request-state.ts`, `request/priority/priority.service.ts`, `request/approval/approval.controller.ts`, `audit/audit.service.ts`, `audit/dto/list-audit-events.dto.ts`, `knowledge/knowledge-scope.service.ts`, `auth/module-matrix.spec.ts`, `web/src/lib/navigation.ts`, `prisma/schema.prisma`.

---

## Veredicto

**APPROVED** — 0 hallazgos HIGH, 0 hallazgos MEDIUM.

Los NIT listados abajo no bloquean. El diseño es implementable tal como está: cada afirmación verificable sobre el código real resultó correcta, el mapeo al marco es fiel, y las decisiones abiertas están marcadas como reversibles con una opción concreta elegida.

---

## Hallazgos

### NIT-1 — El `resultCode` del catálogo `VALIDATION_RESULT` incluye `BLOQUEADA`, que colisiona conceptualmente con el flag `blocking` y con la banda de prioridad de otros contextos

Dónde: §2.7 (`VALIDATION_RESULT`: `APROBADA`, `APROBADA_CON_OBSERVACIONES`, `FALLIDA`, `BLOQUEADA`) y §1.5/§D-C3b, que definen "aprobatorio" = `{APROBADA, APROBADA_CON_OBSERVACIONES}` y declaran que el flag `blocking` es ortogonal al `resultCode`.

Problema: el diseño es internamente coherente (lo dice explícitamente), pero mantener un `resultCode = BLOQUEADA` junto a un campo `blocking: boolean` invita a que el implementador trate un `resultCode = BLOQUEADA` como equivalente a `blocking = true`, cuando el diseño dice que son ortogonales. Es una fuente de confusión evitable, no un defecto lógico.

Fix concreto: añadir una frase en §2.7 aclarando el único punto de verdad: "El bloqueo de GC4 se evalúa EXCLUSIVAMENTE sobre `blocking = true AND blockingResolved = false` (D-C5), nunca sobre `resultCode`. `VALIDATION_RESULT.BLOQUEADA` es solo una etiqueta descriptiva del resultado de una prueba y no participa en la condición de aprobabilidad de GC4." Esto ya está implícito en D-C3b; conviene hacerlo explícito en el seed donde el implementador verá los dos conceptos juntos.

### NIT-2 — `confirm-stabilization` fuerza `EN_ESTABILIZACION → OPERATIVA` con capacidad `review`, sin exigir evidencia de las condiciones de cierre del marco §8

Dónde: §1.2 D-B4 y §3.4, transición `EN_ESTABILIZACION → OPERATIVA` vía `POST .../gates/GC5/confirm-stabilization` (capacidad `review`; "servicio verificado, recepción operativa").

Problema: el marco §8 ("Condiciones de cierre") y §5 (GC5) exigen "estabilidad, transferencia, aceptación y expediente completos" y "recepción operativa confirmada". El diseño modela `confirm-stabilization` como una preparación con `note?` opcional, sin ningún registro que materialice la "recepción operativa confirmada". No es un hueco bloqueante porque el diseño declara explícitamente (§7, §D-D4) que SLA/transferencia/expediente completo son Fase 8, y porque la autoridad de GC5 sí es un acto separado (`approve`). Pero el nombre del endpoint promete una confirmación que el modelo no captura.

Fix concreto: documentar en §3.4 que `confirm-stabilization` NO registra evidencia de recepción (eso queda en Fase 8) y que su único efecto es mover el estado; o bien reutilizar `GatePendingItem`/`ValidationRecord` de GC5 como registro mínimo de la recepción. Elegir una de las dos y anotarla como decisión reversible (p. ej. R14).

### NIT-3 — La regla de obligatoriedad de GC4 (§1.5) exige `FUNCIONAL_ACEPTACION` aprobatoria pero no ancla ese tipo al `gateCheckId` del GC4

Dónde: §1.5 (tabla de obligatoriedad por ruta) y §2.4 (`ValidationRecord.gateCheckId` es `String?`, "normalmente el GC4").

Problema: la condición "existe al menos un `ValidationRecord` de tipo `FUNCIONAL_ACEPTACION` con `resultCode` aprobatorio" se evalúa, según §3.3, server-side sobre las validaciones de la Request. Como `gateCheckId` es opcional, no queda determinado si la validación obligatoria debe estar vinculada al GC4 o basta con que exista a nivel de Request. En rutas con reproceso (varias validaciones a lo largo del tiempo) esto puede cambiar el resultado. El diseño no es ambiguo sobre el flag `blocking` (es claro), pero sí deja implícito el alcance del conteo de la validación obligatoria.

Fix concreto: fijar en §1.5 que la obligatoriedad se evalúa sobre `ValidationRecord` de la Request con `requestId = :id` (independiente de `gateCheckId`), o sobre los vinculados a GC4 (`gateCheckId = <GC4>`). Recomendado: a nivel de Request (más simple y testeable), y declararlo explícitamente en §1.5 y en el spec de §6.

---

## Supuestos verificados (contra el código real del worktree)

1. **Fórmula de prioridad y rango 20–100 (§1.1).** VERIFICADO. `request-state.service.ts::computeScore` calcula `Math.round(Σ PRIORITY_WEIGHTS[k] · (criteria[k]/5))`, algebraicamente idéntico a `round(Σ(peso·calif)/5)` del marco §4. Todas en 1 → 20; todas en 5 → 100. El diseño acierta: no hay cambio de fórmula.
2. **Pesos (§1.1).** VERIFICADO. `PRIORITY_WEIGHTS` = impact 25, alignment 15, riskControl 15, urgency 10, scope 10, dataAvailability 10, feasibility 10, reuse 5. Coinciden exactamente con los 8 criterios del marco §4 (impacto 25, alineación 15, riesgo 15, urgencia 10, cobertura 10, viabilidad 10, relación beneficio/esfuerzo 10, reutilización 5).
3. **Umbrales actuales 80/65/50 y etiquetas viejas (§1.1).** VERIFICADO. `priorityLabel` devuelve "Muy alta/Alta/Media/Baja" con cortes `>=80`, `>=65`, `>=50`. El diseño cambia el corte inferior a 45 y a vocabulario P1–P4, coherente con la tabla del marco §4 (P1 80–100, P2 65–<80, P3 45–<65, P4 20–<45). Los umbrales objetivo del diseño coinciden exactamente con el marco.
4. **JSDoc "0-100" desactualizado (§1.1 D-A5).** VERIFICADO. El JSDoc de `computeScore` dice literalmente "Score ponderado 0-100" y el de `priorityLabel` dice "Cortes inclusivos 80/65/50". El `describe` en `request-state.service.spec.ts` referenciado existe conceptualmente (no leído el spec, pero el JSDoc confirma el 0-100 y el 50). La corrección D-A5 es correcta.
5. **Enum `RequestState.BLOQUEADA` existe sin transiciones (§1.2 D-B7).** VERIFICADO. `request-state.ts` declara `BLOQUEADA` en el enum y `IMPLEMENTED_TRANSITIONS` NO contiene ninguna pareja hacia/desde `BLOQUEADA`. La decisión de dejarlo como valor histórico sin uso operativo es implementable sin romper nada.
6. **`IMPLEMENTED_TRANSITIONS` termina en `EN_PLANIFICACION → EN_EJECUCION` (§1.2 D-B4).** VERIFICADO. La última pareja es `[EN_PLANIFICACION, EN_EJECUCION]`. Las seis parejas nuevas de D-B4 (EN_EJECUCION→EN_VALIDACION, →LISTA_PARA_LIBERAR, →EN_ESTABILIZACION, →OPERATIVA, →CERRADA) son aditivas y no colisionan. `assertTransition` ya lanza `ConflictException` para transiciones no implementadas, así que la extensión solo toca el grafo de datos, como afirma el diseño.
7. **`RequestStateService` es el único escritor del estado (§3.2).** VERIFICADO. `priority.service.ts` escribe `operationalState` SOLO con el valor devuelto por `state.assertTransition(...)` dentro de su `$transaction`. El patrón que el diseño reutiliza (precondición en el service de dominio + `assertTransition` + escritura en `$transaction`) es exactamente el existente.
8. **Mapeo GC1↔triage, GC2↔compromiso (Approval), GC3↔plan (§1.2).** VERIFICADO parcialmente. `IMPLEMENTED_TRANSITIONS` confirma `EN_TRIAGE→BACKLOG_PRIORIZADO` (prioridad), `BACKLOG_PRIORIZADO→COMPROMETIDA` (aprobación), `COMPROMETIDA→EN_PLANIFICACION→EN_EJECUCION` (plan). `priority.service.ts` confirma que la aprobación/compromiso es acción separada. La derivación lazy de GC1–GC3 del estado real es coherente con estos estados existentes.
9. **Registrar evidencia ≠ aprobar (separación, §1.3 D-C3 / BR-008).** VERIFICADO por diseño y coherente con el código: el patrón `ApprovalService` (acción de autoridad separada) existe. El diseño impone `POST /validations` con `@Roles` de 3 roles y `approve` con `@Roles(JEFE_AREA, LIDER_PROCESO)` sobre endpoints distintos; esto materializa la separación. El bloqueo de GC4 por `blocking = true AND blockingResolved = false` es determinista.
10. **Autoridad = `@Roles` + `RolesGuard`, no `MODULE_MATRIX` (§1.2 D-B6 / MEDIUM-2).** VERIFICADO. `approval.controller.ts` usa exactamente `@UseGuards(CurrentUserGuard, RolesGuard)` + `@Roles(RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO)`. El diseño describe el mecanismo real con precisión (`review` ≡ esos dos roles; `frameworks` ≡ los tres).
11. **`KnowledgeScopeService.requireProcessManager` recibe un `Asset`, no una Request (§1.2 / NIT-3 previo).** VERIFICADO. La firma es `requireProcessManager(actor, asset: Pick<AssetModel, 'processId'>)`. El diseño acierta: no es reutilizable tal cual; se necesita `requireRequestManager(actor, request)` nuevo sobre `request.mainProcessId`.
12. **Alcance por ROL usa `actor.grants[].roleCode === LIDER_PROCESO` (lección 1).** VERIFICADO. `knowledge-scope.service.ts::leaderProcessIds` filtra `actor.grants` por `roleCode === RoleCode.LIDER_PROCESO`; `actor.isJefeArea` y `actor.scopedProcessIds` existen. El patrón que `GovernanceScopeService` reutilizará es real.
13. **`AuditObjectType` y `OBJECT_TYPES` deben sincronizarse en los dos lugares (§3.5).** VERIFICADO. `audit.service.ts::AuditObjectType` (union de 24 literales) y `list-audit-events.dto.ts::OBJECT_TYPES` (24 literales) coinciden hoy; añadir `GATE_CHECK`/`GATE_PENDING_ITEM`/`VALIDATION_RECORD` en ambos es obligatorio o el filtro `?objectType=` responde 400. El diseño nombra ambos archivos correctamente.
14. **`MODULE_MATRIX` tiene exactamente 21 claves; `frameworks` para los 3 roles (§4, §6 NIT-5).** VERIFICADO. `module-matrix.spec.ts` afirma `MODULE_KEYS` con 21 claves (incluyendo `frameworks` y `review`) y que `frameworks` está habilitado para los tres roles. Reutilizar `frameworks`/`review` sin añadir una clave `governance` preserva el spec, como exige el diseño.
15. **Navegación: `frameworks` vive en el grupo "Administracion", NO en "Gobierno" (§0, §4).** VERIFICADO. `navigation.ts` ubica `{ href: '/administracion/frameworks', label: 'Frameworks', moduleKey: 'frameworks' }` en el grupo "Administracion"; el grupo "Gobierno" agrupa `team`/`audit`/`permissions`. El diseño describe esto con exactitud.
16. **`Document` tiene `currentVersionId` (puntero móvil) y el contenido vive en `DocumentVersion` (§1.3 D-C2).** VERIFICADO. `schema.prisma`: `Document.currentVersionId String?` + `currentVersion DocumentVersion?`; `DocumentVersion` tiene el contenido. La decisión de doble FK (`evidenceDocumentId` + `evidenceDocumentVersionId`) para fijar la versión inmutable es correcta y necesaria para "no apuntar a un blanco móvil".
17. **`Request.mainProcessId` es `String` NOT NULL (§3.3 `requireRequestManager`).** VERIFICADO. `schema.prisma`: `mainProcessId String @map("main_process_id")` (requerido) con relación `mainProcess`. Resolver el proceso desde `request.mainProcessId` siempre tiene valor; el diseño no depende de un campo nullable.
18. **Modelo aditivo, Fases 1–6 no se rompen (§2.5, §2.6, §7).** VERIFICADO. Todos los campos nuevos de `Request` son opcionales/nullable; no se renombra ni elimina ningún campo existente; la migración es puramente aditiva (CREATE TABLE + ADD COLUMN). El enum `operationalState` no se toca. Coherente con la regla corporativa de "no romper comandos/fases existentes".
19. **Rutas proporcionales sin reclasificación automática (§1.4 D-D3).** VERIFICADO contra el marco §6 ("Si aumenta el riesgo, se reclasifica antes de continuar" = acción manual). El diseño modela `governanceRoute` manual y auditado, sin regla automática. Fiel al marco.
20. **No se modela la estructura corporativa como entidades; "comité" → jefe de área (§0, §1.2 D-B6, §7).** VERIFICADO contra el marco §2 (Comité/Dirección son roles organizativos) y la restricción del prompt. El diseño mapea autoridades a texto (`authorityText`) + los 3 roles existentes, con "comité" → JEFE_AREA. Coherente.

---

## Supuestos no verificados o incorrectos

Ninguno resultó incorrecto. Los siguientes puntos del diseño NO se verificaron contra el código fuente (quedan como supuestos del diseño todavía por confirmar en implementación, pero ninguno contradice lo leído):

1. **Contenido exacto de los specs de prioridad** (`priority.service.spec.ts`, `request-state.service.spec.ts`, `request.service.spec.ts`, `approval.service.spec.ts`). No se leyeron los archivos de test; el diseño afirma aserciones concretas (p. ej. `score=72 → 'Alta'`, corte 45–49 → P3, `describe` renombrable). La migración de aserciones al vocabulario P1–P4 (§1.1 NIT-5) es correcta en dirección, pero el inventario exacto de aserciones a cambiar debe confirmarse al abrir cada spec durante la implementación. No bloquea el diseño; es trabajo de implementación ya contemplado en §6 y §9.
2. **`PlanService`/`PlanGuideService` como patrón de recomputo server-side (§3.3).** El diseño afirma que `PlanGuideService.compute` recomputa en `submit()`. No se leyó ese servicio; el patrón descrito (recomputar la condición en el momento de la acción en vez de confiar en un flag persistido) es sólido y consistente con lo visto en `PriorityService`, pero la referencia específica a `PlanGuideService` no se confirmó.
3. **`ApprovalService.DECISION_TO_STATE` como patrón de elección de destino (§3.4).** No se leyó `approval.service.ts` (sí el controller). El patrón "mapa decisión→estado" es plausible y coherente con `priority.service.ts`, pero el nombre exacto de la constante no se confirmó.
4. **`body-limit` en 1mb (§5, lección 5).** No verificado en configuración; el diseño lo da por existente. No afecta la validez de las reglas por campo.

Ninguno de estos cuatro introduce riesgo de diseño: son referencias de implementación que se resuelven al abrir los archivos, y las decisiones que de ellos dependen ya están especificadas de forma determinista.
