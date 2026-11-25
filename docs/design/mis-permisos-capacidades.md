# Mis permisos: «Qué puedes hacer», Service Desk y solicitante duplicado

Especificación visual de la oleada 5, PR B. Se compone solo con componentes existentes
(`Section`, `InlineNotice`, `StatusBadge`, `Field`, `FormError`). No hay tokens, colores ni
dependencias nuevos. La validación completa de accesibilidad requiere prueba manual con lector
de pantalla y revisión experta.

## 1. Mis permisos · sección «Qué puedes hacer»

Archivo: `app/gobierno/mis-permisos/mis-permisos-view.tsx`. Orden de bloques: Identidad, Roles y
alcance, **Qué puedes hacer**, Módulos.

- Texto introductorio: «Puedes hacer {a} de {t} acciones del portal, según tus roles.»
- Un `section` por grupo (`h3` asociado con `aria-labelledby`), en el orden recibido de la API,
  con `overflow-hidden rounded-lg border bg-card`.
- Fila: etiqueta, `StatusBadge kind="permission"` (icono y texto), descripción · alcance y, si no
  está permitida y hay roles, «Lo hace: Jefe de área, Líder de proceso». Las filas no permitidas
  no se atenúan con `opacity`.
- Alcance (`scope`): `PROCESS` «En los procesos donde tienes rol», `AREA` «En toda el área»,
  `SYSTEM` «En la configuración del sistema».
- Avisos (`InlineNotice` neutral, como máximo uno):
  - Administrador sin grants: «Tu rol de administrador configura el sistema. No participa en
    solicitudes ni en planes.»
  - Sin roles: «Todavía no tienes roles, por eso no puedes hacer ninguna de estas acciones. Pide
    al jefe de área que te asigne un rol.»
- Sin `capabilities` o vacío: la sección no se renderiza. Carga: un `Skeleton` más. Error: el
  `ErrorState` existente de la vista.
- La tabla «Módulos» solo lista los que aparecen en el menú (`NAV_GROUPS`).
- Móvil: la fila se apila (`flex-wrap`). Una sola columna de grupos en todos los anchos.

## 2. Service Desk sin «Próximamente» duplicado

La insignia «Próximamente» es el único anuncio. Descripciones nuevas:
`Mesa de servicio: incidencias, requerimientos y acuerdos de nivel de servicio.` y
`Incidencias, requerimientos y SLA.` El texto oculto pasa de «(próximamente, no disponible)» a
«(no disponible)» para que no se lea dos veces.

## 3. Solicitante duplicado por nombre y área

- El `409` («Ya existe un solicitante con ese nombre en esa área.») se muestra como error del
  campo *Nombre* (`errorRole="alert"`) con la orientación «Cambia el nombre, elige otra área o
  reactiva el existente desde la lista.» No se muestra el `FormError` del pie ni un toast. El foco
  va al nombre con el contenido seleccionado.
- El error se limpia al editar el nombre o al cambiar el área.
- Ayuda en reposo del campo: «El nombre puede repetirse en otra área.»
- Selector de solicitante en *Solicitud*: solo cuando dos solicitantes visibles comparten nombre
  normalizado, el ítem se muestra «Nombre · Área»; si el nombre es único queda igual.
