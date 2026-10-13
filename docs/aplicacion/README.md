# Documentación de la aplicación

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

Fecha de generación: 2026-10-13

Esta carpeta documenta **la aplicación de negocio real** construida sobre la plantilla
de portales internos. No describe la plantilla base: para eso están `README.md`,
`docs/manual-uso-plantilla.md` y `docs/deployment.md` en la raíz del repositorio.

La fuente de verdad es el código (`apps/api` y `apps/web`). Si un detalle de esta
documentación contradice al código, el código manda.

## Qué es el portal

Es un portal interno para la **gestión de la demanda, la planificación, la capacidad
y el gobierno** de un área de analítica (procesos de BI, Integraciones e IA, más la
coordinación multiproceso FMAA).

El portal permite registrar la demanda entrante, clasificarla, priorizarla, convertir
lo comprometido en un plan de trabajo con tareas y dependencias, repartir la capacidad
mensual de las personas, dejar trazabilidad del trabajo diario y la coordinación
(bitácoras, novedades, reuniones y compromisos), inventariar los activos analíticos y
su documentación, y aplicar un ciclo de control de gobierno (gates GC1–GC5) sobre cada
solicitud.

## Flujo de trabajo de alto nivel

El portal acompaña el ciclo de vida de una **solicitud** (`Request`) de principio a fin:

1. **Demanda.** Se registra la solicitud (estado `REGISTRADA`).
2. **Triage.** Se clasifica y se decide la ruta (continuar o descartar).
3. **Priorización.** Se evalúa con 8 criterios ponderados y se obtiene un puntaje.
4. **Aprobación del compromiso.** Se aprueba (la solicitud queda *Comprometida*) o se
   devuelve a triage con motivo.
5. **Planificación.** La solicitud comprometida obtiene un plan con fases, tareas y
   dependencias; el plan se envía, se autoriza o se devuelve.
6. **Ejecución y seguimiento.** Se ejecutan las tareas (estado y aceptación), se
   reparte la capacidad del mes y se registra el trabajo diario, las novedades, las
   reuniones y los compromisos.
7. **Gobierno.** En paralelo, cada solicitud pasa por un ciclo de control de 5 gates
   (GC1–GC5), con validaciones/evidencias, faltantes y un flag transversal de bloqueo.

Alrededor de ese flujo, la aplicación mantiene el inventario de **activos** analíticos
y sus **documentos**, y una capa de **auditoría** que registra cada mutación relevante.

## Índice

- [Módulos del backend](./modulos-backend.md) — propósito, endpoints REST y reglas de
  negocio por módulo de `apps/api`.
- [Modelo de datos](./modelo-datos.md) — entidades, campos clave, relaciones, enums
  lógicos, restricciones y lista de migraciones (`apps/api/prisma`).
- [Frontend y pantallas](./frontend-pantallas.md) — rutas y pantallas por área en
  `apps/web`, con lo que puede hacer el usuario en cada una.
- [Autenticación y autorización](./autenticacion-autorizacion.md) — identidad,
  roles/grants, alcance por proceso y matriz de módulos.

## Límites de arquitectura (recordatorio)

- La lógica de negocio, la autorización, las validaciones y el acceso a datos viven en
  `apps/api` (NestJS). Prisma se usa **solo** en el backend.
- `apps/web` (Next.js) es presentación: consume la API, filtra el menú de forma
  cosmética y no contiene reglas de negocio.
- PostgreSQL es la persistencia transaccional.
