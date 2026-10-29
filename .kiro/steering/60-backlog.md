---
inclusion: auto
name: Backlog de pendientes
description: Gestión del backlog de pendientes por desarrollar (docs/BACKLOG.md). Aplicar cuando el usuario diga "agrega al backlog", "deja pendiente", "para después", "qué hay pendiente", "toma del backlog" o mencione BL-XXX.
---

# Backlog de pendientes

Archivo único: `docs/BACKLOG.md`.

## Agregar
Cuando el usuario pida dejar algo pendiente (o diga "para después"):
- Agregar una fila a la tabla "Pendientes" con el siguiente ID `BL-NNN` consecutivo.
- Incluir título corto, prioridad (por defecto `media`) y detalle suficiente para retomarlo sin esta conversación: archivos/módulos implicados, decisiones ya tomadas, dudas abiertas.
- No implementar nada. Solo registrar.

## Consultar
Cuando pregunte qué hay pendiente, listar las filas con estado `pendiente` ordenadas por prioridad.

## Ejecutar
Cuando el usuario diga "toma BL-XXX":
- Marcar `en curso`, implementar siguiendo los steerings del repo, y al terminar mover la fila a "Hechos / descartados" con fecha.
- Si cambia el alcance, actualizar el detalle antes de implementar.

## Reglas
- No ejecutar pendientes por iniciativa propia.
- No borrar filas; moverlas a "Hechos / descartados".
