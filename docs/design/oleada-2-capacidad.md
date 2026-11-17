# Oleada 2 · PR-B · Capacidad: solo planes autorizados y todas las personas

Alcance: decisión D7 del plan de mejora (módulo 3.2) y los topes de horas. «Planificado» cuenta solo tareas de planes `AUTORIZADO` en solicitudes vivas (no eliminadas ni `RECHAZADA`, `RETIRADA`, `CERRADA`). El resumen lista a todas las personas del alcance con asignación activa, aunque no tengan registros ese mes, con el filtro por defecto «Solo con carga o sin disponibilidad registrada». Componentes existentes: `Toolbar`, `Checkbox`, `Label`, `DataView`, `Table`, `StatusBadge`, `UtilizationBar`, `InlineNotice`. Solo tokens semánticos.

Archivos: `app/activos/capacidad/capacidad-view.tsx`, `disponibilidad-form-dialog.tsx`, `asignacion-form-dialog.tsx`.

## 1. Objetivo de la vista

Quien gestiona el equipo ve de un vistazo a quién redistribuir o a quién le falta registrar disponibilidad. Los números de «Planificado» reflejan lo que el equipo realmente se comprometió a hacer (planes autorizados), no borradores.

## 2. Estructura y jerarquía

1. `PageHeader` y `Toolbar`: Mes (sin cambio) y **nuevo filtro** «Solo con carga o sin disponibilidad registrada».
2. «¿Cómo se calcula?» con el texto de «planificado» actualizado.
3. «Resumen de carga»: tira de señales, contador de resultados, tabla.
4. Disponibilidad y Asignaciones (estructura igual; cambian ayudas y errores de los diálogos).

Lo que destaca: la tira de señales (sobrecargadas, holgura, sin disponibilidad). El filtro es secundario pero visible y activo por defecto.

## 3. Cambios por bloque

### 3.1 Filtro (Toolbar)

```
Mes [ 2026-11 ]   [x] Solo con carga o sin disponibilidad registrada      Mostrando 9 de 23 personas
```

- Control: `Checkbox` con `Label` visible a su derecha, dentro de un `div className="flex min-h-9 items-center gap-2"`; en la `Toolbar` queda como un filtro más, alineado a la base con `items-end` (ya lo da la barra). Etiqueta: «Solo con carga o sin disponibilidad registrada». Valor por defecto: marcado.
- Criterio (lo decide el servidor al ordenar y la web solo filtra lo recibido): se muestra la persona si `comprometido > 0` o `planificado > 0` o `estado === 'SIN_DISPONIBILIDAD'`. Con la casilla desmarcada se muestran todas. Es una presentación; no cambia el estado derivado.
- Contador en `end` de la `Toolbar`: `span className="text-meta text-muted-foreground tabular-nums"` con `role="status"`: «Mostrando {n} de {total} personas». Sin la casilla (desmarcada): «{total} personas».
- La casilla no se persiste en la URL ni en `localStorage`; vuelve a marcada al recargar (misma política del mes).

### 3.2 Tira de señales

Cuenta sobre **todas** las personas del alcance, no sobre las filtradas, para que las cifras no cambien al marcar o desmarcar el filtro. El texto final pasa a «de {total} personas con asignación activa en tu alcance» (hoy dice «en tu alcance»). Sin cambio de clases.

### 3.3 Tabla del resumen

- Estructura de columnas igual. Cambia la cabecera de «Planificado»: `TableHead` con dos líneas, `span className="block font-normal text-meta text-muted-foreground"` bajo el título con el texto «planes autorizados». «Utilización plan» sin cambio.
- `TableCaption` (solo lectores de pantalla): sustituir «(estimación de las tareas del plan)» por «(estimación de las tareas de planes autorizados en solicitudes vivas)».
- Fila de persona sin registros ese mes (nueva): Disponible «—», Comprometido «0 h», Libre «—», Planificado «0 h», barras de utilización en «—» (`UtilizationBar value={null}`), Señal `StatusBadge kind="capacity" value="SIN_DISPONIBILIDAD"` con `srDescription` ya existente («no hay disponibilidad registrada este mes»). Sin fondo de alerta: `bg-danger-subtle/50` queda solo para sobrecarga.
- Fila de persona con planificado pero sin disponibilidad: Planificado con la cifra y, bajo la señal, la insignia existente; no se añade «Plan supera lo disponible» porque `disponible` es nulo.
- Persona de la que solo hay planificado y no hay disponibilidad: la señal sigue siendo «Sin disponibilidad», porque el estado lo decide la API.

### 3.4 «¿Cómo se calcula?»

Segundo párrafo, reemplazo del texto actual:

«Lo **planificado** es una estimación distinta: suma las horas estimadas de las tareas asignadas a la persona ese mes, solo de planes autorizados y de solicitudes que siguen vivas (no cuentan borradores, planes en autorización, ni solicitudes eliminadas, rechazadas, retiradas o cerradas). No es lo mismo que lo **comprometido** (horas que se registran a mano en asignaciones) y no cambia la señal de sobrecarga; es solo una referencia de la carga que proyecta el plan.»

Las palabras en negrita siguen con `strong className="text-foreground"`.

### 3.5 Diálogos con topes

- Disponibilidad: `Input type="number"` con `min={0}` `max={744}` `step="0.5"`; ayuda del `Field`: «De 0 a 744 horas (un mes completo).». Error cliente, valor mayor: «La disponibilidad no puede superar 744 horas al mes.».
- Asignación: `min={1}`; ayuda: «Mínimo 1 hora.». Error cliente, menor a 1: «La asignación debe ser de al menos 1 hora.». Si el valor es 0, el mismo mensaje.
- El 400 de la API muestra su mensaje en español en el `FormError` del diálogo y como toast; el diálogo conserva lo escrito (patrón AC-031 ya vigente).
- Los registros existentes fuera del tope (por ejemplo 99999 h) se siguen listando tal cual (valor actual conservado). Al **editarlos** el tope sí aplica y el error aparece junto al campo.

## 4. Estados

| Estado | Comportamiento |
| --- | --- |
| Cargando | `DataView loading` (4 filas, 8 columnas); el contador se oculta. La casilla queda habilitada. |
| Con datos | Tabla con el filtro aplicado. |
| Vacío por el filtro | Hay personas pero ninguna cumple el criterio: `EmptyState` `inline` icono `Users`, título «Ninguna persona tiene carga ni falta disponibilidad este mes.», descripción «Desmarca el filtro para ver a todas las personas con asignación activa.» y botón secundario «Mostrar a todas las personas» (`variant="outline"`, desmarca la casilla y mueve el foco a ella). |
| Vacío real | Sin personas con asignación activa en el alcance: título «No hay personas con asignación activa en tu alcance.», descripción «Asigna a alguien a un proceso para verlo aquí.». Sustituye al texto actual «Aún no hay disponibilidad ni asignaciones este mes.», que ya no describe el caso. |
| Error | `DataView error` con «Reintentar» (sin cambio). |
| Filtro | Cambiar la casilla no recarga: filtra en cliente lo ya recibido. `aria-live` solo en el contador (`role="status"`). |
| Foco | `--ring` del sistema; el foco se queda en la casilla al marcar o desmarcar. |

## 5. Badges

`StatusBadge kind="capacity"` con etiqueta e icono para `OK`, `SOBRECARGA`, `SIN_DISPONIBILIDAD` y `CARGA_PARCIAL` (sin cambio). `Badge variant="outline"` «Holgura» y `Badge variant="warning"` «Plan supera lo disponible» se mantienen. Nunca solo color.

## 6. Accesibilidad

- Contrastes: pares ya medidos en `docs/design/identidad-color-menu.md` (§4): `muted-foreground`/lienzo 6,25 y /tarjeta oscura 7,58; `foreground`/tarjeta 14,92 (oscuro); borde de control/tarjeta 3,63 claro y 3,49 oscuro (umbral 3 para el borde de la casilla); badges semánticos entre 4,74 y 5,46. El contador usa `muted-foreground` sobre el lienzo (6,25).
- La casilla tiene `Label` visible enlazado (`htmlFor`), tamaño táctil de 24 px más área de la etiqueta (`min-h-9`, `pointer-coarse:min-h-10`).
- Orden de tabulación: Mes, casilla, detalles «¿Cómo se calcula?», encabezados ordenables, botones de las secciones siguientes.
- La cabecera de dos líneas de «Planificado» se lee como «Planificado planes autorizados»; el subtítulo se vincula con `aria-describedby` solo si el lector lo duplica en pruebas manuales.
- Validación con tecnologías de asistencia: pendiente de prueba manual y revisión experta.

## 7. Responsive

| Ancho | Comportamiento |
| --- | --- |
| 1440 | Toolbar en una línea: Mes, casilla y contador a la derecha (`end`). Tabla del resumen sin scroll. |
| 390 | La `Toolbar` apila: Mes a `w-full`, casilla en su propia fila (`w-full`), contador debajo alineado a la izquierda. El resumen conserva su desplazamiento horizontal con `scrollLabel` (la tabla de 8 columnas ya lo usa); la primera columna «Persona» no se fija. No se convierte a tarjetas en este PR: `docs/design/tarjetas-moviles-bl-024.md` queda como siguiente paso si la revisión móvil lo pide. El `EmptyState` y su botón ocupan el ancho (`w-full` el botón, `h-11`). |

## 8. Temas

Solo tokens. Revisar en oscuro: borde de la casilla (3,49), fila de sobrecarga `bg-danger-subtle/50` (más tenue en oscuro), `Badge warning` sobre `bg-card`, y las barras de `UtilizationBar` con valor `null` (guion, sin relleno). Capturas obligatorias: 1440 y 390, claro y oscuro, en «filtro activo con datos», «filtro vacío», «casilla desmarcada con personas sin disponibilidad» y «diálogo con error de tope».

## 9. Textos (todo en español)

| Elemento | Texto |
| --- | --- |
| Filtro | «Solo con carga o sin disponibilidad registrada» |
| Contador | «Mostrando {n} de {total} personas» / «{total} personas» |
| Cabecera | «Planificado» + «planes autorizados» |
| Vacío por filtro | «Ninguna persona tiene carga ni falta disponibilidad este mes.» · botón «Mostrar a todas las personas» |
| Vacío real | «No hay personas con asignación activa en tu alcance.» |
| Tope de disponibilidad | «La disponibilidad no puede superar 744 horas al mes.» |
| Mínimo de asignación | «La asignación debe ser de al menos 1 hora.» |
