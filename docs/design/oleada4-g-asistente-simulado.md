# Oleada 4 · PR G · Insignia del modo de simulación del Asistente

Especificación visual del FEAT-007. Marca y tokens: `.kiro/steering/25-marca-gibo.md`.
Extiende `asistente-chat-ui.md`; no cambia el flujo del chat.

## Decisión

Cuando `GET /assistant/status` devuelve `simulated: true`, el chat muestra una insignia
con el texto exacto **«Modo de simulación: las respuestas no vienen de un modelo real»**.
Solo existe fuera de producción; en producción la API siempre devuelve `simulated: false`.

## Dónde aparece

| Lugar | Posición | Alineación |
| --- | --- | --- |
| Estado vacío (`AssistantEmptyState`) | Primer elemento, sobre el icono y el título | Centrada |
| Compositor (`Composer`) | Primera línea del formulario, sobre la lista de adjuntos y el campo | A la izquierda |

Una vez que hay mensajes, el estado vacío desaparece y queda la insignia del compositor,
visible durante toda la conversación y en panel y página.

## Estilo

- Píldora: `rounded-full border border-warning-border bg-warning-subtle px-2.5 py-1`.
- Texto `text-meta font-medium text-warning` (tokens de aviso; el contraste del par
  `warning` sobre `warning-subtle` cumple AA en claro y oscuro).
- Icono `FlaskConical` de 14 px (`size-3.5`), decorativo (`aria-hidden`). La señal no
  depende solo del color: lleva icono y texto.
- Sin interacción, sin botón de cerrar: no se puede ocultar.

## Accesibilidad

- Es un párrafo de texto estático; el lector de pantalla lo lee en el orden del DOM. No
  usa `role="alert"` ni región viva: no cambia durante la sesión.
- En móvil el texto puede partir en dos líneas; la píldora no se trunca.
- `data-testid="assistant-simulation-badge"` para las pruebas e2e.

## Fuera de alcance

Sin configuración desde la plataforma: la simulación la decide la variable
`ASSISTANT_MODEL_PROVIDER` por ambiente, nunca un parámetro editable.
