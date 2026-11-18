# Oleada 3 · Módulos puntuales: códigos, desactivaciones, periodo y administrador en recurrentes

Alcance: PR-E de la oleada 3 (plan de mejora 3.4, 4.3, 4.4, 6.2, 6.3 y 6.4), solo lo que
asigna `plan.md` a PR-E. Todo se construye con componentes existentes: `Field`,
`FormError`, `InlineNotice`, `ConfirmDialog`, `DisabledHint`, `DisabledReason`,
`PeriodFieldset`, `Button unavailable`, `Tabs`. No se crea ningún componente ni token. La
única modificación a un componente es la de `PeriodFieldset` (§6), declarada como cambio
explícito. Colores: `.kiro/steering/25-marca-gibo.md` y `globals.css`.

Nota de nombre: el plan pide la nota de diseño de PR-E en
`docs/design/oleada-3-codigos-confirmacion.md`. Este archivo es la especificación
definitiva de PR-E; el PR-D no debe duplicarla y el cuerpo del PR debe citar este nombre.

## 0. Qué entra y qué no

| Ítem del plan | Vista | ¿Aquí? |
| --- | --- | --- |
| Formato de códigos 6.2, 6.3, 6.4 | Diálogos de área, proceso y maestra | Sí (§1) |
| 6.3 Áreas: bloqueo y conteos | `/administracion/areas` | Sí (§2) |
| 6.4 Procesos: confirmar al desactivar y marcadores | `/administracion/procesos` | Sí (§3) |
| 4.3: persona fuera de alcance | Diálogos de compromiso y reunión | Solo el error (§4) |
| 4.4: administrador en recurrentes | `/actividades-recurrentes` | Sí (§5) |
| 3.4: periodo inválido | `/demanda/resumen` | Sí (§6) |
| 1.3, 6.7, 2.1, contraste «Vencido», pestañas móviles, tarjetas de 4.4 | | No: PR-A y PR-C |
| «Orden» de áreas (P3), «Marco» como lista (P3), D15 | | No: fuera de alcance |

### Contrastes medidos
Medidos con OKLCH → sRGB y la fórmula WCAG sobre `globals.css`. Todos cumplen 4,5:1.

| Par | Claro | Oscuro |
| --- | --- | --- |
| `text-danger` sobre `bg-card` | 6,59:1 | 7,20:1 |
| `text-danger` sobre `bg-background` | 5,74:1 | 8,01:1 |
| `text-muted-foreground` sobre `bg-card` | 7,13:1 | 7,62:1 |
| `text-foreground` sobre `bg-warning-subtle` | 13,32:1 | 13,48:1 |

Si PR-C cambia los tokens `danger*`, se vuelven a medir los pares con `danger`.

## 1. Errores de formato de código (áreas, procesos, maestras)

### Objetivo
Quien crea un área, un proceso o un elemento de maestra conoce el formato **antes** de
enviar y, si se equivoca, ve el error junto al campo, en español.

### Regla visible
Código: letras mayúsculas, números y guion bajo (`^[A-Z0-9_]+$`), máximo 40 caracteres.
En maestras la misma regla vale para el campo «Catálogo». La API normaliza a mayúsculas
antes de validar: «analitica» es válido y se guarda «ANALITICA». Espacios, guiones y
tildes no lo son.

### Estructura del campo (`area-form-dialog`, `proceso-form-dialog` y alta de maestras)
```
Field id="area-code" label="Código" required help="…" error="…"
  Input className="font-mono uppercase placeholder:text-muted-foreground"
        maxLength={40} autoComplete="off" spellCheck={false}
```
- `uppercase` es solo visual; el valor enviado no depende de la clase.
- `font-mono` está permitido (código que se lee carácter a carácter).
- `help` (siempre visible, enlazada por `Field`): «Letras mayúsculas, números y guion bajo. Máximo 40 caracteres.»
- Marcadores: «p. ej. ANALITICA» (áreas), «p. ej. FIBI» (procesos), «p. ej. TIPO_SOLICITUD» (código de maestra), «p. ej. FASE_PROYECTO» (Catálogo). No sustituyen a la etiqueta.
- En edición el código es de solo lectura (`readOnly disabled`), sin ayuda de formato.

### Mensajes (texto único, constantes compartidas)
| Situación | Texto |
| --- | --- |
| Vacío (cliente) | «El código es obligatorio.» |
| Caracteres no permitidos | «El código solo admite letras mayúsculas, números y guion bajo.» |
| Más de 40 caracteres | «El código admite como máximo 40 caracteres.» |
| Catálogo con formato inválido | «El catálogo solo admite letras mayúsculas, números y guion bajo.» |
| Catálogo de más de 40 caracteres | «El catálogo admite como máximo 40 caracteres.» |
| Duplicado, área | «Ya existe un área con ese código.» (cambio del plan, ya previsto en PR-A de ese plan) |

**Máximos:** `code` y `catalog` usan el mismo máximo de 40 caracteres, cada uno con su
propio mensaje (la tabla). La API ya rechaza los duplicados de proceso y de maestra con
409 y su texto actual; **no se cambian** esos textos en PR-E (no están en el plan). En la
web, el 409 al crear se asigna al campo «Código» con el texto del servidor (regla 2).

**Alcance de API:** PR-E solo añade en la API el formato y la longitud de `code` y `catalog`
(DTO, con `message:` en español) y el texto de duplicado del área.

### Regla de mapeo del error del servidor al campo
La web define una constante por mensaje (los de la tabla) y aplica esta regla, sin
interpretar texto libre:

1. **400 de validación**: el cuerpo trae `message` como arreglo (o texto). Se recorre cada elemento. Si coincide **exactamente** con una constante de código/catálogo de la tabla (formato, longitud; el campo del error lo dice la constante), se asigna a `Field error` de ese campo («Catálogo» o «Código» según la constante).
2. **409 al crear** (POST del alta): se asigna a `Field error` del campo «Código» (el único campo único del alta) con el texto del servidor.
3. Cualquier elemento restante, y todo otro estado (403, 404, 5xx, red), va a `FormError` al pie del diálogo (`role="alert"`).
4. El diálogo permanece abierto con los valores; el foco va al primer campo con error. El error del campo se borra al editarlo. No se lanza `toast` de error si todo el error quedó junto a un campo.

La validación en cliente al enviar usa las mismas reglas y normaliza (recortar y mayúsculas) antes de comprobar. Es solo ayuda de formato: la API es la autoridad.

### Clases y estados
- El comentario de `field.tsx` (los errores del backend no marcan campos y conservan el toast) se actualiza: para los mensajes de código y catálogo de la tabla el error va junto al campo y no se lanza toast.
- Error: lo aporta `Field` (`text-meta text-danger` con icono, `aria-invalid="true"`, `aria-describedby`). `text-danger` sobre `bg-card`: 6,59:1 claro, 7,20:1 oscuro. Icono + texto, no solo color.
- Enviando: botón primario con `busy`, sin cambio de ancho.
- Foco: anillo `--ring` heredado.
- 1440 px: diálogo `size="sm"`, una columna. 390 px: ancho completo, ayuda y error en varias líneas sin truncar, botones `pointer-coarse:min-h-11`.
- Claro/oscuro: solo tokens semánticos, sin clases por tema.

## 2. Áreas: conteos y bloqueo al desactivar (`/administracion/areas`)

### Decisión
`processCount` cuenta **solo procesos activos** y así se documenta en su `@ApiProperty`
(«Procesos activos del área»). No se añade `activeProcessCount`: el contrato queda como
dice el plan (`processCount`, `requesterCount`). El bloqueo y la columna usan el mismo
número, de modo que un área con solo procesos inactivos sigue pudiendo desactivarse. Para
que el plan y el código coincidan, PR-E anota esta definición en el DTO y en
`modulos-backend.md`.

### Estructura
| Dato | Tabla | Tarjeta (390 px) |
| --- | --- | --- |
| `processCount` | columna «Procesos activos», `text-right tabular-nums` | «3 procesos activos» |
| `requesterCount` | columna «Solicitantes», igual | «12 solicitantes» |

- Cabeceras: las del `data-table` actual (`text-meta font-medium text-muted-foreground`, `scope="col"`).
- Cero se muestra «0». Singular: «1 proceso activo», «1 solicitante».
- Tarjeta: las dos metas en una línea con «·», `text-sm text-muted-foreground flex-wrap gap-x-3`.
- Las dos columnas van antes de «Estado» en 1440 px; en < `md` pasan a la tarjeta como meta.

### «Desactivar» bloqueado (`processCount > 0` y área activa)
- Fila, menú de acciones y tarjeta: `Button unavailable` con `DisabledHint`; el motivo sale en tooltip, por teclado y por toque.
- Motivo: «No se puede desactivar el área: tiene 3 procesos activos. Desactiva o reasigna esos procesos primero.» (singular «tiene 1 proceso activo»).
- En el diálogo de edición, el control «Activa» queda `aria-disabled` y el motivo va con `DisabledReason` debajo, enlazado por `aria-describedby` (`text-meta text-muted-foreground`, icono de candado; 7,13:1 claro, 7,62:1 oscuro).
- Área inactiva o sin procesos activos: «Desactivar» habilitado, flujo actual sin cambios.

### Si la API responde 409 igualmente
(el recuento cambió tras cargar la lista) El texto del servidor, «No se puede desactivar el área: tiene N procesos activos.», se muestra en `FormError` si venía del diálogo; si venía de la fila, en `InlineNotice tone="warning" role="alert"` sobre la tabla con el botón «Actualizar» que recarga la lista.

### Estados
- Cargando: esqueleto actual; columnas nuevas con `Skeleton h-4 w-8`.
- Vacío y error: sin cambios.
- Deshabilitado: candado, texto y motivo (no solo atenuado). Foco visible igual que un botón activo, y sigue en el orden de tabulación.

## 3. Procesos: confirmar la desactivación con recuentos (`/administracion/procesos`)

### Flujo
1. El usuario pulsa «Desactivar»; la vista envía la petición normal.
2. Sin asignaciones activas, solicitudes abiertas ni tareas sin cerrar: se desactiva sin confirmar, como hoy.
3. Si la API responde 409 con `requiresConfirmation` y los recuentos, se abre `ConfirmDialog`.
4. «Desactivar proceso» reenvía con `confirmDeactivation: true`. Cancelar no cambia nada y devuelve el foco al disparador (`useDialogReturnFocus`).

### `ConfirmDialog`
- `tone="danger"`.
- Título: «¿Desactivar el proceso «{nombre}»?»
- Descripción: «Este proceso todavía tiene trabajo en curso. Revisa el impacto antes de continuar.»
- Contenido: lista de recuentos, solo filas con valor > 0:
  ```
  div.flex.gap-2.rounded-lg.border.border-warning-border.bg-warning-subtle.p-3
    AlertTriangle (aria-hidden)
    ul.grid.gap-1.text-sm.text-foreground
      li «{n} asignaciones activas»
      li «{n} solicitudes abiertas»
      li «{n} tareas sin cerrar»
  ```
  Singular: «1 asignación activa», «1 solicitud abierta», «1 tarea sin cerrar». `text-foreground` sobre `bg-warning-subtle`: 13,32:1 claro, 13,48:1 oscuro. El significado va en texto y números.
- Botones: «Cancelar» (foco inicial) y «Desactivar proceso».
- Enviando: `busy`; no se cierra con clic fuera.
- Si la API vuelve a rechazar (409 distinto, 403): el diálogo se cierra y el mensaje del servidor sale en `toast.error` y, si venía del diálogo de edición, en su `FormError`.
- No se promete ningún efecto sobre las asignaciones o tareas que la API no defina.

### Marcadores (P2)
En `proceso-form-dialog`, `placeholder:text-muted-foreground` sin opacidad adicional:
| Campo | Marcador |
| --- | --- |
| Código | «p. ej. FIBI» |
| Nombre | «p. ej. Inteligencia de negocio» |
| Marco | «p. ej. INS-006» |
| Área (Select) | «Elige un área» |

En `area-form-dialog`, el marcador pasa de «Analitica» a «p. ej. Analítica».

### Estados
- Red: `toast.error` actual.
- 390 px: diálogo pequeño a ancho completo, lista sin truncar, botones apilados con `pointer-coarse:min-h-11`.
- Accesibilidad: `alertdialog`; título y descripción se anuncian al abrir.

## 4. Compromisos y reuniones: persona fuera de alcance (4.3)

No cambia el formulario; solo la presentación del error nuevo.
- La API responde 400 «La persona indicada no existe o no pertenece al proceso.» en lugar de 500.
- Regla de mapeo: el texto coincide exactamente con la constante → `Field error` del selector de asignado o responsable (el que se envió; si se enviaron ambos, ambos). Cualquier otro mensaje → `FormError` del diálogo.
- El diálogo permanece abierto con los valores intactos y el foco va al selector.
- Sin ayuda adicional bajo el selector.

## 5. Actividades recurrentes: administrador (4.4, D14)

### Objetivo
El administrador ve «Actividades recurrentes» en el menú, abre directo Gestión y no ve la
pestaña «Qué me toca».

### Comportamiento
- Cuando `allowedModules.has('systemSettings')` y el usuario no tiene rol de área: se oculta la pestaña «Qué me toca» y la pestaña inicial es Gestión. Se conserva el `Tabs`/`TabsList` con la pestaña «Gestión» tal como está.
- `?tab=que-me-toca` se ignora para ese usuario y se abre Gestión.
- Resto de roles: sin cambios.
- Menú: mismo icono y posición; sin insignia.

### Estados
- Cargando, vacío y error: los actuales de Gestión. Sin permiso: `NoAccessNotice` de PR-A.
- 1440 y 390 px: sin cambios de maqueta; sin scroll horizontal de página. Tarjetas móviles de la tabla: PR-C.

## 6. Indicadores: periodo inválido (`/demanda/resumen`, 3.4)

### Objetivo
Si «Desde» es posterior a «Hasta», el error aparece junto a los campos y las cifras y la
tabla anteriores siguen visibles.

### Cambio explícito de `PeriodFieldset`
Se añaden dos props opcionales, retrocompatibles, sin lógica de negocio:
- `invalid?: boolean`: pone `aria-invalid="true"` en ambos `Input type="date"`.
- `errorId?: string`: lo aplica como `aria-describedby` de ambos `Input` mientras `invalid` sea verdadero.

El mensaje no lo pinta `PeriodFieldset`: la vista lo renderiza justo debajo con el
componente existente `FormError` (`id="indicadores-periodo"`, así el id es
`indicadores-periodo-error` y se pasa como `errorId`).

### Estructura
```
PeriodFieldset (fieldset «Periodo», Desde / Hasta, invalid, errorId)
FormError id="indicadores-periodo" message="…"   // InlineNotice danger, role="alert"
Resultados (sin cambios)
```
- Mensaje: «La fecha «Desde» no puede ser posterior a «Hasta». Corrige el periodo para actualizar los indicadores.»
- `FormError` ya trae el tono `danger`, icono y `role="alert"`; el texto no depende solo del color.
- **Con `from > to` la vista omite el reinicio a `loading` (`useResetOnChange` de `demand-overview-view.tsx`) y la llamada a la API, y conserva `state` e `indicators`.** Solo con un periodo válido vuelve a reiniciar y recargar como hoy.
- Como el componente limita con `max`/`min`, el estado inválido ocurre al teclear o pegar una fecha. La vista calcula `from > to`; mientras sea así no pide datos al servidor.

### Resultado anterior
La tabla y las cifras del último periodo válido permanecen **sin cambios visuales** (sin atenuado, sin nota, sin cambiar el estado de carga actual). Al corregir el periodo, el error desaparece y la vista recarga con el comportamiento actual.

### Estados
- Error de red: `ErrorState` actual.
- Foco: no se mueve; el `role="alert"` anuncia el error.
- 1440 px: campos en fila (`sm:w-40`), mensaje debajo a ancho de contenido. 390 px: campos apilados a ancho completo, mensaje debajo.
- Contraste: texto de `FormError` sobre su fondo según `InlineNotice danger` (se mide con axe al implementar, por usar fondo translúcido); borde de error del `Input` ≥ 3:1.

## 7. Textos nuevos (resumen)

| Dónde | Texto |
| --- | --- |
| Ayuda del código | «Letras mayúsculas, números y guion bajo. Máximo 40 caracteres.» |
| Código con formato inválido | «El código solo admite letras mayúsculas, números y guion bajo.» |
| Código largo | «El código admite como máximo 40 caracteres.» |
| Catálogo largo | «El catálogo admite como máximo 40 caracteres.» |
| Catálogo con formato inválido | «El catálogo solo admite letras mayúsculas, números y guion bajo.» |
| Duplicado de área | «Ya existe un área con ese código.» (proceso y maestra conservan el texto actual de la API) |
| Bloqueo de área | «No se puede desactivar el área: tiene N procesos activos. Desactiva o reasigna esos procesos primero.» |
| Confirmar proceso | «¿Desactivar el proceso «{nombre}»?» · «Este proceso todavía tiene trabajo en curso. Revisa el impacto antes de continuar.» · «Desactivar proceso» |
| Persona inválida | «La persona indicada no existe o no pertenece al proceso.» |
| Periodo invertido | «La fecha «Desde» no puede ser posterior a «Hasta». Corrige el periodo para actualizar los indicadores.» |

## 8. Accesibilidad y verificación

- Errores de campo enlazados con `aria-describedby` y `aria-invalid`; los que aparecen sin acción del usuario llevan `role="alert"`.
- Nada depende solo del color: icono y texto.
- Objetivos táctiles en móvil: `pointer-coarse:min-h-11`.
- Controles bloqueados: `aria-disabled`, siguen en el orden de tabulación y anuncian su motivo.
- Sin animaciones nuevas (`prefers-reduced-motion` no se ve afectado).
- Axe sin `serious`/`critical` en `/administracion/areas`, `/administracion/procesos`, `/actividades-recurrentes` (como administrador) y `/demanda/resumen`, en claro y oscuro, también con los diálogos de código abiertos con error.
- La validación completa de accesibilidad requiere pruebas manuales con lector de pantalla y revisión experta; esta especificación no las sustituye.
- Capturas al implementar (1440 y 390 px, claro y oscuro): diálogo de área con error de código, fila de área con «Desactivar» bloqueado, confirmación de proceso, recurrentes como administrador, Indicadores con periodo invertido.
