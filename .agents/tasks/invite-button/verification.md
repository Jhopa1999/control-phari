# Verificación — Botón "Reenviar invitación" (frontend-only)

## Archivos cambiados

- `apps/web/src/lib/team.ts`
  Nueva función `inviteUser(id: string): Promise<void>`. Sigue el patrón del
  archivo (try/catch, re-lanza `ApiError`, convierte el resto con
  `toApiError(undefined)`), adaptada a la respuesta **204 sin body**: la señal
  de éxito es la ausencia de `error` (NO se usa `!data`, que siempre sería
  `undefined` para 204). Llama a
  `api.POST('/users/{id}/invite', { params: { path: { id } } })`.

- `apps/web/src/app/gobierno/equipo/equipo-view.tsx`
  - Import de `inviteUser` desde `@/lib/team` y del icono `Mail` de
    `lucide-react`.
  - Helper `inviteButtonId(userId)` (análogo a `revokeButtonId`) para el `id`
    DOM del botón y la devolución de foco.
  - Estado por-fila `invitingUserId: string | null` + `inviteTarget` /
    `inviteOpen` (mismo patrón que `revokeTarget` / `revokeOpen`).
  - Handler `handleInvite`: fija `invitingUserId`, llama a `inviteUser`, en
    éxito muestra `toast.success` en español (incluye nombre e identificador y
    advierte que puede tardar); en error muestra `toast.error(messageOf(err))`,
    que ya traduce 403 ("No tienes acceso a esta acción."), 404 ("No existe o
    fue removido.") y red ("No fue posible comunicarse con el servidor…") a
    texto entendible, sin JSON crudo; en `finally` limpia `invitingUserId`.
  - Columna "Acciones" añadida SOLO a la tabla de **Usuarios**
    (`<TableHead className="text-right">Acciones</TableHead>` + `RowActionsCell`
    con un `<Button>`). La tabla de "Roles asignados" (grants) y su manejo de
    foco al revocar quedan intactos.
  - El botón de cada fila: `loading` cuando `invitingUserId === user.id`
    (muestra "Enviando…" + spinner), y se deshabilita en el resto de filas
    mientras hay una invitación en curso (`invitingUserId !== null &&
    invitingUserId !== user.id`), evitando disparos solapados. El texto visible
    es el nombre accesible (no hace falta `aria-label`).
  - `ConfirmDialog` de invitación montado junto al de revocación, con
    `tone="default"`, título "¿Reenviar la invitación?" y descripción que
    advierte que el enlace de invitaciones anteriores dejará de funcionar.

- `apps/web/.env.local` (NO versionado; gitignored)
  Creado en el worktree para poder ejecutar `npm run build` (prerender de
  Next.js exige `NEXT_PUBLIC_API_BASE_URL`). Replica el `.env.example` del
  propio worktree con el modo `dev-header`. No es parte del cambio funcional.

## Decisión sobre ConfirmDialog: SÍ

Se usa `ConfirmDialog`. Reenviar la invitación invalida el enlace anterior
(el token previo deja de servir), un efecto secundario no obvio para el jefe.
El repo ya usa `ConfirmDialog` para acciones con consecuencia (revocar grant) y
el componente ya estaba importado en la vista; reutilizarlo mantiene coherencia
y aporta accesibilidad (foco inicial en Cancelar, Escape, devolución de foco).
Como la fila NO se elimina al invitar, el `returnFocusTo` devuelve el foco al
propio botón de la fila. Nota: la etiqueta es única ("Reenviar invitación")
porque el endpoint reenvía el correo de activación tanto si el usuario nunca se
activó como si ya está activo, y `User` no expone si ya se activó alguna vez.

## Cómo probar manualmente desde el portal

1. Arranca el backend (`apps/api`) y el frontend (`apps/web`) con las variables
   de entorno correspondientes (SMTP configurado en la API para que el correo
   realmente se envíe).
2. Entra como Jefe de área y ve a **Gobierno → Equipo y permisos**.
3. En la tabla **Usuarios**, localiza una fila cuyo "Identificador" sea un
   correo real y pulsa **"Reenviar invitación"**.
4. Confirma en el diálogo ("¿Reenviar la invitación?"). Observa que SOLO esa
   fila muestra "Enviando…" y queda deshabilitada mientras dura la petición;
   las demás filas no se ven afectadas.
5. En éxito aparece un toast en español indicando que se envió el correo de
   activación al nombre/identificador del usuario. Revisa la bandeja de entrada
   de ese correo (puede tardar unos minutos).
6. Casos de error (toast en español, sin JSON crudo):
   - 403 → "No tienes acceso a esta acción." (rol insuficiente).
   - 404 → "No existe o fue removido." (usuario inexistente/eliminado).
   - Sin red → mensaje de conexión.
7. Verifica que la tabla "Roles asignados" y el foco al revocar un rol siguen
   funcionando igual que antes.

## Resultados de typecheck/build

Ejecutados desde la raíz del worktree
`c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\invite-button`.

Nota de entorno: el worktree no tenía dependencias instaladas ni el cliente
Prisma generado. Se ejecutó `npm install` y `npm run prisma:generate
--workspace apps/api` (artefactos no versionados) para poder compilar. No forma
parte del cambio funcional.

- `npm run typecheck` → **Exit Code: 0**
  (apps/api, packages/api-client, apps/web, apps/mcp — todos sin errores;
  TypeScript estricto, sin `any`).
- `npm run build` → **Exit Code: 0**
  (build:api con nest build, build:api-client con tsc + copia de schema,
  build:web con next build — 32 rutas generadas incluida `/gobierno/equipo`,
  build:mcp con tsc — todos sin errores).

No se tocó backend, Prisma ni el contrato OpenAPI/api-client (no se regeneró el
contrato). No se usó `fetch` crudo ni se duplicaron tipos.
