# Implementation Plan — Documentos: renderizar Markdown y acción «Ver»

Tarea 100% frontend en `apps/web`. Tres objetivos: (1) componente reutilizable
`MarkdownView` con `react-markdown` + `remark-gfm`; (2) acción de fila «Ver» que
abre un diálogo de solo lectura con el contenido vigente renderizado; (3) usar
`MarkdownView` donde hoy hay `<pre>` crudo (editor preview e historial).

Todas las rutas son relativas a `c:\Users\analistabi2\Desarrollo\control-phari`.

## Decisiones de diseño

- **Versiones exactas (pinned).** `react-markdown` `10.1.0` y `remark-gfm`
  `4.0.1` (confirmadas como `latest` con `npm view`; `react-markdown` declara
  peer `react >=18`, compatible con React `19.3.0` del repo). Ambas son ESM puro;
  Next.js 16 (App Router) y `moduleResolution: "bundler"` del `tsconfig.json` las
  resuelven sin configuración extra. Se fijan sin `^`/`~` para ser consistentes
  con el resto de `apps/web/package.json` (todas las deps exactas).
- **Sin HTML crudo / sin `rehype-raw`.** Se mantiene el escape por defecto de
  `react-markdown` (anti-XSS, el contenido viene de usuarios). No se instala ni
  usa `rehype-raw`.
- **Sin `@tailwindcss/typography`.** No existe en el repo y la tarea prohíbe
  agregarlo. El estilo se logra con el prop `components` de `react-markdown`,
  mapeando cada etiqueta a clases Tailwind del design system
  (`text-muted-foreground`, `border`, `bg-muted`, etc.).
- **TypeScript estricto, sin `any`.** `react-markdown` exporta el tipo
  `Components` (y `Options`); los overrides se tipan con `Components`. Ojo con
  `noUnusedLocals`/`noUnusedParameters` activos: en los render props, destructurar
  solo `children`/`className` que se usen, o prefijar con `_` lo no usado.
- **`DocumentContent`** (de `@/lib/api-client`, alias de
  `DocumentContentResponseDto`) tiene `documentId`, `versionId`, `versionNumber`,
  `title`, `content`. `getCurrentContent(id)` lo devuelve. Verificado en
  `packages/api-client/src/generated/schema.d.ts`.
- **Patrón del diálogo nuevo** `VerDocumentoDialog`: replica `HistorialDialog`
  (props `open`/`onOpenChange`/`document`, `useDialogReturnFocus`,
  `Dialog`/`DialogContent size="xl"` + Header/Body/Footer, carga en `useEffect`
  con bandera `cancelled`, estados `loading`/`success`/`error`, toast con
  `messageOf`/mensaje de `DocumentError`, botón «Descargar .md» con
  `downloadMarkdown`). No se añade lógica de negocio ni acceso a datos nuevo.

---

- [ ] 1. Agregar dependencias con versión exacta al frontend.
      Añadir en `dependencies` de `apps/web/package.json`, en orden alfabético
      coherente con el bloque actual: `"react-markdown": "10.1.0"` y
      `"remark-gfm": "4.0.1"` (sin `^` ni `~`). No tocar otras entradas.
      Files: `apps/web/package.json`
      Verify: inspeccionar el diff del `package.json` y, tras el paso 2 instalar,
      confirmar que `apps/web/node_modules/react-markdown` existe.

- [ ] 2. Instalar desde la raíz del monorepo (npm workspaces).
      Ejecutar `npm install` en la raíz `control-phari` (no en `apps/web`) para
      que workspaces enlace las nuevas deps. No modificar manualmente el
      `package-lock.json`.
      Files: `package-lock.json` (actualizado por npm)
      Verify: `npm install` (desde la raíz) termina sin errores y
      `package-lock.json` incluye `react-markdown@10.1.0` y `remark-gfm@4.0.1`.

- [ ] 3. Crear el componente reutilizable `MarkdownView` (client).
      Archivo nuevo `apps/web/src/components/markdown-view.tsx` con directiva
      `'use client'`. Props: `{ content: string; className?: string }`. Renderiza
      `<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>`
      dentro de un contenedor con clases base
      `cn('flex flex-col gap-3 text-sm wrap-break-word', className)`. NO pasar
      `rehype-raw` ni `skipHtml` desactivado — se deja el escape por defecto.
      Tipar el mapa como `Components` importado de `react-markdown`.
      Enlaces (`a`): `target="_blank"` y `rel="noreferrer noopener"`.
      Bloques de código (`pre`): fondo tenue (`bg-muted`) y scroll horizontal;
      `code` inline monoespaciado con fondo tenue. En los render props destructurar
      solo lo que se use (p. ej. `children`, `href`) para no violar
      `noUnusedParameters`.

      Mapeo de elementos → clases Tailwind (coherentes con el design system):
      - `h1`: `className="mt-2 text-xl font-semibold tracking-tight"`
      - `h2`: `className="mt-2 text-lg font-semibold tracking-tight"`
      - `h3`: `className="mt-1 text-base font-semibold"`
      - `h4`: `className="mt-1 text-sm font-semibold"`
      - `p`:  `className="text-sm leading-relaxed text-muted-foreground"`
      - `ul`: `className="ml-5 list-disc space-y-1 text-sm text-muted-foreground marker:text-muted-foreground"`
      - `ol`: `className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground marker:text-muted-foreground"`
      - `li`: `className="pl-1"`  (task-list items de GFM: `remark-gfm`
        inserta `<input type="checkbox" disabled>`; dejar que caiga por defecto,
        se ve como casilla deshabilitada)
      - `a`:  `className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"`,
        `target="_blank"`, `rel="noreferrer noopener"`
      - `code` (inline): `className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"`
      - `pre`: `className="overflow-x-auto rounded-md border bg-muted/60 p-3 text-sm [&>code]:bg-transparent [&>code]:p-0"`
      - `blockquote`: `className="border-l-2 border-border pl-4 text-sm text-muted-foreground italic"`
      - `table`: envolver en overflow — `className="w-full border-collapse text-sm"`
        (opcional: dejar el `table` dentro de un `div` con `overflow-x-auto` si se
        prefiere; mantenerlo simple con `block overflow-x-auto` sobre el table)
      - `thead`: `className="border-b border-border"`
      - `tbody`: sin clase (o `className=""`)
      - `tr`: `className="border-b border-border last:border-0"`
      - `th`: `className="px-3 py-2 text-left font-semibold"`
      - `td`: `className="px-3 py-2 align-top text-muted-foreground"`
      - `hr`: `className="my-2 border-border"`
      - `strong`: `className="font-semibold text-foreground"`
      - `em`: `className="italic"`
      Files: `apps/web/src/components/markdown-view.tsx`
      Verify: tras el paso 7, `npm run typecheck` en `apps/web` pasa (el componente
      compila con tipos estrictos y sin `any`).

- [ ] 4. Crear el diálogo de solo lectura `VerDocumentoDialog`.
      Archivo nuevo `apps/web/src/app/activos/documentos/ver-documento-dialog.tsx`
      con `'use client'`, siguiendo el patrón de `historial-dialog.tsx`.
      Props: `{ open: boolean; onOpenChange: (open: boolean) => void; document: Document | null }`.
      Estado interno: `content: DocumentContent | null`, `state: 'loading'|'success'|'error'`,
      `errorMessage: string | null`. `useDialogReturnFocus()` para
      `captureTrigger`/`handleCloseAutoFocus`.
      Carga en `useEffect([open, document, reloadKey])`: si `!open || !document`
      return; usar bandera `cancelled`; `getCurrentContent(document.id)` →
      `setContent` + `state='success'`; en catch, `setErrorMessage` (mensaje de
      `DocumentError` o `null`) + `state='error'` y además `toast.error(...)`
      como en el resto del módulo. Resetear `content`/`state` al abrir.
      Render: `Dialog`/`DialogContent size="xl"` con `onOpenAutoFocus={captureTrigger}`
      y `onCloseAutoFocus={handleCloseAutoFocus}`; `DialogHeader` con `DialogTitle`
      (`Ver documento — {document?.title}`, `wrap-break-word`) y `DialogDescription`
      (p. ej. «Contenido de la versión vigente en solo lectura.»); `DialogBody`:
      - `state === 'loading'`: indicador de carga (texto/skeleton sencillo).
      - `state === 'error'`: mensaje de error entendible (usar `errorMessage` o un
        texto por defecto) con botón de reintento (`reloadKey + 1`).
      - `state === 'success' && content`: cabecera pequeña con
        `Contenido v{content.versionNumber}` + botón «Descargar .md»
        (`downloadMarkdown(document, content)`, icono `Download` de lucide), y
        debajo `<MarkdownView content={content.content}` dentro de un contenedor
        scrolleable `className="max-h-[60dvh] overflow-auto rounded-md border p-4" />`.
      `DialogFooter` con botón «Cerrar» (`onOpenChange(false)`).
      Importar `MarkdownView` de `@/components/markdown-view`,
      `useDialogReturnFocus` de `@/components/confirm-dialog`, componentes de
      `@/components/ui/dialog`, `Button`, `Download` de `lucide-react`, `toast`,
      `DocumentError`/`downloadMarkdown`/`getCurrentContent` de `@/lib/documents`,
      tipos `Document`/`DocumentContent` de `@/lib/api-client`.
      Files: `apps/web/src/app/activos/documentos/ver-documento-dialog.tsx`
      Verify: tras el paso 7, `npm run typecheck` en `apps/web` pasa.

- [ ] 5. Cablear la acción «Ver» y el diálogo en `documentos-view.tsx`.
      En `apps/web/src/app/activos/documentos/documentos-view.tsx`:
      - Importar `Eye` de `lucide-react` (junto a los iconos existentes) y
        `VerDocumentoDialog` de `./ver-documento-dialog`.
      - Añadir estado del diálogo replicando `historyOpen`/`historyDoc`:
        `const [viewOpen, setViewOpen] = React.useState(false);`
        `const [viewDoc, setViewDoc] = React.useState<Document | null>(null);`
        y una función `openView(doc)` que haga `setViewDoc(doc); setViewOpen(true);`.
      - En `rowActions(doc)`, insertar como PRIMERA acción del array (antes de
        `edit`):
        ```ts
        {
          key: 'view',
          label: 'Ver',
          icon: Eye,
          placement: 'inline',
          onSelect: () => openView(doc),
          disabled: !doc.currentVersion,
          disabledReason: doc.currentVersion ? undefined : 'Aún no tiene versiones.',
        }
        ```
      - Al final del componente, junto a `<HistorialDialog .../>`, renderizar:
        ```tsx
        <VerDocumentoDialog
          open={viewOpen}
          onOpenChange={(next) => {
            setViewOpen(next);
            if (!next) setViewDoc(null);
          }}
          document={viewDoc}
        />
        ```
      Nota: con «Ver» y «Editar» e «Historial» todas inline (`placement: 'inline'`),
      `splitActions` las respeta todas; «Descargar .md» y transiciones siguen en
      el menú. No cambiar la lógica de `handleDownload`/`handleStatus`.
      Files: `apps/web/src/app/activos/documentos/documentos-view.tsx`
      Verify: tras el paso 7, `npm run typecheck` pasa; en `npm run build` la ruta
      `/activos/documentos` compila sin errores.

- [ ] 6. Reemplazar los `<pre>` crudos por `MarkdownView`.
      Dos ediciones del mismo patrón (presentación, sin tocar lógica):
      - `apps/web/src/app/activos/documentos/documento-editor-dialog.tsx`,
        `TabsContent value="preview"`: sustituir el `<pre>` por un contenedor
        `<div className="min-h-80 max-h-[60dvh] overflow-auto rounded-md border p-4">`
        que renderice `content ? <MarkdownView content={content} /> :
        <p className="text-sm text-muted-foreground">Nada que previsualizar todavía.</p>`.
        Importar `MarkdownView` de `@/components/markdown-view`.
      - `apps/web/src/app/activos/documentos/historial-dialog.tsx`, sección
        «Contenido vX»: sustituir el `<pre>` por un contenedor
        `<div className="max-h-72 overflow-auto rounded-md border p-4">` con
        `<MarkdownView content={selected.content} />`. Importar `MarkdownView`.
      Conservar el resto del markup (cabeceras, botón Descargar) sin cambios.
      Files: `apps/web/src/app/activos/documentos/documento-editor-dialog.tsx`,
      `apps/web/src/app/activos/documentos/historial-dialog.tsx`
      Verify: tras el paso 7, `npm run typecheck` pasa y el preview/historial
      renderizan Markdown (no texto crudo).

- [ ] 7. Verificación final del frontend.
      Ejecutar en orden las comprobaciones del repo. No deben romperse comandos
      existentes.
      Files: — (sin cambios)
      Verify:
      1. `npm run typecheck` en `apps/web` (`tsc --noEmit`) termina sin errores.
      2. `npm run build` en `apps/web` (`next build`) compila correctamente,
         incluida la ruta `/activos/documentos`.
      Si `typecheck` falla por tipos de `react-markdown` (p. ej. firma del prop
      `components`), tipar el mapa como `Components` de `react-markdown` y ajustar
      los render props; no introducir `any`.

## Archivos tocados (resumen)

Crear:
- `apps/web/src/components/markdown-view.tsx`
- `apps/web/src/app/activos/documentos/ver-documento-dialog.tsx`

Modificar:
- `apps/web/package.json` (deps)
- `apps/web/src/app/activos/documentos/documentos-view.tsx` (acción «Ver» + diálogo)
- `apps/web/src/app/activos/documentos/documento-editor-dialog.tsx` (preview)
- `apps/web/src/app/activos/documentos/historial-dialog.tsx` (contenido vX)
- `package-lock.json` (lo actualiza npm)

Sin cambios en `globals.css` (no se necesitan utilidades nuevas) ni en backend.
