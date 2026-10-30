# Auditoría UX/UI de octubre de 2026: estado de los hallazgos

Se auditaron 31 rutas de la versión desplegada (`d33e60e`) con el usuario `jefe@demo.local`, en escritorio claro, escritorio oscuro y móvil. La base visual (identidad GIBO, tokens, contrastes, modo oscuro) se dejó como estaba; los hallazgos tratan de organización y flujo.

Límites: producción tenía pocos datos, no hubo pruebas con lectores de pantalla ni con usuarios reales, y algunas pantallas de administración se midieron pero no se analizaron una a una.

## Hecho (PR #25 a #29)

| Hallazgo | Qué se hizo | PR |
| --- | --- | --- |
| A5 Ortografía en el código | Tildes en el módulo SMTP, el menú y un mensaje del cliente de API | #25 |
| A4 (parcial) Menú lateral | Se quitó «Proyectos (Próximamente)» y el pie pasó de tres filas a una | #25, #27 |
| A1 Pantallas de trabajo vacías | Bandeja agrupada en Triage, Priorización, Planificación y Controles | #26 |
| M4 Aprobaciones | Un solo «Actualizar» y vacíos en una línea | #26 |
| M1 (parcial) Panel del área | Solo estados y bandas con datos; el resto plegado | #27 |
| M2 Indicadores | Se quitaron los placeholders «dato futuro» | #25 |
| M3 Leyenda P1 a P4 | Desplegable de una línea | #25 |
| M5 Equipo | «Reenviar invitación» como botón de icono | #25 |
| M6 Reporte semanal enviado | Texto de solo lectura | #25 |
| M7 Columna Triage | Renombrada a «Decisión de triage» | #25 |
| A2 Portafolio | De 11 a 7 columnas | #28 |
| A3 (parcial) Móvil | Filtros plegables bajo «Filtros» | #28 |
| M8 Diálogo de solicitud | Título visible «Fases del flujo» y texto más corto | #29 |
| B1, B3 | Redirección de `/seguimiento/tareas`; título de fila de al menos 24 px | #25 |
| B2 Capacidad | Vacíos en una línea y sin botón duplicado | #29 |
| M10 (parcial) Auditoría | Se quitó el texto técnico bajo los filtros | #25 |

## Pendiente (en `docs/BACKLOG.md`)

| Hallazgo | Backlog |
| --- | --- |
| Desplegar estas fases | BL-023 |
| A3 Tablas a tarjetas en móvil | BL-024 |
| M1 Bloque «Requiere tu atención» (necesita endpoint) | BL-025 |
| A5 Datos maestros sin tilde (viven en la BD) | BL-026 |
| A4 Reagrupar o colapsar el menú, búsqueda rápida | BL-027 |
| M10, M11 Auditoría y Maestras legibles | BL-028 |
| M9 Acciones de fila consistentes | BL-029 |

## Descartado como falso positivo

- «Campo sin etiqueta» en Maestras: el análisis automático contó el `select` oculto que Radix añade dentro de un formulario; el campo «Catálogo» sí tiene etiqueta.
