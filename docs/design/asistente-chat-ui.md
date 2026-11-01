# Asistente de IA · Especificación visual del chat (fase de consulta)

Solo especificación: no hay código de la app en este cambio. Cubre la fase **F2
(solo lectura)** de `agente-ia-propuesta.md` (§10, «Asistente global»). Se apoya
en el contrato ya definido (`/assistant/status`, `/assistant/chat` por SSE,
`/assistant/conversations`). Marca y tokens: `.kiro/steering/25-marca-gibo.md`.

Alcance de esta fase: preguntar por proyectos/solicitudes y por el uso del portal.
**No hay adjuntos, audio, propuestas ni escrituras.** El diseño deja un punto de
extensión (§11) para las tarjetas «propuesta de acción» de F3.

---

## 0. Resumen de decisiones

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Entrada global | Botón «Asistente» en la barra superior (escritorio y móvil) que abre un **Sheet derecho**. | Disponible en todo el portal sin perder el contexto de la pantalla. |
| Sesiones largas | Página **`/asistente`** con historial. En ≥1280 px: lista + conversación en dos columnas. Por debajo: pantallas separadas. | El panel es para preguntas rápidas; la página, para trabajar con el historial. |
| IA no disponible (`available=false`) | El botón **se muestra no disponible** (`aria-disabled`, enfocable) con el motivo en tooltip/descripción. Solo se **oculta** si la API responde 403 (la persona no tiene acceso). | Ocultarlo hace que la gente pregunte «¿dónde está?». Un botón muerto sin motivo es peor. El patrón `unavailable` + `DisabledHint` ya existe (§7.4 del sistema). |
| Streaming | Se pinta el Markdown a medida que llega, a **≤ 30 actualizaciones por segundo**; el lector de pantalla recibe **hitos**, no cada fragmento. | Anunciar cada `delta` vuelve inutilizable el lector. |
| Modal | El panel es **modal** (Radix Dialog, como el menú móvil). | Cero componente nuevo, foco atrapado y Escape resueltos. Se revisará un panel no modal si se pide «leer la pantalla mientras chateo». |
| Estado | Un `AssistantProvider` en el shell conserva conversación activa, borrador y stream en curso entre panel, página y navegación. Cerrar el panel **no** corta una respuesta en curso. | Evita perder una respuesta al cambiar de pantalla. |
| Escrituras | No hay. Las herramientas son de solo lectura y se muestran como «fuentes consultadas». | Contexto de la fase. |

Supuestos (a validar con API):
1. `tool.label` llega ya en español y en gerundio mientras corre («Consultando solicitudes…») o se compone en el cliente (§2.3). El cliente nunca muestra `tool.name`.
2. `error.message` del SSE es legible en español; si falta, se usa el copy genérico de §8.
3. `GET /assistant/conversations` sigue respondiendo aunque el asistente esté apagado (el historial se puede leer). Si no, la página muestra solo el aviso.
4. No hay paginación de mensajes: `GET /conversations/{id}` devuelve todos.
5. `title` puede venir vacío: se muestra «Conversación sin título».

---

## 1. Puntos de entrada

### 1.1 Botón del encabezado

- **Escritorio (≥1024 px):** en la barra superior de `AppShell` (`h-12`), a la izquierda de `NotificationBell`. `Button variant="ghost"` con icono `Sparkles` y texto «Asistente» (`h-9 gap-1.5 px-2.5`).
- **Móvil/tableta (<1024 px):** en `MobileNav`, entre la marca y la campana. Solo icono (`size="icon"`, 36 px; `pointer-coarse:min-w-10`).
- `aria-label="Abrir asistente"` (el texto visible «Asistente» está contenido en el nombre accesible, WCAG 2.5.3). `aria-haspopup="dialog"`.
- **Sin tooltip** en el botón activo (igual que «Abrir menú»: Radix devuelve el foco al disparador).
- En `/asistente` el botón **no se pinta** (ya estás en él); el ítem de menú lateral queda con `aria-current="page"`.

Estados del botón:

| Estado de `/assistant/status` | Botón |
| --- | --- |
| Cargando o error de red al consultarlo | Normal (optimista). Si el chat falla, lo dirá el propio chat. |
| `available: true` | Normal. |
| `available: false` | `unavailable` (`aria-disabled="true"`, opacidad 50, sigue en el orden de tabulación). `DisabledHint reason={reason} label="Asistente"`: el motivo sale en tooltip y como descripción accesible. Al pulsar, `onUnavailableClick` abre el tooltip (no el panel). |
| HTTP 403 | No se pinta ni en barra ni en menú lateral. |

El estado se consulta **una vez al iniciar sesión, al abrir el panel o la página y tras un `error` del stream**. Sin sondeo.

### 1.2 Ítem en el menú lateral

Ítem «Asistente» (`Sparkles`) en el grupo de herramientas generales del sidebar (`getVisibleNavGroups`), con ruta `/asistente`. Es la vía descubrible en móvil (cajón) y la que permite marcar la ruta activa. Visibilidad por permiso igual que el botón. El nombre del módulo de permiso lo define la API; no se especifica aquí.

### 1.3 Cuándo usar cada superficie

| | Panel lateral (Sheet) | Página `/asistente` |
| --- | --- | --- |
| Para qué | Preguntas puntuales mientras trabajas en otra pantalla | Sesiones largas, volver a conversaciones anteriores, ver tablas anchas |
| Historial | Vista interna «Conversaciones» (misma lista, §5) | Siempre visible (≥1280) o pantalla propia |
| Pasar de uno a otro | Botón «Abrir en página completa» (`Maximize2`, solo ≥640 px) navega a `/asistente/{id}` **conservando la conversación** y cierra el panel | La página no tiene panel |
| Móvil | Pantalla completa (390×844) | Dos pantallas: lista → conversación |

Regla: **una conversación es la misma** en ambos. El panel abre siempre la última conversación activa de la sesión del navegador (o una vacía si no hay), no la última del servidor.

---

## 2. Anatomía de la conversación

### 2.1 Mensaje del usuario

```
                                     ┌───────────────────────────┐
                                     │ ¿Qué solicitudes P1 siguen │
                                     │ abiertas?                  │
                                     └───────────────────────────┘
```

- Alineado a la derecha: `ml-auto max-w-[85%] rounded-xl bg-primary-subtle px-3.5 py-2.5 text-sm text-foreground whitespace-pre-wrap wrap-break-word`.
- Texto plano (no se interpreta Markdown); se respetan los saltos de línea.
- `<article aria-label="Tu mensaje">`. Sin avatar ni nombre visible.

### 2.2 Mensaje del asistente

```
 ✦ Asistente
 ┌──────────────────────────────────────────────┐
 │ ⟳ Consultando solicitudes…                    │  ← §2.3
 │                                              │
 │ Hay **4 solicitudes P1** abiertas:           │  ← Markdown
 │ ┌───────────┬──────────┬─────────┐           │
 │ │ Solicitud │ Estado   │ Líder   │           │
 │ └───────────┴──────────┴─────────┘           │
 │ Ver [Portafolio](/seguimiento/portafolio)    │
 │                                              │
 │ [⧉ Copiar]                                   │  ← solo al terminar
 └──────────────────────────────────────────────┘
```

- Fila de etiqueta: `flex items-center gap-1.5 text-meta font-medium text-muted-foreground` con `Sparkles` (`size-3.5`, `aria-hidden`) y «Asistente».
- Superficie según contenedor (prop `surface` de `ChatThread`):
  - `canvas` (panel, fondo lienzo): `rounded-xl bg-card px-4 py-3 shadow-card`.
  - `card` (página, ya dentro de una tarjeta): sin caja, `px-0 py-1`, para no apilar sombras.
- Ancho: `w-full` en móvil; en la página `max-w-3xl` centrado (§6).
- `<article aria-label="Respuesta del asistente">`, `tabIndex={-1}` (destino de foco programático).
- **Markdown**: `MarkdownViewContent` con una **variante `chat`** (hoy no existe; es el cambio a un componente existente):
  - Párrafos y listas en `text-foreground` (la variante actual usa `text-muted-foreground`, insuficiente para leer respuestas largas).
  - Enlaces **internos** (`href` que empieza por `/` y no por `//`) → `next/link`, **misma pestaña**, `text-link underline underline-offset-4`. Externos → `target="_blank"` con icono `ExternalLink` y `<span class="sr-only"> (se abre en una pestaña nueva)</span>`. Cualquier otro esquema (`javascript:`, `data:`) se renderiza como texto.
  - Encabezados: `h1`/`h2` → elemento `h3` con `text-base font-semibold`; `h3`/`h4` → elemento `h4` con `text-sm font-semibold`. Nunca `h1`/`h2` dentro del chat (rompería la jerarquía de la página).
  - Tablas: envueltas en `<div role="region" aria-label="Tabla de la respuesta" tabIndex={0} className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring">`; `th`/`td` con `whitespace-nowrap` salvo la primera columna (`min-w-40 whitespace-normal`). Cabecera `bg-muted/40`. Una región con scroll **debe** ser enfocable para operarse con teclado.
  - `pre`: ya tiene `overflow-x-auto`; añadir `tabIndex={0}`.
  - Espaciado entre bloques `gap-2.5`; `leading-relaxed`.
  - Los números de tablas y cifras: `tabular-nums`.
- **Render de streaming**: el texto acumulado se renderiza en cada frame (`requestAnimationFrame`, máx. ~30/s). Markdown incompleto (tabla a medias, `**` sin cerrar) se tolera: se renderiza lo que haya; no se muestra «cursor» parpadeante (menos ruido y sin animación que desactivar).
- Acciones del pie (solo cuando el turno terminó, `status` = `done` o `stopped`): fila `mt-2 flex items-center gap-1 -ml-2`.
  - **Copiar** (`Button variant="ghost" size="sm"`, icono `Copy` + texto «Copiar»). Copia el **Markdown crudo** (`text`). Tras copiar: icono `Check` + «Copiado» 2 s; el aviso se anuncia en el live region (§7.3). Si el portapapeles falla: `toast.error('No se pudo copiar. Selecciona el texto y cópialo manualmente.')`.
  - Siempre visibles (no solo al pasar el ratón): hay teclado y táctil.

### 2.3 Herramientas consultadas (`ToolActivity`)

Va **arriba** del texto del mensaje, dentro del mismo bloque. Tres estados:

**En curso** (al menos una herramienta `running`):

```
 ⟳ Consultando solicitudes…          (2 de 3)
```
`flex items-center gap-2 text-meta text-muted-foreground`; `LoaderCircle` con `animate-spin motion-reduce:animate-none`. Muestra el `label` de la herramienta en curso más reciente; el contador «(n de total)» aparece desde la segunda herramienta. No es un botón.

**Terminado** (ninguna `running`): botón-resumen expandible

```
 ▸ Consultó 3 fuentes                    (colapsado)
 ▾ Consultó 3 fuentes                    (expandido)
     ✓ Solicitudes
     ✓ Portafolio
     ⚠ Documentos · no se pudo consultar
```
- Botón: `inline-flex min-h-8 items-center gap-1.5 rounded-md text-meta font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-10` con `ChevronRight` que rota 90° al abrir (`motion-reduce:transition-none`). `aria-expanded`, `aria-controls`.
- Plural: «Consultó 1 fuente» / «Consultó 3 fuentes». Con errores: «Consultó 2 fuentes · 1 no respondió» (el texto lleva el significado, no solo el color).
- Lista expandida: `<ul aria-label="Fuentes consultadas" class="mt-1.5 flex flex-col gap-1 pl-5 text-meta">`. Cada ítem: icono `CircleCheck` (`text-success`) o `TriangleAlert` (`text-warning`) `size-3.5` + `label` (en pasado: se usa el `label` que da la API; si solo llega gerundio, se mapea «Consultando X…» → «X»). Un `tool.status='error'` **no** bloquea la respuesta: el modelo puede responder con lo que tenga.
- Por defecto **colapsado**. Se persiste solo en memoria.
- Conversaciones cargadas del historial (`tools[]` sin `id`): mismo resumen, sin estado en curso.
- Sin herramientas en el turno (p. ej. ayuda del portal): no se pinta nada.

**Estado «Pensando»** (turno enviado, aún sin `tool` ni `text`): `Pensando…` en `text-meta text-muted-foreground` con tres puntos `animate-pulse motion-reduce:animate-none`. Se reemplaza por el texto al llegar el primer `delta`.

### 2.4 Detener, errores del turno y reintento

- **Detener** vive en el composer (§3): aborta el `fetch`. El mensaje conserva el texto recibido y añade al pie, en `text-meta text-muted-foreground`: «Respuesta detenida.» (con `Square` `size-3`). Se pueden seguir copiando.
- **Error durante el stream** (evento `error` o corte de red con texto parcial): se conserva lo recibido y debajo `InlineNotice tone="danger" role="alert"` (§4.5) con «Reintentar».

### 2.5 Nueva conversación

Botón `SquarePen` «Nueva conversación» en la cabecera del panel y de la página. Si hay un stream en curso, **no pregunta**: el stream continúa en segundo plano hasta terminar (se guarda en el servidor) y la vista pasa a un estado vacío. (Si la API no lo soporta, ver punto abierto P2.)

---

## 3. Composer

```
┌──────────────────────────────────────────────┐
│ Escribe tu pregunta…                    [ ➤ ] │  ← textarea + botón
└──────────────────────────────────────────────┘
 Enter envía · Mayús+Enter salto de línea  3 812 / 4 000
```

- Contenedor: `border-t bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]` en el panel; en la página, `border-t px-4 pt-3 pb-4` dentro de la tarjeta.
- Fila: `flex items-end gap-2`.
- **Textarea** (reutiliza `ui/textarea`) con `className="min-h-11 max-h-32 resize-none text-base md:min-h-10 md:max-h-40 md:text-sm"`:
  - `text-base` en móvil: con menos de 16 px iOS amplía la pantalla al enfocar.
  - Autoajuste: `field-sizing-content` ya viene en `Textarea`; **Firefox aún no lo soporta**, así que `useAutosizeTextarea` (fallback con `scrollHeight`) se activa si `!CSS.supports('field-sizing', 'content')`. Crece hasta 8 líneas ≈ `max-h-40` (160 px) en escritorio y `max-h-32` (128 px) en móvil, y luego hace scroll interno.
  - `rows={1}`, `aria-label="Mensaje para el asistente"`, `placeholder="Escribe tu pregunta…"`, `aria-describedby` = id de la ayuda de teclas y del contador.
  - `autoComplete="off"`, `enterKeyHint` = `send` en puntero fino, `enter` en táctil.
- **Teclado**:
  - Puntero fino: `Enter` envía; `Mayús+Enter` inserta salto. **Nunca** se envía durante composición IME (`event.nativeEvent.isComposing`).
  - Táctil (`(pointer: coarse)`): `Enter` inserta salto; se envía con el botón (teclados móviles no tienen Mayús+Enter cómodo).
  - Durante el stream, `Enter` no envía (no hay cola) y la ayuda cambia a «Espera a que termine o pulsa Detener.».
- **Botón enviar**: `Button size="icon"` con `size-11 md:size-10`, icono `SendHorizontal`, `aria-label="Enviar mensaje"`, `type="submit"` del `<form>`. `disabled` si el texto recortado está vacío o supera 4 000.
- **Botón detener** (reemplaza a enviar mientras hay stream): `variant="outline"`, icono `Square`, `aria-label="Detener respuesta"`, con texto visible «Detener» desde `md` (`hidden md:inline`). El foco **no se mueve**: el botón ocupa la misma posición y, al aparecer, el textarea conserva el foco si lo tenía.
- **Ayuda de teclas**: `text-meta text-muted-foreground`, `hidden md:block` (en móvil queda `sr-only` para el `aria-describedby`): «Enter para enviar · Mayús+Enter para salto de línea».
- **Contador**:
  - Oculto hasta **3 500** caracteres (87,5 % de 4 000). Desde ahí `tabular-nums text-meta text-muted-foreground`: «3 812 / 4 000» (separador de miles con espacio fino, `Intl` es-CO).
  - Desde **3 900**: `text-warning`; texto sigue visible.
  - **> 4 000**: `text-danger` + icono `CircleAlert` + mensaje bajo el campo «Tu mensaje supera el límite de 4 000 caracteres. Acórtalo para enviarlo.» (`id` enlazado por `aria-describedby`, `aria-invalid="true"` en el textarea). No se corta el texto pegado (sin `maxLength`): se avisa.
  - Anuncio accesible solo al **cruzar umbrales** (3 500, 3 900, >4 000), nunca por tecla (§7.3).
- **Borrador**: se conserva en el provider al cerrar el panel o navegar; se limpia al enviar. Si el envío falla antes de empezar el stream, el texto **vuelve** al campo.
- **Estados deshabilitados**:
  - IA no disponible: textarea `disabled` con placeholder «El asistente no está disponible ahora.», botón enviar `disabled`, y el `InlineNotice` del motivo encima (§4.6).
  - Cargando una conversación: textarea habilitado (se puede ir escribiendo), envío bloqueado hasta que cargue (`aria-busy` en el hilo).
  - Sin red (`navigator.onLine === false`): textarea habilitado; al enviar se muestra el error de red (§4.4).
- Pie de confianza (solo estado vacío y debajo del composer en la página, `text-meta text-muted-foreground`): «El asistente consulta tus datos del portal con tus permisos y puede equivocarse. Verifica la información importante.»

---

## 4. Estados

### 4.1 Vacío (con sugerencias)

```
┌────────────────────────────────────────────┐
│                    ✦                       │
│        ¿En qué te puedo ayudar?            │
│  Pregúntame por tus solicitudes, proyectos │
│  o cómo usar el portal.                    │
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │ ¿Qué solicitudes están bloqueadas y    │ │
│ │ por qué?                               │ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ ¿Qué solicitudes P1 siguen abiertas?   │ │
│ └────────────────────────────────────────┘ │
│  … (5 sugerencias)                         │
│  El asistente consulta tus datos …         │
└────────────────────────────────────────────┘
```

- Contenedor: `flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6 text-center`. Icono `Sparkles` `size-5 text-muted-foreground` (misma regla de `EmptyState`: 20 px, sin círculo). **Se compone con el mismo estilo que `EmptyState`**, pero como contiene una lista de acciones se implementa como `AssistantEmptyState` (no se fuerza dentro de `EmptyState`, cuyo `action` no admite una lista semántica).
- Título `text-base font-semibold` «¿En qué te puedo ayudar?». Descripción `text-sm text-muted-foreground max-w-sm`.
- Sugerencias: `<ul aria-label="Preguntas sugeridas" class="flex w-full max-w-md flex-col gap-2">`; cada una un `Button variant="outline"` `h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2 text-left text-sm font-normal`. **Al activarla se envía de inmediato** (son consultas de solo lectura; una pulsación menos). Con el teclado se recorren con Tab.
- Sugerencias (gestión de demanda):
  1. «¿Qué solicitudes están bloqueadas y por qué?»
  2. «¿Qué solicitudes de prioridad P1 siguen abiertas?»
  3. «Muéstrame mis tareas que vencen esta semana.»
  4. «¿Qué solicitudes están pendientes de triage?»
  5. «¿Cómo apruebo un documento en el portal?»
- En 390×844 con teclado abierto no caben todas: el contenedor hace scroll; el título y las 2 primeras quedan visibles. Si la altura útil es `< 520 px` se ocultan las sugerencias 4 y 5 (`max-h-[520px]:hidden` mediante contenedor), nunca se recortan a medias.

### 4.2 Cargando historial / conversación

- **Lista**: 5 filas `Skeleton` `h-14 rounded-lg`, `<div role="status" aria-busy="true"><span class="sr-only">Cargando conversaciones…</span>…</div>`.
- **Conversación abierta**: esqueleto con un bloque de usuario (`ml-auto h-10 w-2/3`) y un bloque del asistente (`h-24 w-full`, `rounded-xl`), y `sr-only` «Cargando conversación…». Composer visible.
- Respeta `motion-reduce` (el `Skeleton` del proyecto ya lo hace; verificar).

### 4.3 Conversación no encontrada (404 o eliminada)

`EmptyState size="compact"` `icon={MessageSquareOff}` «No encontramos esta conversación.» / «Puede que se haya eliminado.» + `Button` «Nueva conversación». El foco va al `h2` de la zona.

### 4.4 Error de red / servidor (antes de empezar el stream)

El mensaje del usuario **se queda** en el hilo. Debajo:

```
 ⚠ No se pudo enviar tu mensaje
   Revisa tu conexión e inténtalo de nuevo.            [Reintentar]
```
`InlineNotice tone="danger" role="alert" title="No se pudo enviar tu mensaje" action={<Button variant="outline" size="sm">Reintentar</Button>}`. «Reintentar» vuelve a enviar el mismo texto. Variantes de mensaje:
- Sin red / `fetch` falla: «Revisa tu conexión e inténtalo de nuevo.»
- 429: tone `warning`, título «Vas muy rápido», «Espera unos segundos antes de enviar otra pregunta.» Sin botón; se reactiva solo tras 10 s o con el siguiente envío.
- 5xx: «El servicio no respondió. Inténtalo de nuevo en un momento. Si el problema continúa, contacta al administrador del portal.»
- 401: la sesión se trata con el manejo global existente (ver `actor-context`); el chat no inventa su propio mensaje.
- Fallo al **cargar la lista o una conversación**: `ErrorState size="compact"` con `onRetry` y título «No fue posible cargar las conversaciones.» / «No fue posible cargar la conversación.».

### 4.5 Error del asistente (evento `error`)

`InlineNotice tone="danger" role="alert" title="El asistente no pudo completar la respuesta"` con `error.message` (o, si falta, «Inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal.») y «Reintentar». Conserva el texto parcial recibido. Después se vuelve a consultar `/assistant/status` por si la causa fue presupuesto agotado (§4.6).

### 4.6 IA apagada / presupuesto agotado

Mensajes de ejemplo para `reason` (los redacta la API): «El asistente está desactivado por el administrador.» / «Se alcanzó el presupuesto mensual del asistente. Vuelve a intentarlo cuando se renueve.»

```
 ⚠ El asistente no está disponible
   Se alcanzó el presupuesto mensual del asistente.
   Puedes seguir leyendo tus conversaciones anteriores.
```
`InlineNotice tone="warning" role="status" title="El asistente no está disponible"`; `reason` en el cuerpo; segunda línea fija «Puedes seguir leyendo tus conversaciones anteriores.» (si el supuesto 3 es falso, se omite). Ubicación: arriba del hilo (sticky bajo la cabecera, `mx-3 mt-3`). Composer deshabilitado (§3). Si el aviso aparece **durante** una sesión, el foco no se mueve; se anuncia por `role="status"`.

### 4.7 Conversación larga

- Hilo: `flex-1 overflow-y-auto overscroll-contain scroll-smooth motion-reduce:scroll-auto`.
- **Anclaje**: mientras la persona esté a ≤ 80 px del fondo, cada `delta` mantiene el scroll abajo. Si sube más, **se suspende** el anclaje y aparece el botón flotante.
- **Botón «Ir al final»**: `Button variant="outline" size="sm"` con `ArrowDown`, `rounded-full shadow-card bg-background` posicionado `absolute bottom-3 left-1/2 -translate-x-1/2` sobre el hilo (contenedor `relative`). Visible solo cuando no se está al fondo. Si llegó contenido nuevo mientras estaba arriba, el texto es «Ir al final · hay respuesta nueva»; si no, «Ir al final». Al pulsarlo reancla. No roba el foco (se opera por Tab; no se anuncia más allá de su nombre).
- Al **enviar** un mensaje se fuerza el scroll al fondo.
- Al abrir una conversación existente: scroll al final sin animación.
- Rendimiento: `React.memo` por mensaje; solo el mensaje en streaming se vuelve a renderizar. Sin virtualización en esta fase (conversaciones de decenas de mensajes).

---

## 5. Historial

### 5.1 Lista (`ConversationList`)

```
 Conversaciones                        [＋ Nueva]
 ─────────────────────────────────────────────
 Hoy
 ▌ Solicitudes P1 abiertas           14:05  [🗑]
   Tareas de esta semana             09:41  [🗑]
 Ayer
   Cómo aprobar un documento        ayer    [🗑]
 Últimos 7 días
   …
```
- Contenedor de la lista: `<nav aria-label="Conversaciones anteriores">` con `<ul class="flex flex-col gap-0.5 p-2">`.
- Agrupado por `updatedAt` en **Hoy**, **Ayer**, **Últimos 7 días**, **Anteriores** (`<li role="presentation">` con `<h3 class="px-2 pt-3 pb-1 text-meta font-medium text-muted-foreground">`). Orden descendente.
- Fila: `group flex items-center gap-1 rounded-lg` ; enlace principal `flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-2.5 py-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring` con título (`truncate text-sm font-medium`) y fecha (`text-meta text-muted-foreground tabular-nums`; hora si es hoy, «ayer», o `formatDateTime`). Título completo en `title=`.
- Seleccionada: `bg-primary-subtle` + `aria-current="page"` (no solo color: además `font-semibold` en el título).
- **Solo se puede abrir y eliminar** (sin renombrar, anclar ni buscar en esta fase).
- Eliminar: `Button variant="ghost-destructive" size="icon-sm"` con `Trash2`, `aria-label="Eliminar conversación «{título}»"`, siempre visible (táctil: 40 px por `pointer-coarse`). Abre `ConfirmDialog` (§5.2).
- Vacío: `EmptyState size="compact" icon={MessageSquare} title="Aún no tienes conversaciones." description="Cuando le preguntes algo al asistente, aparecerá aquí."`.
- Cargando / error: §4.2 y §4.4.

### 5.2 Confirmación de eliminación

`ConfirmDialog`:
- `title`: «¿Eliminar la conversación «{título}»?»
- `description`: «Se borrará todo el historial de este chat. Esta acción no se puede deshacer.»
- `confirmLabel`: «Eliminar conversación» · `tone="danger"`.
- `onConfirm`: `DELETE /assistant/conversations/{id}`; éxito → `toast.success('Conversación eliminada.')`; fallo → `toast.error('No se pudo eliminar la conversación. Inténtalo de nuevo.')`.
- Foco al cerrar: `returnFocusTo` = fila siguiente (o la anterior; si no hay, el botón «Nueva conversación»). Si se eliminó la conversación abierta, la vista pasa al estado vacío y el foco va al textarea.

### 5.3 En el panel y en móvil

- **Panel**: botón `History` «Conversaciones» en la cabecera alterna la vista interna del Sheet: *Conversación* ↔ *Conversaciones*. En la vista de lista el título pasa a «Conversaciones», aparece `ArrowLeft` «Volver a la conversación» a la izquierda, y se oculta el composer. Al elegir una conversación se vuelve a la vista de conversación con foco en el textarea.
- **Página en <1280 px (móvil, tableta y portátil estrecho)**: pantallas separadas:
  - `/asistente` → lista (con `Button` «Nueva conversación» arriba, ancho completo en móvil).
  - `/asistente/{id}` → conversación con cabecera «← Conversaciones» (`Link` con `ArrowLeft`, `min-h-11`) + título truncado.
  - `/asistente/nueva` → conversación vacía. Al llegar `conversation {conversationId}` se hace `history.replaceState` a `/asistente/{id}` **sin remontar** el componente (el stream no se interrumpe).
  - En ≥1280 px, `/asistente` y `/asistente/nueva` muestran el layout de dos columnas con la conversación vacía; `/asistente/{id}` lo muestra con esa seleccionada.

---

## 6. Responsive y medidas

Tailwind 4 con puntos de corte por defecto (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Sidebar fijo desde `lg` (`w-60`; modo riel `rail:w-14`). Barra superior de escritorio `h-12`; barra móvil `h-14`.

### 6.1 Panel lateral (Sheet derecho)

```
 390 × 844 (móvil)                     1440 × 900 (escritorio)
┌──────────────────────┐        ┌──────────── contenido ─────┬──────────────┐
│ Asistente  ⟲ ✎     ✕ │ 56     │  (portal visible,          │ Asistente ⟲ ✎ ⤢ ✕│ 56
├──────────────────────┤        │   oscurecido 40 %)         ├──────────────┤
│  [aviso si aplica]   │        │                            │   hilo       │
│                      │        │                            │              │
│   hilo / vacío       │ flex-1 │                            │              │
│                      │        │                            ├──────────────┤
├──────────────────────┤        │                            │  composer    │
│ [ textarea ]    [ ➤ ] │ ≈72+  │                            │              │
└──────────────────────┘        └────────────────────────────┴──────────────┘
```

- `SheetContent side="right" closeLabel="Cerrar asistente" aria-describedby={undefined}` con `className="w-full max-w-none gap-0 bg-background sm:w-[440px] xl:w-[480px]"`. (El `sheetVariants` actual fija `w-72 max-w-[85vw] bg-sidebar`; `cn` con `tailwind-merge` deja ganar estas clases. No hay que tocar `ui/sheet.tsx`.)
- `SheetTitle` visible «Asistente» (`text-base font-semibold`; es el nombre del diálogo).
- Cabecera: `flex h-14 shrink-0 items-center gap-1 border-b pl-4 pr-14` (el `pr-14` reserva el botón cerrar absoluto `top-3 right-3`, como exige `SheetContent`). Acciones `Button variant="ghost" size="icon-sm"`: `History` («Conversaciones»), `SquarePen` («Nueva conversación»), `Maximize2` («Abrir en página completa», `hidden sm:inline-flex`). Con Tooltip (los ya existentes `ui/tooltip`) excepto el cerrar.
- Hilo: `relative flex min-h-0 flex-1 flex-col`; interior `overflow-y-auto px-4 py-4`; mensajes `flex flex-col gap-4`.
- Composer: ver §3.
- En 390 px: `px-4` = 358 px útiles; usuario `max-w-[85%]` ≈ 304 px; mensajes del asistente a ancho completo. Objetivos táctiles ≥ 40 px (`pointer-coarse`).
- Altura: `h-dvh` ya viene en el Sheet. Para que el teclado virtual reduzca el hilo y no tape el composer, el `viewport` de Next declara `interactiveWidget: 'resizes-content'` (efectivo en Chrome/Android; en iOS Safari el composer se mantiene visible con `position: sticky` al fondo del contenedor flex y `pb-[env(safe-area-inset-bottom)]`).

### 6.2 Página `/asistente` · escritorio (≥1280 px, ejemplo 1440×900)

```
┌ sidebar 240 ┬──────────────────── main (px-8 → ancho 1136) ──────────────────────┐
│             │ ┌ lista 320 ┐ 24 ┌────────── conversación (792) ─────────────────┐ │
│             │ │Conversac. │    │ Título de la conversación            [＋ Nueva]│ │
│             │ │  [＋Nueva]│    ├───────────────────────────────────────────────┤ │
│             │ │ Hoy       │    │            hilo (max-w-3xl centrado)          │ │
│             │ │ ▌ …       │    │                                               │ │
│             │ │           │    ├───────────────────────────────────────────────┤ │
│             │ └───────────┘    │ composer (max-w-3xl centrado)                 │ │
└─────────────┴──────────────────┴───────────────────────────────────────────────┘
```

- `<h1 class="sr-only">Asistente</h1>` (la identidad visual la dan las dos tarjetas; no hay `PageHeader` para no gastar 80 px de altura).
- Contenedor: `grid min-h-[28rem] grid-cols-1 gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]` con altura `h-[calc(100dvh-6rem)]` (barra 48 + padding vertical `py-6` = 96 px en `lg`); en `md` a `lg` la barra móvil mide 56: `md:h-[calc(100dvh-6.5rem)] lg:h-[calc(100dvh-6rem)]`; en `<md` (`py-5`): `h-[calc(100dvh-6rem)]`.
- Tarjeta de lista: `flex min-h-0 flex-col rounded-xl bg-card shadow-card`; cabecera `flex h-14 items-center justify-between px-4` con `<h2 class="text-sm font-semibold">Conversaciones</h2>` y «Nueva» (`Button size="sm" variant="outline"`); lista con `overflow-y-auto`.
- Tarjeta de conversación: `flex min-h-0 min-w-0 flex-col rounded-xl bg-card shadow-card`; cabecera `flex h-14 items-center gap-2 border-b px-4` con `<h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{título | «Nueva conversación»}</h2>`.
- Hilo: `px-4 py-5 md:px-6`; contenido `mx-auto w-full max-w-3xl` (768 px; con 792 − 48 = 744 de interior cabe sin desborde). Mensajes `gap-5`. Sin sombra apilada: `surface="card"` (§2.2).
- Composer: `mx-auto w-full max-w-3xl px-4 pb-4 md:px-6`.
- Con el sidebar en modo riel (`w-14`) la conversación se ensancha; el `max-w-3xl` mantiene la medida de lectura.

### 6.3 Página · móvil y tableta (<1280 px)

```
 390 × 844  lista                       390 × 844  conversación
┌──────────────────────┐              ┌──────────────────────┐
│ ☰ GIBO       🔔 ◐ 👤 │ 56           │ ☰ GIBO       🔔 ◐ 👤 │ 56
├──────────────────────┤              ├──────────────────────┤
│ Asistente            │              │ ← Conversaciones  [＋]│
│ Tus conversaciones…  │              │ Solicitudes P1 abier…│
│ [＋ Nueva conversación]│            ├──────────────────────┤
│ ┌──────────────────┐ │              │  hilo                │
│ │ Hoy              │ │              │                      │
│ │ ▌ Solicitudes P1 │ │              ├──────────────────────┤
│ └──────────────────┘ │              │ [ textarea ]   [ ➤ ] │
└──────────────────────┘              └──────────────────────┘
```
- Lista: `PageHeader title="Asistente" description="Pregunta por tus solicitudes y proyectos, o cómo usar el portal." actions={<Button>Nueva conversación</Button>}` (en móvil el botón baja a ancho completo por el `flex-wrap` del header) y debajo la lista dentro de una tarjeta `rounded-xl bg-card shadow-card`.
- Conversación: tarjeta `h-[calc(100dvh-6rem)] md:h-[calc(100dvh-6.5rem)] rounded-xl bg-card shadow-card` (390: 844 − 96 = 748 px de alto). Cabecera: `Link` «← Conversaciones» `Button variant="ghost" size="sm"` + título `truncate` + `SquarePen` icono.
- Contenido con `mx-auto w-full max-w-3xl` para tabletas (768–1279).
- Composer pegado al fondo de la tarjeta, mismas reglas.

### 6.4 Tokens y clases permitidas (resumen)

| Elemento | Clases |
| --- | --- |
| Fondo del panel | `bg-background` (lienzo / marino) |
| Mensaje del asistente (panel) | `bg-card rounded-xl shadow-card` |
| Mensaje del usuario | `bg-primary-subtle text-foreground rounded-xl` |
| Texto secundario | `text-meta text-muted-foreground` |
| Enlaces | `text-link` |
| Estados | `text-success` / `text-warning` / `text-danger` con icono y texto |
| Foco | `focus-visible:outline-2 focus-visible:outline-ring` (ya en `Button`/`Textarea`) |
| Separadores | `border-b` / `border-t` (baja opacidad del tema) |

Prohibido color crudo de Tailwind, hex y `text-primary`. **Medir contraste en claro y oscuro**: `text-foreground` sobre `bg-primary-subtle` (burbuja de usuario), `text-link` sobre `bg-card`, `text-muted-foreground` sobre `bg-card` y `bg-background`, `text-warning`/`text-danger` sobre `bg-card`. No se declaran ratios aquí porque no se midieron.

---

## 7. Accesibilidad

### 7.1 Roles y estructura

| Elemento | Marcado |
| --- | --- |
| Panel | Diálogo Radix (`role="dialog"`, `aria-modal`), nombre = `SheetTitle` «Asistente». |
| Hilo | `<div role="log" aria-label="Conversación con el asistente" aria-live="off" aria-relevant="additions" aria-busy={streaming} tabIndex={0}>`. `aria-live="off"` **explícito** (el `role=log` es polite por defecto y leería cada fragmento). `tabIndex=0` para desplazarlo con flechas. Foco: `focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`. |
| Mensajes | `<article aria-label="Tu mensaje">` / `<article aria-label="Respuesta del asistente">`. |
| Fuentes consultadas | `<button aria-expanded aria-controls>` + `<ul aria-label="Fuentes consultadas">`. |
| Sugerencias | `<ul aria-label="Preguntas sugeridas">` de botones. |
| Composer | `<form aria-label="Enviar mensaje al asistente">`, textarea con `aria-label`, `aria-describedby` (ayuda de teclas, contador, error). |
| Historial | `<nav aria-label="Conversaciones anteriores">`, enlace activo con `aria-current="page"`. |
| Avisos | `InlineNotice role="alert"` para errores del turno; `role="status"` para «no disponible». |
| Iconos decorativos | `aria-hidden="true"`. |

### 7.2 Orden de foco

Panel: al abrir, el foco va al **textarea** (`onOpenAutoFocus` → `preventDefault()` + `textarea.focus()`), salvo que se abra desde la vista de lista, donde va al primer enlace. Orden de Tab: Conversaciones → Nueva conversación → Abrir en página → (aviso con acción) → hilo (región con scroll) → controles dentro de mensajes (Fuentes, Copiar, enlaces) → «Ir al final» → textarea → Enviar/Detener → **Cerrar** (el Sheet lo coloca al final del DOM aunque se vea arriba a la derecha; se acepta porque es el comportamiento de todo el portal y `Escape` también cierra). Al cerrar, el foco vuelve al botón «Asistente».

Página: Saltar al contenido → … → lista (enlaces y papelera) → cabecera de conversación → hilo → composer.

Tras **enviar**, el foco permanece en el textarea. Tras **eliminar**, §5.2. Tras **Nueva conversación**, al textarea. Tras elegir una conversación en la lista del panel, al textarea.

### 7.3 Región viva (`AssistantLiveRegion`)

Un único `<div role="status" aria-live="polite" aria-atomic="true" class="sr-only">` por superficie. **Se anuncian hitos, no texto**:

| Evento | Anuncio |
| --- | --- |
| Mensaje enviado | «Mensaje enviado. El asistente está pensando.» |
| Primera herramienta en curso | «Consultando {label}.» (las siguientes no se anuncian) |
| Primer `delta` | «El asistente está respondiendo.» |
| `done` | «El asistente terminó de responder. Consultó {n} fuentes.» (omite la segunda frase si n = 0) |
| Detener | «Respuesta detenida.» |
| Copiar | «Respuesta copiada.» |
| Contador | «Te quedan 500 caracteres.» (3 500) · «Te quedan 100 caracteres.» (3 900) · «Superaste el límite de 4 000 caracteres.» (>4 000) |
| Cambio de vista en el panel | «Conversaciones.» / «Conversación.» |

El contenido de la respuesta **no** se lee automáticamente: la persona lo lee al navegar al `article` (lectores: tecla de artículos/regiones) con el foco en el composer. El anuncio de `done` es la señal de que ya puede leerlo. Los errores usan `role="alert"` (asertivo) y se anuncian solos.

### 7.4 Teclado

| Tecla | Acción |
| --- | --- |
| `Enter` (puntero fino) | Enviar |
| `Mayús+Enter` | Salto de línea |
| `Esc` | Cierra el panel (el stream sigue) · cierra diálogos |
| `Tab` / `Mayús+Tab` | Orden de §7.2 |
| Flechas / `Re Pág` / `Av Pág` / `Inicio` / `Fin` | Desplazan el hilo cuando tiene el foco |
| `Enter`/`Espacio` | Activa botones; en «Fuentes consultadas» expande/colapsa |

Sin atajo global en esta fase (evita colisiones con el buscador y con lectores).

### 7.5 Otros

- Contraste y no depender del color: todo estado lleva icono y texto (§2.3, §4).
- `prefers-reduced-motion`: sin `animate-spin`/`animate-pulse`/`scroll-smooth`; la rotación del chevrón sin transición.
- Zoom 200 % y texto 400 % (reflow a 320 px): el composer y la cabecera no desbordan (`min-w-0`, `flex-wrap` donde aplique); las tablas se desplazan en su región.
- Tamaño de objetivo: ≥ 24 px siempre, ≥ 40 px en táctil.
- `lang="es"` ya declarado en el documento. Las respuestas vienen en español.
- La validación completa de WCAG requiere pruebas manuales con lector de pantalla (NVDA/VoiceOver) y revisión experta; esta especificación define lo necesario, no lo certifica.

---

## 8. Copy (español)

| Dónde | Texto |
| --- | --- |
| Botón encabezado | «Asistente» · `aria-label` «Abrir asistente» |
| Motivo por defecto si `reason` es nulo | «El asistente no está disponible por ahora.» |
| Título del panel / página | «Asistente» |
| Cerrar panel | «Cerrar asistente» |
| Cabecera: acciones | «Conversaciones», «Nueva conversación», «Abrir en página completa», «Volver a la conversación» |
| Título sin nombre | «Nueva conversación» (en cabecera, aún sin título) · «Conversación sin título» (en lista) |
| Vacío: título / descripción | «¿En qué te puedo ayudar?» / «Pregúntame por tus solicitudes, proyectos o cómo usar el portal.» |
| Sugerencias | ver §4.1 |
| Pie de confianza | «El asistente consulta tus datos del portal con tus permisos y puede equivocarse. Verifica la información importante.» |
| Placeholder | «Escribe tu pregunta…» |
| Placeholder (no disponible) | «El asistente no está disponible ahora.» |
| Etiqueta del campo | «Mensaje para el asistente» |
| Ayuda de teclas | «Enter para enviar · Mayús+Enter para salto de línea» |
| Ayuda durante el stream | «Espera a que termine o pulsa Detener.» |
| Botones | «Enviar mensaje», «Detener respuesta» (visible «Detener»), «Copiar», «Copiado», «Ir al final», «Ir al final · hay respuesta nueva», «Reintentar» |
| Estado de espera | «Pensando…» |
| Herramientas | «Consultando {label}…», «(2 de 3)», «Consultó 1 fuente», «Consultó 3 fuentes», «Consultó 2 fuentes · 1 no respondió», «{label} · no se pudo consultar» |
| Detenida | «Respuesta detenida.» |
| Contador | «{n} / 4 000» · error «Tu mensaje supera el límite de 4 000 caracteres. Acórtalo para enviarlo.» |
| Error de envío | «No se pudo enviar tu mensaje» / «Revisa tu conexión e inténtalo de nuevo.» |
| Error 429 | «Vas muy rápido» / «Espera unos segundos antes de enviar otra pregunta.» |
| Error 5xx | «El servicio no respondió. Inténtalo de nuevo en un momento. Si el problema continúa, contacta al administrador del portal.» |
| Error del asistente | «El asistente no pudo completar la respuesta» / (`error.message` o «Inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal.») |
| Respuesta interrumpida (corte con texto parcial) | «La respuesta se interrumpió» / «Recibimos solo una parte. Puedes reintentar.» |
| No disponible | «El asistente no está disponible» / `reason` / «Puedes seguir leyendo tus conversaciones anteriores.» |
| Carga | «Cargando conversaciones…», «Cargando conversación…» |
| Error de carga | «No fue posible cargar las conversaciones.», «No fue posible cargar la conversación.» (+ «Reintentar») |
| No encontrada | «No encontramos esta conversación.» / «Puede que se haya eliminado.» |
| Historial vacío | «Aún no tienes conversaciones.» / «Cuando le preguntes algo al asistente, aparecerá aquí.» |
| Grupos | «Hoy», «Ayer», «Últimos 7 días», «Anteriores» |
| Eliminar | `aria-label` «Eliminar conversación «{título}»» · diálogo §5.2 |
| Toasts | «Conversación eliminada.», «No se pudo eliminar la conversación. Inténtalo de nuevo.», «No se pudo copiar. Selecciona el texto y cópialo manualmente.» |
| Enlaces externos | «(se abre en una pestaña nueva)» (solo lector) |

Tono: tuteo, frases cortas, sin exclamaciones; los errores dicen qué pasó, qué hacer y cómo seguir.

---

## 9. Componentes

### 9.1 shadcn / existentes que se reutilizan

`ui/sheet` (panel), `ui/button` (incl. `unavailable`, `loading`), `ui/textarea`, `ui/skeleton`, `ui/tooltip`, `ui/dialog` (vía `ConfirmDialog`), `ui/badge` (no se usa en esta fase), `sonner` (toasts), `InlineNotice`, `EmptyState`, `ErrorState`, `ConfirmDialog` (+ `useDialogReturnFocus`), `DisabledHint`, `PageHeader`, `PageLayout`, `NotificationBell` (referencia de posición), `MarkdownViewContent` (con variante `chat`).

### 9.2 Faltan en `components/ui/` (y decisión)

| Falta | Decisión |
| --- | --- |
| `scroll-area` | **No se añade.** Scroll nativo con `overflow-y-auto` (mejor con teclado/táctil y sin dependencia nueva). |
| `collapsible` / `accordion` | **No se añade.** Botón con `aria-expanded` + lista (§2.3) cubre el único caso. |
| `avatar` | **No hace falta**: sin avatares en el chat; la etiqueta «Asistente» con icono basta. |
| `alert-dialog` | **No hace falta**: `ConfirmDialog` ya es un `alertdialog`. |
| `popover` | No se usa. |

Resultado: **no se instala ningún componente shadcn nuevo**.

### 9.3 Cambios a componentes existentes

1. `markdown-view-content.tsx`: prop `variant?: 'default' | 'chat'` (§2.2). `'default'` no cambia para no alterar `markdown-view.tsx` ni los documentos.
2. `app-shell.tsx`: pinta `<AssistantTrigger />` antes de `<NotificationBell />` y envuelve en `AssistantProvider`.
3. `mobile-nav.tsx`: `<AssistantTrigger iconOnly />` entre la marca y la campana.
4. `app-sidebar.tsx` / `lib/navigation.ts`: ítem «Asistente».
5. `layout.tsx` (raíz): `viewport.interactiveWidget = 'resizes-content'`.

### 9.4 Componentes nuevos

Ubicación: `apps/web/src/components/assistant/` (componentes) y `apps/web/src/lib/assistant.ts` + `use-assistant-chat.ts` (cliente del contrato; usa el cliente tipado de `packages/api-client` para REST y `fetch` con el mismo encabezado de autenticación para el stream).

| Componente | Props principales | Notas |
| --- | --- | --- |
| `AssistantProvider` | `children` | Contexto: `status`, `activeConversationId`, `draft`, `panelOpen`, `view: 'chat'\|'history'`, estado del turno en curso. Aborta el stream al cerrar sesión. |
| `AssistantTrigger` | `iconOnly?: boolean`, `className?` | Botón de §1.1; usa `useAssistantStatus`. |
| `AssistantPanel` | — (lee del provider) | `Sheet` derecho; cabecera, vistas chat/historial, foco inicial. |
| `AssistantPage` | `conversationId?: string` | Para `/asistente`, `/asistente/nueva`, `/asistente/[id]`. Decide layout en dos columnas (`xl`) o pantalla única. |
| `AssistantConversation` | `conversationId: string \| null`, `surface: 'canvas'\|'card'`, `onConversationCreated(id, title)` | Compone `ChatThread` + `Composer` + avisos. |
| `ChatThread` | `messages: ChatMessageView[]`, `surface`, `streaming: boolean`, `onRetry()`, `onCopy(text)` | `role="log"`, anclaje, «Ir al final». |
| `UserMessage` | `text: string` | §2.1. |
| `AssistantMessage` | `message: AssistantMessageView`, `surface`, `footer?: ReactNode` | §2.2. `footer` es el punto de extensión (§11). |
| `ToolActivity` | `tools: { id?: string; label: string; status: 'running'\|'done'\|'error' }[]` | §2.3. |
| `ThinkingIndicator` | — | «Pensando…». |
| `Composer` | `value`, `onChange`, `onSend()`, `onStop()`, `streaming`, `disabled`, `disabledReason?`, `maxLength=4000`, `autoFocus?` | §3. Incluye contador, ayuda, `useAutosizeTextarea`. |
| `SuggestedQuestions` | `questions: string[]`, `onPick(q)` | §4.1 (lista de textos en un archivo de constantes). |
| `AssistantEmptyState` | `onPick(q)`, `disabled?` | Título + `SuggestedQuestions` + pie de confianza. |
| `JumpToEndButton` | `visible: boolean`, `hasNew: boolean`, `onClick()` | §4.7. |
| `ConversationList` | `items`, `activeId?`, `loading`, `error`, `onRetry()`, `onOpen(id)` (o `hrefFor(id)`), `onDelete(item)` | §5.1; agrupa por fecha. |
| `AssistantUnavailableNotice` | `reason: string \| null` | `InlineNotice` de §4.6. |
| `AssistantLiveRegion` | `message: string` | §7.3. |
| `useAssistantChat` | `(conversationId \| null)` → `{ messages, send, stop, retry, streaming, error, loading }` | Parsea el SSE: `conversation`, `text`, `tool`, `done`, `error`; cancela con `AbortController`; un `tool` repetido con el mismo `id` actualiza su estado. |
| `useAssistantStatus` | — → `{ state: 'loading'\|'available'\|'unavailable'\|'forbidden'\|'error', reason }` | §1.1. |
| `useAutosizeTextarea` | `(ref, value)` | Solo fallback sin `field-sizing`. |
| `useStickToBottom` | `(ref, deps)` → `{ atBottom, hasNew, scrollToEnd }` | Umbral 80 px. |

Rutas (App Router): `app/asistente/page.tsx`, `app/asistente/nueva/page.tsx`, `app/asistente/[id]/page.tsx`.

Tipos de vista (derivados del cliente generado, no copiados):

```ts
type ToolView = { id?: string; name?: string; label: string; status: 'running' | 'done' | 'error' };
type AssistantMessageView = {
  id: string;
  role: 'assistant';
  text: string;
  tools: ToolView[];
  status: 'streaming' | 'done' | 'stopped' | 'error';
  errorMessage?: string;
};
```

### 9.5 Pruebas recomendadas

- Unitarias: parseo de SSE (eventos fragmentados entre chunks), agrupación por fecha, umbrales del contador, enlaces internos/externos del Markdown, sanitización de esquemas.
- Playwright (390×844 y 1440×900): abrir panel y enviar con Enter; Mayús+Enter; Detener; sugerencias; botón no disponible con motivo; eliminar con confirmación; teclado completo; recorrido móvil lista → conversación → volver; `axe` sin violaciones en ambos temas.

---

## 10. Estados de un turno (referencia para el desarrollador)

```
idle ──send──▶ pending ("Pensando…")
pending ──tool(running)──▶ tooling ──tool(done|error)──▶ pending | tooling
pending|tooling ──text──▶ streaming
streaming ──done──▶ idle (copiar visible)
cualquiera ──stop──▶ idle (marca "Respuesta detenida.")
cualquiera ──error / corte de red──▶ failed (conserva texto, "Reintentar")
```

---

## 11. Extensión futura (solo nota, no se implementa)

F3 añadirá **tarjetas de propuesta de acción** dentro del turno del asistente. El diseño ya lo permite: `AssistantMessage` acepta `footer` y el mensaje se modela como una lista de partes (`text`, `tools`, y en el futuro `proposal`). Una `ProposalCard` seguirá el patrón de superficie del proyecto: título («Crear solicitud»), resumen de los campos, `role="group"` con nombre, y dos botones, **Confirmar** (`default`) y **Descartar** (`outline`), nunca confirmación automática; estados pendiente / confirmada / descartada / con error (`InlineNotice`). No cambia el composer ni el hilo.

---

## 12. Puntos abiertos para el equipo de API

- **P1.** `tool.label`: ¿viene en gerundio («Consultando solicitudes…») para `running` y en pasado para `done`? Si solo hay uno, el cliente lo adapta (§2.3).
- **P2.** Si el cliente corta o se desconecta, ¿la API termina y guarda el turno, o lo descarta? Define si «Nueva conversación» durante un stream es seguro (§2.5) y si «Reintentar» duplica el mensaje del usuario en el historial (§4.4).
- **P3.** ¿`GET /assistant/conversations` funciona con la IA apagada? (§4.6)
- **P4.** ¿El límite de 4 000 cuenta caracteres JS (`length`) o puntos de código? El contador usa `length`.
- **P5.** Permiso y módulo con que se decide el 403 y la visibilidad del menú (§1.2).
