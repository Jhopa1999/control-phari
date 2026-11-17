# Oleada 3 · PR-A «errores y acceso»: `NoAccessNotice`, `DisabledReason` y `ErrorState`

Anexo a `docs/design/oleada-1-acceso.md` (que sigue vigente). Alcance: el
componente único «Sin acceso», el uso de `DisabledReason` en rutas y acciones, la
variante `forbidden` de `ErrorState` y los textos de 403 y de servidor en el
selector de apps, el asistente y Mi trabajo. No se crean tokens ni colores
nuevos: todo sale de `InlineNotice`, `ErrorState`, `EmptyState`,
`Button`/`buttonVariants`, `PageHeader` y `DisabledReason` tal como están. La
marca (GIBO) y los tokens vienen de `.kiro/steering/25-marca-gibo.md`.

## 0. Decisión transversal: qué componente para qué situación

| Situación | Componente | Tono / icono | «Reintentar» | Texto |
| --- | --- | --- | --- | --- |
| Pantalla de ruta sin el módulo (preventivo o 403 al cargar) | `NoAccessNotice` dentro de `PageLayout` | neutral, `Info` | no | fijo, en español (§1) |
| Acción concreta no disponible hoy (regla, estado, rol) | `DisabledReason` junto al botón, o `DisabledHint` en filas | `Info` 14 px, `text-muted-foreground` | no | motivo concreto (§2) |
| Una zona (tabla, tarjeta, panel) no pudo cargar por 403 | `ErrorState` tipo `forbidden` | neutral, `Lock` | no | mensaje del servidor (§3.1) |
| Falla de red | `ErrorState` tipo `network` | danger, `WifiOff` | sí | «Revisa tu conexión…» (§3.2) |
| Error del servidor (4xx distinto de 403, 5xx) | `ErrorState` tipo `server` | danger, `CircleAlert` | sí | mensaje del servidor (§3.3) |
| Mensaje de asistente, toast o selector de apps | ver §5 | según §5 | según §5 | §5 |

Regla de elección entre `NoAccessNotice` y `ErrorState` `forbidden`: si el 403
afecta a **toda la pantalla**, `NoAccessNotice` sustituye el contenido. Si afecta a
**una parte** de una pantalla accesible (una tabla secundaria, un panel),
`ErrorState` `forbidden` va dentro de esa zona. Nunca los dos a la vez.

Roles reales (de `auth/module-matrix.ts`) y los nombres que usan los textos:
**jefe de área**, **líder de proceso**, **integrante** y **administrador del
sistema** (`ADMIN`).

---

## 1. `NoAccessNotice` (componente único)

### Objetivo
Quien llega a una pantalla a la que su rol no accede entiende, en un vistazo, que
no es un fallo y tiene como máximo dos salidas claras. El componente sustituye al
local del Panel y a los avisos manuales de nueve vistas.

### Estructura
```
PageLayout
 ├ PageHeader  (se conserva: el usuario sabe dónde está)
 └ NoAccessNotice
     └ InlineNotice tone="neutral" role="status"
         ├ icono Info
         ├ título       «No tienes acceso a esta pantalla.»  (o `title`)
         ├ cuerpo       texto por pantalla (§1.3)
         └ acciones     0 a 2 (§1.4)
```
Un foco único: el aviso. Sin tarjeta envolvente, sin segundo aviso ni
`ErrorState` apilados. Con el aviso presente no se renderizan filtros, tablas ni
botones de la vista.

### Clases (las pone `InlineNotice`; no añadir clases propias salvo las indicadas)
- Caja neutral: `flex gap-3 rounded-md border px-3 py-2.5 text-sm text-foreground border-neutral-border bg-neutral-subtle`.
- Icono: `mt-0.5 size-4 shrink-0 text-neutral` (`aria-hidden`).
- Título: `font-medium`.
- Cuerpo: `<p className="text-muted-foreground">`.
- Acciones: `Link` con `buttonVariants({ variant: 'outline', size: 'sm' })` y
  `pointer-coarse:min-h-11`. Contenedor: el de `InlineNotice`
  (`flex shrink-0 flex-wrap items-center gap-2`).
- `role="status"`, nunca `alert`: el usuario navegó a la pantalla, no es un evento.

### API del componente (para el desarrollador)
`NoAccessNotice({ title?, children? })`. No hay `moduleKey`: la vista decide si
lo monta y el componente no necesita saber qué módulo falta, porque el texto lo
pasa la vista y las acciones salen de `allowedModules`.
- `title` por defecto: **No tienes acceso a esta pantalla.**
- `children` es el cuerpo; si falta, el cuerpo genérico de §1.3.
- Las acciones las calcula el componente con `getDefaultHomeHref(allowedModules)`
  y `allowedModules.has('permissions')`; la vista no las pasa.
- Mientras `permissionsState !== 'success'` la vista **no** monta el aviso; muestra
  `Skeleton h-24 rounded-lg` dentro de `aria-busy="true"` (sin parpadeo).

### 1.3 Textos finales (español, fijos; el mensaje del servidor no se muestra aquí)
Cada fila está contrastada con `MODULE_MATRIX`. Quien ve el aviso es el rol que
**no** está en la matriz del módulo. No hay texto de reserva: si una pantalla no
está en la tabla, usa la última fila.

| Pantalla (módulo) | Roles con acceso | Título | Cuerpo |
| --- | --- | --- | --- |
| Panel del área (`dashboard`) | jefe de área, líder de proceso, integrante | No tienes acceso a este panel. | El Panel del área está disponible para el jefe de área, el líder de proceso y el integrante. Tu rol administra la configuración técnica del portal. |
| Demanda (`demandOverview`) | jefe de área, líder de proceso | No tienes acceso a la vista de demanda. | La vista de demanda está disponible para el jefe de área y el líder de proceso. |
| Triage (`triage`) | jefe de área, líder de proceso | No tienes acceso al triage. | El triage lo realizan el jefe de área y el líder de proceso. |
| Priorización (`priority`) | jefe de área, líder de proceso | No tienes acceso a la priorización. | La priorización la realizan el jefe de área y el líder de proceso. |
| Plan (`plan`) | jefe de área, líder de proceso | No tienes acceso a la gestión del plan. | La gestión del plan está disponible para el jefe de área y el líder de proceso. El integrante ejecuta sus tareas desde Mi trabajo. |
| Revisión (`review`) | jefe de área, líder de proceso | No tienes acceso a las aprobaciones. | Las aprobaciones están disponibles para el jefe de área y el líder de proceso. |
| Bitácora (`log`) | jefe de área, líder de proceso, integrante | No tienes acceso a la bitácora. | La bitácora está disponible para el jefe de área, el líder de proceso y el integrante. |
| Reuniones (`meeting`) | jefe de área, líder de proceso, integrante | No tienes acceso a las reuniones. | Las reuniones están disponibles para el jefe de área, el líder de proceso y el integrante. |
| Capacidad (`capacity`) | jefe de área, líder de proceso, integrante | No tienes acceso a la capacidad. | La capacidad está disponible para el jefe de área, el líder de proceso y el integrante. |
| Actividades recurrentes (`recurring`, D14) | jefe de área, líder de proceso, integrante | No tienes acceso a las actividades recurrentes. | Las actividades recurrentes están disponibles para el jefe de área, el líder de proceso y el integrante. |
| Auditoría (`audit`, D12) | jefe de área, líder de proceso, integrante (cada uno con su alcance) | No tienes acceso a la auditoría. | La auditoría está disponible para el jefe de área, el líder de proceso y el integrante. El administrador del sistema no la incluye. |
| Maestras (`admin`) | jefe de área | No tienes acceso a las maestras. | Administrar las maestras corresponde al jefe de área. |
| Equipo (`team`) | jefe de área | No tienes acceso al equipo. | La gestión del equipo corresponde al jefe de área. |
| Áreas (`areas`), Procesos (`processesAdmin`), Solicitantes (`requesters`) | administrador del sistema, jefe de área | No tienes acceso a esta pantalla. | Esta pantalla está disponible para el administrador del sistema y el jefe de área. |
| Agentes de IA (`aiSettings`), Configuración SMTP (`systemSettings`) | administrador del sistema | No tienes acceso a esta pantalla. | Esta pantalla corresponde al administrador del sistema. |
| Cualquier otra pantalla | n/a | No tienes acceso a esta pantalla. | Tu rol no incluye esta sección. Puedes usar las demás secciones del portal. |

Excepción de Maestras: sigue vigente el modo solo lectura de oleada 1 (§2 de
`oleada-1-acceso.md`) cuando el rol puede leer. `NoAccessNotice` solo aplica si no
hay lectura.

### 1.4 Acciones (máximo 2, en este orden)
1. **Ir a mi inicio** → `getDefaultHomeHref(allowedModules)`. Se omite si el destino
   es la ruta actual o no existe.
2. **Ir a Mis permisos** → `/gobierno/mis-permisos`, solo si `allowedModules.has('permissions')`.

Sin ninguna acción, el aviso va sin `action`. No se inventa un botón.

### 1.5 Estados
| Estado | Comportamiento |
| --- | --- |
| Cargando permisos | Skeleton `h-24 rounded-lg`, `aria-busy="true"`; no se muestra el aviso. |
| Sin módulo (preventivo) | Aviso; ninguna petición a la API. |
| 403 reactivo (la API discrepa de la lista de módulos) | Mismo aviso, mismo texto. Sin «Reintentar». |
| Con acceso | La vista, sin cambios. |
| Foco | Los `Link` heredan el anillo `--ring` de `buttonVariants`. Tabulación: acción 1, acción 2. |
| Deshabilitado | No aplica. |
| Éxito / vacío | No aplica. |

### 1.6 Claro/oscuro y responsive
- Claro: `neutral-subtle` oklch(0.945 0.006 250) sobre `background` oklch(0.953 0.011 256.7); texto `foreground` marino; icono `neutral` oklch(0.42 0.03 262).
- Oscuro: `neutral-subtle` oklch(0.285 0.04 262) sobre `background` oklch(0.2 0.053 261.9); texto `foreground` oklch(0.97 0.005 250); icono `neutral` oklch(0.82 0.02 255).
- Las clases son idénticas en ambos temas.
- **1440 px:** el aviso ocupa el ancho del contenedor de `PageLayout`; texto a la izquierda y acciones a la derecha (`sm:flex-row sm:justify-between`).
- **390 px:** icono + texto, acciones debajo (`flex-col`), sin scroll horizontal. Cada `Link` mide al menos 44 px de alto en táctil (`pointer-coarse:min-h-11`) y ocupa el ancho completo bajo `sm` (`w-full sm:w-auto`).

---

## 2. `DisabledReason` en rutas y acciones

Componente existente (`components/disabled-reason.tsx`); no cambia su API. Esta
oleada fija **cuándo** se usa.

### Cuándo
- Una acción **visible** que hoy no se puede ejecutar por una regla conocida en
  cliente (estado, rol, dato faltante): botón con `unavailable` + `DisabledReason`
  visible junto a la acción principal, o `DisabledHint` si está en una fila densa.
- **No** se usa para una pantalla entera sin acceso (eso es `NoAccessNotice`) ni
  para ocultar acciones que el rol nunca tendrá (esas se ocultan; la explicación
  va una vez arriba, como en Maestras).

### Clases (ya definidas en el componente)
- `DisabledReason`: `flex items-start gap-1.5 text-meta text-muted-foreground`;
  icono `Info` `mt-0.5 size-3.5 shrink-0` (`aria-hidden`).
- En `PageHeader`: acción y motivo juntos en `div flex-col items-start gap-1 md:items-end`, motivo con `max-w-xs md:text-right`.
- El botón usa `unavailable` (`aria-disabled`), no `disabled`: conserva su rol,
  nombre y lugar en la tabulación. `aria-describedby={id}` apunta al motivo.

### Textos
Siempre dicen **qué falta o qué lo impide y, si existe, qué hacer**. En español,
con tilde, sin ids.
- Bien: «Para aprobar, la solicitud debe estar en revisión.»
- Bien: «Solo el jefe de área puede cambiar el rol de administrador.»
- Mal: «No disponible.» · «Acción no permitida.» · «Error 403.»
Si el motivo viene del servidor tras un 403 inesperado, se muestra el mensaje del
servidor (sanitizado por el filtro de la API) como `toast`/`FormError`, no como
`DisabledReason`.

### Estados
| Estado | Comportamiento |
| --- | --- |
| Disponible | Botón normal; sin motivo. |
| No disponible | Botón `aria-disabled`, estilo atenuado del botón, motivo visible (o tooltip en filas). |
| Foco | Anillo `--ring`; el botón es enfocable y el lector anuncia «no disponible» más el motivo. |
| Cargando | Botón `loading` normal; sin motivo. |

### Responsive
- 1440: motivo a la derecha/debajo de la acción según el contenedor.
- 390: motivo debajo del botón, alineado a la izquierda, ancho completo; en filas
  densas el tooltip se abre al pulsar (ya implementado en `DisabledHint`) y el
  objetivo táctil del botón conserva 44 px.

---

## 3. `ErrorState`: 403 distinto de red, con el mensaje del servidor (`serverError`)

### Objetivo
Una persona que ve un error entiende de inmediato si **no tiene permiso** (no hay
nada que reintentar), si **no hay conexión** (reintentar sirve) o si **el servidor
falló** (reintentar puede servir; el motivo del servidor orienta). Hoy todos
dicen «Revisa tu conexión…».

### Props y precedencia
`ErrorState` recibe `error?: unknown`, `title?`, `message?` y `onRetry?`. El tipo
(`forbidden | network | server | notFound`) y el texto salen de
`classifyError(error)`, que devuelve `message` como **`string`** (D-err del plan).
`serverError` es ese `message` cuando viene del cuerpo de la API.

| Props recibidas | Tipo que se pinta | Título | Mensaje |
| --- | --- | --- | --- |
| `error` solo | el de `classifyError` | el del tipo (§3.1 a §3.4) | `serverError` o el de §3 si falta |
| `error` + `title` | el de `classifyError` | `title` | `serverError` o el de §3 |
| `error` + `message` | el de `classifyError` | el del tipo | `message` (gana a `serverError`) |
| `message` solo, sin `error` | `server` (comportamiento actual) | `title` o el de `server` | `message` |
| ninguna | `network` | el de `network` | el de `network` |

Reglas: (1) el tipo solo viene de `error`; (2) `title` y `message` explícitos
siempre ganan al texto calculado; (3) `forbidden` nunca muestra «Reintentar» aunque
llegue `onRetry`; (4) «Revisa tu conexión…» solo aparece en el tipo `network`.

### Estructura común (centrada, como hoy)
```
div role=…  flex flex-col items-center gap-2 px-4 text-center  (py-10; compact: py-6)
 ├ icono        size-5, aria-hidden
 ├ título       text-sm font-semibold
 ├ mensaje      max-w-md whitespace-pre-line break-words text-sm text-muted-foreground
 └ acción       Button outline «Reintentar» (solo network y server)
```

### 3.1 `forbidden` (403)
- Icono: `Lock` `size-5 text-neutral`.
- Título: **No tienes permiso para ver esta información.**
- Mensaje: el `serverError` tal cual, si es texto no vacío. Si falta:
  **Tu rol no incluye este contenido. Si lo necesitas, pídelo al jefe de área.**
- **Sin «Reintentar»**: repetir un 403 no sirve.
- `role="status"`: es una regla, no un evento ni una falla.
- Fondo: ninguno propio (vive dentro de la tarjeta o la tabla que lo contiene).

### 3.2 `network` (sin respuesta, `status` indefinido)
- Icono: `WifiOff` `size-5 text-danger`. Si el desarrollador prefiere no añadir el
  icono, usa `CircleAlert`; el significado no depende del icono porque el título lo dice.
- Título: **No hay conexión con el servidor.**
- Mensaje: **Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal.** (texto vigente)
- Botón **Reintentar** (`Button variant="outline" mt-2`, icono `RefreshCw`), si hay `onRetry`.
- `role="alert"`.

### 3.3 `server` (4xx distinto de 403, y 5xx)
- Icono: `CircleAlert` `size-5 text-danger`.
- Título: **No fue posible cargar la información.** (texto vigente)
- Mensaje: el `serverError` si es texto; si no, `messageForStatus(status)`. Nunca
  «Revisa tu conexión…». Para un 5xx genérico del filtro:
  **Ocurrió un error interno. Inténtalo de nuevo; si continúa, avisa al administrador.**
- Botón **Reintentar** si hay `onRetry`.
- `role="alert"`.

### 3.4 `notFound` (404)
Mismo trato visual que `server`, título **No se encontró lo que buscas.**, mensaje
del servidor, con «Reintentar» solo si la vista lo pasa. `role="alert"`.

### Reglas de contenido del mensaje del servidor
- Se muestra como **texto** (nunca como HTML) y sin recortar. Una sola salida:
  `classifyError` entrega `message` como `string`; si el cuerpo trae un arreglo
  (400 de validación), `classifyError` lo une con `\n`, y el componente lo pinta
  en **un solo `<p>` con `whitespace-pre-line`**. No hay lista `ul`.
- No se antepone «Error:» ni el código HTTP.
- El mensaje no lleva UUID ni stack: lo garantiza el filtro de la API. Si un UUID
  llegara igualmente, la vista no lo oculta ni lo reformula.

### Comparativa por tipo
| | forbidden | network | server |
| --- | --- | --- | --- |
| Icono | `Lock`, `text-neutral` | `WifiOff`, `text-danger` | `CircleAlert`, `text-danger` |
| Tono | neutral | danger | danger |
| `role` | `status` | `alert` | `alert` |
| «Reintentar» | no | sí | sí |
| Mensaje | servidor (o genérico de §3.1) | fijo «Revisa tu conexión…» | servidor (o `messageForStatus`) |

### Estados de la zona que contiene el error
| Estado | Comportamiento |
| --- | --- |
| Cargando | Skeleton de la zona; no se muestra el error previo. |
| Reintentando | El botón queda `loading` y deshabilitado; el texto del error permanece hasta la respuesta, para evitar saltos de diseño. |
| Éxito tras reintento | El error desaparece y se muestra el contenido; el foco no se mueve por script. |
| Foco | «Reintentar» con anillo `--ring`. En `forbidden` no hay controles. |
| Deshabilitado | No aplica. |

### Claro/oscuro
Tokens ya existentes, sin clases distintas por tema:
- `text-danger`: claro oklch(0.5 0.18 27), oscuro oklch(0.76 0.13 22).
- `text-neutral`: claro oklch(0.42 0.03 262), oscuro oklch(0.82 0.02 255).
- `text-muted-foreground`: claro oklch(0.46 0.04 262), oscuro oklch(0.76 0.03 255).
- Fondos: el de la tarjeta que contiene el error (`card` claro oklch(1 0 0); oscuro oklch(0.245 0.068 262.5)).
  Un `ErrorState` a nivel de página queda sobre `background`.

### Responsive
- **1440:** centrado, mensaje con `max-w-md`; botón de tamaño estándar.
- **390:** una sola columna; `px-4`; el botón «Reintentar» a ancho natural con
  `pointer-coarse:min-h-11`; sin scroll horizontal (el mensaje envuelve con
  `break-words`).

---

## 4. Accesibilidad

### Contraste (medido con la fórmula WCAG 2.2 a partir de los OKLCH de `globals.css`)
Mínimos: 4.5:1 texto normal, 3:1 iconos y texto grande.

| Par (texto sobre fondo) | Mínimo | Claro | Oscuro | Resultado |
| --- | --- | --- | --- | --- |
| `muted-foreground` sobre `neutral-subtle` (cuerpo de `NoAccessNotice`) | 4.5:1 | 6.08 | 6.71 | cumple |
| `muted-foreground` sobre `card` (cuerpo de `ErrorState` en tarjeta) | 4.5:1 | 7.13 | 7.62 | cumple |
| `muted-foreground` sobre `background` (`ErrorState` de página) | 4.5:1 | 6.22 | 8.47 | cumple |
| `text-danger` sobre `card` (icono de red y servidor) | 3:1 | 6.59 | 7.20 | cumple |
| `text-neutral` sobre `neutral-subtle` (icono de aviso) | 3:1 | 7.21 | 8.24 | cumple |
| `text-neutral` sobre `card` (icono `Lock`) | 3:1 | 8.47 | 9.36 | cumple |

El borde `neutral-border` es decorativo (no es borde de control) y no se exige.
El mensaje de error usa `text-muted-foreground`; solo el icono lleva el tono.

### Reglas
- El significado nunca depende solo del color: cada variante tiene icono, título y
  texto distintos. 403 y red se distinguen por palabras («No tienes permiso» /
  «No hay conexión»), no por color.
- `role="status"` para sin acceso y `forbidden`; `role="alert"` para red y
  servidor. El componente se monta una vez por error y no se recrea en cada
  render: sin `key` que cambie entre renders y sin definirlo como componente
  dentro de otro. Así el lector anuncia el error una sola vez.
- Orden de tabulación: acciones del aviso en el orden visual (1, 2); en
  `ErrorState`, solo «Reintentar».
- Objetivo táctil: 44 px con `pointer-coarse:min-h-11` (el mínimo WCAG 2.5.8 es 24 px).
- Movimiento: ninguna animación nueva; el icono de «Reintentar» no gira salvo el
  `loading` actual del botón, que respeta `prefers-reduced-motion`.
- `DisabledReason` es referenciado por `aria-describedby`; el motivo se anuncia
  una sola vez.
- La validación completa requiere prueba manual con lector de pantalla (NVDA o
  VoiceOver) y revisión experta; esta especificación no la sustituye. Verificar
  con axe (política vigente: falla `serious` y `critical`) las pantallas con el
  aviso y con cada variante de `ErrorState`, en tema claro y oscuro.

---

## 5. Otras superficies de PR-A

### 5.1 Selector de apps sin aplicaciones (1.3, `aplicaciones-view.tsx`)
Hoy: `EmptyState` (icono `LayoutGrid`) con «No tienes aplicaciones habilitadas» y
«Pide acceso al jefe de área…». Se mantiene el `EmptyState` dentro de `Card` y de
`section` «Tus aplicaciones»; solo cambia el cuerpo según el rol.

| Rol | Título | Descripción | Acciones |
| --- | --- | --- | --- |
| Sin `systemSettings` | No tienes aplicaciones habilitadas | Pide acceso al jefe de área para empezar a trabajar en GIBO. | ninguna (como hoy) |
| Con `systemSettings` (administrador del sistema) | No tienes aplicaciones de área habilitadas | Tu rol administra la configuración técnica del portal. Entra a las pantallas de administración desde estos enlaces. | «Ir a mi inicio» (ver abajo) |

- Componente: `EmptyState` existente (no `InlineNotice`): es el estado vacío de
  la sección, con icono en círculo `primary-subtle`. Sin tono de alerta.
- Enlaces del administrador: `Link` con `buttonVariants({ variant: 'outline', size: 'sm' })`
  y `pointer-coarse:min-h-11`, dentro del `action` de `EmptyState`. El primero
  es **Ir a mi inicio** → `getDefaultHomeHref(allowedModules)`; si no existe, sin
  enlaces. Los demás enlaces no se inventan: máximo ese uno.
- Responsive: 1440 centrado en la tarjeta; 390 una columna, enlace `w-full sm:w-auto`.
- Estados: loading y error de la vista no cambian. El error usa `ErrorState`
  con `error={…}` y `onRetry={reload}`, sin `title` ni `message` fijos: sustituye
  el literal «Revisa tu conexión e inténtalo de nuevo.» (hoy se muestra aunque
  el fallo sea 403). Título del tipo `server`/`forbidden`; en red conserva «Reintentar».
- Contraste: texto del `EmptyState` sobre `card`, ya medido en §4.

### 5.2 Asistente (`assistant-provider.tsx`, líneas 190 y 675)
No usa `ErrorState`: el error es un mensaje del chat (tono `danger` o `warning`)
y un `toast`. Se conserva el componente y el `role` que ya usa cada uno; cambia
el texto según el tipo de `classifyError`.

| Tipo | Título del mensaje | Cuerpo | Reintentar |
| --- | --- | --- | --- |
| `forbidden` (403) | No tienes permiso para esta acción | `serverError`; si falta: Tu rol no incluye esta acción. Si la necesitas, pídela al jefe de área. | no (`canRetry: false`), tono `warning` |
| `network` | No se pudo enviar tu mensaje | Revisa tu conexión e inténtalo de nuevo. | sí |
| `server` (otro 4xx y 5xx) | No se pudo enviar tu mensaje | `serverError`; si falta: El servicio no respondió. Inténtalo de nuevo en un momento. Si el problema continúa, contacta al administrador del portal. | sí |

Toast de confirmar propuesta (línea 675), `toast.error`:
- 403: **No tienes permiso para confirmar esto. {serverError}** (si no hay `serverError`, solo la primera frase).
- red: **No se pudo confirmar. Revisa tu conexión e inténtalo de nuevo.** (texto vigente)
- servidor: **No se pudo confirmar. {serverError}**; si falta: **No se pudo confirmar. Inténtalo de nuevo; si continúa, avisa al administrador.**
En los tres casos la propuesta vuelve a `PENDIENTE` (no se pierde); en 403 el toast no sugiere reintentar.

### 5.3 Mi trabajo (`mi-trabajo-view.tsx`, línea 199)
Toast de recarga (`toast.error`) con los mismos tres textos que §5.2, cambiando el
verbo: **No se pudo actualizar.**
- 403: **No tienes permiso para ver estos datos. {serverError}**
- red: **No se pudo actualizar. Revisa tu conexión e inténtalo de nuevo.** (texto vigente)
- servidor: **No se pudo actualizar. {serverError}**; si falta: **No se pudo actualizar. Inténtalo de nuevo; si continúa, avisa al administrador.**
Con datos ya cargados se conservan (comportamiento vigente). Sin datos, la vista
muestra `ErrorState` con `error={…}` y `onRetry` (§3), y el toast no se duplica.

---

## 6. Resumen para el implementador

| Pieza | Reutiliza | Nuevo |
| --- | --- | --- |
| `NoAccessNotice` | `InlineNotice` neutral, `buttonVariants`, `getDefaultHomeHref` | `components/no-access-notice.tsx` (`title?`, `children?`) |
| `DisabledReason` | tal cual | nada (solo uso y textos) |
| `ErrorState` `forbidden` | `ErrorState` | `Lock`, sin «Reintentar», `role="status"` |
| `ErrorState` network/server | `ErrorState` | `error`, tipo por `classifyError`, `WifiOff` opcional, texto del servidor |
| Selector de apps, asistente, Mi trabajo | `EmptyState`, mensajes del chat, `toast` | solo textos de §5 |

Sin tokens nuevos, sin colores crudos de Tailwind, textos fijos en español con
tildes y UTF-8 sin BOM.

### Casos de prueba visual sugeridos (e2e)
- Administrador en `/demanda/triage`: ve `NoAccessNotice` (`role="status"`) con el
  cuerpo de §1.3, sin petición a la API y sin «Reintentar».
- Integrante en `/gobierno/auditoria`: ve el aviso solo si no tiene `audit`; el
  administrador ve el texto de Auditoría de §1.3.
- 403 simulado con `{ message }`: `ErrorState` muestra ese mensaje, sin botón
  «Reintentar» y sin «Revisa tu conexión».
- `route.abort()`: «Revisa tu conexión» y botón «Reintentar».
- 500 con mensaje del servidor: se muestra el mensaje y «Reintentar»; no aparece
  «Revisa tu conexión».
- Administrador sin aplicaciones: ve el texto de §5.1 y el enlace «Ir a mi inicio».
- Capturas a 1440 y 390 px, en tema claro **y oscuro**, de `NoAccessNotice` y de
  las tres variantes de `ErrorState`.

## 7. Alcance de `DisabledReason` en PR-A

PR-A no cambia los usos existentes de `DisabledReason` ni `DisabledHint`: la §2 fija el criterio para las pantallas que se toquen en oleadas siguientes. Las pantallas sin acceso pasan a `NoAccessNotice`.
