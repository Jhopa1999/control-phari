# Verificación — Documentos: renderizar Markdown y acción «Ver»

Iteración: primera (no existía `review.json`).

## Comandos ejecutados y resultados

1. `npm install` (desde la raíz del monorepo `control-phari`, npm workspaces)
   - Resultado: exit code 0. `added 96 packages`.
   - `npm ls react-markdown remark-gfm --workspace apps/web` confirma que quedan
     enlazadas en el workspace `apps/web`:
     - `react-markdown@10.1.0`
     - `remark-gfm@4.0.1`

2. `npm run typecheck` en `apps/web` (`tsc --noEmit`)
   - Resultado: exit code 0 (sin errores de tipos; TypeScript estricto, sin `any`).

3. `npm run build` en `apps/web` (`next build`)
   - Resultado: exit code 0. `✓ Compiled successfully`. La ruta
     `/activos/documentos` compila sin errores (listada como ○ Static).

No se levantó el dev server (proceso de larga duración), según lo indicado.

## Versiones EXACTAS fijadas (pinned, sin ^ ni ~)

- `react-markdown`: `10.1.0`
- `remark-gfm`: `4.0.1`

Ambas en `dependencies` de `apps/web/package.json`, en orden alfabético con el
resto del bloque (todas las deps exactas).

## Archivos creados

- `apps/web/src/components/markdown-view.tsx` — componente client `MarkdownView`
  (react-markdown + remark-gfm; sin HTML crudo / sin rehype-raw; mapeo de
  elementos a clases Tailwind del design system; enlaces en nueva pestaña con
  `rel="noreferrer noopener"`; bloques de código monoespaciados con fondo tenue).
- `apps/web/src/app/activos/documentos/ver-documento-dialog.tsx` — diálogo de
  solo lectura `VerDocumentoDialog` (carga `getCurrentContent`, estados
  loading/success/error con toast, botón «Descargar .md» con `downloadMarkdown`,
  retorno de foco con `useDialogReturnFocus`), replicando el patrón de
  `HistorialDialog`.

## Archivos modificados

- `apps/web/package.json` — agregadas deps exactas `react-markdown` y `remark-gfm`.
- `package-lock.json` — actualizado por `npm install`.
- `apps/web/src/app/activos/documentos/documentos-view.tsx` — acción «Ver» como
  PRIMERA acción inline de fila (icono `Eye`), deshabilitada con motivo «Aún no
  tiene versiones.» cuando `!doc.currentVersion`; estado `viewOpen`/`viewDoc` y
  render de `VerDocumentoDialog` junto a `HistorialDialog`.
- `apps/web/src/app/activos/documentos/documento-editor-dialog.tsx` — el `<pre>`
  del preview se reemplaza por `MarkdownView` (fallback «Nada que previsualizar
  todavía.»), conservando el contenedor `min-h-80 max-h-[60dvh] overflow-auto
  rounded-md border p-4`.
- `apps/web/src/app/activos/documentos/historial-dialog.tsx` — el `<pre>` de
  «Contenido vX» se reemplaza por `MarkdownView`, conservando el contenedor
  `max-h-72 overflow-auto rounded-md border p-4`.

Sin cambios en `globals.css` ni en el backend. No se tocó lógica de negocio ni
acceso a datos; solo presentación y la nueva acción UI.
