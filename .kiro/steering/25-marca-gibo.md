---
inclusion: fileMatch
fileMatchPattern: 'apps/web/**'
---

# Marca GIBO (Governance & Data)

Reglas de apariencia del portal. La fuente de verdad de la marca es
`docs/branding/gibo/` (guía PDF, tokens, logos). Estas reglas aplican **solo a
la capa visual**: no alteran la arquitectura de `00-estandar-portales.md`.

# Concepto visual

- Modo claro: **«Lienzo Claro»**. Fondo gris-azulado sutil, tarjetas blancas
  que flotan, sin bordes rígidos y con sombras muy suaves.
- Modo oscuro: **«Dark Tech»**. Fondo azul marino profundo y superficies más
  claras que el fondo para separar niveles.

# Tokens principales

Los valores maestros salen de `docs/branding/gibo/05_Web/gibo-tokens.css`.
Se expresan en `apps/web/src/app/globals.css` como variables semánticas.

| Token | Claro | Oscuro |
| --- | --- | --- |
| `--background` | `#F4F6F8` (lienzo) | `#08152E` |
| `--card` | `#FFFFFF` | superficie derivada del marino `#0F2557` |
| `--foreground` | marino `#0F2557` | blanco |
| `--primary` | azul eléctrico `#176BEB` | `#176BEB` |
| `--primary-foreground` | blanco (4.84:1) | blanco |
| enlace | `#145CCB` sobre lienzo (5.66:1) | cian `#20BFD1` (8.15:1) |
| acento | cian `#20BFD1`, solo decorativo | cian |
| `--radius` | `0.75rem` | `0.75rem` |

- Tipografía de interfaz: **Inter** (400, 500, 600). Titulares: **Montserrat**
  700. El logo es vectorial y nunca se recompone con texto.
- Los tokens se definen en OKLCH en `globals.css`; el HEX de la marca es la
  referencia. Si hay diferencia visible, prevalece el HEX de la marca.
- Un valor sugerido fuera del paquete de marca (por ejemplo `#00A8FF` como
  azul de acento) **no se adopta** si no cumple contraste: blanco sobre
  `#00A8FF` queda cerca de 2.6:1 y no llega a 4.5:1.

# Contraste (obligatorio)

- Texto normal 4.5:1, texto grande y bordes de controles 3:1 (WCAG 2.2 AA).
- El cian no se usa como texto sobre fondo claro (2.2:1).
- Mide los ratios; no los estimes. Medir los dos temas.

# Reglas de color en código

- Texto en azul (enlaces, iniciales): `text-link`, nunca `text-primary`. El
  azul eléctrico como texto sobre el lienzo da 4.47:1. `bg-primary` con
  `text-primary-foreground` sí cumple (4.84:1).
- Sombra de tarjeta: utilidad `shadow-card`. Radio: `rounded-xl` en tarjetas y
  tablas.
- Solo tokens semánticos (`bg-primary`, `text-muted-foreground`,
  `bg-success-subtle`...). Prohibido `bg-blue-600`, `text-gray-500` y
  similares en vistas y componentes.
- Cambiar la paleta implica editar `globals.css`, no las vistas.

# Componentes

## Badges semánticos

- Prioridades (P1, P2, P3, P4) y estados **siempre** con badge, nunca con
  texto plano. Usar `StatusBadge` / `PriorityBadge`.
- Estilo: fondo translúcido del tono y texto saturado del mismo tono. El texto
  debe cumplir 4.5:1 sobre su fondo en ambos temas.
- No transmitir el significado solo por color: mantener etiqueta e icono.

## Tablas de datos (`data-table`)

- Aspecto de tarjeta flotante: `bg-card`, `rounded-xl`, sombra suave y sin
  contornos duros (borde de baja opacidad como máximo).
- Cabecera discreta, separadores de fila sutiles, hover suave de fila.
- Estados vacío y error dentro de la misma tarjeta.

## Superficies

- Tarjetas: `bg-card`, `rounded-xl`, `shadow-sm`; evitar bordes marcados.
- Foco visible siempre, con `--ring`.

# Logo y recursos

- Activos web en `apps/web/public/brand/` (`svg/`, `app-icon/`).
- Sobre fondo claro: variante `positivo`. Sobre fondo oscuro: `negativo`.
- Usar `wordmark` si no hay espacio para el tagline; `isotipo` o `icono` en
  espacios cuadrados.
- No aplicar filtros CSS de inversión a logos de color.
- El punto único para cambiar la marca en la UI es `components/brand.tsx`.

# Flujo con el Diseñador

Antes de escribir una vista nueva o rediseñada (formularios, tablas, estados
vacíos y de error), `desarrollador` obtiene la especificación visual del
agente `disenador`. `revisor` verifica que la implementación la respete. Si
el cambio es solo un ajuste menor dentro de un patrón ya especificado, no hace
falta una nueva especificación.
