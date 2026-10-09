# Revisión de diseño · FASE 5 · Trabajo y coordinación

**Alcance de la revisión.** Lectura en frío de `design.md` (tercera iteración) contra: el SDD en
`SDD_control-phari/specs/` (04/05/06/07/08/09/10/11/16/17/18/19/20/23/28/29), el `schema.prisma` y los
módulos existentes de Fases 1–4, y el steering (NestJS dueño de lógica/validación/autorización/
persistencia/API/OpenAPI; Prisma solo en `apps/api`; frontend solo vía `@plantilla-portales/api-client`;
TS estricto sin `any`; monolito modular).

**Nota de ubicación.** El directorio `SDD_control-phari/` **no existe** dentro del worktree
`.worktrees/fase5-trabajo/`; vive en la raíz del repo principal
(`c:\Users\analistabi2\Desarrollo\control-phari\SDD_control-phari\`). Toda la verificación de specs se
hizo contra esa ruta. No afecta al veredicto (el diseño cita las specs correctamente), pero el
implementador debe saber que las specs no están versionadas en el worktree.

**Resumen del veredicto.** El documento está en una madurez alta: las dos revisiones previas corrigieron
los supuestos de código que eran falsos (traversal de `Task`, visibilidad de `Request`), y verifiqué que
**esas correcciones son ahora exactas** contra el código real. No encontré findings HIGH ni MEDIUM
bloqueantes. Quedan NITs de precisión documental. **Veredicto: APPROVED.**

---

## Supuestos verificados (contra código / specs reales)

1. **`Task` NO tiene relación `request`.** Verificado en `schema.prisma`: `Task` solo expone `phase`,
   `process`, `responsible`, `acceptedBy`, y las de dependencias. La cadena real es
   `Task → PlanPhase(phaseId) → Plan(planId) → Request(requestId)`. El diseño valida `taskId` por
   **traversal por pasos** replicando `plan-state.service.ts::requireTaskInScope`, que efectivamente hace
   `task.findFirst({ include: { phase: { select: { planId } } } }) → plan.findFirst({ select: { requestId } }) → request.findFirst({ AND: [{ id }, requestScopeWhere] })`.
   El diseño coincide **línea por línea** con el helper heredado. (HIGH-1 de la iteración previa: resuelto
   correctamente.)

2. **Visibilidad real de `Request` = `mainProcessId in scopedProcessIds` (TODOS los grants), jefe `{}`.**
   Verificado en `request/request.service.ts::scopeWhere` (es `private`), `request-state.service.ts`,
   `approval.service.ts` y `plan-state.service.ts::requestScopeWhere`: todos devuelven
   `{ mainProcessId: { in: Array.from(actor.scopedProcessIds) } }` para no-jefe y `{}` para jefe. No hay
   cláusula de `RequestParticipant` en el alcance de lectura. El diseño valida `projectRequestId` con
   `requestVisibilityWhere(actor)` idéntico, y eliminó la cláusula inventada "donde participa". (HIGH-2
   previo: resuelto correctamente.)

3. **`scopeWhere` de `request` es `private` (no importable).** Verificado. Justifica que
   `CoordinationScopeService` construya su propio helper en lugar de importar. También verificado que
   `capacity-scope.service.ts` filtra grants por `RoleCode.LIDER_PROCESO` (no por `scopedProcessIds`),
   que es el patrón correcto que el diseño replica para el alcance por rol de las entidades de Fase 5.

4. **Alcance por rol de las specs.** `specs/10`: Bitácoras → integrante "Propias", líder "Revisar trabajo
   del proceso", jefe "Visibilidad de área"; Reuniones/compromisos → integrante "Participar", líder/jefe
   "Gestionar proceso/área". El diseño modela exactamente eso: integrante por `userId` (autor/asignado/
   reportado/participante), líder por `leaderProcessIds` (lectura), jefe `{}`; escritura por persona
   (líder no edita lo del integrante por defecto, D13). `specs/10` también exige "No elevar
   automáticamente líder de un proceso a líder de todos" → el uso de `leaderProcessIds` lo respeta.
   404 fuera de alcance / 403 rol: coherente con `specs/18` AC-025/026 y los controles negativos de
   `specs/10`.

5. **`AuditObjectType` y `OBJECT_TYPES` son dos lugares distintos y ambos deben ampliarse.** Verificado:
   `audit/audit.service.ts` define `AuditObjectType` (termina en `ASSIGNMENT`); `audit/dto/list-audit-events.dto.ts`
   define el array `OBJECT_TYPES` usado por `@IsIn` del filtro. El propio DTO documenta que si falta un
   tipo, el filtro `?objectType=` responde 400. El diseño amplía ambos con los seis nuevos tipos en el
   mismo orden. Correcto.

6. **`CurrentActor` tiene `scopedProcessIds: Set<string>`, `grants[].roleCode`, `isJefeArea`.** Verificado
   en `auth/current-actor.ts`. El diseño usa `Array.from(actor.scopedProcessIds)` y
   `actor.grants.filter(g => g.roleCode === RoleCode.LIDER_PROCESO)`, ambos correctos para esos tipos.

7. **`MODULE_MATRIX`: `log` y `meeting` habilitados para los tres roles; `assigned` también.** Verificado
   en `auth/module-matrix.ts` y en `specs/10`. El diseño no agrega claves nuevas (reutiliza `log`/`meeting`),
   coherente con el steering (no inventar). La diferencia de alcance se aplica en el service, no en el guard.

8. **Entidades vs `specs/08` data-dictionary.** Verificado campo a campo:
   - Diario: proceso, fecha, actividades N, clasificación, proyecto/tarea/activo, descripción, resultado,
     estado, horas, evidencia, novedad, siguiente paso/fecha, **notas del día** → el diseño cubre todos
     (incl. `dayNotes`, `nextStep`/`nextStepDate`, `relatedIssueId`). 1:N confirmado por "actividades N".
   - Semanal: lunes, proceso, 5 secciones (resultados / propuestas / bloqueos / compromisos / decisiones),
     "métricas agregadas solo de diarios enviados/revisados" → el diseño tiene las 5 secciones de texto y
     consolidación por lectura. Coincide con `specs/29` SCR-11 "cinco secciones de resumen".
   - Novedad: proceso, fecha, tipo, solicitud/tarea/activo, título, detalle, impacto, **responsable de
     resolución, vencimiento**, resolución/evidencia → el diseño cubre todos (`resolverUserId`,
     `targetDate`, `relatedAssetRef`).
   - Reunión: título, proceso, estado, **solicitud y proyecto** (dos FK distintas a Request, coincide con
     el data-dict que las lista por separado), responsable, fecha/hora, participantes, agenda, decisiones,
     observaciones → cubierto.
   - Compromiso: título, proceso/estado, solicitud, responsable/asignado, vencimiento, **proyecto/reunión**,
     resultado esperado, resultado/evidencia, bloqueos → cubierto.

9. **BR-014 server-side.** Verificado contra `specs/05` BR-014 y `specs/09`/`specs/18` AC-014/015/016:
   planificada → proyecto **o** tarea; soporte → activo; interna → opcional; extraordinaria → solicitante
   **y** justificación. El diseño valida en el service en guardar **y** enviar, coherente con `specs/09`
   Diario "guardar/enviar sujeto a clasificación" y con AC-014/015/016 "intenta guardar/enviar → no
   válida". Reacción 400 con mensaje y conservación de entrada (AC-031). Correcto.

10. **BR-013/015/023 (fronteras).** Verificado: horas = dedicación, nunca escriben `Task.estimateHours`/
    `progress`/`accepted` (BR-013; el service `coordination` no importa `plan`/`TaskService`); enviar =
    revisión, no toca `operationalState`/`Approval`/prioridad (BR-023); semanal consolida solo
    `ENVIADO/REVISADO` (BR-015/AC-017) y `proposals`/`commitmentsText` son texto que no crea `Commitment`
    ni muta prioridad (AC-018/BR-015). Pruebas unit dedicadas a cada invariante en §6. Correcto.

11. **`RECORD_STATE` NO es inventado.** Verificado en `specs/06`: "catálogo record_state tiene Borrador,
    En curso, Bloqueado, Completado, Archivado, pero la asociación/transición exacta requiere cotejo". El
    diseño usa exactamente esos códigos y marca las **transiciones** (no los valores) como P/reversible.
    Correcto: los valores están respaldados, las transiciones no, y el diseño separa ambos.

12. **`P`/reversibles.** Verificado contra `specs/06` y `specs/28` p.3/p.9: transiciones de revisión/
    devolución de bitácora, cierre/reapertura de novedad, publicación de acta, compromisos automáticos,
    catálogo/transiciones de compromiso y zona horaria/cortes de semana están todos listados como
    pendientes en el SDD. El diseño los marca como máquina mínima reversible y **no los afirma**. `Meeting`
    inicia en Borrador ("confirmado" en `specs/06`). No hay invención.

13. **Activo sin entidad `Asset` (gancho a Fase 7).** Verificado: `schema.prisma` no tiene `Asset`;
    FEATURE-007 está fuera de alcance. El diseño representa el activo como texto (`assetRef`,
    `relatedAssetRef`) con gancho de migración documentado (D3). Coherente con el steering (no introducir
    infra/entidades por defecto).

14. **Patrón de módulo raíz + submódulos.** Verificado en `plan.module.ts`: un `@Module` con varios
    controllers/services y comentario explícito del orden de registro por colisión de rutas estáticas vs
    paramétricas (`TaskController` primero). El diseño replica esto en `coordination` (MEDIUM-2 previo:
    resuelto con regla de prefijos + fallback de orden). Correcto.

15. **Helper de fecha.** Verificado `capacity/month.ts` (`monthStringToDate`/`dateToMonthString`,
    `MONTH_PATTERN`). El diseño generaliza a `dateStringToDate`/`dateToString` con revalidación round-trip
    (Finding 6 previo). Patrón coherente.

16. **Pantallas y navegación.** Verificado: `apps/web/.../seguimiento/bitacora/page.tsx` y
    `reuniones/page.tsx` existen; `semanal`, `novedades`, `compromisos` **no** existen (el diseño dice
    "crear"). `navigation.ts` usa la forma `{ href, label, moduleKey }` y el grupo Seguimiento ya tiene
    Bitacora (`log`) y Reuniones (`meeting`). Los tres items propuestos están bien formados.

---

## Supuestos no verificados / imprecisos

Ninguno de los supuestos de código del diseño resultó falso en esta iteración. Los dos HIGH de la
iteración previa (traversal de `Task`, visibilidad de `Request`) están corregidos y verificados como
correctos. Los únicos puntos abiertos son de **precisión documental** (ver NITs) y de **cotejo contra el
Site** que el propio SDD marca como P — fuera del control del diseño.

Un punto de rastreo que el implementador debe tener presente (no bloqueante): el diseño afirma que el
comando de regeneración del api-client es `npm run generate:api-client` "o equivalente ya cableado en
Fases 1–4". No verifiqué el nombre exacto del script en `package.json`. Es una ejecución, no una decisión
de diseño; se resuelve en implementación leyendo el script real.

---

## Findings

1. **NIT — `08` Semanal lista "compromisos (responsable/fecha)" pero el diseño lo modela como un único
   campo de texto `commitmentsText`.** Ubicación: §1.2 (WeeklyReport) y §2.5. El data-dictionary sugiere
   estructura (responsable + fecha) más que texto plano. El diseño lo justifica por BR-015/AC-018 (las
   propuestas no crean `Commitment` ni mutan nada) y lo marca implícitamente como contenido de informe,
   lo cual es defendible y reversible. No bloquea, pero conviene dejar explícito en el documento que el
   mapeo "compromisos de la próxima semana" (campo estructurado del Site) → texto libre es una **decisión
   P reversible** análoga a D12, con gancho a estructurar si el Site lo confirma.
   **Fix concreto:** añadir una línea en §11 (p. ej. D14) o en la nota de WeeklyReport: "`commitmentsText`
   mapea la sección 'compromisos (responsable/fecha)' de `08` Semanal como **texto libre** (P reversible);
   si el Site confirma captura estructurada, se añaden columnas o se derivan a `Commitment` sin cambiar el
   contrato de secciones."

2. **NIT — rango de consolidación `[weekStart, weekStart+6]` no fija explícitamente la aritmética UTC ni
   la exclusividad del extremo superior.** Ubicación: §2.5. El diseño dice "cuya `date` cae en la semana
   `[weekStart, weekStart+6]`". Como `weekStart` es `@db.Date` UTC y los diarios usan `@db.Date`, el
   cálculo debe hacerse con los mismos helpers UTC (`dateStringToDate`) para evitar un off-by-one por zona.
   No es un hueco de modelo, pero el documento no dice con qué operador se filtra (`gte`/`lte` sobre
   `date`).
   **Fix concreto:** en §2.5 precisar el `where` de la consolidación:
   `date: { gte: weekStart, lte: addDaysUTC(weekStart, 6) }` (o `lt: addDaysUTC(weekStart, 7)`), calculado
   en UTC con el mismo helper de fecha, y añadir un caso de prueba de borde (diario del domingo de la
   semana incluido; lunes siguiente excluido).

3. **NIT — `activityStatus` admite "texto/maestra `RECORD_STATE`" (dos interpretaciones).** Ubicación:
   §1.2 (DailyLogActivity, fila `activityStatus`) y D9. El campo se describe como "estado de la actividad
   (texto/maestra `RECORD_STATE`)". "texto **o** maestra" es ambiguo para quien implementa el DTO: ¿se
   valida contra `RECORD_STATE` con `@IsIn` o se acepta cualquier string? D9 dice "validable contra
   `RECORD_STATE` si se informa; no bloquea", lo que inclina a validar, pero §1.2 deja abierto "texto".
   **Fix concreto:** fijar una sola regla en el DTO: `activityStatus?` = `@IsOptional @IsIn(RECORD_STATE
   codes)` (coherente con D9 y con no inventar valores), y actualizar la fila de §1.2 para quitar la
   opción "texto libre". Si se prefiere texto libre, decir explícitamente `@IsOptional @IsString` y quitar
   la mención a `RECORD_STATE`. Elegir una.

---

## Veredicto

Conteo: **HIGH = 0, MEDIUM = 0, NIT = 3.**

Dado que no hay findings HIGH ni MEDIUM, el veredicto mecánico es **APPROVED**. Los tres NITs son de
precisión documental y pueden resolverse durante la implementación sin re-revisión. El diseño verificó
sus supuestos de código críticos y coincide con el repo y el SDD en todos los puntos exigidos por el
brief (a–g).
