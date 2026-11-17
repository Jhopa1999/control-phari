# Oleada 2 · Controles de gobierno y cierre: un solo camino de cierre y controles congelados

Alcance: plan de mejora 5.3 (decisiones D10 y D11). Vista: `/administracion/frameworks`
(Controles de gobierno). Todo se construye con componentes que ya existen
(`GateItem`, `InlineNotice`, `DisabledReason`, `Button unavailable`, `ConfirmDialog`,
`Field`, `Select`, `buttonVariants`). No se crea ningún componente ni token nuevo;
los colores salen de los tokens de `.kiro/steering/25-marca-gibo.md`.

## Decisión transversal

| Situación | Antes | Después |
| --- | --- | --- |
| Cerrar el proyecto | Dos caminos: «Aprobar GC5» y el cierre formal | Un camino: el cierre formal (solicitud del líder, aprobación del jefe) en la ficha. GC5 solo lo refleja |
| Solicitud cerrada | Los controles seguían editables | Todo queda deshabilitado con el motivo visible; se reabre desde la ficha (jefe) |
| Ejecutor de una validación | Lista de personas y «Otra persona (ingresar id)» con un UUID a mano | Solo personas del alcance. El integrante solo puede elegirse a sí mismo |

## 1. Control GC5 «Cierre» (`GateItem`)

### Objetivo
Quien revisa los controles entiende que GC5 no se aprueba aquí y llega al cierre en un clic.

### Estructura (1440 y 390 igual, una columna)
```
li (control GC5)
 ├ h2 «GC5 · Cierre» + StatusBadge
 ├ DescriptionList (Condición, Autoridad)
 └ bloque de cierre (en lugar de la fila «Aprobar GC5 / Marcar como no aplica»)
      p.text-sm        texto según el estado
      Link (buttonVariants outline, size sm)  «Ir al cierre del proyecto»
```

### Texto
- GC5 pendiente, proyecto abierto: «El cierre se solicita y se aprueba desde el cierre del proyecto. Cuando el jefe de área lo aprueba, este control queda cumplido.»
- GC5 cumplido y proyecto cerrado: «Cumplido por el cierre formal del proyecto.» (más «Decidido por … el …» ya mostrado por el estado).
- Acción: **Ir al cierre del proyecto** → `/demanda/solicitudes/{requestId}` (la ficha contiene el panel «Cierre del proyecto»). Se muestra con `canReview` o sin él: es solo un enlace.
- «Marcar como no aplica» de GC5 sigue disponible con las reglas actuales (ruta simplificada o exploración, control pendiente, proyecto abierto).

### Clases (las que salen de los componentes)
- Enlace: `buttonVariants({ variant: 'outline', size: 'sm' })` sobre `Link`; en móvil `pointer-coarse:min-h-11`.
- Texto: `text-sm text-muted-foreground`.

## 2. Solicitud cerrada: controles deshabilitados con motivo

### Cuándo
`board.operationalState === 'CERRADA'`.

### Estructura
```
InlineNotice tone="info" role="status" title="Proyecto cerrado"
  «Sus controles quedaron congelados. Para modificarlos, reabre el proyecto desde la ficha de la solicitud.»
  acción: Link «Ir a la ficha» (outline, sm)
```
Va arriba del tablero, bajo la barra de contexto. Es informativo (`info`), no un error.

### Qué se deshabilita
Aprobar GC4, Marcar como no aplica, Guardar ruta, los tres botones de «Avance de etapas»,
Registrar validación y Resolver bloqueo. Todos con `Button unavailable` (`aria-disabled`,
conservan su lugar en el orden de tabulación) y `aria-describedby` apuntando a un
`DisabledReason` compartido por grupo: «El proyecto está cerrado; reabre el proyecto para modificar sus controles.» El aviso superior ya lo dice, por eso el motivo por botón solo se repite en la barra lateral y en la pestaña Validaciones (una vez por grupo, no por botón).

### Estados
- Cargando: el esqueleto actual. Error: `ErrorState` actual.
- Foco: anillo `--ring` heredado de `Button`.
- Temas: `info` usa los tokens `info*`, ya medidos en claro y oscuro; sin clases distintas por tema.

## 3. Ejecutor de la validación (`ValidationFormDialog`)

- **Reviewer (líder o jefe):** `Select` con las personas del alcance (`GET /coordination/people`). Se elimina la opción «Otra persona (ingresar id)» y el campo del UUID.
- **Integrante:** el `Select` muestra solo su propio nombre, preseleccionado y sin posibilidad de cambiarlo; texto de ayuda bajo el campo: «Solo puedes registrar validaciones ejecutadas por ti.» (`Field help`).
- Si la lista de personas no carga: se ofrece únicamente la propia persona.
- «Fecha de ejecución»: `max` = ahora (el navegador impide elegir una fecha futura); el mensaje de la API se muestra en `FormError` si aun así se envía.
- El diálogo sigue abierto con los valores intactos ante un error de la API (se conserva).

## 4. Confirmación al aprobar GC4

`ConfirmDialog` (`tone="default"`): título «¿Aprobar GC4?», descripción «La solicitud pasará a En estabilización. Esta decisión queda registrada con tu nombre.», botón «Aprobar GC4». El foco vuelve al encabezado del control al cerrar (`gateHeadingId`).

## Mensajes de la API

Los 400 y 409 de gobierno se muestran con el texto del servidor (en español), usando
`apiErrorFrom`, no el genérico «Ya existe un registro con esos datos».

## Accesibilidad

- Contraste: `text-muted-foreground` sobre `bg-card` y `info-subtle` se mide (≥ 4,5:1) en ambos temas antes de cerrar con axe.
- El significado no depende del color: el aviso de cierre lleva icono, título y texto.
- Objetivo táctil: botones con `pointer-coarse:min-h-11`; en 390 px se apilan (`flex-wrap`).
- `axe` sin violaciones serias o críticas en `/administracion/frameworks` con una solicitud abierta y una cerrada.
