# Criterio de confirmación o «Deshacer»

Decisión de la oleada 3 (PR-D) para toda acción que cambia datos desde una
pantalla. Una sola regla evita que unas acciones pidan confirmación sin motivo y
otras ejecuten al primer clic algo que no se puede revertir. Especificación visual:
`docs/design/oleada-3-codigos-confirmacion.md`.

## Criterio único

| La acción… | Patrón | Ejemplo |
| --- | --- | --- |
| Es irreversible, borra datos, notifica a terceros o cambia el estado de gobierno | `ConfirmDialog` con la consecuencia concreta. `tone="danger"` si destruye o niega algo; `tone="default"` si avanza un flujo | Aprobar compromiso, autorizar plan, aprobar documento, aprobar cierre, dar o quitar el rol de administrador |
| Pide una justificación | `ReasonDialog` | Devolver, rechazar, «No aplica» |
| Es reversible con una acción inversa, no notifica a nadie y no tiene dependientes | Se ejecuta de inmediato y un aviso neutro ofrece **Deshacer** 8 s (`useUndoableAction`, `lib/use-undoable-action.tsx`) | Retirar o recuperar un activo sin dependientes |
| Es reversible pero tiene dependientes | `ConfirmDialog` `tone="default"` con el recuento y la frase «puedes recuperarlo»; sin «Deshacer» después | Retirar un activo con solicitudes o documentos |

El rojo se reserva para lo irreversible o lo que quita acceso. «Deshacer» llama al
endpoint inverso del servidor: nunca restaura datos en el cliente. El aviso usa un
`id` fijo, así que una acción nueva reemplaza al aviso anterior y «Deshacer» siempre
revierte la última. 8 s no es la única vía de vuelta: «Recuperar» queda en la fila.

## Revisión de las pantallas citadas en el plan de mejora

| Ítem | Pantalla | Estado antes | Resultado |
| --- | --- | --- | --- |
| 2.5 | Aprobar compromiso | Ya confirmaba con resumen (código, score, título) | Sin cambios |
| 2.5 | Autorizar plan | Ejecutaba al primer clic | `ConfirmDialog` «¿Autorizar el plan de PRY-0012?» |
| 2.5 | Aprobar documento (Aprobaciones y Documentos) | Ejecutaba al primer clic | `ConfirmDialog` «¿Aprobar «Título»?» |
| 2.5 | Aprobar cierre | Ejecutaba al primer clic | `ConfirmDialog` «¿Aprobar el cierre de PRY-0012?» |
| 5.1 | Retirar y recuperar activo | Ejecutaba al primer clic | «Deshacer» sin dependientes; confirmación con dependientes |
| 5.3 | Aprobar GC4, «No aplica», solicitar y rechazar cierre | Ya confirmaban | Sin cambios |
| 6.6 | Dar o quitar rol de administrador | El interruptor llamaba a la API al instante | Interruptor controlado con `ConfirmDialog` |

*Activar* un activo (Borrador → Activo) no tiene transición inversa, por lo que no
ofrece «Deshacer»; tampoco pide confirmación porque su efecto es bajo y el activo se
puede retirar. Si se prefiere simetría, bastaría un `ConfirmDialog` `default`.

## Cómo aplicarlo en una pantalla nueva

1. Clasifica la acción con la tabla. Si dudas entre «Deshacer» y confirmación, pregunta
   si existe la acción inversa y si alguien más se entera: si alguna respuesta es no,
   confirma antes.
2. Con confirmación, usa `ConfirmDialog` (título con verbo y objeto más su código,
   descripción con la consecuencia, botón con el verbo concreto, nunca «Aceptar»).
3. Con «Deshacer», llama a `useUndoableAction().execute({ run, undo, message, … })` y
   devuelve el foco a la fila en `onSettled('undone')`.
4. Prueba el teclado: foco inicial en «Cancelar», Escape cierra sin cambios y el foco
   vuelve al disparador.
