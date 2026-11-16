# Oleada 2 · PR-C · Activos y documentos: el estado gobierna lo que se asocia y «Vigente» exige aprobación

Alcance: decisiones D8 (estado del activo) y D9 (documento «Vigente») del plan de mejora (módulos 5.1 y 5.2). Cambios de presentación sobre vistas que ya existen: el selector «Activo existente» del panel «Activo base» del triage y las acciones y el editor de Documentos. Componentes existentes: `Select`, `SelectItem`, `Field`, `DisabledReason`, `InlineNotice`, `StatusBadge`, `RowActions`. Solo tokens semánticos de `.kiro/steering/25-marca-gibo.md`. No se añaden pantallas ni componentes.

Archivos: `app/demanda/triage/asset-base-panel.tsx`, `app/activos/documentos/documentos-view.tsx`, `app/activos/documentos/documento-editor-dialog.tsx`.

## 1. Objetivo de las vistas

- Triage: quien asocia el activo base solo elige activos que la API va a aceptar, y entiende por qué otros no están disponibles.
- Documentos: nadie publica por accidente. El líder envía a aprobación; el jefe aprueba o publica. Quien edita un documento vigente sabe que volverá a borrador.

## 2. Selector de activo del triage (D8)

Estructura igual a la actual (`Field` + `Select`). Cambia el contenido de la lista.

- Se ofrecen como opción normal solo los activos con estado `ACTIVO`.
- Para el jefe de área (el único que puede activarlos) se listan además los activos `BORRADOR` y `RETIRADO` como `SelectItem disabled`, con sufijo en el texto visible: «Nombre · en borrador» o «Nombre · retirado». Los demás roles no ven esos activos en el selector.
- Agrupación: primero los `ACTIVO`; los no asociables van después, bajo un `SelectGroup` con `SelectLabel` «No asociables». Nunca solo color: el motivo va en texto.
- Ayuda del `Field` (`help`): «Solo se pueden asociar activos en estado Activo y habilitados para tus procesos. Un activo en borrador lo activa el jefe de área en el módulo de Activos. ¿No aparece? Debe crearlo el jefe de área.» Para el jefe se añade al final: «Los de la lista «No asociables» están en borrador o retirados.»
- Lista sin opciones asociables (no hay activos `ACTIVO` visibles): el selector queda con el marcador «No hay activos en estado Activo»; se muestra `DisabledReason` bajo el selector: «Pide al jefe de área que active un activo para asociarlo.» y el botón «Asociar activo» queda `disabled` con ese motivo enlazado por `aria-describedby`.
- Activo ya asociado (valor actual conservado): la tarjeta de solo lectura sigue mostrando el nombre y su `StatusBadge kind="asset"` aunque esté en borrador o retirado. Si está en borrador o retirado se añade debajo `p className="text-meta text-muted-foreground"`: «Este activo no está activo; la asociación se conserva, pero no podrás elegirlo de nuevo si lo cambias.»
- Error del servidor (409 de la API, p. ej. si el activo cambió de estado mientras se elegía): mensaje en español en el `FormError` del panel y toast, como hoy; el valor elegido se conserva.

Contenido del panel de ayuda «Crear activo en el módulo de Activos»: sin cambio.

## 3. Documentos: acciones por rol y estado (D9)

Menú de acciones por fila (`RowActions`, placement `menu`). El control real es del servidor; la web solo oculta lo que el rol no puede hacer.

| Estado | Jefe de área | Líder del proceso del activo |
| --- | --- | --- |
| Borrador | Enviar a aprobación, **Publicar** (directo) | Enviar a aprobación |
| Pendiente de aprobación | Aprobar, Rechazar, Retirar envío | Retirar envío |
| Rechazado | Reenviar a aprobación, Pasar a borrador | igual |
| Vigente | Archivar, Pasar a borrador | Archivar, Pasar a borrador |
| Archivada | **Reactivar** (a Vigente) | sin acción de estado |

- «Publicar» y «Reactivar» solo aparecen para el jefe. La documentación de cierre sigue sin «Publicar» (pasa siempre por aprobación).
- Errores del servidor al mover de estado: toast con el texto en español de la API (`403`: «Solo el jefe de área puede publicar directamente; envía el documento a aprobación.»).

## 4. Editor de documento: aviso al versionar un vigente (D9)

Cuando se edita un documento con estado `VIGENTE`, bajo `RequiredHint` y encima del primer campo:

```
InlineNotice tone="warning"  role="note"
  Título: «Este documento está vigente»
  Texto:  «Al guardar se crea una versión nueva y el documento vuelve a Borrador: necesitará aprobación para ser vigente otra vez.»
```

- Mismo `InlineNotice` del sistema (borde y fondo `warning`, icono `TriangleAlert`, texto `foreground`). No aparece en otros estados ni al crear.
- Tras guardar, el toast de éxito dice «Nueva versión guardada. El documento volvió a Borrador y necesita aprobación.» solo si el documento era vigente; si no, «Nueva versión guardada.».
- La descripción del diálogo no cambia.

## 5. Estados

| Estado | Comportamiento |
| --- | --- |
| Cargando activos | El selector del triage queda vacío con el marcador actual; el botón sigue habilitado para mostrar el error «Elige un activo existente.» solo tras enviar. |
| Sin activos asociables | `DisabledReason` y botón deshabilitado, como en §2. |
| Error al cargar activos | El selector queda vacío (carga tolerante a fallo, sin cambio). |
| Guardando | Botones con `loading`, como hoy. |
| Foco | `--ring` del sistema. Tras un error de envío el foco vuelve al selector (triage) o queda en el diálogo (editor). |

## 6. Accesibilidad y tokens

- Las opciones deshabilitadas del `Select` llevan `aria-disabled` (Radix) y el motivo en el texto visible, no solo en el color.
- El aviso del editor usa `role="note"`; no es una alerta porque no aparece por un evento.
- Contrastes: pares ya medidos en `docs/design/identidad-color-menu.md` (§4): `muted-foreground`/lienzo 6,25 y /tarjeta oscura 7,58; `foreground` sobre `warning-subtle` en los dos temas (uso ya vigente en `InlineNotice`); borde del control/tarjeta 3,63 claro y 3,49 oscuro.
- Móvil (390 px): el menú de acciones y el selector ocupan el ancho completo; el aviso del editor se apila (icono y texto) sin recortar.
