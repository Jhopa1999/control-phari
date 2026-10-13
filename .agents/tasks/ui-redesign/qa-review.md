# QA final del rediseño UI/UX de control-phari (feat/ui-redesign, iteración 2)

La iteración 2 cierra los cinco hallazgos de la revisión anterior. El medio (QA-1, flujos con escritura sin ejercitar) queda resuelto con recorridos reales en Chromium de los ocho grupos de flujos del inventario. `demo-data\manifest.json` registra 18 acciones `qa.ui.action.*` capturadas de las respuestas que vio la página: edición de solicitud, envío y autorización del plan, cambio de estado y aceptación de tarea, envío de diario y semanal, transiciones de novedad y compromiso, activo y documento, ruta de gobierno y «No aplica» de GC4 y GC5. También registra las altas `qa.ui.*` de 21 tipos de entidad. Los recorridos destaparon un defecto real en Capacidad: el overlay del diálogo tapaba la acción «Editar la existente» del toast 409 y, al dispararla, la reconciliación de React fallaba. `b961ba5` lo corrige. En el mismo commit, el aviso de tope de Auditoría deja de pedir el filtro Objeto cuando ya está puesto (QA-3, con caso E2E). El modo error se reescribió y termina en 12/12 sin falsos positivos (QA-2). Las tres capturas de selección ya tienen pareja (QA-4). El orden de columnas de Solicitudes a 390 px queda como decisión del diseño cerrado, y se comprobó que la tabla se desplaza con teclado (QA-5). Juzgué el diff de `b961ba5`, los scripts `qa-flows*.cjs`, los logs y el manifiesto sin volver a ejecutar suites, y comparé a ojo las tres parejas nuevas a 1440.

Watch for: la sección QA-1 de `verification.md` no coincide con la evidencia. Dice que «Enviar a autorización» quedó deshabilitado, que la autorización y la aceptación se probaron con datos demo y que los gates no se mutan, pero el manifiesto muestra que las tres cosas se hicieron desde la UI. Además, ambos `qa-flows.txt` son reejecuciones donde casi todo sale «ya existía» (**confirmed**, bajo). Siguen sin recorrido en la UI «Aprobar GCn», el avance de etapas de Controles y «Resolver bloqueo» (**confirmed**, bajo). El arreglo del 409 descarta lo que se escribió en el alta (**confirmed**, bajo).

**Verdict**: APPROVED

## Visión de conjunto

La cobertura base de la iteración 1 se mantiene: barrido de 312/312 (26 rutas × 4 tamaños × 3 roles en dev-header), los 8 casos jwt pedidos, 62/62 pares de contraste AA medidos en Chromium, vacío 12/12, extenso 10/10 y las 24 regresiones acordadas. Para las dos vistas tocadas en `b961ba5`, el barrido se repitió en 24/24 y la suite E2E pasa a 60 passed.

Los recorridos con escritura son de verdad recorridos de UI. Cada paso pulsa los botones y diálogos rediseñados y espera la petición concreta. Antes de enviar, comprueba que la validación local bloquea el envío vacío, y después confirma el toast y el estado en la API. Así quedan demostrados en uso real `validate`, `ReasonDialog`, `ConfirmDialog` y los toasts encadenados. Los DELETE se interceptan con 204 para no borrar datos, de modo que de las eliminaciones solo se prueba el cableado y solo en Equipo.

El arreglo del 409 es correcto en su objetivo, pero cambia el contrato de Capacidad: ante un fallo, el alta ya no conserva el diálogo ni los valores. En las parejas nuevas de Triage, Priorización y el detalle de tarea, el después muestra la misma solicitud, el mismo estado, el mismo score 84 · P1 y la misma tarea Terminada al 100 % y Aceptada, y no falta ninguna acción del antes, incluida «Retirar aceptación».

<details>
<summary>Issues (4)</summary>

1. **verification.md desalineado con la evidencia de QA-1** (bajo, confirmed): corregir la sección QA-1 para que diga lo que registra el manifiesto. «Enviar a autorización», «Autorizar» y «Aceptar tarea» se ejecutaron desde la UI (acciones 014, 015 y 008), y la ruta, GC4 y GC5 también (016–018). El total es de 512 entidades, no 509. Conviene guardar el log de la primera ejecución en lugar de la reejecución, o anotar que la prueba de las altas es el manifiesto.
2. **Acciones de Controles sin recorrido en la UI** (bajo, confirmed): quedan sin recorrido «Aprobar GC4/GC5», «Enviar a validación», «Marcar lista para liberar», «Confirmar estabilización» y «Resolver bloqueo». La edición y eliminación de fase y de tarea tampoco se recorrieron. El cableado es directo por código, pero conviene recorrerlos o dejarlos listados como pendientes en `verification.md`.
3. **El 409 de disponibilidad descarta lo escrito** (bajo, confirmed): `capacidad-view.tsx` cierra el diálogo de alta y «Editar la existente» abre la fila guardada, así que las horas nuevas se pierden y hay que volver a escribirlas. El comentario del `catch` aún dice «conserva el diálogo abierto y los valores». Hay que actualizar el comentario y valorar si conviene precargar los valores tecleados en la edición.
4. **Reejecuciones que acumulan datos** (bajo, confirmed): los pasos de asignación y validación no comprueban si ya existen y crean un registro en cada pasada. El manifiesto tiene 10 `Assignment` y 7 `ValidationRecord`. Conviene hacerlos idempotentes como el resto antes de reutilizar los scripts.

</details>

<details>
<summary>Detalles</summary>

### Evidencia de QA-1: lo que prueba el manifiesto y lo que dice el resumen

Los dos `qa-flows.txt` que quedan en disco (63/63 y 65/65) son reejecuciones. Plan, triage, evaluación, aprobación, diario, semanal, activo, documento, usuario y rol salen todos como «ya existe (reejecución)», y solo la edición de solicitud, las transiciones de coordinación, la versión de documento, el 409 de capacidad, la asignación, la validación y la revocación se ejecutan de nuevo. El log de la pasada que hizo las altas se sobrescribió. La prueba de esa pasada es el manifiesto. `attachRecorder` de `qa-flows-lib.cjs` escribe una entidad `qa.ui.*` por cada POST 2xx con id nuevo y una acción por cada transición, siempre a partir de las respuestas que recibe la página, no de llamadas directas a la API (**confirmed**: 18 acciones, cada una con su `flow` y estado 200/201).

La tabla de QA-1 en `verification.md` describe otra pasada. En el flujo «plan» dice que «Enviar a autorización» quedó «correctamente deshabilitado con pendientes» y que la autorización y la aceptación «quedan probadas con los datos demo». En «controles» dice que «los gates no se mutan». El manifiesto contradice las tres cosas, y a favor del trabajo hecho: `POST …/plan/submit` (flow `plan`), `POST …/plan/authorize` (flow `plan-autorizacion`), `PATCH /tasks/:id/accept` (flow `plan-aceptar`), `PUT …/governance-route` y `POST …/gates/GC4|GC5/waive` (flow `controles`). El conteo de entidades también difiere (509 en el texto, 512 en el manifiesto). No bloquea, pero un revisor que solo lea `verification.md` creerá que hay menos cobertura de la real.

### Lo que sigue sin recorrido

En Controles, el script guarda la ruta simplificada, registra una validación y marca GC4 y GC5 como «No aplica». Con eso ya no quedan controles aprobables en esa solicitud, así que «Aprobar GCn» no se pulsó nunca. Tampoco se pulsaron los tres botones de «Avance de etapas» ni «Resolver bloqueo» del registro de validaciones. Revisé el código: en `gate-item.tsx`, «Aprobar» usa `unavailable` solo cuando se muestra el panel de bloqueo de GC4, y en el resto llama a `onApprove`, que va directo a `approveGate` en `frameworks-view.tsx`. Las etapas llaman a `handleStage` con la función de API y el texto del toast. Es el mismo patrón que «Marcar como no aplica», que sí se recorrió, y por eso lo clasifico como bajo. Las eliminaciones de fase, tarea, disponibilidad y asignación tampoco se recorrieron (solo la revocación de rol, con el DELETE interceptado).

### Capacidad: el arreglo del 409

```ts
if (err instanceof CapacityError && err.status === 409 && !dispEditing) {
  const existing = availability.find((a) => a.userId === values.userId);
  if (existing) {
    setDispOpen(false);
    setDispEditing(null);
    toast('Ya hay disponibilidad para esa persona y mes.', { action: { label: 'Editar la existente', … } });
```

El arreglo resuelve el bloqueo real (overlay sobre el toast y dos diálogos a la vez). A cambio, el camino del 409 deja de cumplir lo que dice el comentario de tres líneas más arriba («Fallo: conserva el diálogo abierto y los valores (AC-031)»). Las horas tecleadas se pierden y la edición abre con las horas guardadas. El diseño (§11.11, SCR-17) solo exige conservar el toast con «Editar la existente», así que no lo trato como regresión, pero el comentario engaña y la experiencia obliga a escribir dos veces. Además, se muestran dos toasts seguidos, el de error con el mensaje de la API y el informativo con la acción. Ya era así antes del commit.

</details>

<details>
<summary>Mapa de archivos</summary>

Commit nuevo de esta iteración sobre `cf9d653`: `b961ba5`. `apps/web/src/app/activos/capacidad/capacidad-view.tsx` cierra el diálogo de alta ante el 409 antes de ofrecer «Editar la existente». `apps/web/src/app/gobierno/auditoria/auditoria-view.tsx` cambia el texto del aviso de tope cuando hay un Objeto elegido. `e2e/audit-filter.spec.ts` añade el caso del aviso con Objeto y tope.

Evidencia: `verification.md` § QA FINAL — Iteración 2, `qa-flows.txt`, `qa-error.txt`, `demo-data\manifest.json` (`qa.ui.*`) y `screenshots\after\review` frente a `screenshots\before-same-data\review`. Diff completo: `git -C c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\ui-redesign diff main`.

</details>
