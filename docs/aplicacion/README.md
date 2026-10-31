# Documentación de la aplicación

> Documento generado a partir del código. Mantener sincronizado con los cambios en `apps/api` y `apps/web`.

Fecha de generación: 2026-10-14

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
6. **Ejecución y seguimiento.** Se ejecutan las tareas (estado y evidencias en archivos), se
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

## Sincronía de documentación

Para que esta documentación no quede atrás respecto al código, el repositorio
cuenta con un **aviso automático y no bloqueante** de sincronía.

**Qué dispara la advertencia.** Un cambio "toca dominio" si modifica algún
archivo bajo:

- `apps/api/src/modules/**`
- `apps/web/src/app/**`
- `apps/web/src/components/**`

Un cambio "toca documentación de la aplicación" si modifica algún archivo bajo
`docs/aplicacion/**`. Si un conjunto de cambios toca dominio pero **no** toca
`docs/aplicacion/**`, el mecanismo emite una **advertencia** (no falla el
build).

**En CI.** El workflow `.github/workflows/ci.yml` incluye un job independiente
`docs-sync` que corre **solo en `pull_request`**. Compara la base y el head del
PR e invoca el script de abajo; si detecta documentación desincronizada, emite
una anotación `::warning::` de GitHub Actions y un resumen en el PR. El job
**siempre termina en éxito**: avisa, no bloquea. No modifica el job `verify`.

**En local.** El mismo script se puede correr a mano. Compara dos puntos de git
(por defecto el commit anterior; o un rango explícito por variables de entorno):

```bash
# Rango explícito (p. ej. la rama base y la actual):
DOCS_SYNC_BASE=origin/main DOCS_SYNC_HEAD=HEAD node scripts/check-docs-sync.mjs

# Sin variables: compara HEAD~1..HEAD
node scripts/check-docs-sync.mjs
```

En PowerShell (Windows):

```powershell
$env:DOCS_SYNC_BASE = "origin/main"; $env:DOCS_SYNC_HEAD = "HEAD"
node scripts/check-docs-sync.mjs
```

El script (`scripts/check-docs-sync.mjs`) es Node puro, sin dependencias nuevas,
y por defecto siempre sale con código 0. Admite `--strict` para endurecerlo
(salir con código 1 ante una advertencia) si en el futuro el equipo quisiera
convertirlo en bloqueante; el job de CI lo usa **sin** `--strict`.

**Cómo actuar ante la advertencia.** No es un error: es un recordatorio. Ante
ella, o bien **actualizas** la documentación afectada en `docs/aplicacion/**`
(README, `modulos-backend.md`, `modelo-datos.md`, `frontend-pantallas.md` o
`autenticacion-autorizacion.md`) para reflejar el cambio real del código, o bien
**justificas** por qué el cambio no la necesita (refactor interno, formato,
renombre sin impacto en endpoints/modelo/pantallas).

**Relación con el hook de Kiro.** El hook `PostFileSave`
`actualizar-docs-aplicacion.json` ya propone, al guardar un controller/service,
`schema.prisma`, una `page.tsx` o `navigation.ts`, revisar y actualizar
`docs/aplicacion/**`. Ese hook actúa **al guardar**; el job `docs-sync` es la
**red de seguridad en el PR** que avisa si esa actualización se omitió. Son
complementarios y no se pisan: uno asiste durante la edición, el otro verifica
al integrar.

**Sincronía API, MCP y documentación.** La API es la fuente de verdad; el
contrato OpenAPI, el cliente tipado, el MCP y esta documentación se actualizan
en el **mismo PR**. La regla completa, con la lista de verificación y los
controles automáticos (contratos regenerados y pruebas del MCP en CI, aviso de
documentación, plantilla de PR y hook del editor), está en
`.kiro/steering/55-sincronia-api-mcp-docs.md`. El hook
`actualizar-docs-aplicacion.json` también cubre ahora los DTO y `apps/mcp`.

## Administración del sistema (rol ADMIN)
Existe un rol de **sistema** `ADMIN` (origen: `User.isAdmin`), separado de los roles de
área (`JEFE_AREA`/`LIDER_PROCESO`/`INTEGRANTE`). El administrador configura el sistema
desde `/administracion/configuracion-smtp`:
- **SMTP en runtime**: host, puerto, seguridad, usuario, contraseña (write-only, cifrada
  en BD) y remitente, con prueba de envío. La resolución efectiva es BD > entorno >
  ninguna; sin configuración, los correos de invitación/reset se registran en el log (con
  el enlace) y **no** rompen los contratos de `/auth/forgot-password` ni
  `/auth/reset-password`.
- **Administradores del sistema**: marcar/desmarcar `isAdmin` por usuario (no se puede
  degradar al último admin activo).

Notas de operación:
- `SETTINGS_ENCRYPTION_KEY` (32 bytes base64, `openssl rand -base64 32`) cifra el password
  SMTP guardado en BD. Es obligatoria SOLO al leer/escribir ese password; **el API arranca
  sin SMTP ni esta variable**. Si se pierde/rota, el password guardado deja de poder
  descifrarse y hay que reconfigurarlo.
- `APP_WEB_URL` (entorno) sigue siendo la única fuente de la URL base de los enlaces.
- Usuario administrador inicial del seed de desarrollo: `admin@demo.local` (contraseña dev
  `dev1234`, a cambiar). No necesita grants: su rol es global.

## Proyecto y Portafolio: qué va en cada módulo

- **Proyecto**: es la unidad de trabajo. Responde a «qué se hace y cómo va *este* proyecto».
  Reúne el detalle de una iniciativa comprometida: su plan, tareas, evidencias, documentos,
  bitácoras, avance y cierre. Aquí se **edita y opera**.
- **Portafolio**: es la vista ejecutiva de *todos* los proyectos a la vez. Responde a «cómo va
  el conjunto». Sirve para comparar, priorizar y detectar riesgos (avance, alertas por fecha
  objetivo, estado, bloqueos) y permite entrar a la ficha de cada proyecto. Aquí se **consulta**
  de forma consolidada; no se edita.

Regla práctica: lo que se opera o se edita va en Proyecto; lo que se consulta de forma
consolidada va en Portafolio.
