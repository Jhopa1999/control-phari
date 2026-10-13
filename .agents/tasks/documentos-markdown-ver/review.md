# Render de Markdown en Documentos y acción «Ver» de solo lectura

El módulo Documentos pasa de mostrar el contenido como texto plano dentro de `<pre>` a renderizarlo como Markdown mediante un nuevo componente cliente `MarkdownView` (react-markdown + remark-gfm). Se añade una acción de fila «Ver» que abre un diálogo de solo lectura con la versión vigente del documento y permite descargarla como `.md`, y se reemplaza el `<pre>` crudo por `MarkdownView` tanto en la vista previa del editor como en el panel de contenido del historial. El cambio es puramente de presentación: no toca backend, lógica de negocio ni acceso a datos, y reutiliza los helpers existentes (`getCurrentContent`, `downloadMarkdown`, `DocumentError`).

Watch for: el render de Markdown NO habilita HTML crudo (sin `rehype-raw`, sin `dangerouslySetInnerHTML`), por lo que el escape anti-XSS por defecto de react-markdown queda intacto — verificado (confirmed). La fila de Documentos ahora declara tres acciones con `placement:'inline'` (Ver, Editar, Historial), lo que satura la zona inline; conviene confirmar que es el diseño buscado (possible).

**Verdict**: APPROVED

## High-level view

El render se centraliza en `MarkdownView`, un único componente cliente que mapea cada etiqueta Markdown a clases Tailwind del design system vía el prop `components` de react-markdown, en vez de depender de `@tailwindcss/typography` (que no se añadió). El escape por defecto se conserva: no se registra `rehype-raw` ni ningún plugin rehype propio, así que el HTML embebido en el Markdown se neutraliza y no hay vector XSS introducido por este cambio.

La superficie nueva es `VerDocumentoDialog`, modelado punto por punto sobre `HistorialDialog`: estados loading/success/error, toast en el fallo, botón «Descargar .md» que reutiliza `downloadMarkdown`, retorno de foco con `useDialogReturnFocus` y los componentes `ui/dialog`. Carga la versión vigente con `getCurrentContent(doc.id)` y permite reintentar. La acción «Ver» se cablea en `documentos-view` como primera acción de fila, deshabilitada con motivo «Aún no tiene versiones.» cuando el documento no tiene `currentVersion`.

Las dependencias quedan fijadas con versión exacta (`react-markdown@10.1.0`, `remark-gfm@4.0.1`), en orden alfabético y coherentes con el resto del bloque, respetando la regla de no usar rangos. TypeScript estricto sin `any`.

El único punto a confirmar no es un defecto de corrección sino de densidad visual: tres acciones inline en cada fila de Documentos.

<details>
<summary>Issues (1)</summary>

1. **Densidad de acciones inline** — la fila de Documentos pasa a tener tres acciones con `placement:'inline'` (Ver, Editar, Historial); confirmar que es el reparto deseado o mover alguna al menú para no saturar la columna de acciones.

</details>

<details>
<summary>Details</summary>

### MarkdownView: render sin HTML crudo

`MarkdownView` envuelve `ReactMarkdown` con `remarkPlugins={[remarkGfm]}` y un mapa `components` que cubre h1–h4, p, ul, ol, li, a, code, pre, blockquote, table/thead/tbody/tr/th/td, hr, strong y em, cada uno con clases Tailwind del design system. No se registra ningún `rehypePlugin`, en particular no `rehype-raw`, de modo que el escape por defecto de react-markdown permanece: cualquier `<script>` o etiqueta embebida en el texto Markdown se trata como texto, no como HTML ejecutable. La búsqueda de `rehype`, `@tailwindcss/typography` y `dangerouslySetInnerHTML` en el código fuente de `apps/web` no arroja coincidencias; las apariciones de `rehype`/`remark-rehype` provienen solo de artefactos de build (`.next`, `.tsbuildinfo`) porque react-markdown los usa internamente para transformar mdast a hast, lo cual no habilita HTML crudo. No hay riesgo XSS introducido por este cambio (confirmed).

Los enlaces se renderizan con `target="_blank"` y `rel="noreferrer noopener"`, evitando la fuga de `window.opener` y de referrer.

### Densidad de acciones en la fila

`view`, `edit` e `history` fijan los tres `placement:'inline'`. La regla de reparto en `row-actions.tsx` respeta todo `placement:'inline'` explícito, así que las tres quedan en línea en lugar del comportamiento por defecto de dos inline + resto en menú (possible). No es un error de corrección, pero conviene confirmar que ese es el reparto buscado para la columna de acciones. El resto del cableado de la acción «Ver» (icono `Eye`, `disabled: !doc.currentVersion` con `disabledReason` accesible vía `aria-disabled` + `DisabledHint`) usa campos ya soportados por el contrato `RowAction`.

### Verificación

El coder dejó evidencia en `verification.md`: `npm install` (workspaces raíz) exit 0, `npm run typecheck` (`tsc --noEmit`) exit 0, `npm run build` (`next build`) exit 0 con `/activos/documentos` compilando como ruta estática. El mensaje del commit `c6ea892` repite esos resultados. Según lo indicado, no se reejecutaron typecheck ni build en esta revisión.

### No tratado / fuera de alcance

Las modificaciones sin commit en el árbol de trabajo (`apps/web/src/app/globals.css`, `apps/web/src/components/app-sidebar.tsx`) corresponden a la tarea aparte del scrollbar del sidebar y no forman parte de este cambio; quedan fuera del alcance de esta revisión.

Not tested: no se añadieron pruebas unitarias ni e2e para `MarkdownView` ni para `VerDocumentoDialog` en este cambio. El render de Markdown y el flujo loading/error del diálogo nuevo quedan sin cobertura automatizada; la verificación se apoya en typecheck y build.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/components/markdown-view.tsx` (nuevo) — componente cliente `MarkdownView`: react-markdown + remark-gfm, mapa de etiquetas a Tailwind, sin HTML crudo.
- `apps/web/src/app/activos/documentos/ver-documento-dialog.tsx` (nuevo) — diálogo de solo lectura de la versión vigente con descarga `.md`.
- `apps/web/src/app/activos/documentos/documentos-view.tsx` — acción «Ver» inline (primera) con disabled/motivo; estado y montaje del diálogo.
- `apps/web/src/app/activos/documentos/documento-editor-dialog.tsx` — `<pre>` de la vista previa reemplazado por `MarkdownView`.
- `apps/web/src/app/activos/documentos/historial-dialog.tsx` — `<pre>` del contenido de versión reemplazado por `MarkdownView`.
- `apps/web/package.json` — deps exactas `react-markdown@10.1.0` y `remark-gfm@4.0.1`.
- `package-lock.json` — actualizado por `npm install`.
- `.agents/tasks/documentos-markdown-ver/verification.md` (nuevo) — evidencia de verificación.

Diff completo: `git show c6ea892`.

</details>
