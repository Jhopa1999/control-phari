# Accesibilidad — Fase D (UX del portal interno)

Documento de la Fase D: selector de tema (claro/oscuro/sistema) y auditoría de
accesibilidad. El trabajo fue solo de frontend (`apps/web` y el E2E en `e2e/`);
no se tocó `apps/api`, el contrato OpenAPI, `packages/api-client` ni Prisma.

> **Nota de conformidad.** Este documento no declara conformidad WCAG total. La
> validación plena exige pruebas manuales con lectores de pantalla (NVDA,
> VoiceOver) y revisión experta. Aquí se cubren comprobaciones objetivas de
> marcado y contraste y un chequeo automatizado que falla ante violaciones de
> impacto *serious*/*critical* de axe-core.

## 1. Selector de tema

- Se instaló `next-themes@0.4.6` (versión exacta) como dependencia de
  `apps/web`. Justificación: el proyecto ya aplica el modo oscuro con la clase
  `.dark` (`@custom-variant dark (&:is(.dark *))` en `globals.css`);
  `next-themes` con `attribute="class"` aplica/retira esa misma clase en
  `<html>`, resuelve el *flash of wrong theme* con un script inline previo al
  pintado, soporta `system` vía `prefers-color-scheme` y persiste en
  localStorage (clave `theme`). No se añadió persistencia propia.
- `src/components/theme-provider.tsx`: envuelve `ThemeProvider` con
  `attribute="class"`, `defaultTheme="system"`, `enableSystem` y
  `disableTransitionOnChange`.
- `src/app/layout.tsx`: el árbol se envuelve en `ThemeProvider` y el `<html>`
  lleva `suppressHydrationWarning` (el script anti-flash escribe la clase antes
  de la hidratación).
- `src/components/theme-toggle.tsx`: menú `DropdownMenu` accesible, disparador
  `Button` de icono con `aria-label="Cambiar tema"`, iconos `Sun`/`Moon`/
  `Monitor` de lucide-react (todos `aria-hidden`), opciones «Claro», «Oscuro»,
  «Sistema»; la activa se marca con `aria-current="true"` y un check visible.
  Patrón `mounted` para evitar desajuste de hidratación (icono neutro estable
  hasta montar). Operable por teclado (es un menú Radix).
- Ubicación: cabecera del sidebar (`app-sidebar.tsx`, oculto en riel para no
  estrechar la columna) y barra superior móvil (`mobile-nav.tsx`). Un solo
  componente reutilizado en ambos sitios.
- Toaster (`src/components/ui/sonner.tsx`): `theme` ahora sigue a
  `useTheme().theme` (antes `theme="light"` fijo), cumpliendo el TODO del
  comentario. El mapeo de variables sonner a tokens no cambió.

No se encontraron colores hardcodeados fuera del sistema de tokens en
`apps/web/src` (búsqueda de `bg-white`, `text-black`, `bg-gray-*`,
`text-slate-*`, literales `#rrggbb`): sin coincidencias. Por tanto no hubo que
corregir colores en los componentes; el modo oscuro usa íntegramente los tokens
de `globals.css`.

## 2. Contraste (WCAG 1.4.3 texto y 1.4.11 no textual)

Se midieron los pares token/token listados en el plan convirtiendo los valores
OKLCH de `globals.css` a sRGB y calculando el contraste WCAG, en ambos temas.
Umbrales: 4.5:1 texto normal, 3:1 texto grande/UI.

### Pares de texto (umbral 4.5:1) — todos cumplen

| Par | Claro | Oscuro |
| --- | --- | --- |
| `foreground` / `background` | 17.72 | 16.53 |
| `foreground` / `card` · `popover` | 17.72 | 15.65 |
| `muted-foreground` / `background` | 6.54 | 7.71 |
| `muted-foreground` / `muted` | 5.91 | 6.81 |
| `sidebar-foreground` / `sidebar` | 10.02 | 11.34 |
| `sidebar-muted-foreground` / `sidebar` | 5.78 | 6.36 |
| `primary-foreground` / `primary` | 6.66 | 7.58 |
| `success` / `success-subtle` | 6.07 | 8.36 |
| `warning` / `warning-subtle` | 6.10 | 8.62 |
| `danger` / `danger-subtle` | 5.83 | 6.56 |
| `info` / `info-subtle` | 6.06 | 7.31 |
| `neutral` / `neutral-subtle` | 7.42 | 8.63 |

### Pares de UI (umbral 3:1)

| Par | Claro | Oscuro | Nota |
| --- | --- | --- | --- |
| `ring` / `background` | 6.95 | 7.70 | cumple |
| `ring` / `sidebar` | 6.41 | 7.97 | cumple |
| `input` / `background` | 3.64 | 3.47 | cumple (borde de campos) |
| `primary` / `background` | 6.95 | 7.70 | cumple |
| `border-strong` / `background` | **ajustado** | **ajustado** | ver abajo |

### Único ajuste aplicado: `--border-strong`

`--border-strong` es el borde de controles (botón `outline`, `segmented-radio`,
`radio-cards`, `badge` outline). Con los valores originales no alcanzaba 3:1
sobre `--background` (claro 1.53:1, oscuro 1.76:1), incumpliendo 1.4.11 para el
límite visual de esos controles. Se ajustó **solo la luminancia (L)** de OKLCH,
manteniendo croma y matiz del sistema:

- Claro: `oklch(0.86 0.008 264)` → `oklch(0.66 0.008 264)` → contraste **3.11:1**.
- Oscuro: `oklch(0.36 0.012 264)` → `oklch(0.49 0.012 264)` → contraste **3.05:1**.

No se tocó ningún otro token (los demás ya cumplían). `--border` (bordes
decorativos de tarjetas, no controles) no entra en 1.4.11 y se dejó igual.

## 3. Auditoría de accesibilidad de marcado

La base ya traía un marcado sólido (landmarks, un solo `h1` por página vía
`PageHeader`/`CardTitle as="h1"`, labels asociados, foco visible con
`focus-visible:outline-*`, patrón `aria-disabled` + motivo en
`DisabledReason`/`DropdownMenuItem unavailableReason`, skip link, roles ARIA
medidos). La revisión no encontró violaciones objetivas que corregir en los
componentes existentes; el único marcado nuevo es el del selector de tema, que
se construyó accesible desde el inicio:

- `ThemeToggle`: `aria-label="Cambiar tema"` en el disparador, iconos
  `aria-hidden`, ítem activo con `aria-current`, operable por teclado (menú
  Radix), reutilizado (no duplicado) en sidebar y barra móvil.

No quedaron hallazgos pendientes que exijan rediseño.

## 4. Chequeo automatizado con axe-core (E2E)

Se integró `@axe-core/playwright@4.14.0` (versión exacta) como `devDependency`
de la raíz (donde vive `@playwright/test`) y se añadió
`e2e/accessibility.spec.ts`, que sigue el patrón de `shell-navigation.spec.ts`
(storageState del jefe de `global-setup`, sin crear ni modificar datos). Analiza
con las etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y **falla solo ante
violaciones de impacto `serious`/`critical`** sobre tres rutas:

- (a) `/login` — pantalla de inicio de sesión.
- (b) `/demanda/solicitudes` — ruta con tabla (se intercepta `GET …/requests`
  con un fixture para que la tabla se renderice; la base de la CI parte vacía).
- (c) `/catalogs` — con el diálogo «Nuevo elemento» abierto (ruta con diálogo).

### Estado de ejecución en este entorno

Las tres rutas del spec quedaron integradas. En el entorno de desarrollo local
usado para esta fase, las rutas autenticadas no pudieron ejercitarse de forma
fiable: el backend dev que levanta Playwright no resolvía los permisos del actor
(`jefe@demo.local`), lo que hacía fallar también la suite **preexistente**
(`shell-navigation.spec.ts`) con el mismo síntoma («No fue posible cargar tus
permisos»). Es decir, se trata de un problema de datos/arranque del backend E2E
(base sin migrar/sembrar para el api dev), **no** de los cambios de esta fase.
Las comprobaciones de axe en `/login` y en el diálogo de `/catalogs` sí pasaron
cuando los permisos cargaron. El spec debe ejecutarse en una CI con la base
migrada y sembrada (`npm run db:up` + seed) junto al resto de la suite
(`npm run test:e2e`).

## 5. Verificación ejecutada

- `npm run typecheck` (api, api-client, web, mcp): OK.
- `npm run build` (los 4 workspaces): OK.
- `npm run test:unit` (backend): 901 tests en verde, sin regresión.
- `git diff --stat` sobre `apps/api/openapi/openapi.json` y
  `packages/api-client/src/generated/schema.d.ts`: sin cambios.
- E2E axe (`e2e/accessibility.spec.ts`): integrado; ver §4 sobre la ejecución.
