# Cimientos de la renovación UI/UX: tokens, primitivas, componentes compartidos, shell, login y pantallas de error

Revisión visual de FEAT-002 a FEAT-005 contra `design.md` (§5 sistema visual, §6 primitivas, §7 componentes, §8 shell, §8.6 errores, §11.2 login), hecha solo con las capturas de las carpetas `review/` y con `verification.md`. Los tokens, la tipografía y el shell se ven como dice el diseño: un único acento azul, neutros fríos, Inter a 14 px, filas de 40 px, sombras solo en superposiciones, sidebar de 240 px con grupos por flujo, riel de 56 px a 1100 px, cajón de 288 px por debajo de 1024 px y un solo `h1` por página. Login, «Página no encontrada» y el error de ruta siguen la anatomía de §8.6 y §11.2 en los dos modos de autenticación. No aparecen desbordes horizontales ni solapes en el shell (la única excepción es `/demanda/resumen` a 390 px, que ya existía y se migra en FEAT-006), y el foco se ve en todos los controles capturados.

Watch for: `global-error.tsx` sale en la fuente del sistema y no en Inter (**confirmed**); en dev-header, el login queda como un recuadro gris dentro del shell y añade scroll vertical (**confirmed**, lo pide el diseño); el riel recorta un icono contra el pie y no da ninguna pista de que hay más ítems (**likely**). Todos son de severidad baja; ninguno bloquea.

**Verdict**: APPROVED

## High-level view

El sistema visual de §5 se aplica de forma coherente. El acento `#1a57ad` solo aparece en el botón principal, el foco, la barra del ítem activo, la marca y los enlaces. Los badges usan los tríos sutiles de cada tono y las prioridades P1 a P4 llevan etiqueta de texto, así que no dependen solo del color. Los encabezados de tabla van a 12 px sobre `muted/50`. La jerarquía de 20 / 16 / 14 / 13 px se lee bien. Las pantallas que aún tienen textos sin tilde («Control del area», «Titulo») son las que no se han migrado (FEAT-006 en adelante) y no cuentan como hallazgo de los cimientos.

Los 23 componentes compartidos se probaron en páginas de QA a 1440, 768 y 390 px y se adaptan bien a los tres anchos. Lo único que queda es pulido de alineación vertical en RequirementsPanel y en la celda de acciones. Mi trabajo y Proyectos, las dos pantallas piloto, ya se ven dentro del shell nuevo, sin desbordes y con la tabla desplazándose dentro de su región.

El shell cumple §8.2 a §8.4 en expandido, riel y cajón, con sus estados sin actor, con error y cargando, y en los dos modos de autenticación. El menú se queda fijo al hacer scroll y la columna llega hasta el pie. El hueco está en el riel con poca altura: el último icono visible queda cortado contra el pie y nada indica que hay más ítems.

`global-error.tsx` define su propio `<html>` sin la variable de Inter y cae en la fuente del sistema. En dev-header, el login hereda el `min-h-dvh bg-muted` del diseño dentro del `main` del shell: se ve como un panel gris enmarcado y la página hace scroll sin necesidad. Como dev-header solo se usa en desarrollo, el impacto es bajo.

<details>
<summary>Issues (5)</summary>

1. **Fuente de `global-error.tsx`** (baja, confirmed): el `<html>` propio no recibe `inter.variable`, así que la pantalla sale en Segoe UI o system-ui. Hay que aplicar la clase de la variable de Inter al `<html>` de `global-error.tsx` (importando `Inter` de `next/font` igual que en `layout.tsx`).
2. **Login dentro del shell en dev-header** (baja, confirmed): `min-h-dvh` y `bg-muted` dentro del `main` con padding dan un recuadro gris enmarcado y la página sobrepasa el viewport (948 px a 1440 y 940 px a 390). En dev-header conviene que la raíz de `/login` use `min-h-full` o `flex-1` en lugar de `min-h-dvh`, o quitar el fondo `bg-muted` cuando hay shell.
3. **Overflow del riel sin pista** (baja, likely): a 1100×800 el último icono del `nav` queda cortado contra el borde del pie y nada indica que el menú tiene scroll. Se puede añadir una sombra o un degradado en el borde del `nav` cuando tiene overflow.
4. **Texto de Proyectos para quien no tiene Planificación** (baja, confirmed): la integrante lee «usa Planificación y Portafolio», pero solo ve «Ir a Portafolio». Hay que filtrar la frase según los módulos, igual que los enlaces, o dejarla neutra.
5. **Alineación vertical de acciones** (baja, likely): en RequirementsPanel, a 1440 px, el botón de cada pendiente («Editar fase», «Abrir tarea») queda unos 6 px por debajo de la primera línea del texto; en la tabla de QA, las celdas de texto quedan unos 3 px más altas que la celda de acciones de la misma fila. Hay que alinear el botón con la primera línea o centrar las dos partes de forma consistente.

</details>

<details>
<summary>Details</summary>

### Riel con más ítems que alto

```
≥1280  [aside 240 sticky | main]           A-1440-expandido, sidebar-sticky 1440
1024–1279 [riel 56 + tooltips | main]      inicio--1100, J7, sidebar-sticky 1100
<1024  [MobileNav 56] + Sheet 288          B-390-cajon, J9, ruta-inexistente--390
```

En `inicio--1100x800`, `jwt/jefe/inicio--1100x800` y `sidebar-sticky/solicitudes-scroll-final--1100x800`, el riel del jefe no cabe en 800 px. Por debajo del separador de «Activos y conocimiento» asoma un icono cortado (en torno a y = 715) contra el borde superior del pie. El scroll propio del `nav` existe (fila 8 de FEAT-005) y §8 lo acepta, pero en riel no hay etiquetas de grupo que orienten y nada visual indica que hay más destinos debajo (**likely**: el recorte es visible; el efecto en la orientación del usuario es una inferencia). El riel con preferencia a 1440 px (A-1440-riel-tooltip) sí muestra el tooltip sólido y el outline de foco.

### Login de dev-header dentro del shell

En dev-header (`jefe/login--1440x900`, `jefe/login--390x844`, `26-rutas/jefe/login--390x844`), la raíz de §11.2 (`flex min-h-dvh … bg-muted px-4 py-10`) se pinta dentro del `main` del shell, que ya tiene padding. El resultado es un rectángulo gris con un margen blanco alrededor. A 390 px empieza debajo de la barra móvil y la captura de página completa mide 940 px frente a 844 de viewport; a 1440 px, 948 frente a 900 (**confirmed** por las dimensiones del índice y por las capturas). Sale del diseño tal cual está escrito y solo afecta al modo de desarrollo. En jwt (J1, J2, J4, J5 y `jwt/jefe/login--*`) el login ocupa la pantalla sin shell, como pide el diseño.

### Tipografía de `global-error.tsx`

`global-error.tsx` tiene el texto, la marca y «Reintentar» correctos, pero la tipografía es distinta del resto del portal. El archivo define `<html lang="es">` sin la clase `inter.variable`, así que `--font-inter` no existe y `--font-sans` cae en `system-ui` (**confirmed** en `apps/web/src/app/global-error.tsx`, líneas 23–24, y en las capturas, donde las «a» y las «g» son de Segoe UI). Es una pantalla rara, pero rompe la regla de una sola familia de §5.2.

### Pulido en RequirementsPanel y en la celda de acciones

A 1440 px, en RequirementsPanel, la acción de cada pendiente está alineada con el centro o la base de su bloque y no con la primera línea del texto: «La fase «Diseño» necesita…» está en y ≈ 289 y «Editar fase» en y ≈ 295. En la tabla de QA, «Elemento 60» queda unos 3 px más arriba que «53 / Editar / Eliminar» de la misma fila, lo que apunta a un desajuste entre la celda de texto y `RowActionsCell` (`py-0`). Es pulido (**likely**: se mide en la captura, pero no se rastreó en el código). A 390 px, RequirementsPanel apila la acción debajo del texto y el problema desaparece.

### Proyectos y el texto fijo

Para la integrante, que no tiene el módulo `plan`, Proyectos muestra solo «Ir a Portafolio», pero la descripción sigue diciendo «Mientras tanto, usa Planificación y Portafolio» (`integrante/seguimiento-proyectos--1440x900` y `--390x844`, **confirmed**). El texto viene literal de §11.14, así que es una inconsistencia del propio diseño entre la frase y los enlaces filtrados.

### Pruebas y lo que no se pudo verificar

Según `verification.md`, typecheck, build, E2E (56 en dev-header y 6 en jwt) y `capture-check` en 80 + 52 capturas pasan, sin desbordes salvo el de `/demanda/resumen` a 390 px, que ya existía. No se volvieron a ejecutar. Sin verificar, según el propio registro: lectores de pantalla reales, `forced-colors`, `pointer-coarse`, el tema oscuro, la CI, y `error.tsx` y `global-error.tsx` con un error real. Las carpetas `exploracion`, `jwt-shell`, `pantallas-de-error` y `shell-dev-header` son de antes del arreglo de la columna del sidebar, que se revisó aparte en `sidebar-sticky` y en `26-rutas`. En C3 y J7 los tooltips se ven translúcidos y tapan texto; A-1440-riel-tooltip muestra el mismo componente sólido, así que lo más probable es que esas capturas se tomaran durante la animación. Para descartarlo haría falta una captura con el tooltip ya estable.

</details>

<details>
<summary>Capturas revisadas</summary>

FEAT-004/review: `componentes/qa-componentes--1440x900` (partes 1–3), `--390x844` (partes 1–3), `--768x1024` (parte 2), `qa-servidor--1440x900`; `jefe/` e `integrante/` de `mi-trabajo` y `seguimiento-proyectos` a 1440 y 390.
FEAT-005/review: `shell-dev-header/` (A, A-riel, B, C1, C2, C3, C5); `jwt-shell/` (J1, J2, J4–J9); `pantallas-de-error/` (4); `jefe/ruta-inexistente--1440x900`, `integrante/ruta-inexistente--390x844`; `jefe/login--1440x900` y `--390x844`; `jwt/jefe/login--1440x900`, `--1100x800` y `--390x844`; `jefe/inicio--1100x800`, `jwt/jefe/inicio--1100x800`, `integrante/inicio--768x1024`; `sidebar-sticky/` (2); `exploracion/skip-link--1100`; `26-rutas/jefe/` `mi-trabajo` a 1440 y 390, `seguimiento-proyectos--390x844` y `login--390x844`.
Spot-check de código: `master-detail.tsx` (clases de la rejilla) y `global-error.tsx` (`<html>` y `<body>`).

</details>
