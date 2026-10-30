# Bandeja de solicitudes (Triage, Priorización, Planificación, Controles)

Origen: auditoría UX/UI de octubre de 2026, hallazgo A1.

## Objetivo

Al entrar a una mesa de trabajo, la persona ve de inmediato **qué hay que atender** y lo abre con un clic. Antes solo veía un desplegable "Elige una solicitud" y un estado vacío grande.

## Estructura

1. Barra de contexto actual (`RequestContextBar`): se conserva, con su selector, para cambiar de solicitud y para los enlaces `?requestId=`.
2. Bajo la barra, **solo cuando no hay solicitud elegida**: la bandeja, agrupada con los mismos grupos del selector.
3. Al elegir una solicitud, la bandeja desaparece y se muestra el detalle como hasta ahora.

## Bloques de la bandeja

- **Encabezado de grupo** (`h2`, `text-sm font-semibold`) con la etiqueta del grupo y un `Badge neutral` con el conteo.
- **Tarjeta de lista**: `ul.divide-y.overflow-hidden.rounded-xl.border.bg-card.shadow-card`.
- **Fila**: un `button` de ancho completo, `px-4 py-3`, `hover:bg-muted/50`, foco `focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`.
  - Línea 1: título (`font-medium`, hasta 2 líneas).
  - Línea 2: `RequestSummary` con los badges de la mesa (estado, registro, y en Planificación la prioridad).
  - A la derecha: texto "Abrir" (solo desde `sm`) y `ChevronRight`.
- **Límite**: 12 filas por grupo; si hay más, una línea `text-meta text-muted-foreground` indica que el resto se busca en el selector.

## Accesibilidad

- Cada grupo es una `section` con `aria-labelledby` apuntando a su `h2`.
- El nombre accesible de la fila es el título más los textos de los badges.
- Objetivo de clic de al menos 44 px de alto (la fila mide más de 56 px).
- Contraste: reutiliza tokens ya medidos (`text-muted-foreground` 6.6:1 sobre lienzo).

## Estados

- **Sin solicitudes en alcance**: se mantiene el estado vacío actual de cada mesa.
- **Con solicitudes pero ninguna en el primer grupo**: aparecen bajo "Otras solicitudes".
- **Carga y error**: sin cambios (los resuelve cada vista).
