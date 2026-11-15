# Oleada 1 · Acceso: «Sin acceso», Maestras de solo lectura y bloqueo por intentos

Alcance: plan de mejora 1.1 (Login 429), 1.5 (Panel 403) y 6.2 (Maestras). Todo se
construye con componentes que ya existen (`InlineNotice`, `PageLayout`,
`PageHeader`, `Button`, `buttonVariants`, `Field`/`FormError`). No se crea ningún
componente ni token nuevo.

## Decisión transversal: un 403 no es un error de red

| Situación | Componente | Tono | Ejemplo de texto |
| --- | --- | --- | --- |
| Falla de red o 5xx | `ErrorState` (icono `CircleAlert` danger, «Reintentar») | danger | «Revisa tu conexión e inténtalo de nuevo.» |
| 403 (no tienes el rol) | `InlineNotice tone="neutral"`, sin «Reintentar» | neutral | «Esta pantalla no está disponible para tu rol.» |
| 429 (demasiados intentos) | `InlineNotice tone="warning"` | warning | «Demasiados intentos.» |

Reintentar un 403 no sirve, por eso no lleva botón de reintento. El neutral
comunica «es una regla», no «algo falló». Es el patrón que ya usan Áreas,
Procesos, SMTP, IA, Revisión y Solicitantes (`state === 'forbidden'`).

---

## 1. Panel del área: «Sin acceso a este panel»

### Objetivo
Quien llega a `/inicio` sin el módulo `dashboard` (p. ej. administrador del
sistema) entiende en un vistazo que no es un fallo y tiene un camino claro hacia
lo que sí puede usar.

### Cuándo se muestra
1. Preventivo: `!allowedModules.has('dashboard')` (con permisos ya cargados). No
   se hace ninguna petición.
2. Reactivo: `getDemandSummary` responde 403 (`ApiError.status === 403`). Cubre
   el caso de que la lista de módulos y la API discrepen.

En ambos casos la vista **sustituye todo el contenido**: no se renderizan
`AttentionSection`, `PeriodFieldset` ni tarjetas. Hoy el administrador ve dos
errores 403 apilados; con esto ve uno solo.

### Estructura (1440 y 390 igual, una sola columna)
```
PageLayout
 ├ PageHeader  title="Panel del área"  description="Demanda del área en el periodo: volumen, bloqueos y distribución por estado y prioridad."
 └ InlineNotice tone="neutral"
      title="No tienes acceso a este panel."
      texto  (text-muted-foreground)
      action (botón/es)
```
Se mantiene el `PageHeader` para que el usuario sepa en qué pantalla está y la
ruta/migas no cambien. Sin tarjeta envolvente, igual que Áreas.

### Clases (todas ya salen de los componentes; no añadir clases propias)
- Aviso: el de `InlineNotice` neutral: `flex gap-3 rounded-md border px-3 py-2.5 text-sm text-foreground border-neutral-border bg-neutral-subtle`; icono `Info` `size-4 text-neutral`.
- Título: `font-medium` (lo pone `InlineNotice`).
- Texto: `<p className="text-muted-foreground">`.
- Acciones: `buttonVariants({ variant: 'outline', size: 'sm' })` sobre `Link`. En móvil, `InlineNotice` apila acciones debajo del texto (`flex-col` por debajo de `sm`); ancho natural. En el contenedor de acciones puede añadirse `pointer-coarse:min-h-11` al `Link` para objetivo táctil (patrón de `OccurrenceActionButtons`).
- Role: `role="status"` (el usuario llegó a la pantalla, no es un evento; evita interrumpir al lector de pantalla). No `alert`.

### Texto (español)
- Título: **No tienes acceso a este panel.**
- Cuerpo: **El Panel del área está disponible para los roles que gestionan la demanda del área. Tu rol puede usar otras secciones del portal.**
- Si el servidor devolvió un mensaje 403 útil, no se muestra: el texto es fijo y en español (el mensaje del backend puede venir en inglés o ser técnico). El mensaje de la API solo se usa para el `ErrorState` de otros fallos.

### Acciones (en este orden, máximo 2)
1. **Ir a mi inicio** → `getAppHomeHref(app, allowedModules)` de la app activa; es la misma regla del selector de apps. Solo si ese destino es distinto de `/inicio`. Si no hay destino, se omite.
2. **Ir a Mis permisos** → `/gobierno/mis-permisos`, solo si `allowedModules.has('permissions')`. Mismo texto que usan las otras vistas.
Si no queda ninguna acción, el aviso va sin `action` (no se inventa un botón).

### Estados
- **Cargando permisos** (`permissions === null`): `Skeleton h-24 rounded-lg` dentro de `aria-busy="true"`. Nunca mostrar el aviso antes de conocer el rol, para que no parpadee.
- **Éxito (con acceso)**: la vista actual sin cambios.
- **Error de red/5xx**: `ErrorState` actual, con «Reintentar».
- **Deshabilitado**: no aplica.
- **Foco**: los `Link` heredan el anillo `--ring` de `buttonVariants`. Orden de tabulación: acción 1, acción 2.

### Temas
Los tokens `neutral*` ya cubren claro y oscuro: claro `neutral-subtle` oklch(0.945 0.006 250) con texto marino; oscuro `neutral-subtle` oklch(0.285 0.04 262) con texto blanco. Sin diferencias de clases entre temas.

### Accesibilidad
- Contraste: el texto usa `text-foreground` y `text-muted-foreground` sobre `neutral-subtle`; los tokens se midieron en `docs/design/identidad-color-menu.md`, pero el par `muted-foreground` sobre `neutral-subtle` no figura de forma explícita. **El implementador debe medirlo (≥ 4.5:1) en ambos temas antes de cerrar** y, si no llega, usar `text-foreground` en el cuerpo.
- El significado no depende del color: lleva icono, título y texto.
- La validación completa requiere prueba manual con lector de pantalla.

### Responsive
- 1440: aviso a todo el ancho del contenedor de `PageLayout`; título y acciones en una fila (`sm:flex-row sm:justify-between`).
- 390: icono + texto, acciones debajo; sin scroll horizontal.

---

## 2. Maestras para roles sin permiso de edición

Distinto del Panel: aquí la lectura sigue abierta (los formularios las usan), así
que **no se sustituye la pantalla**. Es modo solo lectura.

### Objetivo
Quien no administra no ve acciones que le darán 403 y entiende por qué.

### Cuándo
`permissionsLoaded && !allowedModules.has('admin')` (según el plan 6.2).

### Cambios
1. Se ocultan «Nuevo elemento», «Editar» y «Desactivar»/«Activar» (no se deshabilitan: un botón gris sin acción repetida en cada fila es ruido; la explicación va una vez arriba).
2. Un solo aviso bajo el `PageHeader`, sobre el contenido:
   `InlineNotice tone="neutral" role="note"`
   - Título: **Solo lectura.**
   - Cuerpo (`text-muted-foreground`): **Administrar las maestras corresponde al administrador del sistema. Puedes consultarlas.**
   - Acción: «Ir a Mis permisos» (solo si `allowedModules.has('permissions')`), igual que Equipo y Áreas.
3. Si la columna de acciones queda vacía, se elimina la columna (cabecera incluida) en lugar de dejar una celda vacía; en la lista móvil de tarjetas no se reserva el espacio de acciones.
4. Los botones de acción (cuando sí hay permiso) y la tabla no cambian.

### Estados
- Cargando permisos: sin aviso hasta saber el rol (evita parpadeo del aviso a administradores).
- Vacío / error de carga de la tabla: sin cambios; el aviso de solo lectura convive con ellos.
- Si un usuario con el botón visible recibe 403 (desfase), mostrar el error de la acción como `toast`/`FormError` con el mensaje de la API y no el «Revisa tu conexión».

### Accesibilidad y responsive
- `role="note"`: informativo, no se anuncia solo.
- 1440: aviso a ancho completo sobre la tabla. 390: igual, apilado; las tarjetas no muestran botones.
- Mismos tokens y comprobación de contraste que en la sección 1.

---

## 3. Login: bloqueo por intentos (HTTP 429)

### Objetivo
Cuando la API bloquea por demasiados intentos, la persona sabe qué pasó, cuánto
esperar y cómo seguir (recuperar contraseña), sin que se confunda con una
contraseña incorrecta.

### Dónde
Dentro del formulario, en la misma posición que hoy ocupa `FormError`: justo
encima del botón «Ingresar» y bajo «¿Olvidaste tu contraseña?». El aviso de
sesión expirada (arriba del formulario) no cambia. Si hubiera ambos, ambos se
muestran: son distintos.

### Aviso
`InlineNotice tone="warning" role="alert" id="login-error"` (el mismo id que
usa `FormError` para `aria-describedby`; nunca los dos a la vez: al recibir 429 se limpia `formError`).

- Icono: por defecto `TriangleAlert` (`text-warning`).
- Título (`font-medium`): **Demasiados intentos fallidos.**
- Cuerpo: **Por seguridad, el acceso está bloqueado un momento. Inténtalo de nuevo en {tiempo}.**
- Línea secundaria dentro del cuerpo: **¿No recuerdas tu contraseña?** seguido de `Link` «Recupérala aquí» → `/olvide-contrasena`, clases `text-link underline-offset-4 hover:underline` (igual que el enlace existente). Se pone en el cuerpo y **no en `action`**, porque la tarjeta mide 400 px y `action` a la derecha estrecharía el texto.
- No se revela si la cuenta existe ni qué identificador causó el bloqueo.

### Formato del tiempo
Origen: cabecera `Retry-After` (segundos) del 429, o el campo equivalente del
cuerpo si la API lo entrega. El implementador lo lee en `ApiError`.
- ≥ 120 s → «N minutos» (redondeo hacia arriba).
- 60 a 119 s → «1 minuto».
- < 60 s → «menos de un minuto».
- Sin dato → se omite la frase de tiempo: **Inténtalo de nuevo en unos minutos.**
El texto del aviso se calcula **una vez** al recibir el 429 (no se reescribe cada segundo, para que el lector de pantalla no lo repita).

### Cuenta regresiva (opcional, recomendada si hay `Retry-After`)
- El botón queda `disabled` hasta que termina la espera: texto **«Ingresar»** con `DisabledReason`/texto auxiliar no necesario; el motivo ya está en el aviso. Mientras tanto la etiqueta del botón muestra **«Reintenta en 4:32»** (`tabular-nums`), actualizada cada segundo, **sin** `aria-live` en el botón.
- Los campos de usuario y contraseña **no** se deshabilitan: la persona puede corregir mientras espera.
- Al llegar a 0: se quita el aviso, el botón vuelve a «Ingresar» habilitado y se anuncia un mensaje `role="status"` visualmente oculto (`sr-only`): «Ya puedes intentar iniciar sesión de nuevo.» El foco no se mueve.
- `prefers-reduced-motion`: no hay animación en esto.
- Si falta `Retry-After`: no hay cuenta regresiva ni botón bloqueado; el botón sigue habilitado (el servidor volverá a responder 429).

### Resto de estados del login (sin cambios)
- Envío: campos deshabilitados, botón `loading`, «Ingresando…».
- 401: `FormError` «Usuario o contraseña incorrectos.» (danger). Es el único con tono danger; 429 usa warning porque no es un error de la persona sino una medida de protección.
- Otros errores: mensaje de la API o «No fue posible iniciar sesión. Inténtalo de nuevo.»
- Tras el 429, al enviar de nuevo antes de tiempo (si el botón estuviera habilitado por falta de `Retry-After`), se reemplaza el aviso.

### Foco
Tras recibir el 429 el foco permanece en el botón (o el campo desde el que se envió). Como el aviso es `role="alert"`, se anuncia solo; no se mueve el foco al aviso.

### Temas
`warning-subtle` claro oklch(0.965 0.034 86) y oscuro oklch(0.28 0.045 70); texto `text-foreground` en ambos; icono `text-warning` (claro oklch(0.48 0.11 62), oscuro oklch(0.83 0.12 80)). El enlace `text-link` sobre `warning-subtle` **debe medirse** (≥ 4.5:1) en ambos temas; si no llega en alguno, subrayarlo siempre (`underline`) y usar `text-foreground` en ese tema.

### Responsive
- 1440 y 390: la tarjeta es `max-w-[400px]` y a 390 ocupa el ancho disponible menos el padding de la página; el aviso apila icono + texto, sin acción lateral. El botón mantiene `w-full` y su altura (`size="lg"`). La cuenta regresiva cabe en una línea («Reintenta en 4:32»).
- Objetivo táctil del enlace: línea con `py-1` o `pointer-coarse:min-h-11 inline-flex items-center` en móvil.

### Accesibilidad
- Orden de tabulación: usuario, contraseña, «¿Olvidaste tu contraseña?», enlace «Recupérala aquí», botón.
- El aviso no usa solo color: icono, título y texto.
- Prueba manual con lector de pantalla y verificación axe en login con 429 simulado (e2e/Playwright con la API devolviendo 429 y `Retry-After`).

---

## Resumen para el implementador

| Pieza | Componente reutilizado | Nuevo |
| --- | --- | --- |
| Panel sin acceso | `InlineNotice` neutral + `PageHeader` + `buttonVariants` | ninguno |
| Maestras solo lectura | `InlineNotice` neutral, ocultar acciones | ninguno |
| Login 429 | `InlineNotice` warning (`role="alert"`, `id="login-error"`) | solo lógica de cuenta regresiva en `login-form.tsx` |

Textos fijos en español; sin colores crudos; sin tokens nuevos. Pruebas e2e
sugeridas: administrador en `/inicio` ve el aviso y no ve `ErrorState`; integrante
en Maestras no ve «Nuevo elemento»; login con 429 muestra el aviso, el tiempo y
el enlace de recuperación.
