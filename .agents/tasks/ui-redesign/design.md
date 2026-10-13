# Diseño — Renovación integral de UI/UX del portal (control-phari)

Iteración 4: revisión de la iteración 3 según `design-review.md` y `design-review.json` (CHANGES_REQUESTED: 0 HIGH, 2 MEDIUM, 6 NIT). Los 8 hallazgos se corrigen en el cuerpo y se responden uno por uno en §23. Además se corrige un supuesto que la revisión dejó sin verificar: en `@radix-ui/react-tooltip@1.3.0` con `@radix-ui/react-slot@1.4.0`, un tooltip abierto siempre se suma a la descripción del control, así que todos los tooltips pasan por `TooltipTarget` (§6). Worktree de trabajo: `.worktrees/ui-redesign` (rama `feat/ui-redesign`, baseline `0918f1b`). Contrato de capacidades: `inventario-capacidades.md` (este diseño no elimina ninguna; donde cambia la interacción se indica explícitamente).

## 0. Visión general

El portal pasa de una colección de pantallas shadcn por defecto (acento casi negro, menú plano de 24 ítems, estados grises, sin tildes, sin versión móvil del menú) a una herramienta de trabajo sobria y densa con un sistema propio: un único acento azul profundo configurable, escala neutra fría de baja saturación, Inter a 14 px, rejilla de 4 px, filas de tabla de 40 px y sombras solo en superposiciones. El shell se reconstruye como sidebar de 240 px (riel de 56 px entre 1024 y 1279 px, cajón por debajo de 1024 px) con la navegación reagrupada por flujo de trabajo sin cambiar ninguna URL. Todas las pantallas se recomponen con un conjunto pequeño de patrones reutilizables (listado, maestro‑detalle, mesa de trabajo por solicitud, detalle, panel) construidos con componentes compartidos (`PageHeader`, `Toolbar`, `DataView`, `StatusBadge`, `RequirementsPanel`, `RowActions`, `Field`, etc.). Los bloqueos se presentan siempre con el mismo componente —qué está bloqueado, qué falta, quién responde y cómo resolverlo— usando exclusivamente datos que ya entrega la API. Todo texto visible se corrige al español con ortografía completa. La lógica funcional (llamadas, validaciones, permisos, gating por `allowedModules` y por grants, doble modo de autenticación) se conserva tal cual; el trabajo es de presentación, interacción y accesibilidad. Las únicas correcciones funcionales, todas en el frontend y decididas por el orquestador, están en §19: la recarga con sesión en jwt (§8.7), «Agregar tarea» en fases que ya tienen tareas (§19.1) y los valores de fecha por defecto en el calendario local (§19.2). Además se añaden pantallas propias para rutas inexistentes y errores de ejecución, controles de opción accesibles (tarjetas de decisión y control segmentado) y pruebas automáticas para las utilidades que corrigen fallos del baseline.

## 1. Alcance, restricciones y principios

Alcance: solo `apps/web` (código, estilos, `next.config.ts`, `package.json` de web), `package-lock.json`, `docs/README.md` y `e2e/` (ajuste mínimo de los specs existentes y specs nuevos de §20). No se toca `apps/api`, Prisma, migraciones, OpenAPI ni `packages/api-client`. No cambian URLs: `/` sigue redirigiendo a `/inicio` y `/catalogs` sigue respondiendo 200 (healthcheck de `compose.prod.yaml`).

Principios que resuelven cualquier duda de implementación:

1. Contenido primero: la tabla o el formulario ocupa el espacio; la navegación retrocede (sidebar más tenue, iconos pequeños sin fondo).
2. Una acción principal por región (cabecera de página, panel de detalle, diálogo). Las demás son secundarias, outline o ghost.
3. El estado siempre es texto + color (nunca solo color). El tono expresa nivel de atención, no identidad.
4. Lo bloqueado se explica junto a la acción bloqueada, con lo que falta y cómo resolverlo; la UI presenta datos de la API, no recalcula reglas.
5. Densidad alta y legible: 14 px, filas de 40 px, pocos separadores, sin tarjetas decorativas.
6. Accesible por defecto: foco visible con outline (funciona en alto contraste), teclado completo, regiones vivas mínimas, contraste verificado.

## 2. Diagnóstico del baseline (evidencia)

Fuentes: código del worktree y capturas `screenshots/baseline/` (1440×900 y 390×844).

- Navegación: 24 ítems en 6 grupos en mayúsculas, sin iconos ni orden por flujo. Capacidad cuelga de "Activos"; "Revisión" (aprobaciones del flujo de demanda) y "Frameworks" (gobierno) cuelgan de "Administración". "Tareas" abre una página vacía ("Abre una tarea desde la lista del plan"). "Proyectos" está en construcción sin aviso en el menú.
- Móvil: el sidebar completo se apila encima del contenido (≈800 px de menú antes del h1) y la tabla de Solicitudes se corta por la derecha sin indicio de desplazamiento.
- Volumen real (`screenshots/before-same-data/`, 28 capturas de la UI actual con el dataset de prueba):
  - Solicitudes a 1440 px: unas 45 filas en una sola tabla, sin búsqueda, filtros, orden, conteo ni paginación. Todos los estados con el mismo badge gris. La columna Score repite en cada fila la glosa de la banda en tres líneas ("84 (P1 · Primera consideracion para compromiso)"). Títulos de hasta cuatro líneas. "Editar" repetido como única acción. La página mide unos 2.500 px.
  - Planificación, con un plan Autorizado: la guía sigue diciendo "Listo para enviar" y lista las categorías futuras con sus claves internas (`capacity, evidenceGates, frameworkControls`). Las fases son tarjetas apiladas. El estado de las tareas ocupa dos líneas ("Terminada (100%)").
  - Capacidad: un bloque explicativo fijo de cinco líneas antes del resumen; "Editar" y "Borrar" en cada fila de asignaciones; "Libre" negativo (-10) sin señal; "OK" en el mismo gris que "Sin disponibilidad".
  - Sidebar en jwt: bloque "SESION" arriba y etiquetas sin tildes ("Priorizacion", "Bitacora", "Revision", "Auditoria", "Cerrar sesion").
- Jerarquía: el `--primary` es casi negro (`oklch(0.208 0.042 265.755)`), por lo que la acción principal no se distingue del texto; Bitácora muestra 3 botones primarios a la vez; todos los estados usan el mismo badge gris.
- Densidad: filas de ~57 px; formularios centrados en columnas estrechas con mucho blanco y tablas en el mismo contenedor.
- Copys: no hay tildes ni ñ en ninguna pantalla ("Bitacora", "Contrasena", "Priorizacion"); se muestran códigos internos (BR‑001, BORRADOR, VIGENTE, toasts "Documento movido a VIGENTE"); en Gobierno la banda aparece duplicada ("P1 · P1 · Primera…"); fechas ISO crudas en listas ("2027-07-15"); las fechas de fase/tarea, guardadas a medianoche UTC, se formatean en hora local (en UTC‑5 se ve el día anterior).
- Bloqueos: cada pantalla los explica distinto (candado, texto suelto, alerta roja). La guía del plan muestra categorías técnicas (`datesPhases`) sin acción para resolver. "Marcar no aplica" usa `window.prompt`. El motivo de bloqueo del portafolio solo está en un `aria-label`.
- Accesibilidad: `aria-live` sobre secciones completas (anuncia tablas y formularios enteros); los grupos del menú son `h2` antes del `h1`; `aria-label` sobre elementos genéricos; foco con `ring` (box-shadow, desaparece en modo de alto contraste); toasts en tema `system` (oscuros sobre la app clara); Mis permisos duplica claves React (`log`, `meeting`).
- Estados: carga/vacío/error se reimplementan en cada vista con textos y tamaños distintos.
- Funcional de presentación: en Planificación, «Solo mis tareas» compara `responsibleUserId` (UUID) con `actorId` (identificador, p. ej. `jefe@demo.local`) y nunca devuelve tareas (`plan-view.tsx`, filtro de tareas).
- Rutas y errores: no existen `app/not-found.tsx` ni `app/error.tsx`; una URL inexistente o una excepción de cliente muestran las pantallas por defecto de Next, en inglés.
- Capturas revisadas en la iteración 2 (`demanda-solicitudes--desktop.png` y `--mobile.png`) confirman lo anterior: grupos del menú en mayúsculas y sin iconos, botón principal casi negro, badges todos grises, filas de ~57 px, textos sin tildes ("Titulo", "Revision"), el indicador "N" de Next tapando "Activos" y, en 390 px, ~830 px de menú antes del `h1` y la columna Score cortada.

## 3. Referencias y patrones adoptados

Referencias investigadas por el orquestador. En las iteraciones de diseño no se amplió la investigación ni se cita nada adicional; la iteración 2 solo contrastó los patrones con las capturas de datos reales.

| Referencia | Patrón extraído | Dónde se aplica |
|---|---|---|
| Linear | Navegación de apoyo que retrocede (sidebar más tenue), iconos pequeños sin fondo, pocos separadores, acciones de cabecera siempre en el mismo lugar, pestañas compactas, densidad alta | Shell (§8), `PageHeader` (§7.1), `Tabs` (§6) |
| Asana Workload / Capacity | Carga calculada desde tareas vs. capacidad por persona; resaltar sobre/subcarga; separar la planificación de largo plazo de la carga por tareas | Capacidad: barras de utilización comprometida y planificada con señal de la API (§11) |
| Jira Product Discovery | Comparación por campos explícitos (impacto, esfuerzo, score) y varias vistas de los mismos datos por audiencia | Demanda: Solicitudes (tabla), Triage/Priorización (mesa de trabajo con ficha), Indicadores (§11) |
| IBM Carbon Data Table | Título + descripción, toolbar (búsqueda, filtros, acción principal, ≤5 acciones), filas de altura constante (40/32 px), hover de fila, acciones de fila inline si <3 o menú de desbordamiento, skeletons, encabezados de 1–2 palabras en sentence case, tabla a todo el ancho | `DataView`, `Table`, `RowActions`, `Toolbar` (§6–7) |
| Nielsen Norman — mensajes de error | Lenguaje llano, qué pasó con precisión, cómo resolverlo, junto al origen, indicadores redundantes, sin culpar, sin errores prematuros | `Field`, `FormError`, `ErrorState`, copys (§13), manejo de errores (§16) |

Descartadas por criterio: monday.com y ClickUp (tableros configurables por el usuario; el portal es un flujo gobernado con estados fijos).

## 4. Stack y dependencias (bloqueado al aprobar este diseño)

Se mantiene: Next.js 16.4 App Router, React 19.3, TypeScript 5.9 estricto, Tailwind CSS 4.3 (CSS‑first con `@theme`), shadcn/ui estilo new‑york (componentes copiados en `components/ui`, sin CLI), Radix, lucide-react 1.52, sonner 2.0.8, `tw-animate-css`. No se añaden librerías de UI, de tablas, de formularios ni de estado.

Dependencias nuevas (únicas permitidas), versión exacta:

| Paquete | Versión | Respalda | Uso real | Justificación |
|---|---|---|---|---|
| `@radix-ui/react-tooltip` | `1.3.0` | shadcn `Tooltip` | Ítems del menú en modo riel, botones solo‑icono, `DisabledHint` | Etiqueta visible en hover/foco para controles sin texto; accesible por teclado |
| `@radix-ui/react-dropdown-menu` | `2.1.25` | shadcn `DropdownMenu` | Menú de desbordamiento de `RowActions` (Documentos, Planificación, Solicitudes) | Carbon: >2 acciones por fila van a un menú; teclado y foco gestionados |
| `@radix-ui/react-tabs` | `1.1.22` | shadcn `Tabs` | Controles de gobierno (Controles / Validaciones) y editor de documentos (Editor / Vista previa) | Sustituye el `tablist` hecho a mano (sin navegación por flechas) |

Verificado con `npm view` (iteración 2):

- Las tres declaran `peerDependencies` `react`/`react-dom` `^16.8 || ^17.0 || ^18.0 || ^19.0 || ^19.0.0-rc`, compatibles con React 19.3.
- Fijan sus dependencias en versiones exactas, del mismo tren que `react-dialog@1.2.0` y `react-select@2.3.8`.
- Ninguna tiene scripts de instalación (solo `lint`, `build`, `clean`, `reset` y `typecheck`). Por tanto no se modifica `allowScripts`.
- Sus dependencias compartidas (`primitive@1.1.7`, `react-primitive@2.1.11`, `react-slot@1.4.0`, `popper@1.3.8`, `portal@1.1.18`, `react-compose-refs@1.1.5`, `react-use-controllable-state@1.2.6`…) ya están en el lockfile, pero solo anidadas (bajo `react-dialog`, `react-select` o `apps/web/node_modules`). En la raíz están izadas versiones antiguas (`primitive@1.1.3`, `react-primitive@2.1.3`, `react-slot@1.2.3`, `react-compose-refs@1.1.2`, `react-use-controllable-state@1.2.2`, `react-use-layout-effect@1.1.1`) que fija `@prisma/studio-core → @radix-ui/react-toggle@1.1.10`. npm no puede reutilizarlas, así que añadirá rutas anidadas nuevas de pares que ya existen.
- Transitivas realmente nuevas: `@radix-ui/react-menu@2.1.25`, `@radix-ui/react-roving-focus@1.1.20` y `@radix-ui/react-use-is-hydrated@0.1.3` (sin dependencias). `aria-hidden@1.2.6` y `react-remove-scroll@2.7.2`, que pide `react-menu`, ya están instalados.

Instalación y control del lockfile (todo en la raíz del worktree; los comandos escriben con Node, no con redirección de PowerShell, que cambiaría la codificación):

1. Foto previa de los pares `nombre@versión` y de las claves del lockfile (en el baseline hay 918 pares):
   ```bash
   node -e "const p=require('./package-lock.json').packages;const s=[...new Set(Object.entries(p).filter(([k])=>k.includes('node_modules/')).map(([k,v])=>k.slice(k.lastIndexOf('node_modules/')+13)+'@'+v.version))].sort();require('fs').writeFileSync('lock-pares-antes.json',JSON.stringify({pairs:s,keys:Object.keys(p)}))"
   ```
2. `npm install --save-exact --workspace apps/web @radix-ui/react-tooltip@1.3.0 @radix-ui/react-dropdown-menu@2.1.25 @radix-ui/react-tabs@1.1.22`.
3. Comparación:
   ```bash
   node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package-lock.json','utf8')).packages;const b=JSON.parse(fs.readFileSync('lock-pares-antes.json','utf8'));const now=[...new Set(Object.entries(p).filter(([k])=>k.includes('node_modules/')).map(([k,v])=>k.slice(k.lastIndexOf('node_modules/')+13)+'@'+v.version))];const before=new Set(b.pairs);const after=new Set(now);const keys=new Set(b.keys);console.log('nuevos',now.filter(x=>!before.has(x)).sort());console.log('desaparecidos',b.pairs.filter(x=>!after.has(x)));console.log('con hasInstallScript',Object.entries(p).filter(([k,v])=>!keys.has(k)&&v.hasInstallScript).map(([k])=>k))"
   ```
4. Criterio de aceptación:
   - `nuevos` es exactamente `@radix-ui/react-dropdown-menu@2.1.25`, `@radix-ui/react-menu@2.1.25`, `@radix-ui/react-roving-focus@1.1.20`, `@radix-ui/react-tabs@1.1.22`, `@radix-ui/react-tooltip@1.3.0` y `@radix-ui/react-use-is-hydrated@0.1.3`.
   - `desaparecidos` y `con hasInstallScript` están vacíos.
   - Las rutas anidadas nuevas de pares que ya existían se aceptan.
5. No ejecutar `npm dedupe` ni tocar las versiones izadas que usa `@prisma/studio-core`. Si el paso 4 no se cumple, detenerse y revisar antes de seguir.
6. Borrar `lock-pares-antes.json` (no se versiona). `apps/web/package.json` queda con las tres versiones exactas, sin `^`.
7. Actualizar `docs/README.md` (lista de dependencias de apps/web, línea "Dependencias agregadas a apps/web").

No se añaden, con su motivo: `react-alert-dialog` (el `ConfirmDialog` se construye sobre el `Dialog` existente con `role="alertdialog"`, que Radix permite sobrescribir), `react-checkbox` (se usa `<input type="checkbox">` nativo con `accent-color`; mejor integración con formularios y sin JS), `react-popover` (no hay necesidad real), `react-radio-group` (los radios son nativos, en `RadioCards` y `SegmentedRadio`, §6), `cmdk`/combobox (no es Radix) y librerías de tablas: búsqueda, orden y paginación se resuelven con `table-sort.ts` y `useClientTable` (§7.6). `Sheet` usa `@radix-ui/react-dialog`, ya instalado.

Tipografía: Inter vía `next/font/google` (se autoaloja en el build). En la iteración 2 se comprobó desde esta máquina que `fonts.googleapis.com/css2?family=Inter…` y el archivo de `fonts.gstatic.com` responden 200. El `Dockerfile` de web ejecuta `npm ci`, lo que indica salida a red, pero el build Docker no se ha probado: la verificación final lo ejecuta (§20, «Build Docker»). Si `npm run build:web` o el build Docker fallan al descargar la fuente (p. ej. un entorno sin salida a internet), se elimina el import y `--font-sans` queda en la pila de sistema de §5.2; se documenta en `docs/README.md`.

`next.config.ts`: añadir `devIndicators: { position: 'bottom-right' }` (solo desarrollo; hoy el indicador "N" tapa el menú).

## 5. Sistema visual

### 5.1 Color

Escala neutra fría (tono 264, croma 0.003–0.018), un acento y cinco tonos semánticos con trío fuerte/sutil/borde. Valores en OKLCH (hex de referencia, todos dentro de gamut sRGB). Contrastes calculados con la fórmula WCAG a partir de OKLCH→sRGB (script desechable, ya eliminado).

Tema claro (`:root`):

| Token | OKLCH | Hex | Uso |
|---|---|---|---|
| `--background` | `oklch(1 0 0)` | #ffffff | Contenido |
| `--foreground` | `oklch(0.21 0.014 264)` | #15181f | Texto principal |
| `--surface-subtle` | `oklch(0.975 0.003 264)` | #f6f7f9 | Barra de contexto, toolbars agrupadas |
| `--card` / `--popover` | `oklch(1 0 0)` | #ffffff | Paneles y superposiciones |
| `--card-foreground` / `--popover-foreground` | `oklch(0.21 0.014 264)` | #15181f | |
| `--muted` | `oklch(0.965 0.004 264)` | #f2f3f6 | Fondos tenues, encabezado de tabla, skeleton |
| `--muted-foreground` | `oklch(0.48 0.018 264)` | #585e68 | Texto secundario, placeholders |
| `--secondary` | `oklch(0.955 0.004 264)` | #eff0f3 | Botón secundario |
| `--secondary-hover` | `oklch(0.925 0.008 264)` | #e3e6ec | |
| `--secondary-foreground` | `oklch(0.21 0.014 264)` | #15181f | |
| `--accent` | `oklch(0.955 0.005 264)` | #eef0f4 | Hover de ghost/outline/ítems |
| `--accent-foreground` | `oklch(0.21 0.014 264)` | #15181f | |
| `--primary` | `oklch(0.47 0.15 258)` | #1a57ad | Acento: botón principal, enlaces, foco, indicador activo |
| `--primary-hover` | `oklch(0.42 0.14 258)` | #104a97 | |
| `--primary-foreground` | `oklch(0.985 0.003 264)` | #f9fafc | Texto sobre acento |
| `--primary-subtle` | `oklch(0.955 0.017 258)` | #e9f1fc | Selección de lista, paso actual |
| `--ring` | `var(--primary)` | | Outline de foco |
| `--border` | `oklch(0.915 0.006 264)` | #e1e3e7 | Separadores y contenedores (decorativo) |
| `--border-strong` | `oklch(0.86 0.008 264)` | #ced1d6 | Botón outline |
| `--input` | `oklch(0.62 0.012 264)` | #82868e | Borde de campos (≥3:1, WCAG 1.4.11) |
| `--success` / `-subtle` / `-border` | `0.46 0.12 150` / `0.96 0.035 152` / `0.85 0.07 152` | #0f6a31 / #e1f9e6 / #acdcb8 | |
| `--warning` / `-subtle` / `-border` | `0.48 0.11 62` / `0.965 0.034 86` / `0.86 0.08 80` | #884d01 / #fef2da / #edcc95 | |
| `--danger` / `-subtle` / `-border` | `0.5 0.18 27` / `0.96 0.017 22` / `0.85 0.06 22` | #b32322 / #fdeeed / #f3bfbc | |
| `--info` / `-subtle` / `-border` | `0.47 0.13 258` / `0.955 0.017 258` / `0.86 0.04 258` | #2759a2 / #e9f1fc / #c1d2ec | |
| `--neutral` / `-subtle` / `-border` | `0.42 0.016 264` / `0.955 0.004 264` / `0.88 0.008 264` | #494d56 / #eff0f3 / #d5d7dd | |
| `--destructive` / `-hover` / `-foreground` | `0.52 0.19 27` / `0.47 0.18 27` / `0.985 0.003 264` | #be2323 / #a91518 / #f9fafc | Botón destructivo sólido; `text-destructive` sigue válido como texto |
| `--success-foreground` | `oklch(0.985 0.003 264)` | | Compatibilidad (`bg-success text-success-foreground`) |
| `--sidebar` | `oklch(0.972 0.004 264)` | #f4f6f8 | Fondo del menú (más tenue que el contenido) |
| `--sidebar-foreground` | `oklch(0.36 0.016 264)` | #393d46 | Ítems |
| `--sidebar-muted-foreground` | `oklch(0.49 0.016 264)` | #5c616a | Etiquetas de grupo, subtítulo |
| `--sidebar-accent` | `oklch(0.925 0.008 264)` | #e3e6ec | Ítem activo/hover |
| `--sidebar-accent-foreground` | `oklch(0.21 0.014 264)` | #15181f | Texto del ítem activo |
| `--sidebar-border` | `oklch(0.915 0.006 264)` | #e1e3e7 | |
| `--radius` | `0.5rem` (no es color) | — | Radio base de §5.3; hoy vale `0.625rem` |

Tema oscuro (`.dark`, sin selector de tema; opción futura documentada):

| Token | OKLCH | Token | OKLCH |
|---|---|---|---|
| `--background` | `0.17 0.01 264` | `--primary` | `0.72 0.12 256` |
| `--foreground` | `0.95 0.004 264` | `--primary-hover` | `0.77 0.11 256` |
| `--surface-subtle` | `0.195 0.011 264` | `--primary-foreground` | `0.18 0.03 262` |
| `--card` / `--popover` | `0.2 0.011 264` | `--primary-subtle` | `0.28 0.05 258` |
| `--muted` | `0.23 0.012 264` | `--border` | `oklch(1 0 0 / 10%)` |
| `--muted-foreground` | `0.72 0.014 264` | `--border-strong` | `0.36 0.012 264` |
| `--secondary` / `--accent` | `0.25 0.012 264` | `--input` | `0.52 0.014 264` |
| `--secondary-hover` | `0.29 0.013 264` | `--destructive` / `-hover` | `0.54 0.19 25` / `0.49 0.18 25` |
| `--success` / `-subtle` / `-border` | `0.8 0.13 152` / `0.27 0.04 152` / `0.4 0.06 152` | `--destructive-foreground` | `0.985 0.003 264` |
| `--warning` / `-subtle` / `-border` | `0.83 0.12 80` / `0.28 0.045 70` / `0.42 0.07 70` | `--sidebar` | `0.145 0.009 264` |
| `--danger` / `-subtle` / `-border` | `0.76 0.13 22` / `0.28 0.05 22` / `0.42 0.08 22` | `--sidebar-foreground` | `0.82 0.01 264` |
| `--info` / `-subtle` / `-border` | `0.78 0.1 256` / `0.28 0.05 258` / `0.42 0.07 258` | `--sidebar-muted-foreground` | `0.66 0.014 264` |
| `--neutral` / `-subtle` / `-border` | `0.82 0.01 264` / `0.27 0.01 264` / `0.36 0.012 264` | `--sidebar-accent` / `-accent-foreground` | `0.25 0.012 264` / `0.97 0.003 264` |
| `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground` | `0.95 0.004 264` (= `--foreground`) | `--sidebar-border` | `oklch(1 0 0 / 8%)` |

(Todos los valores de la tabla oscura van como `oklch(L C H)`; `--ring: var(--primary)` se repite dentro de `.dark`; `--success-foreground` oscuro = `oklch(0.17 0.01 264)`; `--radius` no se repite en `.dark`.)

Contrastes verificados (mínimo exigido entre paréntesis):

| Par (claro) | Ratio | Par (oscuro) | Ratio |
|---|---|---|---|
| foreground / background (4.5) | 17.72 | foreground / background | 16.53 |
| muted-foreground / background · muted · sidebar (4.5) | 6.54 · 5.91 · 6.03 | muted-foreground / background · card · muted | 7.71 · 7.30 · 6.81 |
| sidebar-foreground / sidebar (4.5) | 10.02 | sidebar-foreground / sidebar | 11.34 |
| sidebar-muted / sidebar (4.5) | 5.78 | sidebar-muted / sidebar | 6.36 |
| sidebar-accent-foreground / sidebar-accent (4.5) | 14.20 | idem | 14.67 |
| primary-foreground / primary · primary-hover (4.5) | 6.66 · 8.25 | primary-foreground / primary · hover | 7.58 · 9.08 |
| primary como texto / background · muted · primary-subtle (4.5) | 6.95 · 6.28 · 6.10 | primary / background · card · muted | 7.70 · 7.29 · 6.80 |
| input / background · muted (3) | 3.64 · 3.29 | input / background · card · muted | 3.47 · 3.29 · 3.07 |
| destructive-foreground / destructive · hover (4.5) | 5.82 · 7.18 | idem | 5.35 · 6.59 |
| success · warning · danger · info · neutral sobre su `-subtle` (4.5) | 6.07 · 6.10 · 5.83 · 6.06 · 7.42 | idem | 8.36 · 8.62 · 6.56 · 7.31 · 8.63 |
| mismos tonos sobre background (4.5) | 6.74 · 6.76 · 6.59 · 6.91 · 8.46 | idem | 10.76 · 11.21 · 8.43 · 9.56 · 10.95 |
| muted-foreground sobre cualquier `-subtle` (4.5) | ≥5.74 | muted-foreground / surface-subtle | 7.37 |
| foreground / secondary · secondary-hover (4.5) | 15.54 · 14.20 | idem | 13.83 · 12.20 |

Cambio de color corporativo: editar solo `--primary`, `--primary-hover`, `--primary-foreground` y `--primary-subtle` (bloque marcado al inicio de `:root` y de `.dark`). `--ring` lo sigue automáticamente. Condiciones: texto `--primary-foreground` sobre `--primary` ≥4.5:1 y `--primary` como texto sobre `#fff` y `--muted` ≥4.5:1. `--info` puede igualarse al nuevo tono si se desea; no es obligatorio.

Política de uso del acento: botón principal, enlaces, outline de foco, indicador de ítem activo/seleccionado, paso actual y barras de progreso. Nunca como fondo decorativo.

### 5.2 Tipografía

- Familia: `--font-sans: var(--font-inter, ui-sans-serif), system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` (el fallback dentro de `var()` evita que la declaración sea inválida si la variable no existe). En `layout.tsx`: `const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })` y `className={inter.variable}` en `<html>`. `latin` cubre á é í ó ú ü ñ ¿ ¡.
- Base: `body` 14 px / 20 px (`font-size: 0.875rem; line-height: 1.25rem` en `@layer base`; el `rem` raíz sigue en 16 px para no alterar la rejilla de 4 px).
- Escala (única permitida):

| Uso | Tamaño / interlínea | Clase | Peso |
|---|---|---|---|
| Valor de KPI | 24 / 32 | `text-2xl tabular-nums` | 600 |
| `h1` de página | 20 / 28 | `text-xl tracking-tight` | 600 |
| `h2` de sección, título de diálogo | 16 / 24 | `text-base` | 600 |
| `h3`, texto de cuerpo, celdas, controles, ítems del menú | 14 / 20 | `text-sm` | 400 (600 en h3) |
| Etiquetas de campo, ayudas, metadatos, migas | 13 / 18 | `text-meta` (token nuevo) | 400 / 500 en etiquetas |
| Encabezados de tabla, badges, etiquetas de grupo del menú, contadores | 12 / 16 | `text-xs` | 500 |

- Pesos: 400, 500, 600. Sin 700.
- `tabular-nums` en columnas numéricas, KPIs, horas, porcentajes y fechas en tablas.
- Sentence case en todo (títulos, botones, encabezados de columna, grupos del menú). Sin mayúsculas sostenidas ni `tracking-wide`.
- Un único `h1` por página (lo emite `PageHeader`). Los grupos del menú no son encabezados.

### 5.3 Espaciado, densidad, forma y movimiento

- Rejilla de 4 px (escala Tailwind por defecto): 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Padding de `<main>`: `px-4 py-5` (<768), `md:px-6 md:py-6`, `xl:px-8`. Contenedor de página: `max-w-[1600px] mx-auto`, separación vertical `gap-6` (24 px); entre secciones mayores `gap-8` (32 px); título de sección → contenido `gap-3` (12 px).
- Controles: 36 px (`h-9`); pequeños 32 px (`h-8`); icon‑button 36/32 px. En puntero grueso (`pointer-coarse:`) mínimo 40 px de alto (y de ancho en icon‑buttons).
- Tablas: fila de 40 px (`h-10`) por defecto. Densidad compacta de 32 px (`h-8`) en las tablas con una sola línea por celda y muchas filas: Auditoría, Maestras, fases de Planificación, distribuciones del Panel del área y subtablas de Indicadores. Portafolio usa la densidad por defecto, porque sus títulos y motivos de bloqueo ocupan hasta dos líneas. Encabezado 36 px; padding de celda `px-3 py-1.5`; texto 14 px; encabezado 12 px/500 `text-muted-foreground` sobre `bg-muted/50`.
- Cuadre de alturas de fila:
  - Celda de texto: 20 + 12 = 32 px, cabe en 40 y en 32.
  - Celda de acciones (`RowActionsCell`, §7.6): `py-1` + botón de 32 px = 40 px; en compacta, `py-0.5` + botón de 28 px = 32 px.
  - Una celda con dos líneas (título con `line-clamp-2`, nota bajo el nombre de la fase inicial bloqueada) hace crecer su fila. Se acepta; solo ocurre en densidad por defecto o en esa fila de fases.
  - Con `pointer-coarse` los botones miden 40 px y las filas con acciones crecen hasta 48 px. Se acepta: manda el objetivo táctil.
- Formularios: columna máxima 720 px (`max-w-[45rem]`); separación entre campos 16 px; etiqueta→control 6 px.
- Radios: `--radius: 0.5rem` → `rounded-sm` 4 px (badges, menú), `rounded-md` 6 px (controles), `rounded-lg` 8 px (contenedores, tablas, diálogos).
- Bordes: 1 px `--border` en contenedores; separadores interiores solo donde separan grupos (`divide-y` en listas y filas). Sin bordes dobles (el contenedor de tabla no lleva borde interior extra).
- Sombras: ninguna en superficies. `shadow-md` en popover/menú/select/tooltip; `shadow-lg` en diálogo y cajón.
- Capas: topbar móvil y sidebar `z-30`; superposiciones Radix `z-50`.
- Movimiento: transiciones de color 150 ms; diálogos fade+zoom 150 ms; cajón slide 200 ms; ancho del sidebar 150 ms. Regla global `@media (prefers-reduced-motion: reduce)` que anula animaciones y transiciones; además `motion-reduce:animate-none` en spinners y skeletons.

### 5.4 `globals.css` (estructura exacta)

Orden del archivo:

1. `@import 'tailwindcss';` y `@import 'tw-animate-css';`
2. `@custom-variant dark (&:is(.dark *));` (se conserva).
3. Variante del modo riel del sidebar:
   ```css
   @custom-variant rail {
     &:where([data-sidebar='rail'], [data-sidebar='rail'] *) { @slot; }
     @media (width >= 64rem) and (width < 80rem) {
       &:where([data-sidebar='auto'], [data-sidebar='auto'] *) { @slot; }
     }
   }
   ```
4. `:root { … }` con los tokens de §5.1. Primer bloque, con el comentario `/* Acento de marca: único punto a cambiar cuando exista color corporativo */`, contiene `--primary`, `--primary-hover`, `--primary-foreground`, `--primary-subtle`.
5. `.dark { … }` con los tokens oscuros (mismo bloque de acento al inicio y `--ring: var(--primary)`).
6. `@theme { --color-neutral-*: initial; --text-meta: 0.8125rem; --text-meta--line-height: 1.125rem; }` (se elimina la paleta `neutral-50…950` de Tailwind, que no se usa en el código, para que `text-neutral`/`bg-neutral-subtle` sean los tokens semánticos). Verificar en el build que esas utilidades generan CSS; si no, mover `--color-neutral-*: initial;` como primera declaración del bloque `@theme inline` del paso 7.
7. `@theme inline { … }`: `--font-sans` (§5.2); radios (`--radius-sm: calc(var(--radius) - 4px)`, `--radius-md: calc(var(--radius) - 2px)`, `--radius-lg: var(--radius)`, `--radius-xl: calc(var(--radius) + 4px)`); y un `--color-<token>: var(--<token>)` por cada token de color de §5.1 (background, foreground, surface-subtle, card(+foreground), popover(+foreground), muted(+foreground), secondary(+hover, +foreground), accent(+foreground), primary(+hover, +foreground, +subtle), destructive(+hover, +foreground), success(+subtle, +border, +foreground), warning(+subtle, +border), danger(+subtle, +border), info(+subtle, +border), neutral(+subtle, +border), border, border-strong, input, ring, sidebar, sidebar-foreground, sidebar-muted-foreground, sidebar-accent, sidebar-accent-foreground, sidebar-border).
8. `@layer base`: `* { border-color: var(--border); outline-color: var(--ring); }`; `body { background-color: var(--background); color: var(--foreground); font-size: 0.875rem; line-height: 1.25rem; }`; `::selection { background-color: var(--primary-subtle); }`; `input[type='date'], input[type='month'], input[type='datetime-local'], input[type='time'] { color-scheme: light; }` y `.dark` con `color-scheme: dark`; regla de movimiento reducido (`animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important;`).
9. En el mismo `@layer base`:
   ```css
   @media (width < 64rem) {
     html { scroll-padding-top: 4.5rem; } /* barra móvil de 56 px + 16 px de aire (WCAG 2.4.11) */
   }
   ```
   El foco al tabular y el `scrollIntoView` de `MasterDetail` respetan `scroll-padding`, así que el elemento nunca queda bajo la barra superior fija.

## 6. Primitivas (`src/components/ui`)

Estilo de código: el de los archivos existentes (`React.forwardRef` + `displayName`, `cn()`, tipos `React.ComponentPropsWithoutRef` / `React.ComponentRef`). Los componentes shadcn nuevos se copian de la implementación oficial new‑york y se adaptan a estos tokens a mano; no se ejecuta el CLI de shadcn (reescribiría `globals.css`). Foco en todos los interactivos: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` (outline, no `ring`, para que persista en `forced-colors`). Deshabilitado transitorio o sin motivo (§10.3): atributo `disabled` con `disabled:pointer-events-none disabled:opacity-50`, salvo donde se indica. No disponible por una regla, con motivo: `aria-disabled="true"`, que mantiene el control enfocable y con su nombre (prop `unavailable` de `Button`, §7.4).

| Archivo | Cambio |
|---|---|
| `button.tsx` | Base: `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0 pointer-coarse:min-h-10 aria-disabled:cursor-not-allowed aria-disabled:opacity-50` + foco/disabled comunes. Variantes; el hover solo aplica sin `aria-disabled` (`not-aria-disabled:hover:*`, que Tailwind 4.3.3 compila a `:not([aria-disabled="true"]):hover`): `default` `bg-primary text-primary-foreground not-aria-disabled:hover:bg-primary-hover`; `secondary` `bg-secondary text-secondary-foreground not-aria-disabled:hover:bg-secondary-hover`; `outline` `border border-border-strong bg-background not-aria-disabled:hover:bg-accent`; `ghost` `not-aria-disabled:hover:bg-accent`; `ghost-destructive` (nueva) `text-danger not-aria-disabled:hover:bg-danger-subtle`; `destructive` `bg-destructive text-destructive-foreground not-aria-disabled:hover:bg-destructive-hover`; `link` `h-auto px-0 text-primary underline-offset-4 not-aria-disabled:hover:underline`. Tamaños: `default` `h-9 px-3`; `sm` `h-8 px-2.5 text-meta`; `lg` `h-10 px-4`; `icon` `size-9`; `icon-sm` (nuevo) `size-8`; los icon añaden `pointer-coarse:min-w-10`. Prop nueva `loading?: boolean`: antepone `<LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />`, fuerza `disabled` y `aria-busy`. El texto de progreso lo decide quien llama (p. ej. "Guardando…"). Props nuevas `unavailable?: boolean` y `onUnavailableClick?: React.MouseEventHandler<HTMLButtonElement>` (acción bloqueada por una regla, §7.4 y §10.3): con `unavailable`, el botón lleva `aria-disabled="true"`, sigue enfocable y en el orden de tabulación, y no recibe `disabled`. Su `onClick` efectivo es `(e) => { e.preventDefault(); onUnavailableClick?.(e); }`: no llama al `onClick` recibido y no envía el formulario, tampoco con Enter en un campo. `aria-disabled` y `onClick` se asignan después de esparcir `...props`, para que nada los pise. Sin `pointer-events-none`, para que el tooltip responda al puntero. `loading` y `unavailable` no se combinan con `asChild` (un enlace no tiene estado de envío y una acción no disponible se pinta como botón, §7.4). |
| `badge.tsx` | Base: `inline-flex h-5 items-center gap-1 rounded-sm border border-transparent px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3`. Sin estilos de foco (no es interactivo). Variantes: `neutral` `bg-neutral-subtle text-neutral`; `info`, `success`, `warning`, `danger` análogas (`bg-<t>-subtle text-<t>`); `accent` `bg-primary-subtle text-primary`; `outline` `border-border-strong text-foreground`. Alias de compatibilidad durante la migración: `default`→`accent`, `secondary`→`neutral`, `destructive`→`danger`. Al terminar la fase de pantallas no debe quedar uso de los alias (comprobar con búsqueda). El borde transparente se vuelve visible en `forced-colors`. |
| `input.tsx` | `flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:border-ring aria-invalid:border-danger aria-invalid:focus-visible:outline-danger disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground read-only:bg-muted/60 pointer-coarse:h-10`. Sin `shadow-sm`. Deshabilitado sin opacidad (los campos de solo lectura deben seguir legibles: 5.91:1). |
| `textarea.tsx` | Mismos estilos que `Input` con `min-h-20 py-2 field-sizing-content max-h-96`. El editor de documentos sobrescribe con `field-sizing-fixed min-h-80 font-mono`. |
| `select.tsx` | `SelectTrigger` = estilos de `Input` + icono `ChevronDown` `text-muted-foreground`; `[&>span]:line-clamp-1` se conserva. `SelectContent`: `rounded-md border bg-popover shadow-md max-w-[min(40rem,var(--radix-select-content-available-width))]`, para que las opciones largas (títulos de solicitud de 150 caracteres) no salgan del viewport en 390 px. `SelectItem`: `min-h-8 rounded-sm py-1.5 pl-8 pr-2 text-sm focus:bg-accent`; el texto va en `<span className="line-clamp-2 whitespace-normal"><SelectPrimitive.ItemText>…</SelectPrimitive.ItemText></span>`. Radix copia al trigger solo el contenido de `ItemText`, que allí sigue recortado a una línea por `[&>span]:line-clamp-1`. Exportar además `SelectLabel` (`px-2 py-1.5 text-xs font-medium text-muted-foreground`) y `SelectSeparator` (`-mx-1 my-1 h-px bg-border`), partes oficiales del mismo paquete. |
| `label.tsx` | `text-meta font-medium leading-none text-foreground peer-disabled:opacity-70`. |
| `card.tsx` | `Card`: `rounded-lg border bg-card text-card-foreground` (sin sombra). `CardHeader` `flex flex-col gap-1 p-4`; `CardTitle` `text-base font-semibold` con prop nueva `as?: 'div' \| 'h1' \| 'h2' \| 'h3'` (por defecto `div`); `CardDescription` `text-meta text-muted-foreground`; `CardContent` y `CardFooter` `p-4 pt-0`. |
| `dialog.tsx` | `DialogOverlay` `bg-black/40`. `DialogContent` con prop nueva `size?: 'sm' \| 'md' \| 'lg' \| 'xl'` (`max-w-[440px]` / `max-w-[560px]` / `max-w-[720px]` / `max-w-[960px]`; por defecto `md`): `fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-1rem)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-popover shadow-lg` + animación fade/zoom 150 ms. Botón cerrar: `Button variant="ghost" size="icon-sm"` en `absolute top-3 right-3` con `<span className="sr-only">Cerrar</span>`. `DialogHeader` `px-5 pr-12 pt-5 pb-3 gap-1`: los 48 px de la derecha cubren el margen de 12 px, el botón de 32 px y 4 px de aire, así que un título largo («¿Eliminar la asignación de Beto Lider BI (40 h)?» en `sm`, «Historial de versiones — {título}» en `xl`) pasa a la línea siguiente en lugar de quedar debajo del botón; `DialogTitle` `text-base font-semibold`; `DialogDescription` `text-meta text-muted-foreground`. Nuevo `DialogBody` `min-h-0 flex-1 overflow-y-auto px-5 pb-2`. `DialogFooter` `flex flex-col-reverse gap-2 px-5 pb-5 pt-3 sm:flex-row sm:justify-end`. Patrón de formulario en diálogo: `<DialogContent><DialogHeader/><form className="flex min-h-0 flex-1 flex-col"><DialogBody>…</DialogBody><DialogFooter>…</DialogFooter></form></DialogContent>` (el pie queda fijo y el cuerpo desplaza). Se elimina el `max-h-[90vh] overflow-y-auto` sobre `DialogContent` en todos los diálogos. |
| `table.tsx` | `Table` conserva su `div` envolvente `relative w-full overflow-x-auto` (también para tablas fuera de `DataView`: subtablas, actividades, historial) y recibe dos props nuevas: `density?: 'default' \| 'compact'` → `data-density` en `<table>`, y `scrollLabel?: string` → el `div` pasa a `role="region"`, `aria-label={scrollLabel}`, `tabIndex={0}` y `focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring` (desplazamiento horizontal por teclado, WCAG 2.1.1). Toda tabla de datos principal lo usa (p. ej. "Tabla de solicitudes"). `TableHeader` `bg-muted/50 [&_tr]:border-b`. `TableHead` `h-9 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap`. `TableRow` `h-10 border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary-subtle [[data-density=compact]_&]:h-8`. `TableCell` `px-3 py-1.5 align-middle`; la celda de acciones es `RowActionsCell` (§7.6), que cuadra 40/32 px. `TableBody` `[&_tr:last-child]:border-0`. Nuevo `TableCaption` `sr-only` (caption visible no se usa). Columnas numéricas: `className="text-right tabular-nums"` en `TableHead` y `TableCell`. |
| `skeleton.tsx` | `rounded-md bg-muted animate-pulse motion-reduce:animate-none`. |
| `switch.tsx` | Track `h-5 w-9 data-[state=unchecked]:bg-input data-[state=checked]:bg-primary`; thumb `size-4 bg-background shadow-sm`; foco outline común. |
| `separator.tsx` | Sin cambios. |
| `sonner.tsx` | `theme="light"` (hoy `system` pinta toasts oscuros sobre la app clara), `position="bottom-right"`, `richColors`, `closeButton`, `containerAriaLabel="Notificaciones"` (la región se anuncia «Notificaciones alt+T»; por defecto sería «Notifications alt+T»), `toastOptions={{ closeButtonAriaLabel: 'Cerrar notificación' }}` (por defecto «Close toast»; las dos props verificadas en `node_modules/sonner/dist/index.d.ts` 2.0.8), y `style` con variables de sonner mapeadas a tokens: `--normal-bg: var(--popover)`, `--normal-text: var(--popover-foreground)`, `--normal-border: var(--border)`, `--success-bg/--success-text/--success-border` → `var(--success-subtle)/var(--success)/var(--success-border)`, ídem `error`→danger, `warning`, `info`. Cuando exista modo oscuro, `theme` debe seguir al tema activo. |
| `tooltip.tsx` (nuevo) | `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent` (`z-50 max-w-xs rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md`, `sideOffset={6}`, fade 150 ms). Contraste 17.7:1. Comportamiento verificado en el código publicado de `@radix-ui/react-tooltip@1.3.0` (paquete descargado a una carpeta temporal fuera del repo y borrado) y en `@radix-ui/react-slot@1.4.0`, la versión que usan tanto la 1.3.0 como `apps/web`: mientras el tooltip está abierto, `TooltipTrigger` pasa como `aria-describedby` su propio valor más el id del contenido, y el `mergeProps` de `Slot` concatena el `aria-describedby` del hijo con el del disparador, sin sustituirlo. Por tanto, un `aria-describedby={undefined}` en el hijo no evita la descripción, y el texto del tooltip se anunciaría además del nombre (o del motivo). Para que eso no pase, el archivo exporta dos piezas más. `TooltipTarget`, que va entre `TooltipTrigger asChild` y el control: `function TooltipTarget(props: React.ComponentPropsWithRef<typeof Slot>): React.ReactElement { return <Slot {...props} aria-describedby={undefined} />; }`, con el `Slot` de `@radix-ui/react-slot` (ya es dependencia directa). Deja pasar los eventos, `data-state` y la `ref` del disparador, y descarta solo la descripción que añade Radix, así que el control conserva la suya; no usa variables sin usar (`noUnusedLocals`). Y `LabelTooltip`, el tooltip que nunca describe al control. Se usa cuando su texto repite el nombre del control (botones solo‑icono, ítems del menú en riel) o cuando ese texto ya está en el árbol de accesibilidad por otra vía (el aviso del menú en riel, §8.4): `function LabelTooltip(props: { label: React.ReactNode \| null; side?: 'top' \| 'right' \| 'bottom' \| 'left'; children: React.ReactElement }): React.ReactElement`, que pinta `<Tooltip><TooltipTrigger asChild><TooltipTarget>{children}</TooltipTarget></TooltipTrigger>{label != null ? <TooltipContent side={side}>{label}</TooltipContent> : null}</Tooltip>`; con `label` null no hay contenido y el control no se remonta. Regla: ningún control del portal va directamente dentro de `TooltipTrigger asChild`; o usa `LabelTooltip` o usa `DisabledHint`, que describe con su propio id (§7.4). En puntero táctil Radix no abre tooltips por hover (su `onPointerMove` ignora `pointerType === 'touch'`, comprobado en la 1.3.0); por eso ningún dato depende solo de un tooltip, salvo el motivo de `DisabledHint`, que además se abre al pulsar (§7.4). |
| `dropdown-menu.tsx` (nuevo) | `DropdownMenu`, `Trigger`, `Content` (`min-w-44 max-w-72 rounded-md border bg-popover p-1 shadow-md`, `align="end"`), `Item` (`flex min-h-8 items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent [&_svg]:size-4 [&_svg]:shrink-0`; prop `tone?: 'default' \| 'danger'` → `text-danger focus:bg-danger-subtle`), `Label`, `Separator`, `Group`. La altura es mínima, no fija: una etiqueta de una línea mide 32 px (20 + 12) y un ítem con dos líneas crece sin recortarse. Ítem no disponible: no se usa `disabled` de Radix (lo saltaría el teclado y el motivo sería inaccesible); se renderiza con `aria-disabled="true"`, `onSelect={(e) => e.preventDefault()}` (el menú sigue abierto), `items-start text-muted-foreground` y el contenido `<span className="flex min-w-0 flex-col"><span>{label}</span><span className="text-xs">{motivo}</span></span>`. Ítem ocupado (acción en curso, transitorio, §10.3 a): `disabled` de Radix, `LoaderCircle` en lugar del icono y el texto de progreso (`busyLabel`). |
| `tabs.tsx` (nuevo) | `TabsList` `flex items-end gap-1 border-b`; `TabsTrigger` `-mb-px h-9 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground` + foco común (borde, no sombra, para `forced-colors`); `TabsContent` `pt-4 focus-visible:outline-2 …`. |
| `sheet.tsx` (nuevo) | shadcn `Sheet` sobre `@radix-ui/react-dialog`: `SheetContent` con `side?: 'left' \| 'right'` (se usa `left`), `w-72 max-w-[85vw] h-dvh p-0 bg-sidebar shadow-lg`, slide 200 ms; `SheetTitle` obligatorio (se usa `sr-only`). Conserva su botón cerrar (`SheetClose` como `Button variant="ghost" size="icon-sm"` en `absolute top-3 right-3`, con `<span className="sr-only">Cerrar menú</span>`), útil en pantallas táctiles. Como el contenido del cajón empieza por la cabecera del sidebar, esa cabecera lleva `pr-12` en `variant="drawer"` (§8.4), la misma reserva que `DialogHeader`. |
| `checkbox.tsx` (nuevo) | `<input type="checkbox">` nativo: `size-4 shrink-0 cursor-pointer accent-primary rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50`. Reemplaza todos los checkbox nativos sin estilo (participantes, predecesoras, participantes de reunión, defecto bloqueante). Regla de uso: siempre dentro de `<label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">` junto a su texto. Así el objetivo efectivo mide al menos 24 px de alto (WCAG 2.5.8) y el `label` envolvente da el nombre accesible sin `htmlFor`. |
| `radio-cards.tsx` (nuevo) | Radios nativos con forma de tarjeta (decisión de triage). API: `interface ChoiceOption { value: string; label: string; description?: string }` y `interface RadioCardsProps { name: string; idPrefix: string; options: ChoiceOption[]; value: string; onValueChange: (value: string) => void; disabled?: boolean; invalid?: boolean }`. `value=''` significa sin elección; los ids son `${idPrefix}-${value}`. Contenedor `grid gap-2 sm:grid-cols-3`, sin rol propio: el `radiogroup` lo aporta el `FieldSet kind="radio"` que lo envuelve (§7.7). Cada opción es un `<label>` que envuelve su input: `flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-background p-3 text-sm transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50`; con `invalid` y sin elección, `border-danger`. Dentro: `<input type="radio" name id value checked onChange className="mt-0.5 size-4 shrink-0 accent-primary">`, la etiqueta en `font-medium` y la descripción opcional en `text-meta text-muted-foreground`. Teclado nativo: Tab entra al grupo y las flechas cambian la opción. |
| `segmented-radio.tsx` (nuevo) | Control segmentado de radios nativos (valoraciones de 1 a 5 en Priorización). API: `interface SegmentedRadioProps { id: string; name: string; options: { value: string; label: string }[]; value: string; onValueChange: (value: string) => void; labelledBy: string; describedBy?: string; disabled?: boolean }`; ids de las opciones `${id}-${value}`. Es su propio grupo, porque la etiqueta visible del criterio vive en la rejilla de la fila (§11.7) y no puede ser una `legend`: `<div id role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} className="inline-flex gap-0.5 rounded-md border border-border-strong bg-background p-0.5">`. Cada segmento es un `<label>` que envuelve su input: `relative inline-flex h-8 min-w-9 cursor-pointer items-center justify-center rounded-sm px-2 text-sm tabular-nums transition-colors hover:bg-accent has-[:checked]:bg-primary has-[:checked]:font-semibold has-[:checked]:text-primary-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:disabled]:opacity-50`, con `<input type="radio" className="sr-only">` (flechas nativas). Seleccionado: acento con texto `primary-foreground` (6,66:1) y peso 600 como pista que no depende solo del color. |

## 7. Componentes compartidos nuevos (`src/components`)

Carpeta plana, como hoy (`app-sidebar.tsx`, `route-guard.tsx`). Cada componente existe porque lo usan ≥2 pantallas. Firmas en TypeScript. Llevan `'use client'` los que usan hooks, Radix o manejadores propios (`Section` por `React.useId()`, `ErrorState` y `DataView` por `onRetry`, `RequirementsPanel`, `RowActions`, `MasterDetail`, `ConfirmDialog`, `ReasonDialog`, `RequestContextBar`, `Field`, y `DisabledReason`/`DisabledHint`, que comparten archivo). Son seguros para servidor (sin `'use client'`, sin hooks ni Radix) `PageLayout`, `PageHeader`, `EmptyState`, `InlineNotice`, `DescriptionList`, `StatStrip`/`StatTile`, `StatusBadge`/`PriorityBadge`, `TableSkeleton` y `PageFallback`, además de `Badge`, `Skeleton` y `Card`. Los usan `app/not-found.tsx` y los `fallback` de `Suspense` (§7.9.1, §8.6). En código de servidor, un enlace con aspecto de botón se escribe `<Link className={buttonVariants({ variant })}>` y no `Button asChild`, porque `Slot` usa hooks.

### 7.1 Estructura de página

`page-layout.tsx` — `PageLayout({ children, className })`: `div.mx-auto.flex.w-full.max-w-[1600px].flex-col.gap-6`. Toda vista lo usa como raíz.

`page-header.tsx`:
```ts
interface Crumb { label: string; href?: string }
interface PageHeaderProps {
  title: React.ReactNode;          // texto del único <h1>
  description?: React.ReactNode;   // una línea; text-sm text-muted-foreground max-w-prose
  breadcrumbs?: Crumb[];           // solo ancestros; nav[aria-label="Ruta de navegación"] > ol (text-meta, separador ChevronRight 12 px aria-hidden)
  meta?: React.ReactNode;          // fila bajo el título (badges, metadatos) en páginas de detalle
  actions?: React.ReactNode;       // derecha; la acción principal va al final
}
```
Maquetación: `header.flex.flex-col.gap-3.md:flex-row.md:items-start.md:justify-between`; bloque de texto `min-w-0 flex flex-col gap-1`; `h1` `text-xl font-semibold tracking-tight`; acciones `flex flex-wrap items-center gap-2 md:shrink-0`. En móvil las acciones bajan debajo de la descripción y conservan su ancho natural.

`section.tsx`:
```ts
interface SectionProps {
  title: string;
  headingLevel?: 2 | 3;            // por defecto 2
  description?: React.ReactNode;
  count?: number;                   // pill neutra junto al título
  actions?: React.ReactNode;        // acciones de la sección (p. ej. "Nueva fase")
  children: React.ReactNode;
  className?: string;
}
```
`section[aria-labelledby]` con id de `React.useId()`; cabecera `flex items-end justify-between gap-3`, título `text-base font-semibold`, descripción `text-meta text-muted-foreground`, `gap-3` hasta el contenido.

`toolbar.tsx`:
```ts
interface ToolbarProps { label: string; children: React.ReactNode; end?: React.ReactNode }
// div[role=group][aria-label=label]: flex flex-wrap items-end gap-2; `end` alineado a la derecha (ml-auto): contador, acciones secundarias.
interface SearchInputProps extends Omit<React.ComponentProps<'input'>, 'type' | 'id' | 'placeholder'> {
  id: string;
  label?: string;        // etiqueta VISIBLE; por defecto "Buscar"
  placeholder: string;   // obligatorio: dice por qué campo se busca (tabla de abajo)
}
// <div className="grid gap-1.5"><Label htmlFor={id}>{label}</Label>
//   <div className="relative">icono Search (aria-hidden, absolute left-2.5) + Input type="search" pl-8 w-full sm:w-64</div></div>
```
La etiqueta de la búsqueda es visible, como la de los filtros que la acompañan, y no `sr-only`: así el campo conserva un texto visible al escribir (WCAG 3.3.2) y su borde superior se alinea con el resto del toolbar. `task-q` y `doc-filtro-busqueda` ya tienen hoy la etiqueta visible «Buscar» y la conservan. Placeholders:

| Id | Vista | Placeholder |
|---|---|---|
| `sol-buscar` | Solicitudes | Título de la solicitud |
| `mt-buscar` | Mi trabajo | Título de la tarea |
| `portafolio-buscar` | Portafolio | Título de la iniciativa |
| `filtro-busqueda` | Activos | Nombre del activo |
| `doc-filtro-busqueda` | Documentos | Título del documento |
| `task-q` | Planificación · Tareas | Título de la tarea (hoy «Titulo de tarea») |

Filtros dentro del toolbar: cada uno con `Label` visible encima (`text-meta`), control `w-full sm:w-44` (Select) o `sm:w-40` (fecha). En móvil cada filtro ocupa una fila. `Toolbar` es siempre un `div[role=group]` y no tiene `asChild`. Cuando los filtros se aplican con un botón (Maestras, §11.22), la vista envuelve el `Toolbar` en `<form onSubmit>`; en el resto se aplican al cambiar, como hoy.

### 7.2 Estados

`data-view.tsx`:
```ts
type DataViewState = 'loading' | 'error' | 'empty' | 'no-results' | 'ready';
interface DataViewProps {
  state: DataViewState;
  loading?: { rows?: number; columns?: number };   // por defecto 5 × 4
  error?: ErrorStateProps;
  empty?: EmptyStateProps;
  noResults?: { title?: string; description?: string; onClear?: () => void }; // onClear: solo vistas sin Toolbar (hoy ninguna)
  statusText?: string;                              // sr-only role=status: "Cargando solicitudes…", "25 solicitudes" (formatCount, §7.9), "Sin resultados"
  bordered?: boolean;                               // por defecto true
  children?: React.ReactNode;                       // la tabla; solo se renderiza en 'ready'
}
```
Contenedor: `rounded-lg border bg-card overflow-hidden` (si `bordered`). En `ready` renderiza `children` tal cual: la tabla aporta su región desplazable con `scrollLabel` (§6). `statusText` nunca repite literalmente un texto visible de la pantalla (usa conteos: "25 solicitudes", "0 elementos"); así no hay lecturas duplicadas ni coincidencias dobles en los E2E. `loading` → `TableSkeleton` con `aria-busy="true"`. `no-results` → `EmptyState` con título "Ningún resultado coincide con los filtros." y descripción "Cambia o limpia los filtros para ver más resultados.". «Limpiar filtros» tiene una sola ubicación: el `end` del `Toolbar` (§9 A). Las vistas con `Toolbar` no pasan `noResults.onClear`, porque sin resultados siempre hay algún filtro activo y aparecerían dos botones con el mismo nombre (el modo estricto de Playwright fallaría). `onClear` solo pinta el botón en una vista sin `Toolbar`, y hoy no hay ninguna. Exporta también `TableSkeleton({ rows, columns })` (filas de 40 px, celdas `Skeleton h-4` de anchos 60/40/30 %, `aria-hidden`).

`empty-state.tsx`:
```ts
interface EmptyStateProps {
  icon?: LucideIcon;               // 20 px, text-muted-foreground, sin círculo de fondo
  title: string;                   // qué es / qué pasa: "Aún no hay solicitudes."
  description?: React.ReactNode;   // cómo empezar
  action?: React.ReactNode;        // solo si la pantalla ya ofrece esa acción
  secondaryAction?: React.ReactNode;
  size?: 'default' | 'compact';    // py-10 / py-6
}
```
Centrado, título `text-sm font-semibold`, descripción `text-sm text-muted-foreground max-w-sm`, acciones `gap-2`.

`error-state.tsx`:
```ts
interface ErrorStateProps {
  title?: string;          // por defecto "No fue posible cargar la información."
  message?: string | null; // mensaje del api-wrapper; si falta: "Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal."
  onRetry?: () => void;
  retryLabel?: string;     // "Reintentar"
  size?: 'default' | 'compact';
}
```
`role="alert"`, icono `CircleAlert` `text-danger`, botón `outline` con `RefreshCw`.

`inline-notice.tsx`:
```ts
interface InlineNoticeProps {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';  // por defecto info
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  role?: 'note' | 'status' | 'alert';   // por defecto 'note'; 'alert' solo si aparece por un evento
  icon?: LucideIcon | false;             // por defecto: Info / CircleCheck / TriangleAlert / CircleAlert / Info
}
```
`flex gap-3 rounded-md border px-3 py-2.5 text-sm bg-<tone>-subtle border-<tone>-border`; icono 16 px en `text-<tone>`; título `font-medium`; texto en `text-foreground`. Sustituye todos los avisos ad‑hoc (`bg-muted p-3`, el ámbar de sesión expirada, el rojo de "Solicitud bloqueada", los avisos de BR‑006, etc.).

Regiones vivas: se eliminan todos los `aria-live` de secciones y contenedores de tablas/formularios. Solo anuncian: `ResultCount` en los listados que lo tienen (§7.6), el `statusText` de `DataView` en los demás, los `ErrorState`/`FormError` (`role="alert"`), los toasts (sonner), el título/contador de `RequirementsPanel` con `liveUpdates`, "Dedicación del día" (Bitácora), el bloque de consolidado (Semanal) y el mensaje de exceso de límite del editor (`role="alert"`, no el contador).

### 7.3 Estados de dominio

`src/lib/status-presentation.ts` (presentación pura, sin reglas):
```ts
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'outline';
export type StatusKind = 'request' | 'triage' | 'plan' | 'task' | 'record' | 'log' | 'asset'
  | 'document' | 'gate' | 'capacity' | 'band' | 'active' | 'grant' | 'permission' | 'blocking' | 'blocked';
export interface StatusPresentation { label: string; tone: Tone; icon?: LucideIcon }
export function getStatus(kind: StatusKind, value: string | null | undefined): StatusPresentation;
// Valor desconocido → { label: value ?? '—', tone: 'neutral' }. Nunca lanza.
export const GOVERNANCE_ROUTE_FALLBACK_LABELS: Record<string, string>; // COMPLETA Completa, SIMPLIFICADA Simplificada, EXPLORACION Exploración (solo respaldo)
export function routeLabel(code: string | null | undefined, catalog: ReadonlyArray<{ code: string; label: string }>): string;
// Orden: etiqueta de la maestra GOVERNANCE_ROUTE (editable en Maestras) → GOVERNANCE_ROUTE_FALLBACK_LABELS → el código. null o '' → '—'.
export const PRIORITY_BAND_COPY: Record<'P1'|'P2'|'P3'|'P4', string>;
export function parseBand(label: string | null | undefined): 'P1' | 'P2' | 'P3' | 'P4' | null; // /^(P[1-4])\b/
```
Las etiquetas salen de los mapas existentes, corregidos con tildes: `REQUEST_STATE_LABELS` y `TRIAGE_DECISION_LABELS` (`lib/request-state.ts`), `RECORD_STATE_LABEL` (`lib/record-state.ts`) y `TASK_STATUS_LABELS` y `PLAN_STATUS_LABELS`, que se trasladan a `lib/status-labels.ts` (§7.9.2) para que este módulo no importe `lib/tasks.ts` ni `lib/plan.ts`, que arrastran el cliente de la API. El resto de mapas son nuevos y viven en este archivo, que es un módulo puro (§7.9.2). Principio de tono: neutral = no iniciado/cerrado; info = en curso o en manos de otro; success = cumplido/vigente; warning = requiere atención o devuelto; danger = bloqueado/rechazado/sobrecarga.

| Tipo | Valores → etiqueta (tono) |
|---|---|
| `request` | REGISTRADA Registrada (neutral) · EN_TRIAGE En triage (info) · DEVUELTA Devuelta (warning) · RECHAZADA Rechazada (danger) · BACKLOG_PRIORIZADO Backlog priorizado (info) · COMPROMETIDA Comprometida (info) · EN_PLANIFICACION En planificación (info) · EN_EJECUCION En ejecución (info) · BLOQUEADA Bloqueada (danger) · EN_VALIDACION En validación (info) · LISTA_PARA_LIBERAR Lista para liberar (success) · EN_ESTABILIZACION En estabilización (info) · OPERATIVA Operativa (success) · CERRADA Cerrada (neutral) · RETIRADA Retirada (neutral) |
| `triage` | CONTINUAR Continuar (success) · DEVOLVER Devolver (warning) · RECHAZAR Rechazar (danger) |
| `plan` | BORRADOR Borrador (neutral) · EN_AUTORIZACION En autorización (info) · AUTORIZADO Autorizado (success) · DEVUELTO Devuelto (warning) |
| `task` | POR_HACER Por hacer (neutral) · EN_CURSO En curso (info) · BLOQUEADA Bloqueada (danger) · EN_REVISION En revisión (info) · TERMINADA Terminada (success) |
| `record` | BORRADOR Borrador (neutral) · EN_CURSO En curso (info) · BLOQUEADO Bloqueado (danger) · COMPLETADO Completado (success) · ARCHIVADO Archivado (neutral) |
| `log` | BORRADOR Borrador (neutral) · ENVIADO Enviado (info) · REVISADO Revisado (success) |
| `asset` | BORRADOR Borrador (neutral) · ACTIVO Activo (success) · RETIRADO Retirado (neutral) |
| `document` | BORRADOR Borrador (neutral) · VIGENTE Vigente (success) · ARCHIVADA Archivada (neutral) |
| `gate` | PENDIENTE Pendiente (neutral, `CircleDashed`) · CUMPLIDO Cumplido (success, `CircleCheck`) · NO_APLICA No aplica (outline, `CircleMinus`) |
| `capacity` | OK Normal (success) · SOBRECARGA Sobrecarga (danger, `TriangleAlert`) · SIN_DISPONIBILIDAD Sin disponibilidad (neutral) · CARGA_PARCIAL Carga parcial (warning) |
| `band` | P1 (danger) · P2 (warning) · P3 (info) · P4 (neutral) · SIN_PRIORIZAR Sin priorizar (outline) |
| `active` | `'true'` Activo (success) · `'false'` Inactivo (neutral) |
| `grant` | `'true'` Activo (success) · `'false'` Revocado (neutral) |
| `permission` | `'true'` Permitido (success) · `'false'` No permitido (neutral) |
| `blocking` | RESUELTO Resuelto (neutral) · SIN_RESOLVER Sin resolver (danger, `TriangleAlert`) — "No" se muestra como texto, no badge |
| `blocked` | `'true'` Bloqueada (danger, `TriangleAlert`) · `'false'` Sin bloqueo (neutral; en tablas se muestra "—" en su lugar) |

`PRIORITY_BAND_COPY`: P1 "Primera consideración para compromiso", P2 "Programación en el horizonte cercano", P3 "Planificación ordinaria según capacidad", P4 "Reserva de demanda, reformulación o cierre motivado" (misma glosa que la API, con ortografía). La banda nunca se deriva del score en el frontend: se toma de `priorityBand`/`band` de la API o del prefijo de `priorityLabel`. Se elimina `priorityBand(score)` de `frameworks-view.tsx` (duplicaba los cortes 80/65/45 del backend).

`status-badge.tsx`:
```ts
interface StatusBadgeProps { kind: StatusKind; value: string | null | undefined; srDescription?: string; className?: string }
// <Badge variant={tone}>{icon}{label}</Badge>; si srDescription, un <span className="sr-only"> HERMANO (no hijo) con ": {srDescription}".
// El texto del badge es exactamente la etiqueta (E2E: getByText('Activo', { exact: true })).
interface PriorityBadgeProps {
  band?: string | null;        // priorityBand/band de la API
  label?: string | null;       // priorityLabel de la API ("P1 · Primera consideracion para compromiso")
  score?: number | null;       // currentScore; solo se muestra, nunca se calcula
  variant?: 'compact' | 'full'; // por defecto 'compact'
}
// Banda = band ?? parseBand(label).
// 'compact' (tablas): "84" en tabular-nums + badge "P1" en una sola línea (inline-flex items-center gap-1.5 whitespace-nowrap),
//   SIN separador "·" entre ambos: el espacio de 6 px y el badge ya separan. Se lee "84 P1". Esta es la única forma
//   (§11.5, §11.8, §11.12 y §20 la citan como «84 P1»).
//   Sin score: solo el badge. Sin banda ni score: badge outline "Sin priorizar". Nunca repite la glosa por fila.
// 'full' (barra de contexto, ficha, toasts): además la glosa (PRIORITY_BAND_COPY o, si no hay banda, el label de la API)
//   en text-meta text-muted-foreground.
function PriorityLegend(props: { className?: string }): React.ReactElement; // seguro para servidor
// <ul aria-label="Bandas de prioridad" className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted-foreground">
//   cuatro <li className="flex items-center gap-1.5"> con el badge P1–P4 y su glosa de PRIORITY_BAND_COPY.
// Una sola vez por tabla que muestra bandas (Solicitudes, Aprobaciones, Portafolio), entre el toolbar y la tabla.
// La glosa vive en la leyenda y no en un tooltip, porque un badge no es enfocable y el tooltip sería inaccesible por teclado.
```

### 7.4 Bloqueos y acciones no disponibles

`requirements-panel.tsx` (patrón completo en §10):
```ts
type RequirementStatus = 'pending' | 'met';
interface RequirementAction {
  label: string;            // verbo + objeto: "Editar fase", "Abrir tarea", "Ir a triage"
  onClick?: () => void;
  href?: string;            // ruta interna (next/link)
  disabled?: boolean;
  disabledReason?: string;
}
interface RequirementItem {
  id: string;
  label: React.ReactNode;   // qué se requiere o qué falta (texto de la API cuando exista)
  status: RequirementStatus;
  detail?: React.ReactNode; // contexto: estado actual, categoría, fecha de revisión
  owner?: string | null;    // nombre del responsable si la API lo trae
  action?: RequirementAction;
}
interface RequirementsPanelProps {
  id: string;               // id del panel; su cabecera (título + contador) lleva `${id}-summary`, destino del aria-describedby de la acción bloqueada
  title: string;            // qué está bloqueado (con pendientes); también es el respaldo de doneTitle
  description?: React.ReactNode;     // con pendientes; respaldo de doneDescription
  items: RequirementItem[];
  groups?: { id: string; label: string; itemIds: string[] }[];
  doneTitle?: string;       // título sin pendientes; se pinta doneTitle ?? title
  doneDescription?: React.ReactNode; // descripción sin pendientes; se pinta doneDescription ?? description
  footer?: React.ReactNode; // la acción bloqueada + DisabledReason
  headingLevel?: 2 | 3;
  liveUpdates?: boolean;    // título + contador en aria-live="polite"
  compact?: boolean;        // dentro de tarjetas (gates): sin borde propio, padding reducido
}
```

Una acción de `RequirementAction` con `disabled` y `disabledReason` se pinta siempre como `Button unavailable` envuelto en `DisabledHint`, nunca como enlace, aunque tenga `href`: un enlace que no lleva a ninguna parte no es un enlace.

`disabled-reason.tsx` (`'use client'`). Las dos piezas usan `aria-disabled` mediante la prop `unavailable` de `Button` (§6). El control conserva su rol, su nombre y su lugar en el orden de tabulación, y el lector anuncia «no disponible» seguido del motivo (WCAG 4.1.2). No se envuelve el control en un `span` enfocable.

```tsx
function DisabledReason(props: { id: string; children: React.ReactNode }): React.ReactElement;
// <p id> text-meta text-muted-foreground con icono Info 14 px (aria-hidden). Motivo VISIBLE junto a una acción principal.
// La acción es <Button unavailable aria-describedby={id}>; dentro de RequirementsPanel, aria-describedby={`${panelId}-summary ${id}`} (§10.1).
// En PageHeader, la acción y su motivo van juntos: <div className="flex flex-col items-start gap-1 md:items-end">,
// con el motivo en max-w-xs md:text-right.

interface DisabledHintProps {
  reason?: string | null;                    // sin motivo → devuelve children tal cual
  label?: string;                            // solo controles solo-icono: su nombre, como primera línea del tooltip
  children: React.ReactElement<ButtonProps>; // siempre un <Button>
}
function DisabledHint({ reason, label, children }: DisabledHintProps): React.ReactElement {
  const hintId = React.useId();
  const [open, setOpen] = React.useState(false);   // tooltip controlado: también se abre al pulsar
  if (!reason) return children;
  const describedBy = [children.props['aria-describedby'], hintId].filter(Boolean).join(' ');
  return (
    <>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <TooltipTarget>
            {React.cloneElement(children, {
              disabled: false,
              unavailable: true,                        // aria-disabled; el clic no ejecuta la acción ni envía el formulario
              onUnavailableClick: () => setOpen(true),  // ratón, teclado y táctil (donde Radix no abre por hover)
              'aria-describedby': describedBy,          // única descripción: TooltipTarget descarta la que suma Radix (§6)
            })}
          </TooltipTarget>
        </TooltipTrigger>
        <TooltipContent>
          {label ? <span className="block font-medium">{label}</span> : null}
          {reason}
        </TooltipContent>
      </Tooltip>
      <span id={hintId} hidden>{reason}</span>
    </>
  );
}
```

Secuencia de eventos, para quien implemente (leída en el código de `TooltipTrigger` 1.3.0): Radix cierra el tooltip en `pointerdown` si estaba abierto, y en `click`; al recibir el foco lo abre, salvo que el foco venga de un `pointerdown`. El cierre por clic forma parte del `onClick` que los `Slot` fusionan (el de Radix y el de `TooltipTarget`) y que `Button` descarta cuando es `unavailable`; después, `onUnavailableClick` lo vuelve a abrir. El resultado es que pulsar siempre deja visible el motivo. Se cierra con Escape, al salir el foco o al pulsar fuera. Con el tooltip abierto o cerrado, la descripción del botón es solo `describedBy`, así que el motivo se anuncia una vez. `onUnavailableClick` se extrae de las props en `Button` y no llega al DOM.

### 7.5 Confirmaciones y motivos

`confirm-dialog.tsx`:
```ts
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;               // "¿Eliminar la fase «Diseño»?"
  description: React.ReactNode; // consecuencia concreta
  confirmLabel: string;        // "Eliminar fase"
  cancelLabel?: string;        // "Cancelar"
  tone?: 'danger' | 'default'; // por defecto 'danger' → botón destructive
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}
```
`DialogContent size="sm" role="alertdialog"`; foco inicial en Cancelar (`onOpenAutoFocus` → ref); clic fuera no cierra (`onInteractOutside` → `preventDefault`); Escape cierra salvo `busy`. Al confirmar se ejecuta el handler existente sin cambios (toast incluido) y el diálogo se cierra al terminar, con éxito o error.

`reason-dialog.tsx` (motivo obligatorio; reemplaza `window.prompt` y unifica `DevolverDialog`):
```ts
interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  fieldId: string;             // 'devolver-reason' (se conserva) | 'waive-reason'
  fieldLabel?: string;         // "Motivo"
  placeholder?: string;
  confirmLabel: string;        // "Devolver" | "Marcar como no aplica"
  busyLabel: string;           // "Devolviendo…" | "Guardando…"
  tone?: 'danger' | 'default';
  submitting: boolean;
  errorMessage: string | null; // error del backend, en línea; conserva el texto escrito
  onConfirm: (reason: string) => void; // recibe el motivo recortado
}
```
Validación cliente: motivo obligatorio (vacío o solo espacios → error en el campo "Escribe el motivo."). `Textarea` con `autoFocus`. `devolver-dialog.tsx` queda como envoltorio con prop `kind: 'solicitud' | 'plan'` que fija los textos (§13.3).

### 7.6 Tablas y listas

`row-actions.tsx`:
```ts
interface RowAction {
  key: string;
  label: string;               // texto visible y nombre accesible
  icon?: LucideIcon;
  onSelect?: () => void;
  href?: string;               // next/link
  disabled?: boolean;
  disabledReason?: string;     // obligatorio si disabled y no es transitorio (§10.3)
  busy?: boolean;              // spinner + deshabilitado
  busyLabel?: string;          // "Eliminando…"
  tone?: 'default' | 'danger';
  placement?: 'inline' | 'menu'; // por defecto: las 2 primeras inline, el resto en menú
  iconOnly?: boolean;          // inline como icon-button `icon-sm` con aria-label=label y LabelTooltip (solo reordenar fases)
  id?: string;                 // id DOM del botón inline; solo reordenar fases, para devolverle el foco (§11.9)
}
interface RowActionsProps { actions: RowAction[]; rowLabel: string }
```
Inline: `Button variant="ghost" size="sm"` (`ghost-destructive` si `tone='danger'`). Con `disabled` y `disabledReason` → `DisabledHint reason={disabledReason}` sobre un `Button` (en `iconOnly`, además `label={label}`, para que el tooltip diga qué control es y por qué no está disponible); si la acción tiene `href`, se pinta igualmente como botón, sin enlace (§7.4). Con `disabled` sin motivo (casos de §10.3) o con `busy` → atributo `disabled`. Un `iconOnly` disponible va dentro de `LabelTooltip label={label}` (§6), que no lo describe. Menú: trigger `Button variant="ghost" size="icon-sm"` con `Ellipsis` y `aria-label="Más acciones para «{rowLabel}»"`, sin tooltip. Al cerrarse el menú, Radix devuelve el foco al disparador, y un tooltip que se abre con el foco aparecería solo después de cada uso del menú, también con ratón (§14). Ítems según §6. Si alguna acción del menú está `busy` (p. ej. «Descargar .md», §11.17), el trigger muestra `LoaderCircle` (`animate-spin motion-reduce:animate-none`) en lugar de `Ellipsis` y lleva `aria-busy="true"` hasta que termina. Sigue habilitado, para llegar a las demás acciones, y dentro el ítem ocupado aparece deshabilitado con su `busyLabel`. Así queda indicación del progreso aunque el menú se haya cerrado al elegir la acción. Contenedor `flex justify-end gap-1`. Con 2 acciones o menos no se crea menú, salvo que la vista fije `placement: 'menu'`, como Solicitudes, cuya acción principal ya está en el título (§11.5) (Maestras conserva "Editar" y "Activar/Desactivar" como botones, requisito del E2E). Única excepción al máximo de 2 inline: la fila de fase de Planificación (subir, bajar, editar y agregar tarea son controles de edición del propio orden y van inline; eliminar va al menú).

`RowActionsCell` (mismo archivo): `function RowActionsCell(props: { children: React.ReactNode }): React.ReactElement`, que renderiza `<TableCell className="w-px whitespace-nowrap py-1 text-right [[data-density=compact]_&]:py-0.5">`. Toda columna de acciones usa esta celda, con `TableHead` "Acciones" alineado a la derecha. En densidad compacta, los botones de `RowActions` añaden `[[data-density=compact]_&]:h-7 [[data-density=compact]_&]:px-2` y los de icono `[[data-density=compact]_&]:size-7` (28 px, por encima de los 24 px de WCAG 2.5.8). Resultado: 4 + 32 + 4 = 40 px por defecto y 2 + 28 + 2 = 32 px en compacta (§5.3).

`data-table.tsx` (`'use client'`): piezas de listado reutilizables. Todo el filtrado, el orden y la paginación son de presentación, en cliente, sobre lo que ya devuelve la API, sin parámetros nuevos.

```ts
// Encabezado ordenable (patrón Carbon): un <button> dentro del <th>.
interface SortableTableHeadProps<K extends string> {
  label: string;                          // 1–2 palabras, sentence case
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;               // ClientTable.toggleSort
  align?: 'left' | 'right';               // 'right' en numéricas
  className?: string;
}
// <TableHead aria-sort={activa ? (asc ? 'ascending' : 'descending') : undefined} className="p-0">
//   <button type="button" className="flex h-9 w-full items-center gap-1 px-3 text-xs font-medium text-muted-foreground
//     hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&_svg]:size-3.5">
//     {label}<span className="sr-only">, ordenar</span>
//     {activa ? (asc ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />) : <ArrowUpDown aria-hidden className="opacity-40" />}
//   </button>
// aria-sort solo en la columna activa. El siguiente estado lo decide nextSort (table-sort.ts): en otra columna, ascendente;
// en ascendente, descendente; en descendente, el orden por defecto de la vista, salvo que la columna sea la del orden por
// defecto, que pasa a ascendente. Así Registro (Solicitudes) y Fecha (Auditoría), que cargan en descendente, sí llegan a ascendente.

// Conteo visible, que además es la región viva del listado.
function ResultCount(props: { loading: boolean; total: number; filtered: number; noun: { one: string; other: string } }): React.ReactElement;
// <p role="status" className="text-meta tabular-nums text-muted-foreground">
//   cargando: "Cargando {other}…"; sin filtros: formatCount(total, noun) → "45 solicitudes" / "1 solicitud";
//   con filtros: `${filtered} de ${formatCount(total, noun)}` → "12 de 45 solicitudes" (formatCount, §7.9).
// Va en el `end` del Toolbar. Si la vista lo muestra, no pasa `statusText` a DataView (no hay dos anuncios del mismo hecho).

// Paginación en cliente, al pie del contenedor de DataView.
interface DataTablePaginationProps {
  id: string;                              // 'sol-paginacion' → select `${id}-filas`
  page: number; pageCount: number; from: number; to: number; filtered: number;
  pageSize: 25 | 50 | 100;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: 25 | 50 | 100) => void;
  noun: { one: string; other: string };
}
// <nav aria-label="Paginación de {other}" className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-meta">
//   `${from}–${to} de ${formatCount(filtered, noun)}` → "1–25 de 45 solicitudes" (tabular-nums) · Label "Filas por página" + Select h-8 w-20 (25, 50, 100) ·
//   "Página 1 de 2" · Button icon-sm "Página anterior" (ChevronLeft) y "Página siguiente" (ChevronRight), cada uno en LabelTooltip, deshabilitados
//   en los extremos (límite natural, sin motivo, §10.3). Si el botón pulsado queda deshabilitado al llegar al extremo,
//   en el siguiente requestAnimationFrame el foco pasa al otro botón (por ref), para que el teclado no lo pierda.
// Solo se renderiza si filtered > 25.

// Celda de título: identificador legible y acción principal de la fila.
function CellTitle(props: { children: string; onOpen?: () => void; href?: string; meta?: React.ReactNode }): React.ReactElement;
// Con onOpen → <button type="button">; con href → <Link>; sin ninguno → <span>. El control (o el span exterior) lleva
// "inline-block max-w-full text-left font-medium text-foreground hover:underline underline-offset-4 rounded-sm
//  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" y title={children} con el texto completo.
// El recorte va en un span interior, no en el control: <span className="line-clamp-2">{children}</span>. Así no depende de
// que un <button> o un <a> acepten display:-webkit-box, y el outline de foco rodea las dos líneas.
// La celda que la contiene: "min-w-56 max-w-[28rem]". `meta` opcional en una segunda línea text-meta text-muted-foreground.
```

`lib/table-sort.ts` (puro, §7.9.2):

```ts
export type SortDirection = 'asc' | 'desc';
export interface SortState<K extends string> { key: K; direction: SortDirection }
export type Comparator<T> = (a: T, b: T, direction: SortDirection) => number;
export function compareText(a: string | null | undefined, b: string | null | undefined, d: SortDirection): number;
// localeCompare(b, 'es', { sensitivity: 'base', numeric: true }); vacíos al final en ambas direcciones.
export function compareNumber(a: number | null | undefined, b: number | null | undefined, d: SortDirection): number; // null al final
export function compareDate(a: string | null | undefined, b: string | null | undefined, d: SortDirection): number;   // inválida o null al final
export function compareByOrder(order: readonly string[]): (a: string | null | undefined, b: string | null | undefined, d: SortDirection) => number;
// Por posición en `order` (p. ej. estados en el orden del flujo); valores desconocidos al final.
export function sortRows<T, K extends string>(rows: readonly T[], sort: SortState<K> | null, comparators: Record<K, Comparator<T>>): T[];
// sort null → copia en el orden recibido de la API. Orden estable.
export function nextSort<K extends string>(
  current: SortState<K> | null,
  key: K,
  defaultSort: SortState<K> | null,
): SortState<K> | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  // Desde descendente se vuelve al orden por defecto, salvo que sea esta misma columna: entonces ascendente.
  return defaultSort?.key === key ? { key, direction: 'asc' } : defaultSort;
}
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): { pageRows: T[]; page: number; pageCount: number; from: number; to: number };
// page se acota a [1, pageCount]; pageCount ≥ 1; from/to empiezan en 1 (0 y 0 si no hay filas).
export function matchesSearch(text: string | null | undefined, query: string): boolean;
// trim, minúsculas y sin diacríticos (NFD y quitar \p{M}) en los dos lados: "priorizacion" encuentra "Priorización".
```

`lib/use-client-table.ts` (`'use client'`):

```ts
interface UseClientTableOptions<T, K extends string> {
  rows: readonly T[];
  filter?: (row: T) => boolean;            // búsqueda + filtros de la vista (la vista lo memoiza)
  comparators: Record<K, Comparator<T>>;
  defaultSort: SortState<K> | null;        // null = orden de la API
  resetKey?: string;                       // p. ej. JSON de los filtros: si cambia, vuelve a la página 1
}
interface ClientTable<T, K extends string> {
  pageRows: T[]; total: number; filtered: number;
  page: number; pageCount: number; from: number; to: number; pageSize: 25 | 50 | 100;
  setPage(page: number): void; setPageSize(size: 25 | 50 | 100): void;
  sort: SortState<K> | null; toggleSort(key: K): void;
}
function useClientTable<T, K extends string>(o: UseClientTableOptions<T, K>): ClientTable<T, K>;
```

- Estado inicial del orden: `defaultSort`. `toggleSort(key)` hace `setSort((s) => nextSort(s, key, defaultSort))`; no hay otra lógica de ciclo.
- Tamaño de página por defecto: 25. Cambiar el orden, el tamaño o `resetKey` vuelve a la página 1.
- Cuando la vista recarga los datos (tras una acción), se conserva la página, acotada a `pageCount`.
- Filtros, orden y página viven en el estado de la vista y no se persisten, igual que los filtros de hoy.

`description-list.tsx`:
```ts
interface DescriptionItem { term: string; value: React.ReactNode; span?: 1 | 2 }
interface DescriptionListProps { items: DescriptionItem[]; columns?: 1 | 2 }
// dl grid gap-x-6 gap-y-3 (sm:grid-cols-2 si columns=2); dt text-meta text-muted-foreground; dd text-sm whitespace-pre-wrap; valor vacío/null → "—".
```

`master-detail.tsx`:
```ts
interface MasterDetailProps {
  listTitle: string;              // h2 visible: "Mis diarios", "Novedades"
  list: React.ReactNode;          // normalmente <SelectableList/>
  detail: React.ReactNode;
  detailHeadingRef?: React.RefObject<HTMLHeadingElement | null>; // foco tras seleccionar en <1024 px
}
interface SelectableListItem { id: string; title: React.ReactNode; meta?: React.ReactNode; badge?: React.ReactNode }
interface SelectableListProps {
  items: SelectableListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;                   // aria-label del <ul>
  loading?: boolean;               // 4 skeletons de 56 px
  empty?: EmptyStateProps;         // size compact
}
```
`lg:grid lg:grid-cols-[320px_minmax(0,1fr)] gap-6`; la lista va en `rounded-lg border bg-card` con `lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)] overflow-y-auto`. Ítem: `button` a todo el ancho, `px-3 py-2.5 text-left`, título `text-sm font-medium line-clamp-2`, meta `text-meta text-muted-foreground`, badge a la derecha; seleccionado `bg-primary-subtle` + barra izquierda de 2 px `bg-primary` + `aria-current="true"`. En <1024 px, tras `onSelect` del usuario (no en la autoselección inicial), `scrollIntoView({ block: 'start' })` del detalle y foco en su encabezado (`tabIndex={-1}`). El desplazamiento respeta el `scroll-padding-top` de §5.4, de modo que el encabezado no queda bajo la barra móvil.

`stat-tile.tsx`:
```ts
interface StatTileProps { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'default' | 'danger' | 'warning' | 'success' }
function StatStrip(props: { label: string; children: React.ReactNode }): React.ReactElement;
// StatStrip: section[aria-label] con un solo borde: grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 rounded-lg border.
// StatTile: p-4; label text-meta text-muted-foreground; value text-2xl font-semibold tabular-nums (text-<tone> si tone); hint text-xs.
```

`utilization-bar.tsx`:
```ts
interface UtilizationBarProps { value: number | null; tone: 'default' | 'danger' | 'warning'; label: string }
// Texto "45 %" (formatPercent) + barra de 48×6 px aria-hidden (bg-muted; relleno bg-primary | bg-danger | bg-warning, ancho min(value,100) %).
// value null → "—" sin barra. `label` alimenta un sr-only ("Utilización: 45 %").
```

### 7.7 Formularios

`field.tsx`:
```ts
interface FieldControlProps { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true; 'aria-required'?: true }
interface FieldProps {
  id: string;
  label: React.ReactNode;
  required?: boolean;          // asterisco aria-hidden + aria-required en el control (NUNCA el atributo HTML required)
  help?: React.ReactNode;      // id `${id}-help`
  error?: string | null;       // id `${id}-error`
  labelHidden?: boolean;
  className?: string;
  children: React.ReactElement | ((control: FieldControlProps) => React.ReactNode);
}
// Elemento → cloneElement fusionando aria-describedby; función → se llama con las props (Select: se esparcen en SelectTrigger).
interface FieldSetProps {
  id: string;
  legend: React.ReactNode;
  kind?: 'radio' | 'checkbox';   // 'radio' → role="radiogroup"; 'checkbox' → grupo de casillas (rol implícito group)
  required?: boolean;
  help?: React.ReactNode;        // id `${id}-help`
  error?: string | null;         // id `${id}-error`
  children: React.ReactNode;     // RadioCards o lista de Checkbox
}
function FieldSet(props: FieldSetProps): React.ReactElement;
// <fieldset id={id}
//   role={kind === 'radio' ? 'radiogroup' : undefined}            // ARIA in HTML permite radiogroup en fieldset
//   aria-labelledby={`${id}-legend`}                               // nombre garantizado aunque cambie el rol
//   aria-required={kind === 'radio' && required ? true : undefined} // válido en radiogroup; no en radio ni en group
//   aria-invalid={error ? true : undefined}
//   aria-describedby={[help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined}
//   className="grid gap-1.5">
//   <legend id={`${id}-legend`} className="text-meta font-medium">
//     {legend}
//     {required ? <span aria-hidden="true"> *</span> : null}
//     {required && kind === 'checkbox' ? <span className="sr-only"> (obligatorio)</span> : null}
//   </legend>
//   {children}  {help} {error}   // ayuda y error con la misma maquetación que Field
// </fieldset>
function FormError(props: { id: string; message: string | null }): React.ReactElement | null;
// InlineNotice tone=danger role=alert con id `${formId}-error`: destino del aria-describedby de los campos de una regla combinada (§9).
function RequiredHint(): React.ReactElement; // "Los campos con * son obligatorios." text-meta text-muted-foreground
```
Maquetación de `Field`: `grid gap-1.5`; ayuda `text-meta text-muted-foreground`; error `flex gap-1 text-meta text-danger` con `CircleAlert` 14 px. No se usa el atributo `required` porque activaría la validación nativa del navegador y cambiaría el comportamiento (el E2E de Maestras espera el mensaje propio).

### 7.8 Shell, marca y contexto de solicitud

`brand.tsx`: `BrandMark` (cuadro `size-7 rounded-md bg-primary text-primary-foreground` con `ChartNoAxesCombined` 16 px, `aria-hidden`) y `BrandName` ("Portal del área" `text-sm font-semibold leading-tight` + "Analítica" `text-xs text-sidebar-muted-foreground`). Único lugar a tocar para el logo corporativo: sustituir el contenido de `BrandMark` por `next/image` de `/logo.svg` a 28 px.

`skip-link.tsx`: `<a href="#contenido">Saltar al contenido</a>`; `sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md outline-2 outline-ring`. Primer elemento enfocable del shell.

`app-shell.tsx`, `app-sidebar.tsx`, `mobile-nav.tsx`: §8.

`request-context-bar.tsx` (mesa de trabajo por solicitud: Triage, Priorización, Planificación, Controles):
```ts
interface RequestPickerGroup { label: string; match: (r: Request) => boolean }
interface RequestContextBarProps {
  id: string;                      // id del SelectTrigger: 'triage-request' | 'priority-request' | 'plan-request' | 'governance-request'
  label?: string;                  // "Solicitud"
  requests: Request[];
  value: string;                   // '' sin selección
  onValueChange: (id: string) => void;
  groups?: RequestPickerGroup[];   // cada solicitud cae en el primer grupo que la acepta; el resto en "Otras solicitudes"
  helper?: React.ReactNode;        // bajo el selector: "3 pendientes de triage"
  summary?: React.ReactNode;       // a la derecha: <RequestSummary/> u otros badges
  actions?: React.ReactNode;       // acción contextual de la página (p. ej. "Crear plan")
}
function RequestSummary(props: { request: Request; show?: Array<'state' | 'triage' | 'priority' | 'registered'> }): React.ReactElement;
// Por defecto show = ['state']. Fila flex flex-wrap items-center gap-2, en el orden de `show`:
//   'state'      → <StatusBadge kind="request" value={operationalState} />
//   'triage'     → <StatusBadge kind="triage" value={currentTriageDecision} />, o texto text-meta text-muted-foreground "Sin triage" si es null
//   'priority'   → <PriorityBadge variant="compact" score={currentScore} label={priorityLabel} /> ("84 P1" o "Sin priorizar")
//   'registered' → text-meta text-muted-foreground "Registro: {formatDate(registeredAt)}"
function RequestFacts(props: { request: Request; processName?: string | null }): React.ReactElement;
// RequestFacts = DescriptionList: Proceso principal, Registro, Área solicitante, Solicitante, Dueño funcional,
// Fecha objetivo, Enlace de referencia (solo http/https: <a target="_blank" rel="noopener noreferrer"> + ExternalLink), Resultado esperado (span 2).
```
Contenedor `rounded-lg border bg-surface-subtle p-3`, `grid gap-3 lg:grid-cols-[minmax(0,28rem)_1fr_auto] lg:items-end`. Opciones del selector: "{título} · {estado}" con `SelectGroup` + `SelectLabel` por grupo y `SelectSeparator` entre grupos.

### 7.9 Utilidades nuevas (`src/lib`)

`format.ts` (reemplaza las copias locales de `formatDate`, `today()`, `currentMonday()`, `currentMonth()`, `monthStart()` y `nextMonthStart()`). Empieza por este bloque, que es la única definición de las reglas de fechas del portal:

```ts
// Reglas de fechas del portal (únicas; corrige §19.2 y §19.5):
// 1) Mostrar una fecha de solo-fecha guardada: UTC (formatDateOnly, formatMonth). Se guardan como YYYY-MM-DD o como
//    `${día}T00:00:00.000Z`; leerlas en hora local corre el día en UTC−5.
// 2) Proponer un valor por defecto ("hoy", "mes actual", "lunes actual", "periodo del mes"): calendario LOCAL del usuario,
//    que es el día que tiene delante (local*InputValue, localMonthPeriod).
// 3) Pasar una fecha guardada a un <input type="date">: UTC, como hoy (toISOString().slice(0, 10)). No cambia.
// Ninguna regla cambia el formato enviado a la API ni lo que se almacena.
export function localDateInputValue(now: Date = new Date()): string;       // 'YYYY-MM-DD' con getFullYear/getMonth/getDate
export function localMonthInputValue(now: Date = new Date()): string;      // 'YYYY-MM'
export function localWeekMondayInputValue(now: Date = new Date()): string; // misma regla que hoy: domingo → lunes anterior
// day = now.getDay(); diff = day === 0 ? -6 : 1 - day; new Date(y, m, d + diff) en hora local → 'YYYY-MM-DD'
export function localMonthPeriod(now: Date = new Date()): { from: string; to: string };
// from = día 1 del mes local; to = día 1 del mes siguiente (límite exclusivo, como hoy), con cambio de año
```

Funciones de presentación:

- `formatDate(iso)`: marca de tiempo → `Intl.DateTimeFormat('es', { dateStyle: 'medium' })` en zona local ("10 oct 2026"). Para `registeredAt` de `Request`.
- `formatDateTime(iso)`: `{ dateStyle: 'medium', timeStyle: 'short' }` local. Auditoría, maestras, validaciones, versiones.
- `formatDateOnly(value)`: fechas de calendario (regla 1). Acepta `YYYY-MM-DD` o ISO y formatea con `timeZone: 'UTC'`. Para `targetDate`, `initialCommitmentDate`, inicio/fin de fase y tarea, `endDate` de Mi trabajo, fechas `YYYY-MM-DD` de portafolio, novedades, reuniones, compromisos, diarios y semanales.
- `formatMonth('YYYY-MM')` → "octubre de 2026", con `{ month: 'long', year: 'numeric', timeZone: 'UTC' }` (regla 1). Sin `timeZone`, `new Date('2026-10')` se formatea como «septiembre de 2026» en UTC−5.
- `formatHours(n)` → "40 h"; `formatPercent(n)` (n ya en 0–100) → "45 %"; `orDash(v)` → "—" para null/''.
- `formatCount(n, noun: { one: string; other: string })`: `Intl.NumberFormat('es').format(n)` + espacio + `n === 1 ? noun.one : noun.other`. Da «1 pendiente», «0 pendientes» y «3 pendientes». Todo texto visible o anunciado que junte un número variable con un sustantivo usa esta función; nunca se escribe el plural fijo junto a la variable. La usan `ResultCount`, `DataTablePagination`, el `statusText` de `DataView`, el contador de `RequirementsPanel` (§10.1), el `helper` de Triage (§11.6) y el resumen de GC4 (§11.18).
- Contrato exacto, común a las funciones de fecha:
  - `null`, `undefined` o `''` → "—".
  - Texto que no se puede interpretar como fecha → el texto original (mismo criterio que hoy).
- Detalle de `formatHours(n)`: `Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(Math.abs(n))`, precedido de «−» (U+2212, signo menos tipográfico) si `n < 0`, + espacio duro (U+00A0) + "h": "40 h", "37,5 h", "−10 h". `Intl` daría «-10», con guion; `-0` da "0 h".
- Detalle de `formatPercent(n)`: `Math.round(n)` + U+00A0 + "%".
- El espacio duro evita que la unidad quede sola en otra línea. `format.ts` no importa nada (módulo puro, §7.9.2).

Dónde se aplica la regla 2, con los ids que se conservan:

| Campo | Archivo | Hoy | Pasa a |
|---|---|---|---|
| `diario-date` | `diario-form-dialog.tsx` | `toISOString().slice(0, 10)` | `localDateInputValue()` |
| `nov-date` | `novedad-form-dialog.tsx` | ídem | `localDateInputValue()` |
| `reu-date` | `reunion-form-dialog.tsx` | ídem | `localDateInputValue()` |
| `com-due` | `compromiso-form-dialog.tsx` | ídem | `localDateInputValue()` |
| `sem-week` | `semanal-form-dialog.tsx` | `currentMonday()` con `getUTC*` | `localWeekMondayInputValue()` |
| `capacidad-month` | `capacidad-view.tsx` | `currentMonth()` con `getUTC*` | `localMonthInputValue()` |
| `dashboard-from` / `dashboard-to` | `dashboard-view.tsx` | `monthStart()` / `nextMonthStart()` con `getUTC*` | `localMonthPeriod()` |
| `indicadores-from` / `indicadores-to` | `demand-overview-view.tsx` | ídem | `localMonthPeriod()` |

- En los diálogos, el valor se calcula al abrirse, en el efecto que ya lo hace hoy. Solo corre en el cliente.
- En las tres vistas con el periodo o el mes en su estado inicial (Panel del área, Indicadores, Capacidad), el valor se calcula después del montaje y no en el inicializador de `useState`. Ese inicializador también se ejecuta al prerenderizar en el servidor, y el HTML quedaría con la fecha del build y la zona del servidor. Patrón: estado inicial `''`; `React.useEffect(() => { const p = localMonthPeriod(); setFrom((v) => v || p.from); setTo((v) => v || p.to); }, [])`, y para el mes, `setMonth((v) => v || localMonthInputValue())`.
- El efecto de carga sale sin pedir nada mientras el valor es `''` (`if (!from || !to) return;` o `if (!month) return;`). Mientras tanto, cada campo muestra un `Skeleton` de su mismo tamaño (`h-9 w-40` en las fechas del periodo, `h-9 w-44` en el mes). Los `onChange` actuales de los tres campos (`if (e.target.value) set…`) ya impiden volver a `''`, así que el skeleton solo aparece antes del primer valor.
- No cambian el formato enviado a la API, lo que se almacena ni las conversiones de valores ya guardados para editarlos (`solicitud-form-dialog.tsx` 81, `phase-dialog.tsx` 34 y `task-dialog.tsx` 48, regla 3).

`use-request-param.ts`: `useRequestIdParam(): { requestId: string | null; setRequestId(id: string | null): void }` con `useSearchParams` + `router.replace(`${pathname}?requestId=${encodeURIComponent(id)}`, { scroll: false })` (o `pathname` sin query si `null`). Las páginas que lo usan envuelven la vista en `<Suspense fallback={<PageFallback … />}>`. Las reglas de uso están en §7.9.1.

`use-sidebar-mode.ts`: §8.3.

#### 7.9.1 Selección por `?requestId=` (Triage, Priorización, Planificación, Controles)

La fuente de verdad de la solicitud elegida es el estado local de la vista (`selectedId`), no la URL. La URL solo la refleja, para compartir enlaces y encadenar pasos. Regla única para las cuatro mesas de trabajo:

```ts
const { requestId: urlId, setRequestId } = useRequestIdParam();
const [selectedId, setSelectedId] = React.useState('');
const selectedRef = React.useRef(selectedId);
selectedRef.current = selectedId;
// selectRequest(id): la función que hoy fija la selección y resetea el formulario (sin cambios).

// 1) Adoptar el parámetro cuando `requests` termina de cargar y cada vez que cambia `urlId` (navegación externa, atrás/adelante).
React.useEffect(() => {
  if (loadState !== 'success' || !urlId || urlId === selectedRef.current) return;
  if (requests.some((r) => r.id === urlId)) selectRequest(urlId);
  else { setNotice(TEXTO_NO_DISPONIBLE); setRequestId(null); }
}, [loadState, requests, urlId]);

// 2) Elegir en el selector: primero el estado, después la URL (router.replace, sin await).
function handlePick(id: string): void { setNotice(null); selectRequest(id); setRequestId(id); }

// 3) Cada vez que la vista recarga `requests` (Reintentar, éxito de una acción o cambio de actor donde ya ocurre hoy):
//    si `selectedId` ya no está en la lista → selectRequest('') y setRequestId(null).
```

- `TEXTO_NO_DISPONIBLE` es "La solicitud indicada no está disponible aquí." (`InlineNotice` info bajo la barra de contexto). En Planificación es "La solicitud indicada no está comprometida, en planificación ni en ejecución.". El aviso se borra al elegir otra solicitud.
- Como el paso 2 fija `selectedId` antes de que cambie la URL, el efecto 1 no vuelve a resetear el formulario. La ref evita que el efecto dependa de `selectedId`, lo que revertiría la elección mientras la URL todavía tiene el valor anterior.
- No se añaden recargas por cambio de actor. Planificación ya recarga (`[loadRequests, actorId]`); Triage, Priorización y Controles siguen sin hacerlo, como hoy.
- `useRequestIdParam` usa `useSearchParams`, `usePathname` y `useRouter`. `setRequestId(id)` llama a `router.replace(pathname + '?requestId=' + encodeURIComponent(id), { scroll: false })` y `setRequestId(null)` a `router.replace(pathname, { scroll: false })`.

`page-fallback.tsx` (seguro para servidor): `PageFallback(props: { title: string; description?: string; variant?: 'workbench' | 'detail' })`.

- Pinta `PageLayout` > `PageHeader` con el mismo `h1` y la misma descripción que la vista, más un `Skeleton` de la barra de contexto (`h-16 rounded-lg`) y otro del contenido (`h-64 rounded-lg`).
- `variant="detail"` (Tareas) omite la barra de contexto y usa el `h1` "Tarea".
- Es el `fallback` de los `<Suspense>` de Triage, Priorización, Planificación, Controles y Tareas. Así el HTML prerenderizado ya trae el `h1`; hoy Tareas usa `<Suspense>` sin `fallback`.

#### 7.9.2 Módulos puros y predicados compartidos

Regla: `format.ts`, `status-labels.ts`, `status-presentation.ts`, `request-state.ts`, `record-state.ts` (lo importa `status-presentation.ts` por `RECORD_STATE_LABEL`; hoy ya solo tiene `import type`), `navigation.ts`, `plan-guide.ts`, `task-filters.ts`, `table-sort.ts` (§7.6) y `safe-redirect.ts` (§8.7), todos en `src/lib`, son puros.

- Solo usan importaciones relativas (`./…`), `lucide-react` e `import type` desde `./api-client`.
- Nunca usan el alias `@/`, porque Node no lo resuelve sin la configuración de Next.
- Nunca importan valores de `./api-client`: ese módulo lanza un error al importarse si falta `NEXT_PUBLIC_API_BASE_URL`.

Así `e2e/web-lib.spec.ts` (§20) los carga en Node. `lucide-react@1.52.0` publica un build CommonJS (`main: dist/cjs/lucide-react.js`).

- `status-labels.ts` (nuevo): recibe `TASK_STATUS_LABELS`, `taskStatusLabel` y `TASK_STATUSES` (hoy en `lib/tasks.ts`) y `PLAN_STATUS_LABELS` y `planStatusLabel` (hoy en `lib/plan.ts`), con tildes. `tasks.ts` y `plan.ts` los reexportan (`export { … } from './status-labels'`), así que ningún consumidor cambia.
- `request-state.ts` (ampliado). Es una extracción literal de lo que ya decide la UI; no añade reglas:
  ```ts
  export const PLANNABLE_STATES: readonly string[]; // ['COMPROMETIDA', 'EN_PLANIFICACION', 'EN_EJECUCION'] (hoy en plan-view.tsx)
  export function isTriageable(r: Pick<Request, 'operationalState'>): boolean;      // === 'REGISTRADA' (hoy canDecide)
  export function isPrioritizable(r: Pick<Request, 'operationalState' | 'currentTriageDecision'>): boolean;
  // currentTriageDecision === 'CONTINUAR' && operationalState ∈ {EN_TRIAGE, BACKLOG_PRIORIZADO} (hoy canEvaluate)
  export function isPlannable(r: Pick<Request, 'operationalState'>): boolean;       // PLANNABLE_STATES.includes(operationalState)
  ```
  Triage, Priorización y Planificación los usan en lugar de sus condiciones locales, y Solicitudes los usa en el menú «Ir a…» (§11.5). El backend sigue siendo la autoridad: responde 409 si no se cumplen.
- `plan-guide.ts` (nuevo; sustituye al `app/seguimiento/plan/plan-guide.ts` de la iteración 1):
  ```ts
  export type GuideActionKind = 'newPhase' | 'editPhase' | 'newTask' | 'editTask';
  export interface GuideItemPresentation {
    id: string;        // `${code}:${targetId ?? ''}`
    category: string;  // categoría de la API
    label: string;     // texto de §10.2; código desconocido o nombre ausente en los datos cargados → `message` de la API
    action: { kind: GuideActionKind; label: string; targetId: string | null } | null; // null si el código es desconocido
  }
  export const GUIDE_CATEGORY_LABELS: Record<string, string>; // datesPhases, tasksResponsibles, capacity, evidenceGates, frameworkControls (§10.2)
  export function guideCategoryLabel(category: string): string; // categoría desconocida → la clave
  export function presentGuidePending(
    p: PlanGuidePending,
    names: { phase: (id: string) => string | null; task: (id: string) => string | null },
  ): GuideItemPresentation;
  ```
  La vista traduce `action.kind` a la apertura de `PhaseDialog` o `TaskDialog` (§10.2).
- `task-filters.ts` (nuevo):
  ```ts
  export interface TaskFilters { q: string; status: string; phaseId: string; mineUserId: string | null } // 'ALL' = sin filtro
  export function matchesTaskFilters(t: Pick<Task, 'title' | 'status' | 'phaseId' | 'responsibleUserId'>, f: TaskFilters): boolean;
  // q: matchesSearch(t.title, q) (§7.6; como hoy, más insensible a tildes); mineUserId !== null → t.responsibleUserId === mineUserId
  ```
  Planificación pasa `mineUserId: mine ? permissions?.userId ?? null : null`, con el switch deshabilitado mientras `permissions` es `null` (corrige §19.13).

## 8. Shell y navegación

### 8.1 Estructura

`RouteGuard` conserva íntegra su lógica (dev‑header siempre monta shell; jwt: `/login` sin shell, redirección a `/login` o `/login?expired=1`, espera de permisos), con una sola corrección funcional en jwt, descrita en §8.7: esperar a hidratar la identidad antes de redirigir, conservar la ruta de origen en `next` y sacar de `/login` a quien ya tiene sesión. Aparte de eso, solo cambia lo que renderiza: `AppShell` sale a `app-shell.tsx`; `CenteredMessage` pasa a ser un estado de pantalla completa con `BrandMark`, `LoaderCircle` (`motion-reduce:animate-none`) y el texto ("Redirigiendo al inicio de sesión…", "Cargando tu sesión…", "Comprobando tu sesión…") dentro de `role="status"`; y en jwt `/login` se pinta dentro de `<main id="contenido" tabIndex={-1} className="focus:outline-none">`, sin shell (§11.2).

```tsx
// app-shell.tsx
<>
  <SkipLink />
  <div className="flex min-h-dvh bg-background">
    <AppSidebar variant="desktop" />            {/* hidden lg:flex */}
    <div className="flex min-w-0 flex-1 flex-col">
      <MobileNav />                              {/* lg:hidden */}
      <main id="contenido" tabIndex={-1} className="flex-1 px-4 py-5 md:px-6 md:py-6 xl:px-8 focus:outline-none">
        {children}
      </main>
    </div>
  </div>
</>
```

`layout.tsx`: `<html lang="es" className={inter.variable}>`; `metadata = { title: { default: 'Portal del área', template: '%s · Portal del área' }, description: 'Portal interno del área de Analítica.' }`; `<TooltipProvider delayDuration={300}>` envuelve `RouteGuard` dentro de `ActorProvider`; `<Toaster />` se mantiene al final de `body`. Cada `page.tsx` declara solo su título corto (tabla §11.1); el anunciador de rutas de Next lee el título del documento.

### 8.2 Comportamiento por ancho

| Ancho | Navegación | Detalle |
|---|---|---|
| ≥1280 px | Sidebar expandido 240 px (`w-60`) fijo (`sticky top-0 h-dvh`) | Preferencia `rail` del usuario lo reduce a 56 px |
| 1024–1279 px | Riel 56 px (`w-14`) por defecto | Solo iconos con tooltip; preferencia `expanded` lo abre a 240 px empujando el contenido |
| <1024 px | Barra superior `MobileNav` (56 px, `sticky top-0 z-30 border-b bg-background`) con botón "Abrir menú" y marca; el menú abre un `Sheet` izquierdo de 288 px | El cajón contiene el mismo sidebar (`variant="drawer"`, siempre expandido) y se cierra al elegir un enlace (`onNavigate`, §8.4; como respaldo, efecto sobre `pathname`), al pasar a ≥1024 px (`matchMedia('(min-width: 1024px)')`), con Escape o con clic fuera; el foco vuelve al botón |

### 8.3 Preferencia de riel

`use-sidebar-mode.ts`: `type SidebarPref = 'auto' | 'rail' | 'expanded'`. Estado inicial `'auto'` (SSR y primer render, sin desajuste de hidratación); en `useEffect` lee `localStorage.sidebarCollapsed` (`'true'` → `rail`, `'false'` → `expanded`, otro/ausente → `auto`; si `localStorage` lanza, queda `auto`). `isRail` efectivo = `pref === 'rail' || (pref === 'auto' && matchMedia('(min-width: 1024px) and (max-width: 1279.98px)').matches)`, con suscripción a `change`. `toggle()` escribe `'true'`/`'false'` según el estado efectivo opuesto. Mecanismo: todo lo que cambia entre riel y expandido lo resuelve CSS con `data-sidebar={pref}` y la variante `rail:` (§5.4): el ancho, los textos, el botón de riel, el selector dev o su avatar y los mensajes del menú. Cuando cambia el control o su nombre accesible, se renderizan los dos elementos y se alternan con `rail:hidden` (versión expandida) y `hidden rail:inline-flex` o `hidden rail:flex` (versión riel). `display: none` saca al oculto del árbol de accesibilidad y del orden de tabulación, así que el nombre accesible sigue al modo visible sin depender de JS ni de la hidratación (detalle en §8.4). `isRail` en JS solo decide si cada ítem del menú pasa su etiqueta a `LabelTooltip` (`label={isRail ? etiqueta : null}`). `LabelTooltip` envuelve siempre al enlace, para no remontarlo al cambiar de modo; sin contenido no se muestra nada. En el cajón, `AppSidebar` no usa el `isRail` del hook: `const mode = useSidebarMode(); const isRail = variant === 'drawer' ? false : mode.isRail;`. El cajón siempre está expandido, y sin esa línea, con la preferencia `rail` guardada, cada ítem del cajón tendría un tooltip con la etiqueta que ya se ve, también al tabular. No hay parpadeo solo con la preferencia `auto`: con `rail` o `expanded` guardados, el SSR y el primer render pintan el modo `auto` y el ancho se ajusta tras el efecto (una transición de 150 ms al cargar). Se acepta y no se añade un script inline en `<head>`. El hook devuelve `{ pref, isRail, toggle, setPref }`. `setPref(p)` persiste igual que `toggle()`: `'rail'` → `'true'`, `'expanded'` → `'false'` y `'auto'` borra la clave.

### 8.4 Anatomía del sidebar (`app-sidebar.tsx`)

`<aside id="app-sidebar" aria-label="Menú lateral" data-sidebar={pref} className="hidden lg:flex sticky top-0 h-dvh w-60 rail:w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-150">` (en `drawer` la raíz es un `div` sin `id` ni landmark, porque ya está dentro del diálogo del cajón: `flex h-full w-full`, `data-sidebar="expanded"`). Props: `interface AppSidebarProps { variant: 'desktop' | 'drawer'; onNavigate?: () => void }`. `onNavigate` se llama en el `onClick` de cada enlace del menú y de la marca.

1. Cabecera (h-14, `px-3`; en `drawer`, además `pr-12`, que reserva el botón cerrar del cajón, §6 `sheet.tsx`): `Link` a `/inicio` con `BrandMark` + `BrandName` (`rail:sr-only` en el nombre, que sigue dando nombre al enlace; en riel la marca se centra).
2. Navegación: `<nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-2 py-3">` con lista de grupos. Etiqueta de grupo: `<span id="nav-g-{id}" className="px-2.5 text-xs font-medium text-sidebar-muted-foreground rail:sr-only">` y `<ul aria-labelledby="nav-g-{id}" className="mt-1 flex flex-col gap-0.5">`; separación entre grupos 16 px (en riel, un separador de 1 px). El primer grupo no tiene etiqueta. No se usan encabezados (`h2`) en el menú.
3. Ítem: `Link` `relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm pointer-coarse:min-h-10 hover:bg-sidebar-accent/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring rail:justify-center rail:px-0`; icono 16 px `text-sidebar-muted-foreground`; etiqueta `truncate rail:sr-only`; badge opcional (`ml-auto rounded-sm border border-sidebar-border px-1.5 text-xs text-sidebar-muted-foreground rail:sr-only`: en riel sigue dentro del nombre accesible del enlace, que en los dos modos es «Proyectos Próximamente»; el tooltip no lo aporta, porque no describe el enlace). Activo: `aria-current="page"`, `bg-sidebar-accent text-sidebar-accent-foreground font-medium`, icono `text-sidebar-accent-foreground` y barra izquierda de 3 px `bg-primary` (`before:` absoluto, `rounded-full`), que da una pista de forma además del color. Cada ítem va siempre dentro de `LabelTooltip side="right"`, con `label` igual a la etiqueta (más " · Próximamente" si aplica) cuando `isRail`, y `null` en otro caso (§8.3). El tooltip no describe el enlace (§6 `tooltip.tsx`): su nombre ya es la etiqueta, `sr-only` en riel.
4. Pie (`border-t border-sidebar-border p-2 flex flex-col gap-1`):
   - Botón de riel: dos botones alternados por CSS (§8.3), los dos con `onClick={toggle}`:
     ```tsx
     <Button variant="ghost" size="sm" className="w-full justify-start rail:hidden" onClick={toggle}>
       <PanelLeftClose aria-hidden="true" />Contraer menú
     </Button>
     <LabelTooltip label="Expandir menú" side="right">
       <Button variant="ghost" size="icon-sm" className="hidden rail:inline-flex" aria-label="Expandir menú"
         onClick={toggle}>
         <PanelLeftOpen aria-hidden="true" />
       </Button>
     </LabelTooltip>
     ```
     Solo el visible está en el árbol de accesibilidad, así que el nombre es "Contraer menú" (texto visible) o "Expandir menú" según el modo que se ve, también antes de hidratar. No llevan `aria-expanded` ni `aria-controls`, para que el estado no se anuncie dos veces y el nombre visible coincida con el accesible (WCAG 2.5.3). No se renderizan en `drawer`. El `onClick` de los dos llama a `toggle()` y, en el siguiente `requestAnimationFrame`, enfoca el de los dos que quedó visible (por `ref`, el que tenga `offsetParent !== null`). Sin eso, quien lo activa con teclado perdería el foco, porque el botón pulsado pasa a `display: none`.
   - Cuenta en `jwt`: `div[role=group][aria-label="Usuario autenticado"]`.
     - Avatar de iniciales (`size-7 rounded-full bg-primary-subtle text-primary text-xs font-semibold`, `aria-hidden`; en riel lleva `title={nombre}`, una ayuda solo para ratón).
     - Nombre (`authUser.name` o "Usuario", `text-sm font-medium truncate`) e identificador (`text-xs text-sidebar-muted-foreground truncate`), los dos con `rail:sr-only`: en riel siguen en el árbol de accesibilidad.
     - "Cerrar sesión", dos botones alternados con `LogOut` → `logout(); router.replace('/login')` (igual que hoy): `Button variant="ghost" size="sm" className="w-full justify-start rail:hidden"` con el texto, y `Button variant="ghost" size="icon-sm" className="hidden rail:inline-flex" aria-label="Cerrar sesión"` dentro de `LabelTooltip label="Cerrar sesión" side="right"`. Siempre hay un único botón «Cerrar sesión» accesible.
   - Selector en `dev-header`:
     - Expandido (envoltorio `rail:hidden`): `Label htmlFor={actorSelectId}` "Usuario actual (dev)" (`text-xs`) + `Select` con `SelectTrigger id={actorSelectId} className="h-8"`, sin `aria-label`: el nombre accesible sale del `Label` y coincide con el texto visible «Usuario actual (dev)» (WCAG 2.5.3; hoy lleva `aria-label="Usuario actual"`, que sustituye a la etiqueta, y ningún spec lo usa), opciones de `GET /dev/actors` (nombre; valor = identifier) y persistencia en `localStorage.actorId` vía `setActorId` (sin cambios). Estados: `Skeleton h-8` cargando; error `role="alert"` "No fue posible cargar los usuarios.".
     - Riel (`hidden rail:inline-flex`): botón avatar (`size-8 rounded-full`, iniciales del actor seleccionado o `?`) con `aria-label="Usuario actual (dev): {nombre}. Expandir el menú para cambiarlo"`, dentro de `LabelTooltip label={nombre} side="right"`.
     - Al pulsar el avatar: marca `focusActorSelectRef.current = true` y llama a `setPref('expanded')`, que persiste en `localStorage` con el mismo setter que el botón de riel. Un efecto sobre `pref` enfoca `#{actorSelectId}` cuando `pref === 'expanded'` y la marca está activa, y después la limpia. El foco llega cuando el selector ya es visible.
     - En `jwt` no se llama a `/dev/actors` (igual que hoy).
5. Estados del menú (mismas condiciones que hoy): sin actor → dev "Elige un usuario en «Usuario actual (dev)», al final de este menú, para ver tus módulos." / jwt "Cargando tu sesión…"; cargando → 6 `Skeleton h-8` + sr‑only `role="status"` "Cargando menú…"; error → "No fue posible cargar tus permisos." (`role="alert"`) + `Button variant="outline" size="sm"` "Reintentar" que llama a `reload()` del contexto (nuevo, usa la función existente); sin módulos → "No tienes módulos habilitados. Pide acceso al jefe de área.". En riel:
   - El texto del mensaje lleva `rail:sr-only` y no `rail:hidden`. Sigue en el árbol de accesibilidad, así que `role="alert"` y `role="status"` se siguen anunciando.
   - "Reintentar" lleva `rail:hidden`.
   - Se añade un `Button variant="ghost" size="icon-sm" className="hidden rail:inline-flex"` con `Info` y `aria-label="Expandir el menú para ver el aviso"`, dentro de `LabelTooltip label={mensaje}`. Como todo `LabelTooltip`, no describe el botón: el mensaje ya está en el árbol de accesibilidad gracias a `rail:sr-only`. Al pulsarlo llama a `setPref('expanded')` y, en el siguiente `requestAnimationFrame`, enfoca el contenedor del aviso (`tabIndex={-1}`, ya visible), para que el foco no quede en el botón oculto.

Regla de ids. Las dos variantes pueden coexistir en el DOM, porque el sidebar de escritorio sigue montado (`hidden lg:flex`) mientras el cajón está abierto. Por eso, dentro de `AppSidebar` ningún `id` es fijo sin el prefijo de variante:

```tsx
const isDrawer = variant === 'drawer';
const asideId = isDrawer ? undefined : 'app-sidebar';                    // solo existe en escritorio
const actorSelectId = isDrawer ? 'drawer-actor-select' : 'actor-select'; // #actor-select se conserva en escritorio
const groupLabelId = (g: string) => `${isDrawer ? 'drawer-' : ''}nav-g-${g}`;
```

El `Label htmlFor` del selector dev usa `actorSelectId`, y los `aria-labelledby` de los grupos usan `groupLabelId`. El cajón vuelve a pedir `GET /dev/actors` cada vez que se abre (solo en dev-header; la llamada es idempotente). Se acepta y se documenta con un comentario en el código.

`mobile-nav.tsx`: `<header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 lg:hidden">` + `Sheet` controlado: trigger `Button variant="ghost" size="icon" aria-label="Abrir menú"` (`Menu`; `aria-expanded` lo gestiona Radix; sin tooltip, porque el foco vuelve a él al cerrar el cajón, §14) + `BrandMark` + "Portal del área". `SheetContent side="left"` con `SheetTitle className="sr-only"` "Menú principal" y `<AppSidebar variant="drawer" onNavigate={() => setOpen(false)} />`. También cierra el cajón cuando `matchMedia('(min-width: 1024px)')` pasa a coincidir, porque el contenido del `Sheet` vive en un portal y `lg:hidden` no lo oculta.

### 8.5 Arquitectura de información (ninguna URL cambia)

`src/lib/navigation.ts` (reescrito; `ModuleKey` se conserva idéntico a `MODULE_MATRIX`):
```ts
export interface NavItem { href: string; label: string; moduleKey: ModuleKey; icon: LucideIcon; activeFor?: string[]; badge?: string }
export interface NavGroup { id: string; label: string | null; items: NavItem[] }
export const NAV_GROUPS: NavGroup[];
export const MODULE_LABELS: Record<ModuleKey, string>;
export const MODULE_ORDER: readonly ModuleKey[]; // 21 claves, sin repetidos
export function getVisibleNavGroups(allowed: ReadonlySet<string>): NavGroup[]; // filtra ítems por allowedModules y quita grupos vacíos
export function isNavItemActive(item: NavItem, pathname: string): boolean;   // href o activeFor: igualdad o prefijo `${p}/`
```

| Grupo | Ítem (antes → después) | Ruta | `moduleKey` | Icono lucide |
|---|---|---|---|---|
| (sin título) | Control del área → **Panel del área** | `/inicio` | dashboard | `LayoutDashboard` |
| | Mi trabajo (activo también en `/seguimiento/tareas`) | `/mi-trabajo` | assigned | `ListTodo` |
| Demanda | Solicitudes | `/demanda/solicitudes` | requests | `Inbox` |
| | Triage | `/demanda/triage` | triage | `ListFilter` |
| | Priorizacion → **Priorización** | `/demanda/priorizacion` | priority | `ChartColumn` |
| | Revision (Administración) → **Aprobaciones** | `/administracion/revision` | review | `BadgeCheck` |
| Ejecución | Plan → **Planificación** | `/seguimiento/plan` | plan | `ChartGantt` |
| | Capacidad (desde Activos) | `/activos/capacidad` | capacity | `Gauge` |
| | Portafolio | `/seguimiento/portafolio` | portfolio | `FolderKanban` |
| | Resumen de demanda (Demanda) → **Indicadores** | `/demanda/resumen` | demandOverview | `ChartLine` |
| | Proyectos, con badge "Próximamente" | `/seguimiento/proyectos` | project | `FolderOpen` |
| Seguimiento | Bitacora → **Bitácora** | `/seguimiento/bitacora` | log | `NotebookPen` |
| | Semanal → **Reporte semanal** | `/seguimiento/semanal` | log | `CalendarDays` |
| | Novedades | `/seguimiento/novedades` | log | `TriangleAlert` |
| | Reuniones | `/seguimiento/reuniones` | meeting | `Users` |
| | Compromisos | `/seguimiento/compromisos` | meeting | `Handshake` |
| Activos y conocimiento | Activos | `/activos/catalogo` | asset | `Database` |
| | Documentos | `/activos/documentos` | docs | `FileText` |
| Gobierno | Frameworks (Administración) → **Controles** | `/administracion/frameworks` | frameworks | `ShieldCheck` |
| | Auditoria → **Auditoría** | `/gobierno/auditoria` | audit | `ScrollText` |
| | Mis permisos | `/gobierno/mis-permisos` | permissions | `KeyRound` |
| Administración | Equipo y permisos (desde Gobierno) | `/gobierno/equipo` | team | `UserCog` |
| | Configuracion / maestras → **Maestras** (activo también en `/catalogs`) | `/administracion/maestras` | admin | `ListTree` |

Decisiones: (1) Orden por flujo y frecuencia: entrada personal → demanda (registro, triage, priorización, aprobación) → ejecución (plan, capacidad, portafolio, indicadores) → seguimiento diario → conocimiento → gobierno → administración. (2) "Tareas" (`/seguimiento/tareas`) deja de ser ítem del menú porque es una página de detalle sin listado: se llega desde Mi trabajo y Planificación (botones "Abrir"); la ruta, su gating por backend y su estado vacío se conservan, y "Mi trabajo" queda marcado como activo en ella. (3) `/catalogs` sigue fuera del menú, operativo, y marca "Maestras". (4) Proyectos se mantiene con badge "Próximamente" para no esconder un módulo con permiso real. (5) Aprobaciones agrupa la aprobación de compromisos y la autorización de planes, ambas del flujo; Controles queda en Gobierno.

`MODULE_LABELS` (para Mis permisos; elimina la derivación desde el menú que duplicaba claves): dashboard "Panel del área", assigned "Mi trabajo", task "Detalle de tareas", requests "Solicitudes", triage "Triage", priority "Priorización", review "Aprobaciones", plan "Planificación", capacity "Capacidad", portfolio "Portafolio", demandOverview "Indicadores", project "Proyectos", log "Bitácora, reporte semanal y novedades", meeting "Reuniones y compromisos", asset "Activos", docs "Documentos", frameworks "Controles de gobierno", audit "Auditoría", permissions "Mis permisos", team "Equipo y permisos", admin "Maestras". `MODULE_ORDER` sigue ese mismo orden.

### 8.6 Ruta inexistente y errores de ejecución

No se crean URLs nuevas: `/` sigue redirigiendo y `/catalogs` sigue respondiendo 200. Comportamiento de Next 16.4, según su documentación en `node_modules/next/dist/docs`:

- El `app/not-found.tsx` raíz atiende cualquier URL sin ruta y conserva el estado 404.
- `app/error.tsx` envuelve los segmentos que hay bajo el layout raíz. Como `RouteGuard` vive en el layout, se pinta dentro del shell.
- `app/global-error.tsx` sustituye al layout raíz cuando el que falla es el propio layout.

Archivos:

- `app/not-found.tsx` (componente de servidor):
  - `export const metadata: Metadata = { title: 'Página no encontrada' }`.
  - `PageLayout` > `PageHeader title="Página no encontrada"` > `EmptyState` con icono `Compass`, título "Esta dirección no existe o cambió.", descripción "Revisa el enlace o vuelve al inicio del portal." y acción `<Link href="/inicio" className={buttonVariants({ variant: 'outline' })}>Ir al Panel del área</Link>`.
  - En jwt sin sesión, `RouteGuard` redirige a `/login` como en cualquier ruta protegida (§8.7).
- `app/error.tsx` (`'use client'`):
  - `export default function RouteError(props: { error: Error & { digest?: string }; retry: () => void })`. No se llama `Error` para no ocultar el global.
  - `PageLayout` > `PageHeader title="No fue posible mostrar esta pantalla"` > `ErrorState title="Ocurrió un error inesperado." message="Inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal." onRetry={props.retry}`.
  - Usa `retry` y no `reset`: `retry` es estable desde Next 16.3 y vuelve a pedir y a pintar el segmento.
  - No muestra `error.message` (en producción es genérico) ni hace `console.error` (§16).
- `app/global-error.tsx` (`'use client'`, nuevo): completa el requisito de que todo texto visible esté en español.
  - Define `<html lang="es"><body>` propios e importa `./globals.css`.
  - Usa `<title>Error · Portal del área</title>`, porque este archivo no admite `metadata`.
  - Bloque centrado con `BrandMark`, "No fue posible cargar el portal.", "Recarga la página. Si el problema continúa, contacta al administrador del portal." y `Button` "Reintentar", que llama a `retry()`.

### 8.7 Defecto funcional a corregir en el shell

Origen: lo detectó otro agente al tomar capturas en modo jwt y lo transmitió el orquestador. Es un defecto del login ya integrado, no una decisión de diseño. Afecta a la autenticación, así que su verificación (§20) es obligatoria.

Síntoma: con una sesión válida, recargar una ruta protegida (F5 en `/inicio`) lleva a `/login`, y en `/login` aparece el formulario aunque la sesión siga vigente.

Causa probable (leída en el código; se confirma al reproducir). React ejecuta los efectos de los hijos antes que los del padre, y `RouteGuard` es hijo de `ActorProvider` en `layout.tsx`. En el primer montaje, el efecto de `RouteGuard` ve `isAuthenticated === false`, porque `actorId` arranca en `null`: `ActorProvider` todavía no ha leído `authToken` ni `authUser` de `localStorage`, y lo hace en su propio efecto, que corre después. Cuando la identidad se hidrata, el `router.replace('/login')` ya está en curso. Y en `/login` el guard renderiza siempre el formulario.

Cambio. Toca solo `lib/actor-context.tsx`, `components/route-guard.tsx`, `app/login/login-form.tsx` y un módulo puro nuevo. El modo dev-header no cambia.

1. Reproducir primero en el worktree: modo jwt, iniciar sesión, ir a `/inicio` y hacer `page.reload()`. Hoy se termina en `/login`. Queda automatizado en `e2e/jwt-session.spec.ts` (§20): el caso 1 debe fallar antes del arreglo y todos deben pasar después. En este paso el spec solo usa selectores que ya existen en el baseline (ids del formulario, «Ingresar», `main` + `h1`, `role="status"` con /expir/i, /Cerrar sesi[oó]n/), y comprueba el contenido antes que la URL.
2. `ActorProvider` expone dos campos nuevos.
   - `identityReady: boolean`. Vale `false` en el SSR y en el primer render. Pasa a `true` en el mismo efecto de montaje que lee `localStorage`, en todas sus ramas: token con usuario, token sin usuario legible (centinela `__jwt__`), sin token y dev-header. React agrupa las actualizaciones del efecto, así que el render siguiente trae `actorId` e `identityReady` a la vez. Si `localStorage` lanza un error, se trata como «sin sesión» (`actorId = null`, `identityReady = true`).
   - `signedOut: boolean`. Pasa a `true` en `logout()` y a `false` en `login()`. Sirve para no añadir `next` tras un cierre de sesión explícito.
3. `RouteGuard` en jwt:
   - Mientras `!identityReady`, en cualquier ruta (también `/login`): pinta el estado de carga de pantalla completa (§8.1: `BrandMark`, `LoaderCircle` y "Cargando tu sesión…" con `role="status"`) y no redirige.
   - Ruta protegida sin sesión: pinta "Redirigiendo al inicio de sesión…" y llama a `router.replace` hacia `/login` con estos parámetros:
     - `next` con la ruta actual (`pathname + window.location.search`), salvo que sea `/inicio`, que ya es el destino por defecto.
     - `expired=1` si `sessionExpired`, como hoy.
     - Sin `next` si `signedOut`, porque otro usuario no debe aterrizar en la ruta del anterior.
   - `/login` con sesión guardada (`identityReady && isAuthenticated`): con `state === 'none'` o `state === 'loading'` pinta "Comprobando tu sesión…" (`role="status"`, misma pantalla de §8.1) en lugar del formulario. La sesión solo es válida cuando el backend la acepta. `'none'` se incluye a propósito: entre el render que hidrata la identidad y el efecto que pone `'loading'` hay un render con `'none'`, y sin él el formulario parpadearía. Es la misma condición que el guard ya usa en las rutas protegidas.
     - Si la carga termina en `state === 'success'`, pinta "Redirigiendo…" y llama a `router.replace(postLoginPath(new URLSearchParams(window.location.search)))`.
     - Si termina en 401, la lógica actual limpia la sesión y marca `sessionExpired`, y el guard deja ver el formulario.
     - Si falla por otro motivo (`state === 'error'`), también se deja ver el formulario, sin redirigir.
     - `LoginForm` muestra el aviso de sesión expirada si `?expired=1` o si `sessionExpired` es `true`. Así no hay bucle `/login` → `/inicio` → `/login`.
   - Con sesión y permisos cargando: igual que hoy, "Cargando tu sesión…".
   - `window.location.search` se lee dentro del efecto. Así el layout no usa `useSearchParams`, que obligaría a envolver toda la app en un `Suspense`.
4. `LoginForm`, tras `login(token, user)`: llama a `router.replace(postLoginPath(searchParams))` en lugar de `router.replace('/inicio')`. El guard hace lo mismo al ver la sesión en `/login`. Las dos llamadas van al mismo destino, así que la duplicidad es inocua. El resto del formulario no cambia: campos deshabilitados durante el envío, errores, 401 genérico.
5. `src/lib/safe-redirect.ts` (puro, §7.9.2):
   ```ts
   export function safeInternalPath(raw: string | null | undefined): string | null;
   // Devuelve null si el valor está vacío, supera 2048 caracteres, no empieza por '/', empieza por '//' o '/\',
   // contiene caracteres de control, cambia de origen al resolverlo con new URL(raw, 'http://portal.invalid')
   // o su pathname es '/login'. Si es válido, devuelve pathname + search + hash del URL normalizado.
   export function postLoginPath(params: { get(name: string): string | null }): string;
   // safeInternalPath(params.get('next')) ?? '/inicio'
   ```
   Solo se navega a rutas internas con `router.replace`; nunca a URLs externas ni a `javascript:`. Un `next` inválido se ignora sin mostrar error.
6. dev-header: sin cambios. El guard sigue siendo passthrough y no consulta `identityReady` ni `signedOut`; `/login` sigue dentro del shell y no se añade `next`.

Regresiones obligatorias en jwt (automatizadas en `e2e/jwt-session.spec.ts` y repetidas en la QA manual, §20):

- (a) Recargar una ruta protegida mantiene la sesión y la ruta.
- (b) Un enlace directo sin sesión va a `/login?next=…` y, tras iniciar sesión, vuelve a esa ruta.
- (c) `/login` con sesión válida lleva a `/inicio`, o a `next` si es válido.
- (d) `?expired=1` sigue mostrando el aviso de sesión expirada.
- (e) Un `next` externo (`https://…`, `//…`, `/\…`) se ignora y lleva a `/inicio`.
- (f) Cerrar sesión lleva a `/login` sin `next`, y una recarga posterior no recupera la sesión.

En dev-header, la suite actual y `shell-navigation.spec.ts` pasan sin cambios.

## 9. Patrones de página

Cada vista se compone con `PageLayout` > `PageHeader` > (barra de contexto o toolbar) > contenido. Sin tarjetas decorativas: contenedores con borde solo donde agrupan datos (tabla, lista, panel de detalle, formulario).

**A. Listado** (Solicitudes, Mi trabajo, Portafolio, Activos, Documentos, Maestras, Auditoría, Aprobaciones, Equipo). Estructura:

1. `PageHeader` con la acción principal.
2. `Toolbar` con búsqueda y filtros; a la derecha (`end`), `ResultCount` ("45 solicitudes" / "12 de 45 solicitudes") y "Limpiar filtros" (`ghost sm`) cuando hay alguno activo. Es la única ubicación de "Limpiar filtros" en la página (§7.2). Restablece la búsqueda a vacío y cada filtro a su centinela ("Todos"/"Todas"). La llevan Solicitudes, Mi trabajo, Activos, Documentos, Auditoría y Portafolio; en Portafolio, restablecer sus tres filtros de servidor dispara la misma recarga que elegirlos a mano. Maestras no la lleva: sus filtros se aplican con "Aplicar" y su E2E espera el estado vacío también con filtros (§11.22).
3. `PriorityLegend` si la tabla muestra bandas.
4. `DataView` con `Table` (con `scrollLabel`) a todo el ancho y, al pie, `DataTablePagination`.

Reglas:

- Encabezados de 1–2 palabras; los ordenables usan `SortableTableHead`.
- La primera columna es el identificador legible con `CellTitle`: dos líneas como máximo y `title` con el texto completo.
- Si la fila se abre en una ficha o en un detalle, el título es esa acción: en Solicitudes abre la ficha, y en Mi trabajo y en las tareas del plan abre el detalle de la tarea. Así no se repite un botón "Editar" o "Abrir" en cada fila.
- En Activos, Documentos, Maestras y Equipo el título es texto y las acciones siguen inline (hasta 2), porque además de editar tienen transiciones de estado. Maestras, además, por su E2E.
- Las acciones secundarias van en `RowActions`: 2 inline como máximo, o solo el menú "Más acciones" cuando la acción principal ya está en el título.
- Estados y bandas siempre con `StatusBadge` y `PriorityBadge variant="compact"`: una línea por celda, sin glosas repetidas.
- Vacío y sin resultados son distintos: el primero explica qué es la lista y ofrece la acción; el segundo dice "Ningún resultado coincide con los filtros." + "Cambia o limpia los filtros para ver más resultados." y deja "Limpiar filtros" en el toolbar, sin repetirlo.
- Búsqueda, filtros, orden y paginación son de presentación, en cliente (`useClientTable`, §7.6), salvo donde hoy ya filtra el servidor (Portafolio, Maestras), que se conserva. No se añaden parámetros a la API.

Capacidades por listado (ids nuevos entre paréntesis; los existentes se conservan):

| Vista | Búsqueda | Filtros | Orden (por defecto en negrita) | Paginación |
|---|---|---|---|---|
| Solicitudes | Título (`sol-buscar`) | Estado (`sol-filtro-estado`), Proceso (`sol-filtro-proceso`), Prioridad (`sol-filtro-banda`: P1–P4 y Sin priorizar, con `parseBand(priorityLabel)`); en cliente | Título, Estado (orden del flujo), Prioridad (score), **Registro descendente** | 25 |
| Mi trabajo | Tarea (`mt-buscar`) | Estado (`mt-filtro-estado`) | Tarea, Estado, **Vence ascendente** (sin fecha al final) | 25 |
| Portafolio | Título (`portafolio-buscar`, en cliente) | Proceso, Estado y Banda en servidor, como hoy | Título, Estado, Banda (P1→P4, sin priorizar al final), Registro, Objetivo; **orden de la API** | 25 |
| Activos | Nombre (`filtro-busqueda`) | Proceso, Solicitud y Estado en cliente, como hoy | **Nombre**, Proceso, Estado | 25 |
| Documentos | Título (`doc-filtro-busqueda`, existente) | Los cuatro existentes | **Título**, Activo, Versión, Estado | 25 |
| Auditoría | — | Objeto (`aud-filtro-objeto`), Acción (`aud-filtro-accion`); en cliente | **Fecha descendente**, Acción, Objeto | 25 |
| Maestras | — | Catálogo y Estado en servidor con "Aplicar", como hoy | Catálogo, Código, Etiqueta, Orden; **orden de la API** | 25 |
| Planificación · Tareas | `task-q` (existente) | `task-status`, `task-phase`, "Solo mis tareas" | Inicio, Vence, Estado; **orden de la API** | No (un plan) |
| Capacidad · Resumen de carga | — | — | Persona, Utilización, Utilización plan; **orden de la API** | No (una fila por persona) |
| Aprobaciones, Equipo, Disponibilidad, Asignaciones | — | — | Orden de la API | No |

Con el dataset de prueba (~45 solicitudes) la tabla de Solicitudes queda en dos páginas de filas de 40 px, en lugar de una lista de ~2.500 px de alto con filas de 50–85 px.

**B. Maestro‑detalle** (Bitácora, Reporte semanal, Novedades, Reuniones, Compromisos). `PageHeader` con "Nuevo …" → `MasterDetail`. El panel de detalle es una `Card` con: cabecera (título `h2` + `StatusBadge` + metadatos `text-meta`), acciones del registro a la derecha (una sola principal), cuerpo con `DescriptionList` y subsecciones (`h3`). Las acciones de cambio de estado van en un grupo rotulado "Cambiar estado a:" con un botón `outline sm` por destino (`nextStates`, sin cambios).

**C. Mesa de trabajo por solicitud** (Triage, Priorización, Planificación, Controles de gobierno). `PageHeader` → `RequestContextBar` (selector agrupado + resumen + acción contextual) → contenido de la solicitud elegida. En Triage y Priorización: `xl:grid xl:grid-cols-[minmax(0,45rem)_minmax(18rem,1fr)] gap-6` con el formulario (o el `RequirementsPanel` de bloqueo) a la izquierda y `RequestFacts` en un panel "Ficha de la solicitud" a la derecha (debajo en <1280 px). Sin selección: `EmptyState` "Elige una solicitud para empezar." Lista vacía: `EmptyState` del caso.

**D. Detalle** (Tareas, Mis permisos). `PageHeader` con migas, `h1` = nombre del objeto y `meta` con estado. `lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-6`: principal (secciones) y lateral (datos y acciones secundarias).

**E. Formulario**. Altas y ediciones en `Dialog` (tamaños: `sm` usuario, asignar rol, motivo, disponibilidad, diario, semanal, fase, confirmación, elemento de maestra; `md` asignación, compromiso, reunión, novedad, actividad, activo, tarea, validación; `lg` solicitud; `xl` editor de documento, historial, ver cambio). Formularios de página (Triage, Priorización, secciones del semanal) en columna de 720 px. Estructura: `RequiredHint` → grupos con subtítulo `h3` `text-sm font-semibold` cuando hay más de 6 campos → `FormError` (errores del backend) → pie con Cancelar (outline) + acción principal. Dos columnas (`sm:grid-cols-2`) solo para pares cortos relacionados (fechas, selects de catálogo).

**F. Panel** (Panel del área, Indicadores, Capacidad). Pocos indicadores clave arriba (`StatStrip`, 2–4 valores) y luego tablas/listas por sección. Sin mosaicos de tarjetas.

Reglas de errores en formularios (todas las pantallas): validación al enviar, no mientras se escribe; se evalúan todas las reglas y se muestran todos los errores a la vez (hoy casi todos los formularios se detienen en la primera regla que falla; cambia la presentación, no el conjunto de reglas); cada regla de un solo campo se muestra bajo su campo (`Field error`), se marca `aria-invalid` y se enfoca el primer campo inválido; las reglas que combinan campos y los errores del backend van en `FormError` (`role="alert"`) y se conserva el toast existente; el error de un campo se limpia al editarlo; los valores se conservan ante cualquier fallo (AC‑031, sin cambios). Los mensajes y las reglas de validación cliente son exactamente los del inventario (con ortografía corregida). Detalle:

1. Cada diálogo o formulario expresa su validación como una función pura local: `validate(values): { fieldErrors: Partial<Record<Campo, string>>; formError: string | null }`.
2. Foco: al primer campo con error, en orden del DOM. Si solo falla una regla combinada, al primer campo implicado.
3. Los campos implicados en una regla combinada (p. ej. "Catálogo y código son obligatorios.") llevan `aria-invalid`, y su `aria-describedby` incluye el id del `FormError`.
4. Los errores del backend no marcan campos, porque no se sabe cuál falló. Van en `FormError` y se conserva el toast.

## 10. Patrón de bloqueos y acciones no disponibles

### 10.1 `RequirementsPanel`

Junto a la acción bloqueada (encima o en el mismo bloque, nunca en otra parte de la página). Anatomía:

- Contenedor `rounded-lg border bg-card` (con pendientes: `border-warning-border`), `headingLevel` configurable.
- Cabecera, con `id="{id}-summary"` en el elemento que contiene solo el título y el contador: icono (`Lock` en `text-warning` si hay pendientes; `CircleCheck` en `text-success` si no), título (`text-sm font-semibold`) que dice qué está bloqueado ("Aún no puedes enviar el plan a autorización") y contador con `Badge warning` `formatCount(n, { one: 'pendiente', other: 'pendientes' })` ("1 pendiente", "3 pendientes") o `Badge success` "Todo listo". Debajo, fuera del `-summary`, la descripción `text-meta text-muted-foreground` con cómo se resuelve en general.
- Lista `ul.divide-y` (agrupada con subtítulos `text-xs font-medium text-muted-foreground` si hay `groups`). Cada ítem: icono de estado (`CircleDashed` `text-warning` / `CircleCheck` `text-success`) + texto sr‑only "Pendiente:" / "Cumplido:"; etiqueta `text-sm`; `detail` y "Responsable: {owner}" en `text-meta text-muted-foreground`; acción a la derecha: `Button variant="ghost" size="sm"`, o `Link` con `buttonVariants` si tiene `href`. Una acción no disponible (`disabled` + `disabledReason`) es siempre `Button unavailable` dentro de `DisabledHint`, sin enlace (§7.4).
- Pie (`border-t px-4 py-3`): la acción bloqueada (`Button unavailable` mientras haya pendientes, §10.3) y su `DisabledReason`, una frase con qué hacer. El botón lleva `aria-describedby="{id}-summary {id del motivo}"`: al enfocarlo se lee qué está bloqueado, cuántos pendientes hay y qué hacer, sin recorrer la lista entera con sus acciones.
- Con `liveUpdates`, la región viva (`aria-live="polite"`) es el mismo `{id}-summary`: se anuncia el cambio de título o de contador, no la lista.
- Excepción de ubicación: en el panel `compact` de GC4, la acción no va en el pie sino en la fila de acciones del control, inmediatamente debajo del panel, con el mismo `aria-describedby`. Esa fila solo existe para quien revisa; para el resto, el panel se pinta sin acción bloqueada ni `DisabledReason` (§10.2, §11.18).
- Sin pendientes: título `doneTitle ?? title`, descripción `doneDescription ?? description`, icono `CircleCheck`, badge «Todo listo» y la acción habilitada. Con pendientes se pintan siempre `title` y `description`.
- La UI no evalúa reglas nuevas: los ítems vienen de la guía del plan, de los gates/validaciones o, en Triage/Priorización/Tareas, de los mismos predicados que hoy ya deciden mostrar el candado (se extraen a una función única por vista y se reutilizan para el gating y para el panel).

### 10.2 Bloqueos por pantalla

| Pantalla | Acción bloqueada | Fuente de los ítems | Ítems y acciones de resolución |
|---|---|---|---|
| Planificación | "Enviar a autorización" | `GET /requests/:id/plan/guide` (`pendings`, `canSubmit`, `futureCategories`) | Agrupado por categoría (`datesPhases` "Fases y fechas", `tasksResponsibles` "Tareas y responsables"; futuras `capacity` "Capacidad", `evidenceGates` "Evidencias de controles", `frameworkControls` "Controles del marco"). Texto por código con ortografía (fallback al `message` de la API para códigos desconocidos): `NO_PHASES` "El plan necesita al menos una fase." → "Nueva fase"; `PHASE_MISSING_DATES` "La fase «{fase}» necesita fecha de inicio y de fin." → "Editar fase"; `PHASE_DATES_INVERTED` "La fase «{fase}» empieza después de terminar." → "Editar fase"; `NO_TASKS` "El plan necesita al menos una tarea." → "Agregar tarea" (abre `TaskDialog` en la fase inicial; sin fases: deshabilitada, "Primero crea una fase."); `TASK_MISSING_RESPONSIBLE` "La tarea «{tarea}» necesita un responsable." → "Editar tarea"; `TASK_MISSING_DATES` "La tarea «{tarea}» necesita fecha de inicio y de fin." → "Editar tarea"; `TASK_DATES_INVERTED` "La tarea «{tarea}» empieza después de terminar." → "Editar tarea"; `MILESTONE_WITH_HOURS` "El hito «{tarea}» debe tener 0 horas de esfuerzo." → "Editar tarea". Nombres desde `targetId` (fases/tareas cargadas). Acciones solo si `canEdit`. Mapa puro en `lib/plan-guide.ts` (§7.9.2), con pruebas en `e2e/web-lib.spec.ts`. La guía solo se muestra con `canEdit` (§11.9): en un plan autorizado, la captura con datos reales muestra hoy "Listo para enviar", que induce a error. Pie: "Enviar a autorización" `unavailable` mientras `canSubmit` sea `false`, con `DisabledReason` "Resuelve los pendientes de la lista para enviar el plan." y `aria-describedby="plan-guide-summary {id del motivo}"`. Con `canSubmit`, el título pasa a `doneTitle` "El plan está listo para enviar" y el botón se habilita. |
| Triage | Formulario de triage | `isTriageable` (hoy `operationalState === 'REGISTRADA'`) y `currentTriageDecision` | Dos variantes según los datos de la solicitud. (a) Ya tiene triage (`currentTriageDecision` no es `null`). Su único ítem está cumplido, así que el panel se pinta sin pendientes (§10.1) y su texto va en `doneTitle` "El triage de esta solicitud ya está registrado" y `doneDescription` "El triage se registra una sola vez, cuando la solicitud está Registrada."; `title`, que es obligatorio, recibe el mismo texto que `doneTitle` y no llega a pintarse. Ítem cumplido "Triage registrado" con detalle "Decisión: {StatusBadge triage} · Estado actual: {StatusBadge request}"; acción del ítem "Ir a priorización" → `/demanda/priorizacion?requestId=…` solo si `isPrioritizable(request)` y `priority` está permitido. Es lo que se ve justo después de guardar un triage. (b) Sin triage y en otro estado: título "No puedes registrar el triage de esta solicitud"; ítem pendiente "La solicitud debe estar en estado Registrada" con detalle "Estado actual: {badge}" y sin acción; descripción "El triage se registra una sola vez, cuando la solicitud está Registrada. Elige una del grupo «Pendientes de triage»." |
| Priorización | Formulario de evaluación | Predicado actual `currentTriageDecision === 'CONTINUAR' && estado ∈ {EN_TRIAGE, BACKLOG_PRIORIZADO}` | Título "La priorización no está disponible para esta solicitud"; ítem 1 "Triage vigente con decisión Continuar" (cumplido o pendiente; detalle "Triage actual: {decisión}" o "Sin triage"; acción "Ir a triage" → `/demanda/triage?requestId=…` solo si `isTriageable(request)` —estado Registrada— y `triage` está permitido; con triage Devolver o Rechazar, o en estados posteriores, no hay acción, porque el triage no se puede volver a registrar); ítem 2 "Estado En triage o Backlog priorizado" (detalle "Estado actual: {badge}"). |
| Tareas | Pasar a "En curso" | `task.predecessors` + predicado actual `status === 'TERMINADA' && accepted` | Título "Esta tarea no puede pasar a En curso todavía" (solo si alguna bloquea; si no, lista simple con estado); un ítem por predecesora con detalle "{estado} · aceptada/sin aceptar" y acción "Abrir" → `/seguimiento/tareas?taskId=…`. |
| Controles (GC4) | "Aprobar GC4" | `gate.status` y `gate.validationSummary` (`approvable`, `blockingReasons`) | Tres condiciones, definidas una sola vez en §11.18: `isWaived` (el control está en «No aplica»), `showGc4Block` (panel) y `showActions` (fila de acciones). `approvable` lo calcula el backend con las validaciones y la ruta, sin mirar el estado del control, así que un GC4 dispensado sin validación obligatoria llega con `approvable: false`; por eso el panel exige además `!isWaived`. Panel (`showGc4Block`, para cualquier rol, como la alerta de hoy): `compact`, con `id="GC4-block"` (el id actual), dentro del control. Título "Aprobar GC4 no está disponible"; un ítem pendiente por motivo de `blockingReasons`, tal cual llega de la API, con la acción "Ver validaciones" (cambia a la pestaña Validaciones). Si la lista llega vacía, un único ítem con el respaldo actual: "Hay validaciones bloqueantes o falta la validación obligatoria.". El panel no lleva pie: "Aprobar GC4" está en la fila de acciones del control (`showActions`), justo debajo del panel, para estar siempre en el mismo sitio. Si hay panel, ese botón va `unavailable`, con `aria-describedby="GC4-block-summary GC4-block-reason"`, y dentro de la fila, bajo los botones, va `DisabledReason id="GC4-block-reason"` "Resuelve los motivos de la lista para aprobar este control.". Sin fila (quien no tiene `canReview`) no hay `DisabledReason`: el panel solo informa, con sus motivos y "Ver validaciones". En «No aplica» no hay panel ni fila: quedan el badge, "No aplica: {motivo}" y la línea de resumen de GC4. "Marcar como no aplica" sigue disponible en la fila. |
| Controles (todos) | — | `gate.pendingItems` | Sección "Faltantes" con estado resuelto/pendiente, responsable (nombre vía `/coordination/people` si está en alcance) y "Revisión: {fecha}". Solo lectura (la UI actual no los gestiona). |
| Documentos | "Nuevo documento" | Predicado actual (sin activos no retirados) | `DisabledReason` "Para crear documentos necesitas un activo que no esté retirado." + enlace "Ir a Activos" (si `asset` permitido). |
| Equipo | "Asignar rol" | Predicado actual (sin usuarios o sin procesos) | `DisabledReason` "Necesitas al menos un usuario y un proceso para asignar roles." |
| Capacidad | Persona fija | Predicado actual `lockPerson` | Ayuda del campo "Solo puedes registrar tu propia disponibilidad." (sin cambios). |
| Planificación (fase) | Subir/bajar y eliminar | Predicados actuales (`lockedInitial = isInitial && hasTasks`; eliminar: `hasTasks`) | Nota bajo el nombre de la fase (`text-meta text-muted-foreground`, con `Lock` de 12 px `aria-hidden`): "Fase inicial con tareas: no se mueve ni se elimina." (en adelante, `LOCK`). Cálculo por fila, con `atTop = index === 0` y `atBottom = index === phases.length - 1`; reparte entre las tres acciones exactamente las condiciones de hoy (`busy \|\| atTop \|\| lockedInitial`, `busy \|\| atBottom \|\| lockedInitial` y `busy \|\| hasTasks`): "Subir fase" → si `atTop`, `disabled` sin motivo; si no y `lockedInitial`, `DisabledHint` (`label` "Subir fase", motivo `LOCK`); si no, `disabled={busy}`. "Bajar fase" → lo mismo con `atBottom` (`label` "Bajar fase"). "Eliminar fase" (menú) → si `hasTasks`, `aria-disabled` con segunda línea `LOCK` (si `isInitial`) o "La fase tiene tareas. Elimínalas antes de eliminar la fase." (resto); si no, `disabled={busy}`. Si coinciden el límite natural y el bloqueo, manda el límite natural (§10.3): la fase inicial es la de menor `order` y la API devuelve las fases ordenadas por `order` (`phase.service.ts`), así que es la primera ("Subir fase" siempre `disabled`) y, si es la única, también la última; la nota bajo el nombre ya explica el bloqueo. El motivo `LOCK` se mantiene mientras `busy` (§10.3). "Agregar tarea" no está en esta tabla: no se bloquea por tener tareas (§19.1) y solo se deshabilita, sin motivo, mientras otra acción está en curso (`busy`, §10.3 a). |
| Controles (rol) | Acciones de autoridad | Predicado actual `canReview` | `InlineNotice` (neutral, `role="note"`) bajo la barra de contexto: "Tu rol permite consultar y registrar validaciones. Aprobar controles, cambiar la ruta y marcar «No aplica» corresponde al jefe de área o al líder de proceso." |

Ids de los paneles (`id` es obligatorio porque de él sale `{id}-summary`): Planificación `plan-guide`, Triage `triage-block`, Priorización `priority-block`, Tareas `task-predecessors` y GC4 `GC4-block` (el id actual).

### 10.3 Acciones deshabilitadas

Toda acción deshabilitada muestra su motivo, salvo tres casos evidentes: (a) transitorio mientras se carga o se ejecuta otra acción (`busy`/`loading`), (b) límite natural (subir la primera fase, bajar la última), (c) "sin cambios por guardar". Esos tres usan el atributo `disabled`. Cualquier otra acción deshabilitada tiene motivo y usa `aria-disabled` (`Button unavailable`, §6 y §7.4): sigue enfocable y el lector anuncia su nombre, que no está disponible y el motivo. Según dónde esté:

- Acción principal o bloqueada → `DisabledReason` visible bajo el botón, enlazado con `aria-describedby`. Dentro de `RequirementsPanel`, además, el `-summary` del panel (§10.1).
- Acción en fila densa → `DisabledHint`: tooltip al pasar el puntero, al enfocar y al pulsar, y el motivo como descripción accesible.
- Ítem de menú → `aria-disabled` + motivo en el propio ítem (§6).

Si la acción es imposible por rol o por estado y no aporta información, se oculta en lugar de deshabilitarse, y lo explican el badge de estado o el aviso de rol. Ejemplos: "Revocar" de un rol ya revocado; "Aprobar" y "Marcar como no aplica" en un control marcado como no aplica; el selector de ruta proporcional para quien no tiene `canReview`, que ve solo el valor actual (§11.18).

Precedencia cuando varias causas coinciden en la misma acción (la vista la aplica al calcular `disabled`, `disabledReason` o `unavailable`):

1. Límite natural o «sin cambios por guardar» (b, c) → `disabled` sin motivo. Manda aunque además exista una regla, porque en ese control no hay nada que resolver; si la regla importa, ya la explica otro texto (p. ej. la nota de la fase inicial, §10.2).
2. Regla con motivo → `unavailable` con su motivo, también mientras otra acción está en curso. Así el control no pasa de `aria-disabled` a `disabled` durante un envío y no pierde el foco.
3. Transitorio (a) → `disabled` mientras dura.

## 11. Especificación por pantalla

Regla general: se conservan todos los ids de campos y filtros del inventario, todas las llamadas a la API, las validaciones, los toasts (con ortografía), los predicados de gating y el reseteo "solo en éxito". Lo que se lista aquí es lo que cambia.

### 11.1 Títulos

| Ruta | `metadata.title` | `h1` | Descripción (una línea) | Acción principal |
|---|---|---|---|---|
| `/inicio` | Panel del área | Panel del área | Demanda del área en el periodo: volumen, bloqueos y distribución por estado y prioridad. | — |
| `/mi-trabajo` | Mi trabajo | Mi trabajo | Tareas en las que eres responsable, con su plan y su estado. | "Actualizar" (outline) |
| `/demanda/solicitudes` | Solicitudes | Solicitudes | Registra y actualiza las solicitudes de demanda de tu alcance. | "Nueva solicitud" |
| `/demanda/triage` | Triage | Triage | Clasifica cada solicitud registrada y decide si continúa, se devuelve o se rechaza. | "Guardar triage" (en el formulario) |
| `/demanda/priorizacion` | Priorización | Priorización | Evalúa ocho criterios de 1 a 5; el sistema calcula el score y la banda al guardar. | "Guardar evaluación" |
| `/administracion/revision` | Aprobaciones | Aprobaciones | Decide el compromiso de las solicitudes priorizadas y autoriza los planes enviados. | — (por sección) |
| `/seguimiento/plan` | Planificación | Planificación | Define fases y tareas de una solicitud comprometida y envíala a autorización cuando esté completa. | "Crear plan" / "Enviar a autorización" (contextual) |
| `/seguimiento/tareas` | Tarea | título de la tarea ("Detalle de tarea" sin `taskId`) | — (`meta` con estado) | "Guardar cambios" |
| `/activos/capacidad` | Capacidad | Capacidad | Disponibilidad y carga del equipo por mes, dentro de tu alcance. | — (por sección) |
| `/seguimiento/portafolio` | Portafolio | Portafolio | Iniciativas de tu alcance. Los filtros acotan la vista; no amplían tu alcance. | — |
| `/demanda/resumen` | Indicadores | Indicadores del área | Indicadores del periodo. Sin casos o sin denominador se informa «No aplica» con su motivo, nunca cero. | — |
| `/seguimiento/proyectos` | Proyectos | Proyectos | Seguimiento de proyectos en curso. | — |
| `/seguimiento/bitacora` | Bitácora | Bitácora | Registro diario de actividades por proceso. Las horas son dedicación del día y no cambian el avance de las tareas. | "Nuevo diario" |
| `/seguimiento/semanal` | Reporte semanal | Reporte semanal | Consolida resultados, bloqueos y decisiones de la semana por proceso. | "Nuevo reporte semanal" |
| `/seguimiento/novedades` | Novedades | Novedades | Bloqueos, incidentes y solicitudes de apoyo. Cada novedad se actualiza hasta resolverse. | "Nueva novedad" |
| `/seguimiento/reuniones` | Reuniones | Reuniones | Agenda, participantes y decisiones de las reuniones de coordinación. | "Nueva reunión" |
| `/seguimiento/compromisos` | Compromisos | Compromisos | Acuerdos con responsable y fecha de vencimiento. | "Nuevo compromiso" |
| `/activos/catalogo` | Activos | Activos | Activos de datos y soluciones de cada proceso. | "Nuevo activo" |
| `/activos/documentos` | Documentos | Documentos | Documentación en Markdown versionada y ligada a un activo. Cada edición crea una versión nueva. | "Nuevo documento" |
| `/administracion/frameworks` | Controles de gobierno | Controles de gobierno | Controles GC1–GC5, ruta proporcional y validaciones de cada solicitud. | "Registrar validación" (pestaña Validaciones) |
| `/gobierno/auditoria` | Auditoría | Auditoría | Cambios registrados dentro de tu alcance. | — |
| `/gobierno/mis-permisos` | Mis permisos | Mis permisos | Tus roles, procesos de alcance y módulos habilitados. | — |
| `/gobierno/equipo` | Equipo y permisos | Equipo y permisos | Usuarios del portal y sus roles por proceso. | "Asignar rol" (+ "Nuevo usuario" outline) |
| `/administracion/maestras` y `/catalogs` | Maestras | Maestras | Valores reutilizables que usan los formularios del portal. | "Nuevo elemento" |
| `/login` | Iniciar sesión | Iniciar sesión | Accede con tu usuario o correo del portal. | "Ingresar" |

### 11.2 Login (`/login`)

La raíz de la página es `<div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted px-4 py-10">`. El landmark principal lo aporta quien la contiene, para que nunca haya dos `main` ni dos `#contenido`: en jwt, `RouteGuard` pinta `/login` sin shell, dentro de `<main id="contenido" tabIndex={-1} className="focus:outline-none">`; en dev-header, `/login` sigue dentro del shell, cuyo `main` ya existe (§8.1). Columna centrada de 400 px: `BrandMark` + `BrandName` arriba, `Card` con `CardTitle as="h1"` "Iniciar sesión". Desde este cambio, `/login` también tiene `main` + `h1`, así que `jwt-session.spec.ts` endurece sus aserciones en este mismo paso (§21, paso 3). Se conservan ids, `noValidate`, `autocomplete`, errores por campo con `role="alert"` + `aria-describedby` + `aria-invalid` (paridad con el baseline), mensajes 401/genérico y, tras iniciar sesión, `router.replace(postLoginPath(searchParams))`: la ruta interna de `next` o `/inicio` (§8.7). Aviso de expiración: `InlineNotice tone="warning" role="status"` "La sesión expiró. Vuelve a iniciar sesión.". Botón `size="lg"` a todo el ancho con `loading` ("Ingresando…"). Textos: "Usuario o correo", "Contraseña", "Ingresa tu usuario o correo.", "Ingresa tu contraseña.", "Usuario o contraseña incorrectos.", "No fue posible iniciar sesión. Inténtalo de nuevo.".

### 11.3 Panel del área (`/inicio`, patrón F)

Toolbar con el `fieldset` "Periodo" (`legend` visible `text-meta font-medium`; "Desde" `dashboard-from` y "Hasta" `dashboard-to`, mismos `min/max` y recarga automática). El periodo por defecto sigue siendo el mes en curso, del día 1 al día 1 del mes siguiente, pero en el calendario local, con `localMonthPeriod()` y calculado tras el montaje (§7.9, regla 2). `StatStrip` "Resumen general": "Solicitudes en alcance" (`total`), "Bloqueadas activas" (`blockedActive`, tono danger si >0), "Sin priorizar" (fila `SIN_PRIORIZAR` de `byPriorityBand`), "En ejecución" (fila `EN_EJECUCION` de `byState`); los dos últimos se leen de los arreglos de la API, sin cálculo. Debajo, en `lg:grid-cols-2`: Sección "Por estado operativo" y "Por banda de prioridad", tablas `compact` con columnas Estado/Banda (`StatusBadge`) · Solicitudes (numérica) · Distribución (barra `aria-hidden` de ancho `count/total`, `bg-primary/70`); filas con 0 en `text-muted-foreground`. Vacío: "No hay solicitudes en tu alcance para este periodo." + "Ajusta el periodo para ver otro rango.". Error: `ErrorState` con mensaje de la API + Reintentar.

### 11.4 Mi trabajo (`/mi-trabajo`, A)

Toolbar "Filtros de mi trabajo" con `SearchInput` `mt-buscar` (etiqueta visible "Buscar", placeholder "Título de la tarea"), Select "Estado" `mt-filtro-estado` (Todos + `TASK_STATUS_LABELS`) y `ResultCount` (tareas). `useClientTable`: 25 por página, orden por defecto Vence ascendente (sin fecha al final); ordenables Tarea, Vence y Estado. Tabla: Tarea (`CellTitle href="/seguimiento/tareas?taskId=…"` + `Badge outline` "Hito"; el título abre la tarea) · Solicitud · Fase · Vence (`formatDateOnly`) · Estado (`StatusBadge task` + progreso `text-meta tabular-nums` "40 %") · sin columna de acciones (el botón "Abrir" de hoy pasa a ser el enlace del título). Vacío: "No tienes tareas asignadas." + "Las tareas de las que seas responsable aparecerán aquí.". Error: "No fue posible cargar tu trabajo.". Recarga al cambiar `actorId` (igual).

### 11.5 Solicitudes (`/demanda/solicitudes`, A)

Problemas que resuelve, vistos con el dataset de prueba (`screenshots/before-same-data/demanda-solicitudes-1440.png`): unas 45 filas en una sola tabla, sin búsqueda, filtros, orden ni conteo; todos los estados con el mismo badge gris; la columna Score repite en cada fila la glosa de la banda en tres líneas; títulos de hasta cuatro líneas; "Editar" repetido como única acción.

Toolbar `label="Filtros de solicitudes"` (todo en cliente, nuevo):

- `SearchInput` `sol-buscar` (etiqueta visible "Buscar", placeholder "Título de la solicitud"), por título con `matchesSearch`, sin distinguir mayúsculas ni tildes.
- Select "Estado" `sol-filtro-estado`: Todos + `REQUEST_STATE_LABELS` en el orden del flujo.
- Select "Proceso" `sol-filtro-proceso`: Todos + procesos cargados, por `mainProcessId`.
- Select "Prioridad" `sol-filtro-banda`: Todas, P1, P2, P3, P4 y Sin priorizar. La banda se obtiene con `parseBand(priorityLabel)`; si es `null`, la solicitud cuenta como Sin priorizar.
- En el `end`: `ResultCount` ("45 solicitudes" / "12 de 45 solicitudes") y "Limpiar filtros" cuando hay alguno activo.

Debajo del toolbar va `PriorityLegend`.

Tabla (`useClientTable`, 25 por página, orden por defecto Registro descendente):

- Título: `CellTitle onOpen={() => openEdit(r)}`. Dos líneas como máximo y `title` completo. Abre la ficha (el mismo diálogo de edición de hoy), así que desaparece el botón "Editar" de cada fila.
- Proceso: nombre del proceso principal, o "—".
- Estado: `StatusBadge request`, con tono por estado.
- Triage: `StatusBadge triage` o "—".
- Prioridad: `PriorityBadge variant="compact" score={currentScore} label={priorityLabel}`, una línea: «84» y el badge «P1», sin separador (§7.3). Sustituye a las columnas Score y Prioridad de la iteración 1.
- Registro: `formatDate`.
- Acciones: `RowActionsCell` con `RowActions` solo como menú "Más acciones para «{título}»", con todas sus acciones en `placement: 'menu'`:
  - "Editar ficha".
  - "Ir a triage", "Ir a priorización", "Ir a planificación" e "Ir a controles de gobierno". Cada uno aparece solo si su `moduleKey` está en `allowedModules` y, además, la solicitud cumple el predicado del destino: "Ir a triage" con `isTriageable`, "Ir a priorización" con `isPrioritizable` e "Ir a planificación" con `isPlannable`. "Ir a controles de gobierno" no tiene predicado, porque Controles lista todas las solicitudes del alcance. Usan `href` `…?requestId={id}`, para no llevar a un destino bloqueado.

Columnas ordenables: Título, Estado (orden del flujo con `compareByOrder`), Prioridad (score; sin score al final) y Registro. La tabla usa `scrollLabel="Tabla de solicitudes"`. Vacío: "Aún no hay solicitudes." + "Registra la primera para iniciar el triage y la priorización." + "Nueva solicitud". Sin resultados: "Ningún resultado coincide con los filtros." + "Cambia o limpia los filtros para ver más resultados."; "Limpiar filtros" solo en el `end` del toolbar (§7.2).

`SolicitudFormDialog` (`size="lg"`): descripción crear "Registra la solicitud. Quedará en estado Registrada y lista para triage."; editar "Actualiza la ficha. Las fechas iniciales no se modifican.". Línea de metadatos "Registro: {fecha} · Estado: {StatusBadge}" (reemplaza los inputs deshabilitados de solo lectura). Indicador "Fases del flujo" (`nav` + `ol`, `aria-current="step"` en Solicitud; pasos siguientes con `Lock` y texto sr‑only "se resuelve en su módulo") y su texto de precondiciones. Grupos: "Datos principales" (Título*, Proceso principal* — en edición `Input` deshabilitado con el nombre —, Participantes como `FieldSet` con `Checkbox`: principal marcado y deshabilitado + `Badge` "Principal"), "Solicitante" (Área solicitante, Solicitante, Dueño funcional), "Alcance" (Fecha objetivo, Ficha o enlace de referencia, Resultado esperado), "Cambio" solo en edición (Compromiso inicial de solo lectura, Justificación del cambio). Errores: título y proceso principal en su campo. Éxito al crear (nuevo): toast "Solicitud registrada." con acción "Ir a triage" (si `triage` permitido) → `/demanda/triage?requestId={id}`.

### 11.6 Triage (`/demanda/triage`, C)

`RequestContextBar id="triage-request"` con grupos "Pendientes de triage" (predicado `isTriageable`) y "Otras solicitudes"; `helper` `formatCount(n, { one: 'pendiente de triage', other: 'pendientes de triage' })` ("1 pendiente de triage", "4 pendientes de triage"); `summary` `RequestSummary show={['state','registered']}`. Carga además `listProcesses()` (degrada a `[]`) para la ficha. Formulario (columna izquierda) en grupos: "Clasificación" (Ruta, Tipo de demanda, Criticidad, Tamaño, Disponibilidad de datos — Selects de catálogo con "Sin especificar" —, Esfuerzo en horas), "Responsable y dependencias" (Responsable principal, Dependencias, Observaciones), "Decisión" (`FieldSet kind="radio" id="triage-decision" legend="Decisión" required help="Solo Continuar habilita la priorización."` que envuelve `RadioCards name="triage-decision" idPrefix="triage-decision"` con Continuar, Devolver y Rechazar —valores `CONTINUAR`, `DEVOLVER`, `RECHAZAR`—, sin descripción por opción para no inventar semántica, e `invalid` cuando hay error; reemplaza al Select actual con el mismo id de grupo). Error de decisión en el `FieldSet`. Bloqueo: §10.2. Éxito: toast "Triage registrado." y, si la decisión fue Continuar y `priority` está permitido, acción "Ir a priorización" → `/demanda/priorizacion?requestId={id}`. Deep link: `?requestId=` según §7.9.1. `page.tsx` usa `<Suspense fallback={<PageFallback title="Triage" description="…" />}>`.

### 11.7 Priorización (`/demanda/priorizacion`, C)

`RequestContextBar id="priority-request"` con grupos "Listas para priorizar" (predicado `isPrioritizable`) y "Otras solicitudes"; `summary` con `StatusBadge` y, si hay score, "Score vigente:" + `PriorityBadge variant="full" score={currentScore} label={priorityLabel}`. Carga además `listProcesses()`, degradado a `[]`, para el "Proceso principal" de la ficha (`RequestFacts`). Formulario: lista de criterios (Criterio · Peso "25 %" · Valoración) en un contenedor `rounded-lg border divide-y`. Cada criterio es una fila `grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center`: a la izquierda, `<span id="priority-{key}-label">` con el criterio (`text-sm font-medium`) y "Peso {n} %" (`text-meta text-muted-foreground`); a la derecha, `SegmentedRadio id="priority-{key}" name="priority-{key}" labelledBy="priority-{key}-label"` con las opciones 1 a 5 (ids `priority-{key}-{n}`, valor por defecto 3, flechas para cambiar). Por debajo de 640 px la fila se apila (criterio y peso arriba, control debajo), sin desplazamiento horizontal; desde `sm`, una fila de encabezados `aria-hidden` ("Criterio", "Valoración") alinea las columnas; Justificación (`priority-justification`). No se muestra un score previo: lo calcula el backend. `InlineNotice` info: "Guardar la evaluación no aprueba el compromiso. La aprobación se decide en Aprobaciones." (enlace a Aprobaciones si `review` permitido). Éxito: toast "Evaluación guardada: score {score} ({banda} · {glosa})." usando `parseBand(thresholdLabel)` y `PRIORITY_BAND_COPY`; si `parseBand` devuelve `null`, se muestra `thresholdLabel` tal cual: "Evaluación guardada: score {score} ({thresholdLabel}).". Lleva la acción "Ir a aprobaciones" si `review` está permitido. Bloqueo: §10.2.

### 11.8 Aprobaciones (`/administracion/revision`, A)

Dos `Section` con su propio "Actualizar" (outline sm): "Compromisos por aprobar" (`count`) y "Planes por autorizar" (`count`; sección visible solo con `review`, como hoy). Cada una con un `InlineNotice` info compacto: "Aprobar lleva la solicitud a Comprometida; devolver la regresa a triage con un motivo." / "Autorizar lleva la solicitud a En ejecución; devolver regresa el plan a edición con un motivo.". Tablas, con `PriorityLegend` una sola vez sobre la primera: Título (`CellTitle` sin acción) · Prioridad (`PriorityBadge variant="compact" score={currentScore} label={priorityLabel}`, que sustituye a las columnas Score y Prioridad) · Registro · Acciones ("Aprobar" `default sm` + "Devolver" `outline sm`, deshabilitados mientras se actúa sobre esa fila) y Solicitud · Estado del plan (`StatusBadge plan`) · Acciones ("Autorizar", "Devolver"; menú con "Ver plan" → `/seguimiento/plan?requestId=…` si `plan` permitido). Devolver abre `DevolverDialog kind="solicitud"|"plan"`.

### 11.9 Planificación (`/seguimiento/plan`, C)

- Barra de contexto: `RequestContextBar id="plan-request"` con grupos por estado ("Comprometidas", "En planificación", "En ejecución"; solicitudes de `PLANNABLE_STATES`, una llamada por estado como hoy) y `summary` con `StatusBadge plan` si existe plan. No lleva `actions`.
- Sin plan: `EmptyState` "Esta solicitud aún no tiene un plan." + "Crea el plan para definir fases y tareas." + botón principal "Crear plan". Es el único lugar de esa acción.
- `DEVUELTO`: `InlineNotice warning` "Plan devuelto: {returnReason}. Corrige lo indicado y vuelve a enviarlo.".
- `!canEdit` (en autorización o autorizado): `InlineNotice info` "El plan está {en autorización/autorizado}; las fases y tareas no se pueden editar.". La guía no se muestra: en esos estados no hay ninguna acción posible y hoy, con un plan autorizado, aparece "Listo para enviar", lo que induce a error. La llamada a `getPlanGuide` se conserva.
- Plan editable: `RequirementsPanel` (`id="plan-guide"`, `liveUpdates`) justo bajo la barra.
  - Ítems de `presentGuidePending` (§7.9.2), agrupados con `guideCategoryLabel`.
  - En el pie, el botón "Enviar a autorización" (`ConfirmDialog tone="default"`, §13.3), `unavailable` con su `DisabledReason` mientras haya pendientes (§10.2).
  - Una línea "Se evaluarán más adelante: Capacidad, Evidencias de controles y Controles del marco." con las etiquetas de `GUIDE_CATEGORY_LABELS`, no las claves internas.
- Sección "Fases" (acción "Nueva fase" si `canEdit`): tabla `compact`, en lugar de las tarjetas apiladas de hoy.
  - Columnas: # · Fase (+ `Badge` "Fase inicial") · Fechas · Entregable · Tareas (conteo) · Acciones.
  - Si la fase inicial tiene tareas, debajo del nombre va la nota de §10.2 con `Lock`. Esa fila crece a dos líneas.
  - Acciones en `RowActionsCell`: "Subir fase" y "Bajar fase" como `iconOnly` (`ArrowUp`/`ArrowDown`, esos `aria-label` y `LabelTooltip`); inline "Editar" y "Agregar tarea"; en el menú, "Eliminar fase" con `ConfirmDialog`. Estados y motivos según el cálculo por fila de §10.2, en el que el límite natural manda sobre el bloqueo de la fase inicial.
  - Foco tras reordenar. Mientras dura la llamada, `busy` deshabilita los botones, y el foco del teclado se perdería en cada movimiento. Los dos botones llevan `id` (`RowAction.id`, §7.6): `phase-{id}-up` y `phase-{id}-down`. `handleMovePhase` guarda `{ phaseId, dir }` en una ref antes de llamar a la API, sin cambiar nada más de su lógica. Cuando `busy` vuelve a `false`, con éxito o con error, un efecto enfoca `#phase-{phaseId}-{dir}`; si ese botón quedó `disabled` por el límite natural, enfoca el del sentido opuesto. Después limpia la ref. Un botón `unavailable` sigue siendo enfocable, así que siempre queda uno de los dos: mover una fase implica al menos dos fases.
  - "Agregar tarea" queda con `disabled={busy}` y sin motivo (§10.3 a), en todas las fases, también en las que ya tienen tareas (corrige §19.1). Hoy comparte por copia la condición `busy || hasTasks` de "Eliminar"; el backend admite varias tareas por fase (`Task.phaseId` solo tiene `@@index`, y los datos de prueba tienen 33 tareas en 14 fases). "Eliminar fase" conserva `busy || hasTasks` con su motivo, y `lockedInitial`, "Subir fase" y "Bajar fase" no cambian.
- Sección "Tareas":
  - Toolbar con `task-q` (`SearchInput`, conserva su etiqueta visible "Buscar"; placeholder "Título de la tarea"), `task-status`, `task-phase` y el switch "Solo mis tareas". Los filtros se aplican en cliente con `matchesTaskFilters` (§7.9.2). "Solo mis tareas" compara con `permissions.userId` (corrige §19.13) y queda deshabilitado mientras `permissions` es `null`.
  - Columnas: Tarea (`CellTitle href="/seguimiento/tareas?taskId=…"` + "Hito") · Fase · Responsable · Inicio · Vence · Esfuerzo · Predecesoras · Estado · Acciones.
  - Responsable: columna nueva con el nombre vía `listCoordinationPeople()`, degradada a "—"; "Sin asignar" en `text-warning` cuando es `null`.
  - Estado: `StatusBadge task` y el progreso "40 %" en `text-meta` al lado, en una sola línea.
  - Ordenables Inicio, Vence y Estado.
  - Acciones (solo si `canEdit`): inline "Editar" y, en el menú, "Eliminar tarea" con confirmación. El "Abrir" de hoy pasa a ser el enlace del título.
- Diálogos: `PhaseDialog` `sm`; `TaskDialog` `md`, con las predecesoras como lista de `Checkbox` en `max-h-48 overflow-y-auto`.
- Deep link `?requestId=` según §7.9.1. Si el id no está entre las solicitudes planificables: `InlineNotice` "La solicitud indicada no está comprometida, en planificación ni en ejecución.".

### 11.10 Tareas (`/seguimiento/tareas`, D)

`PageHeader` con migas `[{ label: 'Mi trabajo', href: '/mi-trabajo' }]` (si `assigned` permitido), `h1` = título, `meta` = `StatusBadge task` + "40 %" + `Badge outline` "Hito" + `StatusBadge`‑like "Aceptada" (success) o "Sin aceptar" (neutral). Principal: "Descripción", "Criterios de aceptación" (`whitespace-pre-wrap`), "Predecesoras" (§10.2), formulario "Actualizar estado" (`task-next-status` con solo transiciones permitidas, `task-progress`, `task-evidence`; "Guardar cambios" con `DisabledReason` "No hay transiciones disponibles desde «{estado}»." si no hay). Lateral: "Evidencia" (enlace si es http/https; texto si no) y, si `plan` permitido, "Aceptación" con el texto explicativo y "Aceptar tarea"/"Retirar aceptación". Sin `taskId`: `h1` "Detalle de tarea" y `EmptyState` "Elige una tarea para ver su detalle." + "Ir a Mi trabajo" / "Ir a Planificación" (según `allowedModules`). Cargando: `h1` "Tarea" + skeletons. `page.tsx` conserva su `<Suspense>` y le añade `fallback={<PageFallback title="Tarea" variant="detail" />}`. Error: `h1` "Tarea" + `ErrorState` "No fue posible cargar la tarea." con Reintentar.

### 11.11 Capacidad (`/activos/capacidad`, F)

Toolbar con "Mes" (`capacidad-month`). Su valor por defecto es el mes en curso del calendario local, con `localMonthInputValue()` y calculado tras el montaje (§7.9, regla 2). La explicación pasa a un `<details>` nativo "¿Cómo se calcula?" (cerrado por defecto) con el mismo texto. Sección "Resumen de carga": tabla Persona · Disponible · Comprometido · Utilización (`UtilizationBar`, tono danger si `sobrecargado`) · Libre (`formatHours`, que ya escribe el signo menos tipográfico U+2212: "−10 h"; si es negativo, además en `text-danger`; es el exceso que ya informa la API) · Planificado (+ `Badge warning` "Plan supera lo disponible" con `srDescription` explicativa si `planSobreDisponible`) · Utilización plan (`UtilizationBar`, tono warning si `planSobreDisponible`) · Señal (`StatusBadge capacity` con `srDescription`; en Carga parcial se mantiene el texto visible). El resumen es ordenable por Persona, Utilización y Utilización plan (`useClientTable` sin paginación; orden de la API por defecto), para encontrar la sobrecarga de un vistazo (patrón de Asana Workload). Secciones "Disponibilidad" ("Registrar disponibilidad") y "Asignaciones" ("Nueva asignación"), cada una con su `DataView` y acciones de fila inline en `RowActionsCell` (Disponibilidad: "Editar"; Asignaciones: "Editar" y "Eliminar", sustituye a "Borrar"); "Eliminar" de asignación con `ConfirmDialog`. Se conserva el toast 409 con acción "Editar la existente" y `lockPerson`.

### 11.12 Portafolio (`/seguimiento/portafolio`, A)

Toolbar "Filtros del portafolio": `portafolio-proceso`, `portafolio-estado` y `portafolio-banda` (en servidor, con recarga automática, como hoy), `SearchInput` `portafolio-buscar` (por título, en cliente) y `ResultCount`. `PriorityLegend` bajo el toolbar. Carga además `listCatalogItems({ catalog: 'GOVERNANCE_ROUTE' })` sin filtro de estado (el `GET` de maestras solo exige actor), degradado a `[]`, para las etiquetas de ruta. `useClientTable` con 25 por página y el orden de la API por defecto; ordenables Título, Estado, Banda (P1→P4, sin priorizar al final), Registro y Objetivo. Tabla en densidad por defecto: Título (`CellTitle`) · Proceso · Estado (`StatusBadge`) · Banda (`PriorityBadge variant="compact" band={priorityBand} label={priorityLabel}`) · Ruta (`routeLabel`, §7.3) · Responsable · Registro · Objetivo · Compromiso (las tres con `formatDateOnly`) · Bloqueo (`StatusBadge blocked` + motivo visible `text-meta text-muted-foreground line-clamp-2`; sin bloqueo "—").

### 11.13 Indicadores (`/demanda/resumen`, F)

Toolbar "Periodo" (`indicadores-from`, `indicadores-to`; oculto en `forbidden`), con el mismo periodo por defecto que el Panel del área: `localMonthPeriod()` tras el montaje (§7.9, regla 2). Cada grupo es una `Section` con una lista `rounded-lg border divide-y` de filas de indicador: izquierda título (`text-sm font-semibold`) + descripción (`text-meta`); derecha valor (`text-2xl tabular-nums` + unidad `text-meta` + muestra `text-xs`) o "No aplica" (`Badge outline`) con el motivo de la API. Subtablas (por ruta, por complejidad, bloqueos por causa) `compact` bajo su fila. `forbidden`: `InlineNotice neutral role="note"` "Esta pantalla no está disponible para tu rol." + "Los indicadores del área son para el jefe de área y los líderes de proceso. Si necesitas estos datos, solicita acceso. El panorama de la demanda está en el Panel del área." + enlace "Ir al Panel del área". Gating sin cambios.

### 11.14 Proyectos (`/seguimiento/proyectos`)

`EmptyState` (icono `FolderOpen`) "Esta sección estará disponible próximamente." + "Aquí podrás seguir los proyectos en curso. Mientras tanto, usa Planificación y Portafolio." con enlaces filtrados. Se elimina `components/under-construction.tsx` (único uso).

### 11.15 Bitácora, Reporte semanal, Novedades, Reuniones, Compromisos (B)

Comunes: lista con `SelectableList` (autoselección del primero o mantenimiento de la selección, como hoy), fechas con `formatDateOnly`, badges con `StatusBadge` (`log` o `record`), "Eliminar" en vez de "Borrar" con `ConfirmDialog`, botón principal de la cabecera deshabilitado solo mientras carga (transitorio). Las fechas por defecto de los diálogos de alta salen del calendario local (§7.9, regla 2): "hoy" en `diario-date`, `nov-date`, `reu-date` y `com-due` con `localDateInputValue()`, y el lunes de la semana en curso en `sem-week` con `localWeekMondayInputValue()`. Se calculan al abrir el diálogo, como hoy.

- Bitácora: lista "Mis diarios" (fecha, proceso, estado). Detalle: acciones (solo borrador) "Enviar a revisión" (principal, `ConfirmDialog tone="default"`), "Editar notas" (outline), "Eliminar" (`ghost-destructive`). Notas; "Dedicación del día: N h" como dato destacado (`aria-live`); nota "La dedicación es la suma de las horas de las actividades y no cambia el avance de las tareas.". Sección "Actividades" con "Agregar actividad" (secondary) y tabla Clasificación (`Badge outline`) · Descripción (`line-clamp-2`) · Horas (numérica) · Acciones (inline "Editar", "Eliminar"). Enviado: `InlineNotice neutral` "El diario se envió a revisión; las actividades ya no se pueden editar.".
- Reporte semanal: lista "Mis reportes" ("Semana del {lunes}"). Detalle: "Enviar" → "Enviar reporte" (principal, confirmación); bloque "Consolidado de bitácoras" con `StatStrip` interno (Diarios, Actividades, Dedicación, Extraordinarias; `aria-live`) o su texto vacío; secciones de texto (`sem-results`, `sem-proposals` con su ayuda, `sem-blockers`, `sem-commitments`, `sem-decisions`) en columna de 720 px y "Guardar secciones"; enviado → `InlineNotice` "El reporte se envió; sus secciones ya no se pueden editar.". Diálogo "Nuevo reporte semanal" con `sem-process`, `sem-week` y su ayuda.
- Novedades: lista (título, tipo · proceso, estado). Detalle: `DescriptionList` (Responsable, Fecha objetivo, Detalle, Impacto, Resolución), "Editar" (outline), grupo "Cambiar estado a:" (toast "Novedad movida a {estado}.").
- Reuniones: detalle con "Editar" y "Eliminar"; "Participantes" como `Badge outline`; Agenda, Decisiones, Observaciones.
- Compromisos: detalle con `DescriptionList` (Asignado, Responsable, Reunión de origen, Resultado esperado, Bloqueos), "Editar", "Cambiar estado a:".

### 11.16 Activos (`/activos/catalogo`, A)

Toolbar "Filtros de activos" (`filtro-proceso`, `filtro-solicitud`, `filtro-estado`) + `SearchInput` nuevo `filtro-busqueda` (por nombre, con `matchesSearch`) + `ResultCount`. `useClientTable`: 25 por página, orden por defecto Nombre ascendente; ordenables Nombre, Proceso y Estado. Tabla: Nombre (`CellTitle`) · Proceso · Solicitud · Responsable · Tipo · Estado (`StatusBadge asset`, ya no el código crudo) · Acciones (inline "Editar" + transición permitida por grants —"Activar"/"Retirar"/"Recuperar"— con `busy`). Toast "Activo movido a {etiqueta}." (etiqueta, no código). `ActivoFormDialog` `md`, campo "Responsable" con esa etiqueta exacta (E2E).

### 11.17 Documentos (`/activos/documentos`, A)

Toolbar "Filtros de documentos" (los 5 filtros actuales con sus ids; la búsqueda usa `matchesSearch`) + `ResultCount`. `useClientTable`: 25 por página, orden por defecto Título ascendente; ordenables Título, Activo, Versión y Estado. Tabla: Título (`CellTitle`) · Activo · Proceso · Versión ("v3") · Estado (`StatusBadge document`) · Acciones (inline "Editar" e "Historial" (`RotateCcwClock`); menú "Descargar .md" (deshabilitado con motivo "Aún no tiene versiones." si no hay versión vigente) y las transiciones permitidas por grants). Mientras `downloadingId === doc.id`, "Descargar .md" va con `busy: true` y `busyLabel: 'Descargando…'`. El trigger "Más acciones" de esa fila muestra el spinner y `aria-busy="true"` hasta que termina la descarga, con éxito o con error (§7.6). Hoy ese estado es el «…» del botón. Toast "Documento movido a {etiqueta}.". `DocumentoEditorDialog` `xl`: `Tabs` "Modo de edición" (Editor / Vista previa) sustituye el `tablist` manual; el `Textarea` `doc-content` vive en la pestaña Editor; contador `N/200.000` sin `aria-live` y mensaje `role="alert"` "Supera el límite de 200.000 caracteres." al excederlo; Ctrl/Cmd+S se conserva. `HistorialDialog` `xl` con tabla y panel de contenido.

### 11.18 Controles de gobierno (`/administracion/frameworks`, C con pestañas)

Carga adicional: `listCoordinationPeople()` (degrada a `[]`) para nombres de responsables y del ejecutor. `RequestContextBar id="governance-request"` (sin grupos) con `summary` = `StatusBadge request` + `PriorityBadge variant="full" score={currentScore} label={priorityLabel}`. Deep link según §7.9.1, con `PageFallback` en `page.tsx`. Aviso de rol (§10.2). Si `board.blocked`: `InlineNotice danger role="alert"` "Solicitud bloqueada" + motivo. Maquetación `xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] gap-6`, con el orden del DOM igual al de lectura: primero la columna principal (pestañas) y después la lateral. La rejilla `xl:` coloca la lateral a la derecha sin utilidades `order-*`; por debajo de 1280 px se apilan y la lateral queda después de los controles.
- Principal (primera en el DOM): `Tabs` "Controles" | "Validaciones ({n})".
  - Controles: `ol aria-label="Controles de gobierno GC1 a GC5"` dentro de un contenedor `rounded-lg border divide-y`. Cada `li` (`aria-label="Control {code}: {título}"`) lleva:
    - `h2` "{code} · {título}" + `StatusBadge gate`.
    - `DescriptionList` (Condición, Autoridad) y "No aplica: {motivo}".
    - Faltantes (§10.2).
    - Resumen de GC4: `{formatCount(total, { one: 'validación', other: 'validaciones' })} · {formatCount(blockingUnresolved, { one: 'bloqueante sin resolver', other: 'bloqueantes sin resolver' })} · {hasMandatoryApproving ? 'Validación obligatoria presente' : 'Falta la validación obligatoria'}`. Conserva los tres datos de hoy, sin «(s)». Debajo, si `showGc4Block`, su `RequirementsPanel compact` (§10.2).
    - Condiciones de presentación de cada control. Son solo presentación: `approvable` y `blockingReasons` vienen de la API, que calcula `approvable` con las validaciones y la ruta, sin mirar el estado del control.
      ```ts
      const isGc4 = gate.gateCode === 'GC4';
      const approvableGate = isGc4 || gate.gateCode === 'GC5'; // GC1–GC3 no se aprueban desde gobierno (como hoy)
      const isWaived = gate.status === 'NO_APLICA';
      const summary = gate.validationSummary;                  // GateValidationSummary | null; solo GC4 lo trae
      // Panel de bloqueo: para cualquier rol, como la alerta de hoy, salvo «No aplica».
      const showGc4Block = isGc4 && summary !== null && !summary.approvable && !isWaived;
      // Fila de acciones: con canReview, solo en GC4/GC5 y fuera de «No aplica».
      const showActions = canReview && approvableGate && !isWaived;
      ```
    - Fila de acciones (`showActions`), `flex flex-col gap-1`:
      - Botones, `flex flex-wrap gap-2`: "Aprobar {code}" (`default sm`) y "Marcar como no aplica" (`outline sm`, `disabled={busy}`), que abre `ReasonDialog` (`waive-reason`; vacío → no envía).
      - "Aprobar {code}": si `showGc4Block`, `unavailable` con `aria-describedby="GC4-block-summary GC4-block-reason"`, también mientras `busy` (§10.3); si no, `disabled={busy}`. Con `CUMPLIDO` sigue disponible, como hoy.
      - Bajo los botones, solo si `showGc4Block`: `DisabledReason id="GC4-block-reason"` "Resuelve los motivos de la lista para aprobar este control.".
    - Sin fila (sin `canReview`) no hay `DisabledReason`: un integrante con GC4 bloqueado ve el panel con sus motivos y "Ver validaciones", y el aviso de rol explica quién aprueba.
    - `isWaived`: ni panel ni fila (§10.3). Quedan el badge "No aplica", "No aplica: {motivo}" (si llega `waiverReason`) y, en GC4, la línea de resumen. Hoy "Aprobar" aparece deshabilitado sin motivo y, si GC4 no es aprobable, la alerta roja se ve igualmente; el resultado funcional es el mismo, porque la acción no es posible.
    - GC1–GC3: "Este control se deriva de fases previas y no se aprueba desde gobierno.".
  - Validaciones: toolbar con "Registrar validación" (abre `ValidationFormDialog` `md` con los mismos campos e ids). `InlineNotice` "Resumen GC4: {formatCount(total, validación)}; {formatCount(blockingUnresolved, bloqueante sin resolver)}; {validación obligatoria presente | falta la validación obligatoria}. {Aprobable según el servidor | Aún no es aprobable}.", con las mismas formas singular y plural ("1 validación; 1 bloqueante sin resolver; …"). Tabla Tipo · Caso · Versión · Ambiente · Fecha · Resultado · Bloqueante ("No" / `StatusBadge blocking`) · Evidencia · Acciones ("Resolver bloqueo" con `canReview`).
- Lateral (segunda en el DOM):
  - `Section` "Ruta proporcional", con la descripción "Determina qué controles son exigibles. La elige el líder, sin reclasificación automática.". Las etiquetas de ruta salen de `routeLabel`, que prefiere la de la maestra cargada al mapa de respaldo (al revés que hoy).
    - Con `canReview`: `Label` "Ruta" + `Select` `governance-route` (`disabled={busy}`, placeholder "Sin ruta asignada"), "Guardar ruta" (`disabled` mientras `busy` o sin cambios, §10.3 a y c) y la línea "Actual: {routeLabel}" o "Sin ruta asignada.".
    - Sin `canReview`: solo la línea "Actual: {routeLabel}" o "Sin ruta asignada.", sin `Select` ni `Label`. Se oculta en lugar de deshabilitarse (§10.3), y el aviso de rol (§10.2) ya dice quién la cambia. Hoy el `Select` aparece deshabilitado sin motivo. El id `governance-route` solo existe para quien revisa.
  - Con `canReview`, `Section` "Avance de etapas" (los 3 botones outline, con la ayuda "Cada avance exige el estado de origen correcto; si no corresponde, verás el motivo.").
- `ValidationFormDialog`: "Ejecutor" pasa de texto libre a `Select` `val-executor` con las personas en alcance (valor = id de usuario, el mismo campo `executedByUserId`) más la opción "Otra persona (ingresar id)", que muestra `Input` `val-executor-manual`; si la lista está vacía o falló, solo el `Input` (comportamiento actual). Errores de "tipo, caso, resultado, ejecutor, fecha" en sus campos. Toast "Validación registrada. Registrarla no aprueba el control.".

### 11.19 Auditoría (`/gobierno/auditoria`, A)

Carga adicional `listCoordinationPeople()` (degrada). Toolbar nuevo en cliente: "Objeto" (`aud-filtro-objeto`) y "Acción" (`aud-filtro-accion`), con las opciones presentes en los datos y sus etiquetas, + `ResultCount` (eventos). `useClientTable`: 25 por página, orden por defecto Fecha descendente; ordenables Fecha, Acción y Objeto. Tabla `compact`: Fecha (`formatDateTime`) · Actor (nombre si está en alcance; si no, id corto `xxxxxxxx…` con `title` completo; null → "Sistema") · Proceso ("{nombre} ({código})" o "—") · Acción · Objeto (etiquetas) · Cambio ("Ver cambio" abre `VerCambioDialog` `xl`, Antes/Después en dos columnas `lg`). Etiquetas: acciones CREATE Creación, UPDATE Actualización, DELETE Eliminación, REVOKE Revocación; objetos APPROVAL Aprobación, ASSET Activo, ASSIGNMENT Asignación de horas, CATALOG_ITEM Elemento de maestra, COMMITMENT Compromiso, DAILY_LOG Diario, DAILY_LOG_ACTIVITY Actividad del diario, DOCUMENT Documento, DOCUMENT_VERSION Versión de documento, GATE_CHECK Control de gobierno, GATE_PENDING_ITEM Faltante de control, GRANT Asignación de rol, ISSUE Novedad, MEETING Reunión, MONTHLY_AVAILABILITY Disponibilidad mensual, PLAN Plan, PLAN_PHASE Fase del plan, PRIORITY_EVALUATION Evaluación de prioridad, PROCESS Proceso, REQUEST Solicitud, TASK Tarea, TASK_DEPENDENCY Dependencia de tarea, TRIAGE Triage, USER Usuario, VALIDATION_RECORD Validación, WEEKLY_REPORT Reporte semanal; desconocido → código.

### 11.20 Mis permisos (`/gobierno/mis-permisos`, D)

Mismos estados (sin actor, cargando, error con `reload`). Secciones: "Identidad" (`DescriptionList` Nombre, Identificador), "Roles y alcance" (tabla Rol · Proceso · Código; vacío "No tienes roles activos."), "Módulos" (tabla Módulo · Acceso con `MODULE_ORDER`/`MODULE_LABELS` y `StatusBadge permission`; claves únicas, sin advertencias de React) y la nota "El servidor aplica estos permisos; el menú solo muestra lo que tienes habilitado.".

### 11.21 Equipo y permisos (`/gobierno/equipo`, A)

Glosario: "grant" → "rol asignado". Acciones de cabecera: "Nuevo usuario" (outline) y "Asignar rol" (principal, §10.2). Sección "Usuarios" (Nombre · Identificador · Estado `active`). Sección "Roles asignados" (Usuario · Proceso "{nombre} ({código})" · Estado `grant` · Acciones "Revocar" con `ConfirmDialog`, oculto si ya está revocado). La tabla sigue sin columna Rol (la API no devuelve el código de rol; §19). Diálogos `sm`: "Nuevo usuario" (`user-identifier`, `user-name`) y "Asignar rol" (`grant-user`, `grant-role` con "Jefe de área", "Líder de proceso", "Integrante", `grant-process`). Toasts "Usuario creado.", "Rol asignado.", "Rol revocado.".

### 11.22 Maestras (`/administracion/maestras` y `/catalogs`, A)

Mismo componente para ambas rutas. `<form onSubmit={handleApplyFilters}>` que envuelve `<Toolbar label="Filtros de maestras">` (Enter o "Aplicar" aplica; no se auto‑aplica): `filter-catalog` (`Label` "Catálogo", placeholder "Todos"), `filter-active` (Todos/Activos/Inactivos) y botón `secondary` "Aplicar". En el `end` del toolbar, `ResultCount` (elementos). `useClientTable`: 25 por página y orden de la API por defecto; ordenables Catálogo, Código, Etiqueta y Orden. Tabla `compact`: Catálogo · Código · Etiqueta · Estado (`StatusBadge active`: exactamente "Activo"/"Inactivo") · Orden (numérica) · Actualizado (`formatDateTime`) · Acciones (inline "Editar" y "Activar"/"Desactivar", sin menú). Vacío (también con filtros, por compatibilidad con el E2E): "No hay elementos todavía." + "Crea el primer valor de una maestra o ajusta los filtros." + "Nuevo elemento". `CatalogFormDialog` `sm`: Catálogo*, Código* (deshabilitados en edición), Etiqueta*, Orden, Activo (Switch). Descripción: crear "Crea un valor reutilizable para una maestra del portal."; editar "El catálogo y el código no se pueden modificar." (reescrita para que ningún texto del diálogo, salvo el error, contenga "Catálogo y código son…", §13.4). Mensajes: "Catálogo y código son obligatorios." (regla de dos campos → `FormError`), "La etiqueta es obligatoria." (campo). Los errores del backend (p. ej. el 409 de duplicado) pasan a mostrarse también en `FormError` dentro del diálogo, además del toast actual, como en el resto de diálogos (`CatalogsView` guarda el mensaje en estado y lo pasa al diálogo, que lo limpia al abrirse); por eso el E2E de duplicado se acota al diálogo (§20). La página no tiene otro encabezado que contenga "Maestras".

## 12. Estados (resumen normativo)

| Estado | Presentación | Anuncio |
|---|---|---|
| Carga de datos | Skeletons con la forma del contenido (`TableSkeleton`, 4 ítems de lista, bloques de detalle). Nunca spinner de página dentro del shell. | `ResultCount` "Cargando {objeto}…" en los listados que lo tienen; en el resto, `statusText` de `DataView` |
| Envío | Botón con `loading` y texto de progreso ("Guardando…", "Eliminando…"); cada formulario conserva lo que hace hoy con sus campos durante el envío (login, por ejemplo, los deshabilita). | `aria-busy` en el botón |
| Vacío | `EmptyState`: qué es + cómo empezar + acción solo si la pantalla ya la ofrece. | — |
| Sin resultados | `EmptyState` "Ningún resultado coincide con los filtros." + "Cambia o limpia los filtros para ver más resultados."; "Limpiar filtros" solo en el `end` del toolbar (§7.2). | `ResultCount` "0 de 45 solicitudes" (o `statusText` "Sin resultados" donde no hay contador) |
| Error de carga | `ErrorState`: qué pasó (mensaje del wrapper de API) + qué hacer + "Reintentar". | `role="alert"` |
| Error de envío | `FormError` en el formulario + toast de error (se conservan ambos) + valores intactos. | `role="alert"` |
| Éxito | Toast de éxito (textos del inventario con ortografía) y refresco de datos; en flujos encadenados, acción del toast hacia el paso siguiente (§11.5–11.7). | sonner |
| Deshabilitado | §10.3: `disabled` si es transitorio, límite natural o sin cambios; `aria-disabled` (`unavailable`) con motivo en cualquier otro caso. | Nombre + "no disponible" + motivo (`aria-describedby`) |
| Muchas filas | Búsqueda, filtros, orden y paginación de 25 en cliente (§9 A); conteo siempre visible. | `ResultCount` |
| Sesión (jwt) | Pantalla completa "Cargando tu sesión…" hasta hidratar la identidad; "Redirigiendo…" mientras se navega (§8.7). | `role="status"` |
| Ruta inexistente | `app/not-found.tsx` (§8.6): "Página no encontrada" + "Ir al Panel del área"; estado HTTP 404. | — |
| Error de ejecución | `app/error.tsx` dentro del shell (§8.6) con "Reintentar" (`retry`); si falla el layout, `app/global-error.tsx`. | `role="alert"` |

## 13. Copys

### 13.1 Reglas

- Español con ortografía completa en todo texto visible, `aria-label`, `title`, `metadata.title`, toasts y mensajes de `lib/*.ts` (`messageForStatus`, errores de dominio). Se usan ¿ cuando hay pregunta; no se usan signos de exclamación.
- Sentence case. Botones con verbo + objeto cuando el contexto no es obvio ("Registrar disponibilidad", "Asignar rol"); "Guardar cambios" en ediciones; "Cancelar" siempre como salida.
- "Eliminar" para borrados definitivos (sustituye "Borrar"); "Archivar", "Retirar", "Desactivar" para estados reversibles.
- Sin códigos internos visibles: se eliminan las referencias "(BR‑001)", "(BR‑006)", "(BR‑008)", "(BR‑013)", "(BR‑017)", "(BR‑022)" del texto (se pueden dejar en comentarios del código) y los estados se muestran con su etiqueta.
- Vacío = qué es + cómo empezar. Error = qué pasó + qué hacer + Reintentar. Sin culpar al usuario.
- Valores vacíos "—" (raya), no "-". Puntos suspensivos con "…". Comillas « » para nombres citados en frases. Fechas "10 oct 2026", fecha y hora "10 oct 2026, 14:30", horas "40 h", horas negativas "−10 h" (U+2212), porcentajes "45 %".
- Conteos con su forma singular: un número variable junto a un sustantivo siempre pasa por `formatCount` (§7.9): "1 solicitud", "1 pendiente", "1 validación", "1 bloqueante sin resolver". Nunca "1 pendientes", ni el "pendiente(s)" de hoy.
- Mensajes de los wrappers de `lib/*.ts` (`messageForStatus` y equivalentes):
  - Se conservan todos los textos por estado HTTP y los textos por defecto que nombran su dominio, solo con la ortografía corregida. Ejemplos: `tasks.ts` 400 "Revisa los datos de la tarea."; `catalog.ts` 404 "El elemento no existe o fue removido."; los 409 de plan y de tarea; `my-work.ts` "Ocurrió un error al cargar tu trabajo."; `catalog.ts` 409 "Ya existe un elemento con ese código en esta maestra.".
  - Se unifican solo dos: el de red, "No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.", y el genérico, "Ocurrio un error al procesar la solicitud." → "Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.".
  - En las vistas, el respaldo para errores que no son de dominio pasa de "Ocurrio un error inesperado." a "Ocurrió un error inesperado. Inténtalo de nuevo.".
- Textos que llegan de la API (condiciones y autoridades de los gates, motivos de "No aplica" de indicadores, `blockingReasons`, mensajes de la guía con código desconocido, nombres de rol en Mis permisos) se muestran tal cual: no se pueden corregir sin tocar `apps/api` (§22).

### 13.2 Glosario

| Término | Uso |
|---|---|
| Solicitud | Unidad de demanda (no "requerimiento"). |
| Triage | Se mantiene (término del marco). Decisiones: Continuar, Devolver, Rechazar. |
| Priorización, evaluación, score, banda | "Score" se mantiene (término del marco, 20–100). Bandas P1–P4 y "Sin priorizar". |
| Aprobación / autorización | Aprobación = compromiso de una solicitud; autorización = plan. Devolver siempre con motivo. |
| Plan, fase, tarea, hito, predecesora | Hito: una sola fecha y 0 horas. Predecesora: tarea que debe terminar y ser aceptada antes. |
| Responsable, asignado | Responsable = quien responde; asignado = quien ejecuta (compromisos). |
| Capacidad | Disponibilidad (horas del mes), asignación (horas comprometidas a mano), comprometido, planificado (estimación desde tareas), libre, utilización, sobrecarga. |
| Bitácora, diario, actividad, dedicación | Diario = registro de un día; dedicación = suma de horas del día. |
| Reporte semanal | Sustituye "Semanal" como sustantivo. |
| Novedad | Bloqueo, incidente, calidad de datos o solicitud de apoyo. |
| Compromiso | Acuerdo con vencimiento (no confundir con "compromiso inicial" de la solicitud, que es una fecha). |
| Activo, documento, versión | Documento versionado ligado a un activo; publicar → Vigente. |
| Control (gate) GC1–GC5, ruta proporcional, validación, defecto bloqueante, evidencia | "Marcar como no aplica" (requiere motivo). |
| Maestras | Catálogos de valores reutilizables. |
| Rol asignado | Sustituye "grant" en la UI. Roles: Jefe de área, Líder de proceso, Integrante. |
| Proceso | BI, Integraciones, IA, Coordinación (nombres de la API). |

### 13.3 Textos de confirmación y motivo

| Acción | Título | Descripción | Confirmar |
|---|---|---|---|
| Eliminar fase | ¿Eliminar la fase «{nombre}»? | Esta acción no se puede deshacer. | Eliminar fase |
| Eliminar tarea | ¿Eliminar la tarea «{título}»? | Esta acción no se puede deshacer. Si otra tarea depende de esta, no se podrá eliminar. | Eliminar tarea |
| Eliminar diario | ¿Eliminar el diario del {fecha}? | Esta acción no se puede deshacer. | Eliminar diario |
| Eliminar actividad | ¿Eliminar esta actividad? | Sus horas dejarán de contar en la dedicación del día. | Eliminar actividad |
| Eliminar reunión | ¿Eliminar la reunión «{título}»? | Esta acción no se puede deshacer. | Eliminar reunión |
| Eliminar asignación | ¿Eliminar la asignación de {persona} ({horas} h)? | Esta acción no se puede deshacer. | Eliminar asignación |
| Revocar rol | ¿Revocar este rol? | {usuario} perderá los permisos de ese rol en {proceso}. Para devolverlos, asigna el rol de nuevo. | Revocar rol |
| Enviar diario | ¿Enviar el diario a revisión? | Después de enviarlo no podrás editar sus actividades. | Enviar a revisión (tono default) |
| Enviar reporte semanal | ¿Enviar el reporte semanal? | Después de enviarlo no podrás editar sus secciones. | Enviar reporte (default) |
| Enviar plan | ¿Enviar el plan a autorización? | Mientras esté en autorización no podrás editar fases ni tareas. | Enviar a autorización (default) |
| Devolver solicitud (`ReasonDialog`) | Devolver solicitud | «{título}» volverá a triage con el motivo que indiques. | Devolver (danger) |
| Devolver plan | Devolver plan | El plan de «{título}» volverá a edición con el motivo que indiques. | Devolver (danger) |
| Marcar como no aplica | Marcar {GCn} como no aplica | Indica por qué este control no aplica a la solicitud. Quedará registrado. | Marcar como no aplica (default) |

### 13.4 Textos fijados por E2E

Deben existir exactamente (los que cambian se actualizan en el mismo cambio, §20): `h1` "Maestras" en `/catalogs` y ningún otro encabezado con "Maestras"; botones "Nuevo elemento", "Aplicar", "Crear", "Guardar cambios", "Editar", "Activar", "Desactivar"; opciones "Todos", "Activos", "Inactivos"; títulos de diálogo "Nuevo elemento" y "Editar elemento"; etiquetas "Etiqueta", "Orden", "Catálogo", "Código"; badges "Activo"/"Inactivo" con texto exacto; vacío "No hay elementos todavía."; "Catálogo y código son obligatorios."; "Ya existe un elemento con ese código en esta maestra."; en Activos, botón que contenga "Nuevo activo", etiqueta "Responsable" (única en el diálogo) y la persona "Beto Lider BI" en sus opciones. Ids `#filter-catalog`, `#filter-active`.

`getByText` y `getByLabel` de Playwright coinciden por subcadena y sin distinguir mayúsculas, así que en el diálogo de Maestras:

- Ningún otro texto contiene "Nuevo elemento", "Editar elemento" ni "Catálogo y código son obligatorios.". Por eso se reescribe la descripción de edición (§11.22).
- Ninguna otra etiqueta contiene "Catálogo", "Código", "Etiqueta" ni "Orden"; la del `Switch` es "Activo".
- En la página, ni `ResultCount` ("N elementos") ni los toasts repiten "No hay elementos todavía.". Los encabezados ordenables se llaman "Catálogo, ordenar", "Código, ordenar"…, pero son botones de la tabla, fuera del diálogo, y el E2E acota sus etiquetas al diálogo.

## 14. Accesibilidad (objetivo WCAG 2.2 AA)

- Contraste: tabla §5.1 (texto ≥4.5:1, bordes de campos e indicadores ≥3:1). Deshabilitados exentos; los campos de solo lectura se mantienen legibles.
- Foco: outline de 2 px `--ring` con offset 2 px (inset en ítems del menú y filas para no recortarse en contenedores con scroll); nunca `outline-none` sin alternativa. Visible en `forced-colors`.
- Teclado: orden lógico (skip link → menú → contenido); menús, pestañas, selects y diálogos con el comportamiento Radix (flechas, Escape, Home/End, foco atrapado y devuelto); radios con flechas; regiones de tabla desplazables enfocables; nada solo con hover; el foco no se pierde al paginar ni al reordenar fases (§7.6, §11.9).
- Estructura: un `h1` por página; secciones con `aria-labelledby`; menú sin encabezados y listas rotuladas; landmarks `aside` (menú lateral), `nav`, `header` (móvil) y `main#contenido`; `<html lang="es">`; títulos de documento únicos con plantilla.
- Formularios: `Label htmlFor` en todos los controles; obligatorios con asterisco `aria-hidden` + `aria-required` + `RequiredHint`; ayudas y errores enlazados con `aria-describedby`; `aria-invalid`; foco al primer error; errores solo al enviar.
- Estados y nombres: estados con texto (nunca solo color); `srDescription` como hermano sr‑only; iconos decorativos `aria-hidden`; icon‑buttons con `aria-label` + `LabelTooltip`, que repite el nombre sin describir el control (§6). Excepciones, sin tooltip y con su `aria-label`: los disparadores de menú y de cajón («Más acciones para…», «Abrir menú»), porque Radix les devuelve el foco al cerrarse y el tooltip se abriría solo, y los botones «Cerrar» de diálogo y cajón, que son convencionales; motivos de acciones no disponibles anunciados una sola vez, con el tooltip abierto o cerrado (`TooltipTarget`, §6 y §7.4); sin `aria-label` en elementos genéricos (se usan `role="group"` o texto sr‑only).
- Acciones no disponibles (4.1.2): `aria-disabled="true"` sobre el propio botón (`Button unavailable`), que conserva rol, nombre y foco; el motivo es su descripción (`aria-describedby`) y se ve en texto o en un tooltip que también se abre al pulsar, así que funciona en táctil. Nunca un `span` enfocable sin rol alrededor de un control deshabilitado. El atributo `disabled` queda para lo transitorio y para los casos evidentes de §10.3.
- Idioma (3.1.1 y 3.1.2): las etiquetas accesibles que traen las librerías también van en español: región de notificaciones "Notificaciones" y botón "Cerrar notificación" en sonner (§6), y "Cerrar"/"Cerrar menú" en diálogo y cajón.
- Regiones vivas mínimas (§7.2) y `role="status"`/`role="alert"` donde corresponde (WCAG 4.1.3).
- Objetivos: ≥24×24 px en puntero fino (botones `sm` 32 px, icon‑sm 32 px); ≥40 px con `pointer-coarse`. Botones de fila en tablas compactas: 28 px. Casillas siempre dentro de un `label` de 32 px de alto. Tarjetas de decisión de 44 px o más. Segmentos de valoración de 32 × 36 px como mínimo. Botones de paginación de 32 px.
- Movimiento: `prefers-reduced-motion` global y en spinners/skeletons; sin animaciones decorativas.
- Foco no tapado (2.4.11): por debajo de 1024 px la barra superior es fija, y `scroll-padding-top: 4.5rem` (§5.4) mantiene el foco y el destino de `scrollIntoView` fuera de ella. Las superposiciones (menús, select, tooltip) son temporales y se cierran con Escape.
- Grupos obligatorios (1.3.1, 3.3.2): los grupos de radio usan `FieldSet kind="radio"` (`role="radiogroup"`, `aria-required`, `aria-invalid` y `aria-labelledby` a la `legend`). Las listas de casillas obligatorias añaden "(obligatorio)" sr-only a la `legend`, porque `aria-required` no es válido en `group`.
- Nombre visible = nombre accesible (2.5.3): los botones con texto no llevan un `aria-label` distinto, y los campos con `Label` visible tampoco (el selector dev deja de llevar `aria-label="Usuario actual"`, §8.4). El riel usa dos botones alternados por CSS ("Contraer menú" con texto visible y "Expandir menú" solo icono, §8.4) en lugar de `aria-expanded`; solo el visible está en el árbol de accesibilidad. Los encabezados ordenables añaden ", ordenar" al final de su nombre, que sigue empezando por el texto visible.
- Tablas ordenables: `aria-sort` solo en la columna activa. El cambio de orden o de página no mueve el foco; `ResultCount` anuncia el resultado de los filtros.
- Reflujo a 320 px: sin desplazamiento horizontal de página; solo las tablas desplazan dentro de su región (excepción de tablas de datos de WCAG 1.4.10).
- Validación completa de WCAG requiere pruebas manuales con tecnologías de asistencia y revisión experta; este diseño fija las decisiones, no certifica.

## 15. Responsive

| Ancho | Shell | Cabecera | Toolbar | Tablas | Maestro‑detalle / mesa |
|---|---|---|---|---|---|
| <640 | Topbar + cajón | Acciones debajo, ancho natural | Cada filtro en una fila, ancho completo | Desplazamiento horizontal dentro de la región; primera columna `min-w-56` (`CellTitle`); la paginación pasa a dos líneas | Lista arriba, detalle debajo (foco al seleccionar); ficha debajo del formulario |
| 640–1023 | Topbar + cajón | Acciones a la derecha si caben | Filtros en línea con anchos fijos | Ídem | Ídem |
| 1024–1279 | Riel 56 px (o expandido por preferencia) | En línea | En línea | Más ancho útil (+184 px) | Maestro‑detalle en 2 columnas; ficha de la mesa debajo |
| ≥1280 | Sidebar 240 px | En línea | En línea | A todo el ancho hasta 1600 px | Formulario + ficha en 2 columnas; Controles con lateral |

Diálogos: `w-[calc(100%-1rem)]` y alto máximo `100dvh-2rem` con cuerpo desplazable en cualquier ancho.

## 16. Manejo de errores por operación

No existe infraestructura de logging en el cliente y no se añade: los errores se muestran al usuario y no se registran (no se agrega `console.error`).

| Operación | Fallo | Recuperable | Qué ve el usuario |
|---|---|---|---|
| Carga de datos de una vista | Red o HTTP (los wrappers lanzan errores de dominio con mensaje) | Sí | `ErrorState` con el mensaje + Reintentar (misma función `load` de hoy) |
| Carga complementaria (procesos, personas, catálogos, solicitudes para filtros) | Cualquier error | Sí, degradada | Nada bloquea: se usa `[]` como hoy; nombres caen a "—" o id corto; listas de selección vacías |
| Mutación (crear, editar, transición, aprobar, eliminar) | 400/403/404/409/red | Sí | Toast de error + `FormError` en el diálogo o formulario abierto; valores conservados; en Planificación el 409 de envío refresca la guía (como hoy) |
| Permisos (`/me/permissions`) | Error ≠ 401 | Sí | Menú: "No fue posible cargar tus permisos." + Reintentar (`reload`) |
| Sesión jwt | 401 en `/me/permissions` | No en la página | Redirección a `/login?expired=1`, con `next` salvo que la ruta sea `/inicio` (§8.7) |
| Recarga con sesión (jwt) | Identidad aún sin leer de `localStorage` | Sí, se espera | Pantalla "Cargando tu sesión…"; no se redirige hasta `identityReady` (§8.7) |
| `localStorage` inaccesible (jwt) | La lectura lanza | Sí | Se trata como «sin sesión»: `/login` (con `next`) |
| `next` inválido o externo en `/login` | — | Sí | Se ignora sin mensaje; destino `/inicio` (§8.7) |
| Lista de actores dev | Error | Sí (recargar página) | "No fue posible cargar los usuarios." (sin cambios) |
| `?requestId=` desconocido o fuera de la lista | — | Sí | Se ignora; `InlineNotice` info "La solicitud indicada no está disponible aquí." (Planificación usa el texto de §11.9) y el selector queda vacío; se limpia `?requestId=` de la URL (§7.9.1) |
| Preferencia del sidebar en `localStorage` | Lectura/escritura lanza o valor inválido | Sí | Modo `auto`; el botón sigue funcionando en memoria |
| Fuente Inter en el build | `next/font` no descarga | Fatal para el build | Se aplica el fallback de §4 (pila de sistema) y se documenta |
| Descarga `.md` | Error al leer contenido | Sí | Toast de error (sin cambios) |
| Excepción al pintar una pantalla | Error de JavaScript en un componente | Sí | `app/error.tsx`: "No fue posible mostrar esta pantalla" + "Reintentar" (`retry`); sin registro, porque no hay logging en el cliente |
| Fallo del layout raíz | Error en `RouteGuard` o en el shell | Sí (recargar) | `app/global-error.tsx` con "Reintentar" |
| URL sin ruta | — | Sí | `app/not-found.tsx`, estado 404 |

## 17. Validación de entradas externas

- `requestId` (query en Triage, Priorización, Planificación, Controles): opcional, string. Solo se usa si coincide exactamente con el `id` de una solicitud ya cargada en esa vista; nunca se envía al backend sin pasar por esa coincidencia. Si no coincide, se ignora y se limpia de la URL (§7.9.1, §16). La fuente de verdad de la selección es el estado local de la vista, no la URL.
- `next` (query de `/login`, solo jwt): opcional, string, 2048 caracteres como máximo. Solo se admiten rutas internas absolutas del mismo origen y distintas de `/login`, validadas con `safeInternalPath` (§8.7). Un valor inválido se ignora sin mensaje y el destino es `/inicio`. La capa responsable es el frontend, porque la navegación ocurre en el cliente; el backend no participa.
- `taskId` (Tareas): sin cambios (se pasa a `GET /tasks/:id`; 404/403 → `ErrorState`).
- `localStorage.sidebarCollapsed`: solo `'true'`/`'false'`; cualquier otro valor equivale a ausente. `actorId`, `authToken`, `authUser`: sin cambios.
- Filtros nuevos en cliente (§9 A: búsquedas de Solicitudes, Mi trabajo, Portafolio y Activos; Estado, Proceso y Prioridad de Solicitudes; Estado de Mi trabajo; Objeto y Acción de Auditoría):
  - La búsqueda es opcional y sin límite de longitud. Compara con `matchesSearch`: sin espacios en los extremos, sin distinguir mayúsculas ni tildes, «contenida en».
  - Los selects usan un valor centinela "Todos" (o "Todas") como en las vistas actuales, y sus opciones salen de los mapas de etiquetas o de los datos cargados. Un valor que no esté entre las opciones no puede llegar: no hay entrada libre.
  - El tamaño de página solo admite 25, 50 o 100.
- Formularios: se conservan exactamente las reglas cliente del inventario (obligatorios, enteros ≥0, progreso 0–100, hora HH:mm, límite de 200.000 caracteres, reglas por clasificación de actividad, etc.); solo cambia dónde se muestra el mensaje. "Ejecutor manual" en validaciones: obligatorio y recortado, sin validación de formato en cliente (el backend responde 400 si no es un id válido → "Revisa los datos ingresados.").
- Motivos (`ReasonDialog`): obligatorio, recortado, sin límite en cliente (el backend es la autoridad).

## 18. Invariantes y capa responsable

| Invariante | Capa que la garantiza | Rol de la UI |
|---|---|---|
| Autorización de cada operación | Backend (guards, alcance por proceso) | Filtra menú y secciones por `allowedModules` y grants como hoy (cosmético). Los deep links no saltan ningún gating: la vista destino aplica los mismos predicados. |
| Reglas del flujo (estados, transiciones, gates, guía del plan, score y banda) | Backend | Presenta datos de la API. Los predicados de UI existentes (`canDecide`, `canEvaluate`, `canEdit`, `ALLOWED_TRANSITIONS`, `nextStates`, `lockPerson`, `canChangeStatus`, `canReview`, `canManage`) se conservan literalmente, se extraen literalmente y se reutilizan para agrupar el selector, para el menú "Ir a…" y para el `RequirementsPanel`. Única excepción: "Agregar tarea" deja de usar `hasTasks`, que era una copia de la condición de "Eliminar fase" sin respaldo en el backend (§19.1). Los que usan varias vistas (`isTriageable`, `isPrioritizable`, `isPlannable` y `PLANNABLE_STATES`) van a `lib/request-state.ts`; el resto, a una función por vista. No se añaden predicados nuevos. Se elimina el cálculo de banda por score en Controles. |
| Score y banda | Backend | Se leen de `currentScore`, `priorityBand`, `band` y del prefijo de `priorityLabel`; nunca se calculan ni se previsualizan. |
| Etiquetas y tonos de estado | Frontend (`status-presentation.ts`) | Presentación pura; un valor desconocido se muestra con su código y tono neutral. |
| Doble modo de autenticación | `auth-mode.ts`, `actor-context.tsx`, `RouteGuard` | dev-header: sin cambios de lógica; solo cambia la ubicación visual del selector dev. jwt: única corrección funcional, la de §8.7 (esperar a hidratar la identidad, volver a la ruta de origen, `/login` con sesión → inicio). El token, la cabecera `Authorization`, el 401 → `expired=1` y el cierre de sesión no cambian. |
| Redirección tras iniciar sesión | `lib/safe-redirect.ts` | Solo rutas internas del mismo origen; nunca URLs externas (evita una redirección abierta). |
| Filtrado, orden y paginación de listados | Frontend (`useClientTable`) | Presentación sobre los datos que ya devuelve la API, en el alcance que ya aplica el backend; no amplía ni restringe lo que el usuario puede ver. |
| URLs y healthcheck | App Router | No se crean, mueven ni eliminan rutas; `/` redirige; `/catalogs` 200. |
| Integridad de datos en formularios | Backend | Validación cliente idéntica a la actual (guía de usabilidad, no autoridad). |
| Fechas: mostrar en UTC, proponer en local, editar en UTC | Frontend (`format.ts`, bloque de reglas de §7.9) | Una sola definición para todas las vistas. Afecta a la presentación y a los valores propuestos; el backend sigue validando y guardando las fechas como hoy. |

## 19. Hallazgos funcionales detectados (para el usuario)

Se corrigen por decisión del orquestador, con delegación del usuario (revisión de la iteración 2). Los dos cambios son solo del frontend:

1. Planificación: "Agregar tarea" (hoy "+ Tarea") se deshabilitaba cuando la fase ya tenía tareas (`disabled={busy || hasTasks}`, `plan-view.tsx` línea 418), así que cada fase admitía una sola tarea desde la UI.
   - Era una copia de la condición de "Eliminar" (línea 433). El backend no lo exige: `Task.phaseId` solo tiene `@@index([phaseId])`, y la carga de datos de prueba creó 33 tareas en 14 fases por la API real.
   - Cambio: `disabled={busy}`, sin motivo (§11.9).
   - "Eliminar fase" conserva `busy || hasTasks` con su motivo; `lockedInitial`, "Subir fase" y "Bajar fase" no cambian.
2. Los valores de fecha por defecto se calculaban con el calendario UTC:
   - "Hoy" en diario, novedad, reunión y compromiso (`toISOString().slice(0, 10)`).
   - El lunes actual (Reporte semanal), el mes actual (Capacidad) y el periodo por defecto del Panel del área y de Indicadores (`getUTC*`).
   - En UTC−5, después de las 19:00, proponían el día, la semana o el mes siguientes. Es la cara simétrica del punto 5.
   - Cambio: calendario local con las funciones `local*` de `format.ts` (§7.9, regla 2), calculadas en el cliente. No cambian el formato enviado a la API, el almacenamiento ni la conversión de fechas guardadas para editarlas.

Se conservan tal cual (requieren cambio de API):

3. Roles asignados: la API devuelve `roleId` sin código ni nombre de rol y no hay endpoint de roles, por lo que la tabla no puede mostrar el rol. Requiere cambio de API.
4. Textos de la API sin tildes (guía del plan para códigos desconocidos, condiciones/autoridades de gates, motivos de indicadores, `blockingReasons`, nombres de rol). Requiere cambio de API.

Se corrigen porque son solo presentación:

5. Fechas de calendario guardadas a medianoche UTC se mostraban un día antes en UTC‑5 → `formatDateOnly` con `timeZone: 'UTC'`.
6. Banda duplicada "P1 · P1 · …" en Controles → `PriorityBadge`.
7. Estados y toasts con códigos crudos en Activos y Documentos → etiquetas.
8. Claves React duplicadas en Mis permisos → `MODULE_ORDER`.
9. `window.prompt` para "No aplica" → `ReasonDialog` (mismo efecto: sin motivo no se envía).
10. Toasts en tema `system` → `light`.
11. El diálogo de devolución de planes decía "volverá a triage" → texto propio (vuelve a edición).
12. El estado `REVISADO` de diarios se mostraba como "Enviado" → "Revisado".
13. Planificación, "Solo mis tareas": comparaba `responsibleUserId` (UUID) con `actorId` (identificador, p. ej. `jefe@demo.local`) y nunca devolvía tareas → compara con `permissions.userId` de `GET /me/permissions` (§7.9.2). Es un filtro de presentación en cliente.
14. Sin `app/not-found.tsx` ni `app/error.tsx`, una URL inexistente o una excepción mostraban textos de Next en inglés → pantallas propias en español (§8.6).
15. Planificación con plan autorizado o en autorización: la guía decía "Listo para enviar" → no se muestra cuando el plan no es editable (§11.9).

Corrección funcional, no de presentación, pedida por el orquestador:

16. Modo jwt: recargar una ruta protegida con sesión válida llevaba a `/login`, y `/login` mostraba el formulario aunque hubiera sesión → el guard espera a hidratar la identidad, vuelve a la ruta de origen tras iniciar sesión (solo rutas internas) y `/login` con sesión lleva al inicio (§8.7). dev-header no cambia.

## 20. Pruebas y verificación

Comprobaciones con scripts reales del repositorio:

- Por incremento: `npm run typecheck:web`.
- Al cerrar cada fase: `npm run build:web` (con `packages/api-client` ya construido; si no, `npm run build:api-client`).
- Final: `npm run typecheck`, `npm run build`, `npm run test:unit` (backend sin cambios, debe seguir en verde) y `npm run test:e2e` (requiere `npm run db:up`, las migraciones aplicadas y el seed, `npm run prisma:seed --workspace apps/api`).
- Build Docker, al final. Comprueba que `next/font/google` descarga Inter dentro de la imagen y que `docker:prod:build` no se rompe:
  - Con Docker y `.env.production` disponibles: `npm run docker:prod:build`.
  - Si no hay `.env.production` (hoy no existe ni en el worktree ni en el checkout principal; solo `.env.production.example`, y no se crea uno para esto), se construye la imagen de web con el mismo Dockerfile, contexto y argumento que usa `compose.prod.yaml`: `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=/api -t control-phari-web:verificacion .` desde la raíz del worktree. Después, `docker image rm control-phari-web:verificacion`.
  - Si falla al descargar la fuente, se aplica el respaldo de §4. Si Docker no está disponible o el daemon no arranca, el informe final dice de forma explícita "Build Docker no verificado" y por qué.

E2E existentes:

- `e2e/catalogs.spec.ts`, cambios exactos y únicos: `'No hay elementos todavia.'` → `'No hay elementos todavía.'`; `getByLabel('Catalogo')` → `getByLabel('Catálogo')` (tres usos: alta, duplicado y verificación `toBeDisabled` en edición); `getByLabel('Codigo')` → `getByLabel('Código')` (tres usos); en el test de duplicado, `page.getByText('Ya existe un elemento con ese codigo en esta maestra.')` → `dialog.getByText('Ya existe un elemento con ese código en esta maestra.')` (el texto ahora aparece en el toast y en el `FormError`; acotarlo al diálogo evita la doble coincidencia); `'Catalogo y codigo son obligatorios.'` → `'Catálogo y código son obligatorios.'`. Nada más cambia (encabezado, botones, opciones, ids, badges). Con la validación de §9 (todos los errores a la vez), el test "el formulario requiere los campos obligatorios" ve además "La etiqueta es obligatoria." bajo su campo; su aserción sigue valiendo. La paginación de 25 no afecta: el test filtra por `E2E_CATALOG` y trabaja con dos filas.
- `e2e/responsible-selector.spec.ts`: sin cambios (§13.4).

E2E nuevo `e2e/shell-navigation.spec.ts`. Solo depende del seed (actores y permisos), como el resto de la suite, y no de los datos de prueba cargados a mano: el listado del paso 8 se sirve con un fixture. Usa el `storageState` del jefe y `addInitScript` para otros actores y preferencias, como el spec de responsables:

1. Escritorio 1440×900, jefe: `nav` "Navegación principal" contiene los grupos de §8.5 en orden; clic en "Solicitudes" → URL `/demanda/solicitudes`, el enlace tiene `aria-current="page"` y hay exactamente un `h1` ("Solicitudes").
2. Integrante (`integrante.bi@demo.local`): el menú no contiene "Triage", "Priorización", "Aprobaciones", "Planificación", "Indicadores", "Equipo y permisos" ni "Maestras"; sí contiene "Panel del área", "Mi trabajo", "Solicitudes" y "Capacidad" (permisos según `MODULE_MATRIX`).
3. `/seguimiento/tareas` marca "Mi trabajo" como activo; `/catalogs` marca "Maestras" y muestra el `h1` "Maestras".
4. Móvil 390×844: el `aside` "Menú lateral" no es visible. "Abrir menú" abre el diálogo "Menú principal". `dialog.getByRole('link', { name: 'Solicitudes' })` navega a `/demanda/solicitudes`, el diálogo se cierra y el foco vuelve a "Abrir menú". Los locators del cajón se acotan al diálogo, porque el sidebar de escritorio sigue en el DOM, oculto. Segundo caso, con la preferencia de riel guardada (`addInitScript` que fija `localStorage.sidebarCollapsed = 'true'`): con el cajón abierto, `focus()` en su enlace «Solicitudes» no abre ningún tooltip (`page.getByRole('tooltip')` con `toHaveCount(0)`), porque en el cajón `isRail` vale `false` (§8.3).
5. 1100×800 (riel por defecto): los enlaces conservan su nombre accesible. Hay un solo botón "Expandir menú" y ninguno "Contraer menú" (`toHaveCount(0)`: el oculto no está en el árbol de accesibilidad). Al pulsarlo con teclado (`focus()` + `Enter`), aparece "Contraer menú" con el foco (`toBeFocused()`), "Expandir menú" deja de existir y el texto "Solicitudes" del menú se ve. Tras recargar, el botón sigue siendo "Contraer menú" (preferencia persistida).
6. Teclado: el primer `Tab` en `/inicio` enfoca "Saltar al contenido" y `Enter` mueve el foco a `main#contenido`.
7. `/ruta-inexistente` responde 404 y muestra el `h1` "Página no encontrada" con el enlace "Ir al Panel del área".
8. Listado de Solicitudes con un fixture de 30 solicitudes (jefe). El seed no crea solicitudes y la CI parte de una base limpia, así que el paso no puede depender de la base. Se intercepta solo el `GET` del listado, con el mismo patrón que `date-display.spec.ts`: la petición llega a la API real, de modo que la autenticación, los permisos y CORS siguen siendo reales, y solo se sustituye el cuerpo.
   ```ts
   import type { Request } from '../apps/web/src/lib/api-client'; // solo tipo: el módulo no se evalúa
   // lib/requests.ts importa Request pero no lo reexporta; el tipo vive en lib/api-client.ts.
   const PROCESS_ID = '00000000-0000-4000-8000-000000000000'; // no existe: la columna Proceso muestra «—»
   const STATES = ['REGISTRADA', 'EN_TRIAGE', 'BACKLOG_PRIORIZADO', 'COMPROMETIDA', 'EN_EJECUCION', 'CERRADA'];
   const BANDS: Array<[number, string] | null> = [
     null,
     [84, 'P1 · Primera consideracion para compromiso'],
     [70, 'P2 · Programacion en el horizonte cercano'],
     [52, 'P3 · Planificacion ordinaria segun capacidad'],
     [30, 'P4 · Reserva de demanda, reformulacion o cierre motivado'],
   ]; // mismas glosas que devuelve la API
   function fakeRequest(i: number): Request {
     const n = String(i).padStart(2, '0');
     const at = new Date(Date.UTC(2026, 0, i, 12)).toISOString(); // registeredAt crece con i
     const band = BANDS[i % BANDS.length];
     return {
       id: `00000000-0000-4000-8000-0000000000${n}`,
       title: `Solicitud e2e ${n}`,
       registeredAt: at, createdAt: at, updatedAt: at,
       requesterArea: null, requesterName: null, functionalOwner: null, targetDate: null,
       referenceUrl: null, expectedResult: null, initialCommitmentDate: null, changeJustification: null,
       mainProcessId: PROCESS_ID, // string en el contrato: no admite null
       participants: [],
       operationalState: STATES[i % STATES.length],
       currentTriageDecision: band ? 'CONTINUAR' : null,
       currentScore: band ? band[0] : null,
       priorityLabel: band ? band[1] : null,
     };
   }
   const FIXTURE = Array.from({ length: 30 }, (_, i) => fakeRequest(i + 1));
   await page.route((url) => url.pathname.endsWith('/requests'), async (route) => {
     if (route.request().method() !== 'GET') return route.continue(); // el resto de métodos sigue a la API sin cambios
     const response = await route.fetch(); // estado y cabeceras reales (CORS incluido)
     await route.fulfill({ response, json: FIXTURE });
   });
   await page.goto('/demanda/solicitudes'); // la ruta se registra antes de navegar
   ```
   - Locators: `count = page.getByRole('group', { name: 'Filtros de solicitudes' }).getByRole('status')`, que es el `ResultCount`; `rows = page.getByRole('region', { name: 'Tabla de solicitudes' }).getByRole('row')`, donde la fila 0 es la de encabezados.
   - Conteo y paginación: `count` con `toHaveText('30 solicitudes')`. `getByRole('navigation', { name: 'Paginación de solicitudes' })` contiene "1–25 de 30 solicitudes" y "Página 1 de 2". Se usa `toHaveText` sobre `count`, y no `getByText('30 solicitudes')`, porque ese texto también está dentro de la paginación.
   - Sin resultados: `#sol-buscar` = "zzz sin coincidencias e2e" → `count` "0 de 30 solicitudes", se ve "Ningún resultado coincide con los filtros." y hay exactamente un botón "Limpiar filtros" (`toHaveCount(1)`, §7.2). Al pulsarlo, `#sol-buscar` queda vacío y `count` vuelve a "30 solicitudes".
   - Orden real, no solo el atributo: al cargar, el `columnheader` "Registro" tiene `aria-sort="descending"` y `rows.nth(1)` contiene "Solicitud e2e 30". Tras pulsar "Registro, ordenar": `"ascending"` y "Solicitud e2e 01". Tras otro clic: `"descending"` y "Solicitud e2e 30" (`nextSort`, §7.6). En todo momento hay un solo `th[aria-sort]` (`toHaveCount(1)`).
   - El paso no abre fichas ni menús: los ids del fixture no existen en la base.

E2E nuevo `e2e/date-display.spec.ts` (presentación con datos fijos):

- `test.use({ timezoneId: 'America/Bogota' })`. Se intercepta solo el `GET` de `/my-work`:
  ```ts
  await page.route('**/my-work', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(); // conserva estado y cabeceras CORS reales; la cadena de permisos sigue siendo real
    await route.fulfill({ response, json: [ITEM] });
  });
  ```
  `ITEM` se tipa con `import type { MyWorkItem } from '../apps/web/src/lib/api-client'` (solo tipo: ese módulo lanza un error al evaluarse sin `NEXT_PUBLIC_API_BASE_URL`, y un `import type` no lo evalúa) y lleva `title: 'Tarea de prueba de fecha (e2e)'` y `endDate: '2027-07-15T00:00:00.000Z'`, con el resto de campos obligatorios de `MyWorkItem` rellenos con valores ficticios.
- En `/mi-trabajo`, la fila de esa tarea contiene "15 jul 2027" y no contiene "14 jul 2027". Falla con el código actual (formato en hora local) y pasa con `formatDateOnly`.
- Prueba de la fecha propuesta, la regresión de §19.2, que hoy falla. Con la misma zona del archivo, `await page.clock.setFixedTime(new Date('2026-11-01T01:30:00Z'))` antes de navegar; en Bogotá es el 31 de octubre a las 20:30. Playwright 1.63, instalado en el repo, tiene `page.clock`.
  - En `/seguimiento/bitacora`, pulsar `getByRole('button', { name: 'Nuevo diario' }).first()`: si el actor no tiene diarios, el estado vacío repite la acción.
  - `#diario-date` debe valer `'2026-10-31'`. Hoy vale `'2026-11-01'`.
- Los dos tests usan el `storageState` del jefe, que tiene el módulo `log`. No crean datos: el diálogo se abre y se cierra con "Cancelar".

E2E nuevo `e2e/jwt-session.spec.ts` (regresiones de §8.7):

- `test.skip(process.env.E2E_AUTH_MODE !== 'jwt', 'Requiere la API y la web en modo jwt')`, para que la ejecución por defecto (dev-header) lo salte.
- `test.use({ storageState: { cookies: [], origins: [] } })`.
- Credenciales: `E2E_JWT_IDENTIFIER` (por defecto `jefe@demo.local`) y `E2E_JWT_PASSWORD`, la contraseña de desarrollo del seed (`DEV_PASSWORD` en `apps/api/prisma/seed.ts`). Se pasa por variable de entorno y no se copia en el spec; sin ella, el spec se salta con ese motivo.
- Ejecución: levantar la API con `AUTH_MODE=jwt` y la web con `NEXT_PUBLIC_AUTH_MODE=jwt` (la configuración de Playwright reutiliza servidores ya levantados fuera de CI) y ejecutar `npm run test:e2e -- e2e/jwt-session.spec.ts` con `E2E_AUTH_MODE=jwt`.
- El spec se escribe en el paso 0 de §21, antes de cualquier cambio visual. Por eso solo usa selectores que ya existen en el baseline y no cambian con el rediseño:
  ```ts
  async function signIn(page: Page): Promise<void> {
    await page.locator('#identifier').fill(IDENTIFIER);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
  }
  const mainHeading = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1 });
  const loginForm = (page: Page) => page.locator('#password');
  const expiredNotice = (page: Page) => page.getByRole('status').filter({ hasText: /expir/i });
  const logoutButton = (page: Page) => page.getByRole('button', { name: /Cerrar sesi[oó]n/ });
  ```
- Regla de orden: primero el contenido y después la URL. Tras `page.reload()`, la URL sigue siendo `/inicio` hasta que el cliente redirige, así que comprobarla primero pasaría en falso. El contenido (`mainHeading`) no aparece mientras el defecto existe: el guard pinta un mensaje sin `main` y luego `/login`, que en el baseline no tiene `main` ni `h1`. Desde el paso 3, `/login` sí tiene `main` + `h1` (§11.2); la comprobación de URL que sigue al contenido es la que mantiene la prueba válida si el defecto volviera.
- Casos:
  1. `goto('/login')`, `signIn` → `mainHeading` visible → URL `/inicio`. `page.reload()` → `mainHeading` visible → URL `/inicio`. Después, `goto('/seguimiento/portafolio')` → `reload()` → `getByRole('heading', { level: 1, name: 'Portafolio' })` visible (el `h1` ya es ese hoy) → URL `/seguimiento/portafolio`. Es la reproducción del defecto: debe fallar antes del arreglo.
  2. Sin sesión, `goto('/demanda/solicitudes')` → `loginForm` visible → URL `/login?next=%2Fdemanda%2Fsolicitudes`. `signIn` → `mainHeading` visible → URL `/demanda/solicitudes`.
  3. Con sesión, `goto('/login')` → `mainHeading` visible → URL `/inicio` y `loginForm` con `toHaveCount(0)`.
  4. `goto('/login')`, `page.evaluate` que guarda `authToken = 'token-invalido'` y un `authUser` válido, y `goto('/inicio')` → `expiredNotice` visible → URL `/login?expired=1`.
  5. `goto('/login?next=https%3A%2F%2Fejemplo.invalid')` y también con `next=%2F%2Fejemplo.invalid`; `signIn` → `mainHeading` visible → URL `${baseURL}/inicio`, en el mismo origen.
  6. Con sesión, `logoutButton` → `loginForm` visible → URL `/login`, sin `next`, y `localStorage.authToken` vacío. Un `goto('/inicio')` posterior → `loginForm` visible → URL `/login`.
- Endurecimiento posterior, en el mismo commit que cambia cada texto (§21):
  - Paso 3 (login): el caso 4 comprueba el texto exacto "La sesión expiró. Vuelve a iniciar sesión."; los casos 2 y 6, el `h1` "Iniciar sesión".
  - Paso 4 (a) (Panel del área): `mainHeading` pasa a `getByRole('heading', { level: 1, name: 'Panel del área' })` en los casos 1, 3 y 5.
  - Los ids del formulario y el botón "Ingresar" no cambian en ningún paso.

Pruebas de utilidades `e2e/web-lib.spec.ts`. Usan el runner de Playwright sin el fixture `page`, así que no abren navegador. Importan con rutas relativas los módulos puros de §7.9.2 y `MODULE_KEYS` de `apps/api/src/modules/auth/module-matrix.ts`, que solo depende del enum `RoleCode`; es el mismo patrón de `catalogs.spec.ts`, que importa de `apps/api/test-utils`.

- `format.ts`. El bloque fija la zona del proceso: `test.beforeAll(() => { prevTz = process.env.TZ; process.env.TZ = 'America/Bogota'; })` y, en `test.afterAll`, restaura el valor anterior (o borra la variable si no existía), porque el worker es compartido. Node 24 aplica el cambio de `TZ` en caliente también en Windows; se comprobó en esta máquina con `Intl` y `getTimezoneOffset`. Así los fallos de UTC frente a hora local se detectan en cualquier máquina, también en una CI en UTC.
  - `formatDateOnly('2027-07-15T00:00:00.000Z')` y `formatDateOnly('2027-07-15')` → "15 jul 2027".
  - `formatDate`, `formatDateTime` y `formatDateOnly` con `null` o `''` → "—"; con `'no-es-fecha'` → `'no-es-fecha'`.
  - `formatHours(40)` → `'40\u00a0h'`; `formatHours(37.5)` → `'37,5\u00a0h'`; `formatHours(-10)` → `'\u221210\u00a0h'`; `formatHours(-2.5)` → `'\u22122,5\u00a0h'`; `formatHours(-0)` → `'0\u00a0h'`; `formatPercent(45)` → `'45\u00a0%'`.
  - `formatMonth('2026-10')` → "octubre de 2026". Sin `timeZone: 'UTC'` daría «septiembre de 2026» en Bogotá; comprobado con Node 24, ICU 78.3.
  - `formatCount(1, { one: 'pendiente', other: 'pendientes' })` → `'1 pendiente'`; con 0 → `'0 pendientes'`; con 3 → `'3 pendientes'`; `formatCount(1, { one: 'validación', other: 'validaciones' })` → `'1 validación'`; `formatCount(12345, …)` → `'12.345 pendientes'`.
  - Valores por defecto (regla 2), con fechas construidas en hora local:
    - `localDateInputValue(new Date(2026, 9, 31, 21, 30))` → `'2026-10-31'`. La implementación de hoy daría `'2026-11-01'`.
    - `localMonthInputValue(new Date(2026, 9, 31, 21, 30))` → `'2026-10'`.
    - `localWeekMondayInputValue(new Date(2026, 10, 1, 20, 0))` → `'2026-10-26'`. Es domingo y pasa al lunes anterior. Con el sábado `new Date(2026, 9, 31)` también da `'2026-10-26'`, y con el lunes `new Date(2026, 10, 2, 8, 0)`, `'2026-11-02'`.
    - `localMonthPeriod(new Date(2026, 9, 31, 21, 30))` → `{ from: '2026-10-01', to: '2026-11-01' }`; `localMonthPeriod(new Date(2026, 11, 31, 23, 0))` → `{ from: '2026-12-01', to: '2027-01-01' }`.
- `navigation.ts`:
  - `MODULE_ORDER` tiene 21 claves únicas y su conjunto es igual a `MODULE_KEYS` del backend. `MODULE_LABELS` tiene etiqueta para cada clave.
  - Los `href` de `NAV_GROUPS` son exactamente las 23 rutas de §8.5, lo que protege las URLs. Todo `moduleKey` del menú está en `MODULE_ORDER`.
  - `getVisibleNavGroups(new Set(['dashboard']))` deja un solo grupo, con `/inicio`; `getVisibleNavGroups(new Set())` → `[]`. Con las claves que `MODULE_MATRIX` da a `INTEGRANTE` no aparecen Triage, Priorización, Aprobaciones, Planificación, Indicadores, Equipo y permisos ni Maestras.
  - `isNavItemActive` marca "Mi trabajo" en `/seguimiento/tareas` y "Maestras" en `/catalogs`; marca "Solicitudes" en `/demanda/solicitudes/x` y no en `/demanda/solicitudesx`.
- `status-presentation.ts`:
  - `getStatus('request', 'X')` → `{ label: 'X', tone: 'neutral' }`; `getStatus('request', null).label` → "—"; `getStatus('log', 'REVISADO').label` → "Revisado".
  - `parseBand('P2 · Programacion en el horizonte cercano')` → `'P2'`; `parseBand('P10')`, `parseBand('Sin priorizar')` y `parseBand(null)` → `null`.
  - `routeLabel('SIMPLIFICADA', [{ code: 'SIMPLIFICADA', label: 'Ruta simplificada' }])` → "Ruta simplificada"; `routeLabel('EXPLORACION', [])` → "Exploración"; `routeLabel('OTRA', [])` → "OTRA"; `routeLabel(null, [])` → "—".
- `plan-guide.ts`: cada uno de los 8 códigos produce su texto y su acción (§10.2). Un código desconocido devuelve el `message` de la API y `action: null`. Un `targetId` que no está en los datos cargados devuelve el `message` de la API. `guideCategoryLabel('datesPhases')` → "Fases y fechas".
- `request-state.ts`:
  - `isTriageable` solo con `REGISTRADA`.
  - `isPrioritizable` con `CONTINUAR` + `EN_TRIAGE` o `BACKLOG_PRIORIZADO`, y no con `DEVOLVER` ni con `COMPROMETIDA`.
  - `isPlannable` con los tres estados de `PLANNABLE_STATES` y no con `BACKLOG_PRIORIZADO`.
- `task-filters.ts`: con `mineUserId` igual al `responsibleUserId`, la tarea pasa; con otro id, no. Con `mineUserId: null` no filtra por responsable. `q` no distingue mayúsculas. `'ALL'` no filtra.
- `table-sort.ts`:
  - `compareText` ordena "Árbol" junto a "arbol" y "Item 2" antes que "Item 10".
  - Los vacíos quedan al final en las dos direcciones.
  - `sortRows` es estable y con `sort: null` devuelve el orden recibido.
  - `paginate(45 filas, 2, 25)` → `from: 26, to: 45, pageCount: 2`; una página fuera de rango se acota; sin filas → `pageCount: 1, from: 0, to: 0`.
  - `matchesSearch('Priorización de demanda', ' priorizacion ')` → `true`.
  - `nextSort`, con `def = { key: 'registeredAt', direction: 'desc' }`:
    - `nextSort(null, 'title', def)` y `nextSort(def, 'title', def)` → `{ key: 'title', direction: 'asc' }`.
    - `nextSort({ key: 'title', direction: 'asc' }, 'title', def)` → `{ key: 'title', direction: 'desc' }`.
    - `nextSort({ key: 'title', direction: 'desc' }, 'title', def)` → `def`.
    - `nextSort(def, 'registeredAt', def)` → `{ key: 'registeredAt', direction: 'asc' }`, la columna del orden por defecto llega a ascendente. Desde ahí, otro clic da `def`.
    - Con `defaultSort` `null`: `nextSort({ key: 'title', direction: 'desc' }, 'title', null)` → `null`.
- `safe-redirect.ts`:
  - `safeInternalPath('/seguimiento/plan?requestId=abc')` → la misma ruta.
  - `null` para `'https://ejemplo.invalid'`, `'//ejemplo.invalid'`, `'/\\ejemplo.invalid'`, `'/\t/ejemplo.invalid'`, `'javascript:alert(1)'`, `'/login'`, `'/login?next=/x'`, `''` y `null`.
  - `postLoginPath(new URLSearchParams('next=%2Fdemanda%2Ftriage'))` → `'/demanda/triage'`; con `'expired=1'` → `'/inicio'`; con `'next=https%3A%2F%2Fejemplo.invalid'` → `'/inicio'`.

Se ejecutan con el resto de la suite (`npm run test:e2e`) o por archivo (`npm run test:e2e -- e2e/web-lib.spec.ts`). La configuración levanta igualmente la API y la web.

Verificación manual en navegador (Chromium, ambos modos de auth: `NEXT_PUBLIC_AUTH_MODE` ausente y `jwt`), con actores jefe, líder BI e integrante:

- Recorrer las 26 rutas en 1440, 1100 y 390 px: sin solapes, recortes ni scroll horizontal de página; tablas desplazables dentro de su región.
- Comparar con `screenshots/before-same-data/` (mismo dataset), en especial Solicitudes. Comprobar: filas de 40 px; Prioridad en una línea ("84 P1", el número y el badge sin separador); leyenda de bandas una sola vez; títulos de dos líneas como máximo; sin "Editar" repetido; búsqueda, filtros, orden, conteo y paginación funcionando con unas 45 filas.
- A 390 px: al recorrer una página con Shift+Tab, el foco nunca queda bajo la barra superior. Al elegir un registro en maestro‑detalle, el encabezado del detalle queda visible (WCAG 2.4.11).
- En jwt: las regresiones (a)–(f) de §8.7 también a mano, con F5 real en `/inicio`, `/seguimiento/plan?requestId=…` y `/gobierno/auditoria`. En dev-header: cambio de actor desde el selector del menú y desde el cajón móvil, con la recarga de permisos como hoy.
- `/ruta-inexistente` y una excepción forzada con React DevTools (alternar el error boundary) muestran las pantallas de §8.6 en español.
- Flujos: registrar solicitud → triage (Continuar) → priorizar → aprobar → crear plan → resolver pendientes desde el panel → enviar → autorizar → actualizar estado de tarea con predecesora pendiente (ver bloqueo) → registrar validación → aprobar GC4 cuando proceda; bitácora (crear, agregar actividad, enviar con confirmación); documentos (crear, nueva versión, historial, descargar, publicar); capacidad (registrar disponibilidad, provocar el 409 y usar "Editar la existente").
- Estados vacío/carga/error (con la API detenida para forzar error y "Reintentar"), textos largos (títulos de 150 caracteres, nombres largos de proceso), solo teclado (menú, menús de fila, pestañas, diálogos, radios), zoom 200 % y 400 %, `prefers-reduced-motion` y modo de alto contraste de Windows.
- Correcciones de las iteraciones 3 y 4:
  - Planificación (§19.1): en una fase que ya tiene tareas, "Agregar tarea" está habilitado y crear una segunda tarea desde la UI funciona. "Eliminar fase" sigue no disponible con su motivo.
  - Fechas por defecto (§19.2): con el reloj del sistema en UTC−5 después de las 19:00, o con la regresión de `date-display.spec.ts`, "Nuevo diario", novedad, reunión y compromiso proponen el día local; el reporte semanal, el lunes local; Capacidad, el mes local; el Panel del área e Indicadores, el periodo del mes local.
  - Acciones no disponibles: en un plan con dos fases o más y la fase inicial con tareas, "Bajar fase" de esa fase se alcanza con Tab, se anuncia con su nombre, "no disponible" y el motivo, y al pulsar (también a 390 px con emulación táctil) muestra el tooltip con el nombre y el motivo sin ejecutar nada. "Subir fase" de esa misma fase está deshabilitado sin motivo (límite natural, §10.3) y la nota bajo el nombre explica el bloqueo.
  - Tooltips y lector de pantalla (NVDA en Chromium): un botón solo‑icono disponible ("Subir fase" de otra fase, "Expandir menú") se anuncia con su nombre, sin repetirlo como descripción al abrirse el tooltip; "Bajar fase" bloqueado anuncia el motivo una sola vez, con el tooltip cerrado y abierto (`TooltipTarget`, §6).
  - Controles de gobierno, GC4 (si el dataset no tiene el caso, se crea vía API y se registra en el manifiesto, como indica la sección de datos de prueba):
    - Un GC4 marcado «No aplica» con `approvable: false` (ruta Completa o Simplificada sin la validación obligatoria) no muestra el panel ni la fila de acciones. Quedan el badge, "No aplica: {motivo}" y la línea de resumen.
    - Un integrante con GC4 bloqueado ve el panel con sus motivos y "Ver validaciones", sin fila de acciones y sin "Resuelve los motivos de la lista…".
    - Un líder con GC4 bloqueado alcanza con Tab "Aprobar GC4" no disponible; el lector anuncia el título y el contador del panel y el motivo.
  - Ruta proporcional: sin `canReview` se ve solo "Actual: {ruta}" o "Sin ruta asignada.", sin selector; con `canReview`, el selector `governance-route` y "Guardar ruta".
  - Selector dev: su nombre accesible es "Usuario actual (dev)", igual que la etiqueta visible.
  - Foco con teclado: tras "Bajar fase" en una fase intermedia, el foco vuelve a "Bajar fase" de esa misma fase, ya en su nueva posición; si llegó a la última, pasa a su "Subir fase". En Solicitudes, al llegar a la última página con "Página siguiente", el foco pasa a "Página anterior". Al cerrar el menú «Más acciones» o el cajón no aparece ningún tooltip.
  - Contenido largo: un ítem de menú con motivo en dos líneas no se recorta. El título largo de un diálogo ("¿Eliminar la asignación de Beto Lider BI (40 h)?" en `sm`, "Historial de versiones — {título}" en `xl`) no queda debajo del botón cerrar.
  - Copys: con un solo elemento se lee "1 pendiente", "1 pendiente de triage", "1 validación" y "1 bloqueante sin resolver". En Capacidad, "Libre" negativo se ve como "−10 h".
  - Accesibilidad de librerías: la región de toasts se anuncia como "Notificaciones" y el botón de cerrar de cada toast como "Cerrar notificación".
  - Documentos: al elegir "Descargar .md" en el menú, el trigger "Más acciones" de esa fila muestra el spinner hasta que termina la descarga.
  - Controles de gobierno: el orden de lectura (Tab y lector) recorre las pestañas y los controles antes que "Ruta proporcional", igual que el orden visual.
- Capturas posteriores con `.agents/tasks/ui-redesign/scripts/capture-baseline.cjs <outDir>` (p. ej. `screenshots/after`) para comparar con el baseline; `consoleErrors` debe ser 0 (hoy Mis permisos tiene 3).
- Comprobar en el CSS generado que existen `text-meta`, `bg-neutral-subtle`, `text-neutral` y la variante `rail:`.

Datos de prueba (autorizados por el usuario; registro en `.agents/tasks/demo-data/manifest.json`, cargados por la API real en la base compartida: 19 solicitudes según el manifiesto, en todas las etapas y bandas P1–P4 (la base compartida conserva además solicitudes anteriores al dataset, por eso las capturas de §2 muestran unas 45 filas), planes con tareas en todos los estados, capacidad con sobrecarga y sin disponibilidad, bitácora, reuniones, compromisos, activos, documentos y gates con bloqueos):

1. Las capturas y la QA deben aprovecharlos: tablas con muchas filas, textos largos, bloqueos y estados vacíos (con filtros sin resultados o con el actor `lider.ia@demo.local`, cuyo alcance es solo IA).
2. Si hace falta un caso de borde que no exista, se crea vía API con textos en UTF‑8 desde Node (no desde PowerShell, que rompe la codificación) y se registra en ese mismo `manifest.json`.
3. Esos datos no se borran; la limpieza se hará después.
4. Sigue prohibido borrar o modificar datos que no estén en el manifiesto.

Qué se automatiza y qué no:

- Las utilidades que corrigen fallos o deciden navegación quedan cubiertas por `e2e/web-lib.spec.ts` (formatos, conteos, valores por defecto de fecha, orden, paginación, navegación, guía del plan y redirecciones), `e2e/date-display.spec.ts` (fecha mostrada y fecha propuesta en el navegador) y `e2e/jwt-session.spec.ts`.
- Los dos botones del riel se cubren con el paso 5 de `shell-navigation.spec.ts` (nombre accesible y foco), y la ausencia de tooltips en el cajón, con el segundo caso del paso 4. `DisabledHint`, `aria-disabled` y los paneles de GC4 dependen de datos concretos (una fase inicial con tareas, un GC4 bloqueado o dispensado), así que se verifican a mano en la QA de esta sección, igual que el anuncio real en lectores de pantalla.
- Ningún spec depende de los datos de prueba cargados a mano: los listados que necesitan filas (`date-display.spec.ts` y el paso 8 de `shell-navigation.spec.ts`) interceptan solo el `GET` y responden con un fixture. Todos sí dependen del seed (actores, procesos y permisos), como los specs actuales.
- Se usa el runner de Playwright porque ya está en el stack. La estrategia del repositorio reserva Jest al backend, y añadir Jest a `apps/web` exigiría dependencias y configuración nuevas.
- La conformidad visual, el contraste en pantalla y el comportamiento con lectores de pantalla se verifican a mano: el repositorio no tiene herramientas de regresión visual ni de accesibilidad, y no se añaden.

## 21. Orden de implementación sugerido

0. Defecto del shell (§8.7), antes que nada visual:
   - Reproducirlo en jwt con `e2e/jwt-session.spec.ts`, escrito con los selectores estables de §20 y comprobando el contenido antes que la URL; el caso 1 debe fallar.
   - Corregir `actor-context.tsx`, `route-guard.tsx` y `login-form.tsx` y añadir `lib/safe-redirect.ts` con sus pruebas en `e2e/web-lib.spec.ts`.
   - Confirmar las regresiones (a)–(f) en jwt (los seis casos en verde) y que la suite por defecto (dev-header) sigue en verde.
   - Va en su propio commit, separable del rediseño.
1. Fundaciones: dependencias con el control del lockfile (§4), `globals.css` (§5.4), Inter y `metadata` en `layout.tsx`, `next.config.ts`, y primitivas restyled y nuevas (§6, incluidas `radio-cards.tsx`, `segmented-radio.tsx`, las props `unavailable`/`onUnavailableClick` de `Button` y `TooltipTarget`/`LabelTooltip` en `tooltip.tsx`). La app sigue funcionando con las vistas actuales (alias de `Badge`).
2. Componentes compartidos y utilidades (§7) con las etiquetas corregidas en `lib/*.ts`:
   - Módulos puros y predicados de §7.9.2, `table-sort.ts` (con `nextSort`), `use-client-table.ts`, `data-table.tsx` y `disabled-reason.tsx`.
   - `e2e/web-lib.spec.ts`. Primero las pruebas que reproducen fallos (`formatDateOnly`, `formatMonth`, `formatHours` negativo, `local*`, `matchesTaskFilters`, `nextSort` sobre la columna por defecto) y después las correcciones.
   - Valores de fecha por defecto (§19.2): sustituir las funciones locales (`today`, `currentMonday`, `currentMonth`, `monthStart`, `nextMonthStart`) de los ocho archivos de la tabla de §7.9 por las `local*` de `format.ts`, con el cálculo tras el montaje en Panel del área, Indicadores y Capacidad. Es un cambio mecánico e independiente del rediseño visual. Antes del cambio se crea `e2e/date-display.spec.ts` con la prueba de la fecha propuesta en «Nuevo diario» (§20), que debe fallar antes y pasar después.
3. Shell y navegación (§8): `navigation.ts`, `app-shell`, `app-sidebar` (ids por variante, `onNavigate`, botones alternados del riel), `mobile-nav`, `skip-link`, `brand`, `RouteGuard` (sobre el arreglo del paso 0), login (§11.2), `app/not-found.tsx`, `app/error.tsx` y `app/global-error.tsx` (§8.6).
   - E2E de navegación.
   - `jwt-session.spec.ts`: en el mismo commit del login, el caso 4 pasa al texto exacto "La sesión expiró. Vuelve a iniciar sesión." y los casos 2 y 6 comprueban el `h1` "Iniciar sesión" (§20).
   - Se añade a `e2e/date-display.spec.ts` la prueba de la fecha mostrada en Mi trabajo (§20): debe fallar antes de migrar Mi trabajo y pasar después.
4. Pantallas por bloques: (a) Panel, Mi trabajo, Indicadores, Proyectos, y en el mismo commit `jwt-session.spec.ts` pasa a `h1` "Panel del área" en los casos 1, 3 y 5; (b) Solicitudes, Triage, Priorización, Aprobaciones; (c) Planificación (incluido "Agregar tarea" con `disabled={busy}`, §19.1), Tareas, Capacidad, Portafolio; (d) Bitácora, Reporte semanal, Novedades, Reuniones, Compromisos; (e) Activos, Documentos; (f) Controles de gobierno, Auditoría, Mis permisos; (g) Equipo, Maestras + ajuste de `e2e/catalogs.spec.ts`.
5. Enlaces entre pasos: `useRequestIdParam` en las cuatro mesas de trabajo (con `Suspense` y `PageFallback` en sus `page.tsx`, §7.9.1), menú "Ir a…" de Solicitudes, "Ver plan" en Aprobaciones y acciones de toast.
6. Limpieza (alias de `Badge` sin uso, `under-construction.tsx`, `formatDate` locales), `docs/README.md` y verificación completa (§20), incluido el build Docker o la constancia explícita de que no se pudo verificar. En `docs/README.md`:
   - Frontend: dependencias de apps/web, cómo cambiar el acento y el logo, respaldo de la fuente y modo oscuro futuro.
   - Sección «Testing (Jest + Playwright)», que hoy dice «Jest (solo apps/api)», nombra solo `e2e/catalogs.spec.ts` y afirma que la suite valida la cadena completa hasta PostgreSQL. Se actualiza con:
     - La lista de specs: los dos actuales (`catalogs.spec.ts`, `responsible-selector.spec.ts`) y los cuatro nuevos (`shell-navigation.spec.ts`, `date-display.spec.ts`, `jwt-session.spec.ts` y `web-lib.spec.ts`), con una línea sobre qué cubre cada uno.
     - La excepción a la estrategia de `.kiro/steering/30-pruebas.md`, que reserva Playwright a los flujos E2E críticos. `web-lib.spec.ts` prueba funciones puras de `apps/web/src/lib` con el runner de Playwright y sin el fixture `page`, así que no abre navegador. Se eligió porque Jest solo está configurado en `apps/api` y llevarlo a `apps/web` exigiría dependencias y configuración nuevas. Los módulos que importa son puros (§7.9.2).
     - Que `date-display.spec.ts` y el paso 8 de `shell-navigation.spec.ts` interceptan solo el `GET` de un listado (`page.route` + `route.fetch()` + `route.fulfill({ response, json })`). La petición pasa igualmente por la API real, con autenticación, permisos y CORS, y solo se sustituye el cuerpo por un fixture. Por eso no dependen de los datos de la base.
     - Cómo ejecutar `jwt-session.spec.ts`. Se salta salvo que `E2E_AUTH_MODE=jwt`. Necesita `E2E_JWT_PASSWORD`, la contraseña de desarrollo del seed (`DEV_PASSWORD` en `apps/api/prisma/seed.ts`; ni el spec ni la documentación la copian), y admite `E2E_JWT_IDENTIFIER` (por defecto `jefe@demo.local`). Antes hay que levantar la API con `AUTH_MODE=jwt` y la web con `NEXT_PUBLIC_AUTH_MODE=jwt`, porque fuera de CI Playwright reutiliza los servidores que ya están en marcha. Después, `npm run test:e2e -- e2e/jwt-session.spec.ts`.
     - Que toda la suite necesita los actores del seed (`npm run prisma:seed --workspace apps/api`) y que la CI actual no ejecuta el seed (§22).

## 22. Fuera de alcance y limitaciones

- Cualquier cambio en `apps/api`, Prisma, OpenAPI o el cliente generado. Incluye los textos de la API sin tildes, la columna Rol en roles asignados, la gestión de faltantes de gates desde la UI y la paginación, el orden o los filtros en el servidor: los listados filtran, ordenan y paginan en cliente sobre lo que ya devuelve la API (§9 A).
- Persistir filtros, orden o página en la URL o en `localStorage`.
- Selector de tema claro/oscuro (el bloque `.dark` queda listo y documentado).
- Identidad corporativa definitiva (logo y color): hay un único punto de cambio para cada uno.
- Nuevas funcionalidades: búsqueda global, paleta de comandos, notificaciones, vistas tipo tablero, edición en línea en tablas, exportaciones.
- Los hallazgos 3 y 4 de §19, porque requieren cambios en la API. Los hallazgos 1 y 2 ya no están fuera de alcance: se corrigen (§19).
- Sin investigación adicional de referencias en esta fase: se usaron las cinco referencias ya investigadas.
- Comportamiento real con lectores de pantalla y en dispositivos táctiles físicos: el diseño fija el marcado (ARIA, `aria-disabled`, regiones vivas), pero solo se puede confirmar con pruebas manuales (§14 y §20).
- La CI (`.github/workflows/ci.yml`) aplica `prisma migrate deploy` sobre una base limpia y no ejecuta el seed. En cambio, todos los specs E2E, los actuales y los nuevos, usan actores del seed: el `storageState` envía `X-Actor-Id: jefe@demo.local`, y un actor que no existe recibe 401 (`actor-resolver.ts`). Leído en el código, no ejecutado. Añadir el seed a la CI queda fuera de este trabajo, que es solo de frontend, y se informa al usuario. Los specs nuevos no añaden otra dependencia de datos: los listados que necesitan filas usan fixtures (§20).

## 23. Respuestas a la revisión de diseño (iteración 3 → 4)

Fuente: `design-review.md` y `design-review.json` de la iteración 3 (CHANGES_REQUESTED: 0 HIGH, 2 MEDIUM, 6 NIT). Los 8 hallazgos se atienden en el cuerpo del documento; ninguno se pospone ni se descarta. Esa misma revisión comprobó uno por uno los 22 hallazgos de la iteración 2 y los dio por atendidos, así que su tabla de respuestas se retira de aquí, como se hizo con la de la iteración 1.

| # | Sev. | Decisión | Dónde | Respuesta |
|---|---|---|---|---|
| 1 | MEDIUM | Atendido | §10.2 (Controles GC4), §11.18, §10.3, §20 | Las tres condiciones de la corrección están en un bloque único de §11.18, que §10.2 cita: `isWaived`, `showGc4Block = isGc4 && summary !== null && !summary.approvable && !isWaived` (panel para cualquier rol) y `showActions = canReview && approvableGate && !isWaived`. Dentro de la fila, «Aprobar GC4» va `unavailable` con `aria-describedby="GC4-block-summary GC4-block-reason"`, y `DisabledReason` solo aparece si hay panel; sin fila no hay motivo. En «No aplica» no hay panel ni fila: quedan el badge, el motivo y el resumen. La QA manual incluye los dos casos pedidos y el del líder. Verificado en `gate-check.service.ts`: `approvable = blockingReasons.length === 0` se calcula con las validaciones y la ruta, sin el estado del control. En el contrato, `validationSummary` es `GateValidationSummaryDto \| null`, así que `summary !== null` es la comprobación correcta. |
| 2 | MEDIUM | Atendido, con dos ajustes | §20 (paso 8, cabecera del spec, «Qué se automatiza»), §11.5 | Se intercepta el `GET` del listado con `route.fetch()` + `route.fulfill({ response, json })` y 30 solicitudes ficticias («Solicitud e2e 01…30», `registeredAt` crecientes, estados y bandas variados). Se comprueban «30 solicitudes», «1–25 de 30 solicitudes» y «0 de 30 solicitudes» con un solo «Limpiar filtros». Además de `aria-sort`, se comprueba el orden real de la primera fila (30 → 01 → 30). Los dos ajustes sobre la propuesta están verificados en el código. Primero, `Request` se importa como tipo desde `lib/api-client.ts`, porque `lib/requests.ts` lo importa pero no lo reexporta. Segundo, `mainProcessId` es `string` en el contrato, así que se usa un UUID que no existe (la columna Proceso muestra «—») en lugar de `null`. El conteo se lee por rol dentro del toolbar «Filtros de solicitudes» (nombre fijado en §11.5), porque «30 solicitudes» también aparece dentro de la paginación. La cabecera del spec ya no habla de «datos del entorno». |
| 3 | NIT | Atendido | §8.3, §20 (paso 4) | `const isRail = variant === 'drawer' ? false : mode.isRail;` en `AppSidebar`. El paso 4 del E2E lo comprueba con la preferencia `rail` guardada: al enfocar un enlace del cajón no aparece ningún `role="tooltip"`. |
| 4 | NIT | Atendido | §10.2 (Planificación, fase), §10.3, §11.9, §20 | Cálculo por fila explícito, que reparte las mismas condiciones de hoy, y una regla general de precedencia en §10.3: primero el límite natural, después la regla con motivo (también con `busy`, para no perder el foco) y por último lo transitorio. Verificado que la API devuelve las fases por `order` ascendente (`phase.service.ts`). La fase inicial siempre es la primera, así que su «Subir fase» es límite natural, y la QA usa «Bajar fase». |
| 5 | NIT | Atendido | §8.4, §14, §20 | `SelectTrigger` sin `aria-label`; el nombre sale del `Label htmlFor` («Usuario actual (dev)»). Verificado que ningún spec lo usa. |
| 6 | NIT | Atendido | §11.18, §10.3, §20 | Sin `canReview`, solo «Actual: {routeLabel}» o «Sin ruta asignada.»; el `Select` `governance-route` existe solo para quien revisa. §10.3 pasa a decir «por rol o por estado», con este caso como ejemplo. |
| 7 | NIT | Atendido | §7.4, §10.1, §10.2 (Triage) | Respaldos `doneTitle ?? title` y, por simetría, `doneDescription ?? description`. La variante (a) de Triage pasa sus textos en `doneTitle` y `doneDescription`, y repite el de `doneTitle` en `title`, que es obligatorio. |
| 8 | NIT | Atendido | §21 (paso 6), §20, §22 | El paso 6 detalla la actualización de «Testing» en `docs/README.md`: la lista de specs, la excepción de `web-lib.spec.ts` a `.kiro/steering/30-pruebas.md` y su motivo, las intercepciones y cómo ejecutar `jwt-session.spec.ts`. Se añaden el comando del seed y la limitación de la CI (§22). |

Corrección propia: un supuesto de la iteración 3 que era falso.

- Qué decía: que en el hijo de `TooltipTrigger asChild`, un `aria-describedby` propio, o `aria-describedby={undefined}`, sustituía al que añade Radix, porque `Slot` «da prioridad al hijo». En eso se apoyaban los tooltips de etiqueta (sin descripción) y `DisabledHint` (motivo anunciado una vez).
- Qué se comprobó: descargué `@radix-ui/react-tooltip@1.3.0` con `npm pack` en una carpeta temporal fuera del repo, leí su `dist/index.mjs` y borré la carpeta. También leí `@radix-ui/react-slot@1.4.0`, ya instalado en `apps/web/node_modules`. Es la versión que usa la 1.3.0, a través de `react-primitive@2.1.11`, y también la que usa `apps/web`.
  - Mientras está abierto, `TooltipTrigger` pasa `aria-describedby = concatAriaDescribedby(propio, contentId)`.
  - El `mergeProps` de `Slot` 1.4.0 trata `aria-describedby` aparte: lo concatena (hijo + disparador, sin duplicados) en lugar de sustituirlo.
  - Con el diseño anterior, siempre que el tooltip estuviera abierto, un botón solo‑icono habría anunciado su nombre dos veces y una acción no disponible, su motivo dos veces. Con teclado, el tooltip se abre en cuanto el control recibe el foco.
- Qué cambia: `TooltipTarget` (`<Slot {...props} aria-describedby={undefined} />`) va entre el disparador y el control, y `LabelTooltip` sirve para los tooltips de etiqueta (§6). `DisabledHint` envuelve su botón con `TooltipTarget` (§7.4). `LabelTooltip` lo usan `RowActions` (§7.6) y el menú lateral (§8.3, §8.4). El badge «Próximamente» del menú pasa de `rail:hidden` a `rail:sr-only`: en riel, el tooltip ya no lo aporta como descripción, y así sigue en el nombre del enlace.
- También verificado en el mismo código: el cierre en `pointerdown` y en `click`, la apertura al recibir el foco (salvo que venga de un puntero) y que `onPointerMove` ignora el táctil. La secuencia de `DisabledHint` descrita en §7.4 se mantiene.

Decisiones añadidas en esta iteración que la revisión no pedía. Todas se derivan de sus hallazgos o de la corrección anterior:

- Precedencia general entre límite natural, regla con motivo y transitorio (§10.3). Mantener el motivo durante `busy` evita que el control pierda el foco al pasar de `aria-disabled` a `disabled`.
- El motivo de «Eliminar fase» con tareas dice cómo se resuelve: «La fase tiene tareas. Elimínalas antes de eliminar la fase.». Verificado que una tarea no puede cambiar de fase (`TaskDialog` fija `phaseId` al crearla), así que no se sugiere moverlas.
- El toolbar de Solicitudes tiene nombre accesible, «Filtros de solicitudes», como los demás listados (§11.5).
- Sin tooltip en los disparadores de menú y de cajón («Más acciones para…», «Abrir menú») ni en los botones «Cerrar» (§7.6, §8.4, §14). Al cerrarse el menú o el cajón, Radix devuelve el foco al disparador, y el tooltip, que se abre con el foco, aparecería solo tras cada uso, también con ratón. El nombre accesible explícito se conserva. Antes, el diseño ponía el tooltip «Más acciones».
- Los botones de paginación llevan `LabelTooltip`, como el resto de botones solo‑icono (§7.6).
- El foco del teclado no se pierde en las acciones que se repiten seguidas. En la paginación, si el botón pulsado llega al extremo, el foco pasa al otro (§7.6). Al reordenar fases, el foco vuelve al botón pulsado de la fase movida, o al del sentido opuesto si llegó al extremo (§11.9). Para eso, `RowAction` admite `id`, y `handleMovePhase` solo añade guardar `{ phaseId, dir }` en una ref; sus llamadas a la API y su manejo de errores no cambian.

Supuestos que siguen sin verificar:

- El anuncio real de `aria-disabled`, de las descripciones y de las regiones vivas con NVDA, JAWS o VoiceOver. El comportamiento de Radix y de `Slot` ya está leído en el código publicado, pero el anuncio solo se confirma con la QA manual (§20).
- El render real en el navegador de las primitivas (ítems de dos líneas, títulos largos de diálogo), que se dedujo de la geometría de las clases.
- El build Docker con `next/font/google` (§20, «Build Docker»).
- Cómo trata Playwright 1.63 el preflight CORS de un `GET` interceptado entre orígenes (web en 3000, API en 3001). El patrón es el mismo de `date-display.spec.ts`, y el manejador deja pasar a la API real cualquier método distinto de `GET`. Se confirma al ejecutar los specs.
- Que la CI no puede pasar hoy la suite E2E sin el seed (§22). Está leído en `ci.yml`, `seed.ts` y `actor-resolver.ts`, pero no ejecutado.

## 24. Resoluciones del orquestador (cierre del diseño)

El bucle de diseño agotó sus 4 iteraciones con 0 HIGH en todas. Los 2 MEDIUM de la revisión de la iteración 4 son correctos y se resuelven aquí con decisiones tomadas por el orquestador (el usuario delegó las decisiones de diseño). Esta sección es normativa y prevalece sobre cualquier redacción anterior que la contradiga. El diseño queda CERRADO para implementar.

### 24.1 `useClientTable` y paginación (resuelve MEDIUM 1)

El hallazgo es válido: `§7.6` define `pageSize` con valor por defecto 25 y `ClientTable` solo expone `pageRows`, mientras `§9 A` declara «Paginación: No» para Planificación · Tareas y Capacidad · Resumen de carga, y `§11.11` pide «`useClientTable` sin paginación», opción que no existía. Al pie de la letra, esas vistas ocultarían las filas 26+ sin aviso.

Decisión:

1. `UseClientTableOptions.pageSize?: number | null`. El valor `null` significa «sin paginación» y es explícito en cada vista; no se hereda un 25 implícito.
2. **Invariante de la utilidad:** `pageRows` solo puede ser un subconjunto truncado de `filtered` si la vista renderiza `DataTablePagination`. Con `pageSize: null`, `pageRows === filtered` (todas las filas). Ninguna vista puede ocultar filas sin un control visible que lo indique: es la regla que cierra el modo de fallo descrito.
3. Las vistas que `§9 A` declara «Paginación: No» (Planificación · Tareas, Capacidad · Resumen de carga) pasan `pageSize: null` y no renderizan la paginación. Conservan búsqueda, filtros y orden en cliente.
4. Las vistas con paginación declarada pasan un número y renderizan `DataTablePagination` **siempre**, no solo cuando `filtered > pageSize`, para que el control no aparezca y desaparezca al filtrar.
5. La utilidad lleva prueba unitaria de la invariante: con `pageSize: null` devuelve todas las filas; con número, `pageRows.length <= pageSize` y `filtered.length` sigue disponible para el conteo.

### 24.2 Auditoría: tope de 500 eventos y filtros honestos (resuelve MEDIUM 2)

El hallazgo es válido. Verificado en el código por el orquestador, no supuesto:

- `apps/api/src/modules/audit/audit.service.ts`: `const MAX_AUDIT_TAKE = 500` y `take` se acota con `Math.min(filters.take, MAX_AUDIT_TAKE)`, con `orderBy createdAt desc`. La respuesta es, como máximo, una ventana de los 500 eventos más recientes.
- `apps/api/src/modules/audit/dto/list-audit-events.dto.ts`: la consulta acepta **solo** `objectType` (lista `OBJECT_TYPES`) y `take` (máximo 500). **No existe filtro `action` en el servidor.**
- `apps/web/src/lib/audit.ts`: declara a mano `export type AuditObjectType = 'PROCESS' | 'USER' | 'GRANT' | 'CATALOG_ITEM'` (4 valores) mientras el servidor acepta 26. Es un contrato duplicado a mano, contrario a la regla del repositorio de preferir el cliente generado; hoy impide filtrar por los otros 22 tipos aunque el endpoint los admita.

Decisión:

1. **El filtro «Objeto» se envía al servidor** como `objectType`; no se aplica en cliente. Así la ventana de 500 se calcula sobre la consulta ya filtrada, que es el comportamiento correcto y el que evita el «Ningún resultado» engañoso.
2. **Las opciones de «Objeto» se derivan del tipo generado de OpenAPI** (el parámetro de la operación en `packages/api-client`), no de los datos presentes ni de una lista escrita a mano. Se elimina la unión local de 4 valores de `lib/audit.ts`. Es trabajo de frontend: no se toca la API.
3. **El filtro «Acción» es solo de cliente**, porque el servidor no lo soporta. Su etiqueta y su texto de ayuda deben dejar claro que acota lo mostrado en pantalla, no la consulta al servidor.
4. **El conteo no puede presentar un dato truncado como total.** Si la respuesta trae exactamente 500 elementos, la UI no dice «500 eventos»: indica que son los más recientes y que para ver más hay que acotar por Objeto. Si trae menos de 500, es el total de esa consulta y puede expresarse como total. El texto exacto queda sujeto a `§13` (lenguaje llano, sin tecnicismos).
5. La paginación real de auditoría (total de registros y navegación por páginas) exige cambio de API y se registra en `§22` como pendiente, junto con el nombre de rol y los textos de la API sin tildes.

### 24.3 Hallazgos restantes

Los 8 NIT de la revisión de la iteración 4 no bloquean la implementación. Se atienden cuando se esté tocando el archivo correspondiente; si alguno exigiera una decisión de diseño nueva, se resuelve aplicando los principios de `§1` y se anota en el reporte del tramo. No se abre otra iteración de diseño por ellos.
