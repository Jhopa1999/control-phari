# Especificación visual: cambio de contraseña obligatorio y control del jefe

Alcance: (A) pantalla nueva `/cambiar-contrasena`; (B) control «Exigir cambio de contraseña» en «Equipo y permisos» (`gobierno/equipo/equipo-view.tsx`), solo jefe de área. Sin tokens nuevos ni dependencias: todo se compone con componentes existentes. Marca GIBO (Lienzo Claro / Dark Tech), solo tokens semánticos.

## 0. Tokens y componentes

| Uso | Token / componente | Nota de contraste |
|-----|--------------------|-------------------|
| Fondo de la pantalla A | `bg-muted` (igual que `/restablecer-contrasena` en modo jwt) | heredado |
| Tarjeta | `Card` (`bg-card`, `rounded-xl`, `shadow-card`) | heredado |
| Texto | `text-foreground`; ayudas `text-muted-foreground` (`text-meta`) | heredado |
| Botón principal | `Button size="lg"` (`bg-primary` + `text-primary-foreground`, 4.84:1) | medido en marca |
| Error de campo | `Field error` (`text-danger` + icono `CircleAlert`) | heredado |
| Error de formulario | `FormError` → `InlineNotice tone="danger" role="alert"` | heredado |
| Éxito | `InlineNotice tone="success" role="status"` | heredado |
| Advertencia en diálogo | `InlineNotice tone="warning"` | heredado |
| Insignia de pendiente | `Badge variant="warning"` + icono `KeyRound` | `bg-warning/14` + `text-warning`, ya verificado ≥ 4.5:1 en ambos temas |
| Enlaces | `text-link` (nunca `text-primary`) | 5.66:1 claro / 8.15:1 oscuro |
| Foco | `--ring` (outline 2 px, offset 2 px) en todo control | 3:1 |

No se introduce ningún par color-sobre-fondo nuevo. Los ratios son los ya medidos para estos componentes; si el desarrollador cambia algún porcentaje o añade un par, hay que medirlo en los dos temas. La validación completa de accesibilidad exige además prueba manual con lector de pantalla (NVDA/VoiceOver) y revisión experta.

---

## A. Pantalla `/cambiar-contrasena`

### A.1 Objetivo
Obligar a elegir una contraseña nueva sin pérdida de contexto. Acción principal: **«Cambiar contraseña»**. Salida secundaria: **«Cerrar sesión»**. Sin menú ni navegación (todas llevarían a `403`).

### A.2 Estructura y jerarquía (de arriba abajo)
1. `BrandName size="lg"` centrado (punto de marca; no recomponer el logo).
2. `Card` con un único foco: el formulario.
   - `h1` «Cambia tu contraseña».
   - Descripción: «Por seguridad, debes elegir una contraseña nueva antes de seguir usando el portal.»
   - Formulario: 3 campos, `FormError`, botón principal.
3. Botón secundario «Cerrar sesión» al pie de la tarjeta, de peso visual bajo (no compite con el principal).

Envoltorio (un `<main id="contenido">`, sin `AppShell`):

```
<main id="contenido" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted px-4 py-10">
  <BrandName size="lg" className="items-center" />
  <Card className="w-full max-w-[400px]"> … </Card>
</main>
```

Tarjeta (misma anatomía que `SetPasswordForm`):

```
<CardHeader className="gap-1.5 p-6 pb-4">
  <CardTitle as="h1" className="text-lg tracking-tight">Cambia tu contraseña</CardTitle>
  <CardDescription>Por seguridad, debes elegir una contraseña nueva antes de seguir usando el portal.</CardDescription>
</CardHeader>
<CardContent className="grid gap-4 p-6 pt-0">
  <form noValidate className="grid gap-4"> … </form>
  <Button type="button" variant="ghost" size="lg" className="w-full">Cerrar sesión</Button>
</CardContent>
```

`metadata.title`: «Cambiar contraseña». Tema claro y oscuro idénticos en estructura: solo cambian los valores de los tokens.

### A.3 Formulario (`noValidate`, validación al enviar, todos los errores a la vez, foco al primero, error se limpia al editar)

Todos con `required` en `Field` (asterisco `aria-hidden` + `aria-required`, nunca el atributo HTML `required`) y `RequiredHint` («Los campos con * son obligatorios.») como primer elemento del formulario.

| Orden | `id` / `name` | Etiqueta | `autoComplete` | Ayuda | `Input` |
|-------|---------------|----------|----------------|-------|---------|
| 1 | `currentPassword` | Contraseña actual | `current-password` | — | `type="password"` |
| 2 | `newPassword` | Nueva contraseña | `new-password` | «Mínimo 8 caracteres y distinta de la actual.» | `type="password"` |
| 3 | `confirmPassword` | Confirmar contraseña nueva | `new-password` | — | `type="password"` |

- Todos los `Field` con `errorRole="alert"` (patrón del login y de `SetPasswordForm`).
- Al montar, el foco va a `currentPassword` (es la única tarea de la pantalla).
- Recomendado para gestores de contraseñas: un `<input type="text" autoComplete="username" value={identificador} readOnly hidden>` antes del primer campo. No visible, fuera del orden de tabulación.
- Sin botón «mostrar contraseña» (no existe en el patrón actual; fuera de alcance).
- Cierre del formulario: `<FormError id="change-password" message={formError} />` y

```
<Button type="submit" size="lg" loading={submitting} className="w-full">
  {submitting ? 'Guardando…' : 'Cambiar contraseña'}
</Button>
```

- Orden de tabulación: Contraseña actual → Nueva → Confirmar → Cambiar contraseña → Cerrar sesión. Enter en cualquier campo envía.

### A.4 Estados

| Estado | Presentación |
|--------|--------------|
| **Carga inicial** (permisos aún sin resolver) | Misma tarjeta con `Skeleton`: `h-6 w-48` (título), `h-4 w-full` (descripción), 3 × (`h-4 w-32` + `h-9 w-full`) y `h-10 w-full`. El contenedor lleva `role="status" aria-busy="true"` y un `<span className="sr-only">Cargando…</span>`. |
| **Reposo** | Campos vacíos, botón habilitado. |
| **Validación al enviar** | Errores bajo cada campo (ver A.5), sin enviar. Foco al primer campo con error en orden DOM. |
| **Enviando** | Botón con `loading` y texto «Guardando…»; los tres `Input` y «Cerrar sesión» con `disabled`. Sin cambios de maquetación (el botón conserva ancho). |
| **Error del servidor** | Ver A.6. Valores conservados; se rehabilita el formulario. |
| **Éxito** | El formulario se sustituye por `<InlineNotice tone="success" role="status">Contraseña actualizada. Entrando al portal…</InlineNotice>`; «Cerrar sesión» se oculta. Se recargan permisos y se redirige (`router.replace`). No se vuelve a habilitar el formulario. |
| **Error al cargar permisos** | Lo resuelve `RouteGuard`/`ErrorState` existentes; no se diseña aquí. |
| **Deshabilitado** | Solo durante el envío; `disabled:opacity-50` heredado de `Input`/`Button`. |
| **Foco** | `--ring` heredado; nunca se retira el outline. |

### A.5 Validación local (al enviar) y política

Mensajes junto al campo, en este orden de comprobación; se muestran todos los que apliquen:

| Campo | Condición | Mensaje |
|-------|-----------|---------|
| `currentPassword` | vacío | «Escribe tu contraseña actual.» |
| `newPassword` | longitud < 8 | «La contraseña debe tener al menos 8 caracteres.» |
| `newPassword` | igual a la actual (y la actual no vacía) | «La contraseña nueva debe ser distinta de la actual.» |
| `confirmPassword` | distinta de la nueva | «Las contraseñas no coinciden.» |

El 8 es el piso del contrato; el servidor sigue siendo la autoridad (puede exigir más con `PASSWORD_MIN_LENGTH`). Si la nueva falla por longitud, no se muestra además «distinta de la actual».

### A.6 Errores del servidor

| Respuesta | Dónde | Texto | Foco |
|-----------|-------|-------|------|
| `400` «La contraseña actual no es correcta.» | `error` del campo `currentPassword` (excepción por texto exacto, como las ya previstas en `field.tsx`) | el texto del servidor | `currentPassword`, con el contenido seleccionado |
| `400` «La contraseña nueva debe ser distinta de la actual.» | `error` de `newPassword` | el texto del servidor | `newPassword` |
| `400` longitud / otro mensaje del servidor | `FormError` | el texto del servidor, o «La contraseña no cumple los requisitos. Elige otra.» si llega vacío | `newPassword` |
| `429` | `FormError` | «Demasiados intentos. Espera unos minutos e inténtalo de nuevo.» (con minutos si hay `Retry-After`: «Espera {n} min e inténtalo de nuevo.») | ninguno (el aviso es `role="alert"`) |
| `401` | flujo global de sesión caducada | no se trata aquí | — |
| Red / `5xx` / `403` CSRF | `FormError` | «No fue posible cambiar la contraseña. Inténtalo de nuevo.» | ninguno |

Nunca JSON crudo, nunca códigos técnicos (`PASSWORD_CHANGE_REQUIRED` no se muestra).

### A.7 Accesibilidad
- `h1` único; campos con `Label` enlazado; ayuda y error enlazados por `aria-describedby` (lo hace `Field`); `aria-invalid` en los campos con error.
- Errores con `role="alert"`: se anuncian al aparecer. El éxito, con `role="status"`.
- Sin dependencia del color: error = icono + texto; éxito = icono + texto.
- Tamaños: botones `size="lg"` (≥ 40 px de alto), muy por encima de 24 × 24 px (WCAG 2.5.8).
- «Cerrar sesión» es un `button` (acción), no un enlace.
- `prefers-reduced-motion`: sin animaciones propias; el spinner del botón es el existente.
- Contraste: solo pares ya medidos (sección 0). Texto de ayuda `text-muted-foreground` sobre `bg-card`: par estándar de la marca.

### A.8 Responsive
- Móvil (< 640 px): tarjeta a ancho completo con `px-4` del `main`; sin cambios de estructura.
- Tablet y escritorio: tarjeta centrada de 400 px máx. No hay menú lateral ni barra superior en ningún ancho.

---

## B. Control del jefe en «Equipo y permisos»

### B.1 Objetivo y visibilidad
Permitir al jefe marcar **a todos** o **a los seleccionados**, con confirmación explícita y resultado claro. Acción de seguridad masiva y reversible (se puede retirar), por eso el diálogo es `tone="default"` (no rojo) y el foco inicial cae en «Cancelar» (comportamiento de `ConfirmDialog`).

Solo el jefe de área ve los controles (columna de selección, botones y acciones de fila). Para el resto **no se renderizan** (no «deshabilitados»). El backend es la autoridad.

### B.2 Estructura (sección «Usuarios»)
Orden y jerarquía, sin tocar `PageHeader` (sus botones «Nuevo usuario» y «Asignar rol» siguen siendo el foco de la página):

1. `Section title="Usuarios"` con `actions` (prop existente, `flex-wrap`): 
   ```
   <Button type="button" variant="outline" disabled={state !== 'success'}>
     <KeyRound aria-hidden="true" /> Exigir cambio a todos
   </Button>
   ```
   Es outline: no compite con el botón primario «Asignar rol».
2. **Barra de selección**, visible solo con ≥ 1 persona seleccionada, entre la cabecera de la sección y la tabla:
   ```
   <InlineNotice tone="info" icon={false} className="…"
     action={<>
       <Button type="button" variant="outline" size="sm">
         <KeyRound aria-hidden="true" /> Exigir cambio de contraseña
       </Button>
       <Button type="button" variant="ghost" size="sm">Quitar selección</Button>
     </>}>
     <span aria-live="polite" className="font-medium">{n} {n === 1 ? 'persona seleccionada' : 'personas seleccionadas'}</span>
   </InlineNotice>
   ```
   Se usa `InlineNotice` porque ya tiene contraste verificado y se apila en móvil (`flex-col` → `sm:flex-row`).
3. Tabla/tarjetas de usuarios (contenedor existente `overflow-hidden rounded-lg border bg-card`).

### B.3 Tabla (escritorio, `md:` y más)
- **Nueva primera columna** de selección, `TableHead className="w-10"`:
  - Cabecera: `Checkbox` dentro de `<label className="flex min-h-8 cursor-pointer items-center">` con `<span className="sr-only">Seleccionar todos los usuarios</span>`. Estado `indeterminate` (vía ref) cuando hay selección parcial. Marca/desmarca toda la lista.
  - Fila: `<label className="flex min-h-8 cursor-pointer items-center"><Checkbox/><span className="sr-only">Seleccionar a {user.name}</span></label>`. El propio jefe y los inactivos son seleccionables.
- **Celda Estado**: `className="whitespace-nowrap"` pasa a `<div className="flex flex-wrap items-center gap-1">` con el `StatusBadge` actual y, si `user.mustChangePassword`:
  ```
  <Badge variant="warning"><KeyRound aria-hidden="true" />Cambio de contraseña pendiente</Badge>
  ```
  Icono + texto, no solo color. Preferible añadir un `kind` a `StatusBadge` (regla de marca: estados con `StatusBadge`) que produzca exactamente esa insignia; si el patrón no lo permite, usar `Badge` directo.
- **Acciones de fila** (`RowActions`): «Reenviar invitación» sigue en línea (`iconOnly`). Se añaden en el menú «…» (`placement: 'menu'`), con icono:
  - «Exigir cambio de contraseña» (`KeyRound`) si no está pendiente.
  - «Retirar exigencia» (`LockOpen`) si está pendiente.
  Con acción en curso: `busy` con `busyLabel` «Guardando…».

### B.4 Tarjetas móviles (`DataCardList`, < `md`)
- Checkbox al inicio del título: `<label className="inline-flex min-h-11 items-center gap-3 font-medium wrap-break-word"><Checkbox className="size-5"/><span>{user.name}</span></label>` (área táctil de 44 px; el nombre forma parte del nombre accesible).
- `badges`: se añade la insignia «Cambio de contraseña pendiente» a la lista existente.
- Acciones de la tarjeta: se mantiene «Reenviar invitación» (`size-11`); las nuevas van a un menú «…» con `RowActions menuOnly` (44 × 44 px).
- La barra de selección se apila: texto arriba, botones debajo (a todo el ancho con `w-full sm:w-auto`).
- El botón «Exigir cambio a todos» salta a su propia línea gracias a `flex-wrap` de `Section`.

### B.5 Diálogos (`ConfirmDialog`, `tone="default"`, confirmación con el botón primario)
Texto en el diálogo: `description` breve; las consecuencias van en `children` como lista (`<ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">`), porque `DialogDescription` es un párrafo.

**B.5.1 A todos**
- Título: «¿Exigir el cambio de contraseña a todo el equipo?»
- Descripción: «Cada persona con contraseña, excepto tú, deberá elegir una nueva la próxima vez que use el portal.»
- Lista:
  - «Las sesiones abiertas se interrumpen en la siguiente acción de cada persona.»
  - «Los accesos por MCP o scripts de esas personas quedan limitados hasta que cambien su contraseña.»
  - «Para dejar fuera a alguien, cancela y selecciona solo a las personas que quieras.»
  - «Puedes retirar la exigencia después desde esta pantalla.»
- Botones: «Cancelar» / **«Exigir cambio a todos»**.

**B.5.2 A la selección**
- Título: «¿Exigir el cambio de contraseña a {n} {persona|personas}?»
- Descripción: «Cada una deberá elegir una contraseña nueva la próxima vez que use el portal.»
- Lista de nombres: hasta 5 y, si hay más, «y {k} más.» (`text-sm`, `list-disc`), seguida de las dos primeras viñetas de B.5.1 (sesiones y MCP).
- Si el propio jefe está incluido: `<InlineNotice tone="warning">Tu usuario está en la selección. Al confirmar, tú también deberás cambiar tu contraseña en tu próxima acción.</InlineNotice>` como primer hijo.
- Botones: «Cancelar» / **«Exigir cambio a {n} {persona|personas}»**.

**B.5.3 Una persona (menú de fila)**
- «¿Exigir a {nombre} que cambie su contraseña?» / «Deberá elegir una contraseña nueva la próxima vez que use el portal.» / «Exigir cambio». Aviso de advertencia igual al anterior si la fila es el propio jefe.

**B.5.4 Retirar**
- «¿Retirar la exigencia a {nombre}?» / «Podrá seguir usando el portal sin cambiar su contraseña.» / «Retirar exigencia».

Comportamiento (heredado de `ConfirmDialog`): foco inicial en Cancelar; clic fuera no cierra; Escape cierra salvo mientras se guarda; botón de confirmar con `loading`; devuelve el foco al disparador. Si el disparador desaparece (la barra de selección se oculta al limpiar la selección), `returnFocusTo` apunta al encabezado de la `Section` (`headingRef`).

### B.6 Resultado y errores (toast `sonner`, más actualización de la lista)

| Caso | Mensaje |
|------|---------|
| Éxito con `updated > 0` | «Se exigió el cambio de contraseña a {updated} {persona\|personas}.» Si `skipped > 0`, segunda línea: «{skipped} no se modificaron: no tienen contraseña o ya estaban pendientes.» |
| Éxito con `updated = 0` | «Nadie cambió: las {skipped} personas indicadas no tienen contraseña o ya estaban pendientes.» (tono informativo) |
| Retirar | «Se retiró la exigencia a {updated} {persona\|personas}.» |
| `404` | «Alguna de las personas ya no existe. Recarga la lista e inténtalo de nuevo. No se marcó a nadie.» |
| `403` | «Solo el jefe de área puede exigir el cambio de contraseña.» |
| Otro / red | «No se pudo exigir el cambio de contraseña. No se marcó a nadie. Inténtalo de nuevo.» |

Tras un éxito: se limpia la selección y se recarga la lista (aparecen las insignias). La operación es atómica; los mensajes de error lo dicen.

### B.7 Estados

| Estado | Presentación |
|--------|--------------|
| Carga de usuarios | La existente (`Skeleton`/`TableSkeleton`); botón «Exigir cambio a todos» `disabled` mientras `state !== 'success'`; sin columna de selección hasta cargar. |
| Vacío (sin usuarios) | `EmptyState` existente; sin botón masivo ni columna de selección. |
| Error de carga | `ErrorState` existente. |
| Sin selección | La barra no se renderiza; la cabecera de columna muestra la casilla desmarcada. |
| Selección parcial | Casilla de cabecera `indeterminate`; barra visible. |
| Guardando | Botón de confirmar con `loading`; en la fila, `busy`; el resto de acciones de ese tipo `disabled` (patrón de «Reenviar invitación»). |
| Foco | `--ring` en casillas, botones y menú. |

### B.8 Accesibilidad
- Cada casilla tiene nombre accesible propio («Seleccionar a Ana Pérez»); la de cabecera, «Seleccionar todos los usuarios», con estado mixto (`indeterminate`).
- El contador de la barra es `aria-live="polite"`: se anuncia «3 personas seleccionadas» sin robar el foco.
- La insignia de pendiente tiene texto visible; no depende del color.
- Teclado: Tab llega a casilla, nombre, acciones de fila; Espacio marca; los diálogos atrapan el foco y devuelven al disparador.
- Objetivos: casillas con `label` de al menos `min-h-8` (≥ 24 px, WCAG 2.5.8); en móvil `min-h-11`.
- Todos los pares de color son los de `InlineNotice`, `Badge` y botones ya medidos. Falta la verificación manual con tecnologías de asistencia.
- Sin animación nueva; respeta `prefers-reduced-motion`.

### B.9 Responsive
- Escritorio (≥ `md`): tabla con columna de selección; barra en una línea (`sm:flex-row`).
- Móvil (< `md`): tarjetas con casilla en el título; barra apilada; botones del diálogo apilados por `DialogFooter`.

---

## C. Notas para el desarrollador
- Reutilizar `Field`, `FormError`, `InlineNotice`, `Card`, `Button`, `Input`, `Checkbox`, `Badge`/`StatusBadge`, `RowActions`, `ConfirmDialog`, `Section`, `Skeleton`. Sin componentes nuevos salvo el formulario `change-password-form.tsx`.
- No usar colores crudos de Tailwind.
- Iconos de `lucide-react`: `KeyRound`, `LockOpen` (existen en la librería ya usada).
- Los textos con tildes se escriben con la herramienta de edición (UTF-8 sin BOM).
