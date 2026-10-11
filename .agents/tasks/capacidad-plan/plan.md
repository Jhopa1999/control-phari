# Implementation Plan — Vinculación CAPACIDAD ↔ PLAN

Objetivo: el resumen de capacidad debe mostrar, junto a `comprometido` (suma de
`Assignment.committedHours`, sin tocar su semántica ni la auditoría), un dato
nuevo e informativo `planificado` = horas estimadas derivadas de las tareas del
plan asignadas a cada persona ese mes. Cambio ADITIVO; no altera comportamiento
de `comprometido`, `estado`, `sobrecargado`, `cargaParcial` ni auditoría. No
requiere migración (`Task.estimateHours` ya existe).

## Hallazgos de exploración (base del plan)

- Worktree: todas las rutas son absolutas bajo
  `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\cap-plan\`. El cwd
  del agente es la raíz del repo; usar SIEMPRE rutas absolutas del worktree.
- `apps/api/src/modules/capacity/capacity.service.ts` → `summary(actor, query)`:
  hoy carga `monthlyAvailability.findMany` y `assignment.findMany` (visibles +
  fuera de alcance), arma `userIds`, nombres, `availableByUser`,
  `committedByUser`, y mapea filas con el `estado`. El alcance por persona lo da
  `this.scope.scopedUserIds(this.prisma, actor)` → `'ALL' | string[]`; en el
  método ya existe `userIn: string[] | null`.
- `apps/api/src/modules/capacity/dto/capacity-summary-row.dto.ts`:
  `CapacitySummaryRowDto` con `@ApiProperty` por campo; existe `type
  CapacitySummaryEstado`.
- `apps/api/src/modules/capacity/month.ts`: `monthStringToDate('YYYY-MM')` →
  `Date` (primer día del mes en UTC) y `dateToMonthString`. El mapeo mes/año se
  compara en UTC.
- `apps/api/src/modules/plan/task-status.ts`: `enum TaskStatus` con
  `POR_HACER, EN_CURSO, BLOQUEADA, EN_REVISION, TERMINADA` (hay un 5º estado
  `EN_REVISION` no citado en el brief; la regla `status != TERMINADA` lo incluye
  correctamente como carga activa, igual que POR_HACER/EN_CURSO/BLOQUEADA).
- Modelo `Task` (`apps/api/prisma/schema.prisma`): `responsibleUserId String?`,
  `estimateHours Int?`, `startDate DateTime?`, `endDate DateTime?`,
  `status String @default("POR_HACER")`, `isMilestone Boolean`; índices en
  `responsibleUserId` y `status`. Delegado Prisma: `this.prisma.task`.
- El patrón de consulta de tareas por persona ya existe en
  `apps/api/src/modules/plan/task/task.service.ts` (`this.prisma.task.findMany`
  con `where.responsibleUserId`), confirma nombres de campos.
- Frontend: pantalla en
  `apps/web/src/app/activos/capacidad/capacidad-view.tsx`. Tabla "Resumen de
  carga" con columnas Persona / Disponible / Comprometido / Utilizacion % /
  Libre / Senal. Tipos vía `apps/web/src/lib/api-client.ts`
  (`CapacitySummaryRow = components['schemas']['CapacitySummaryRowDto']`) y
  acceso vía `apps/web/src/lib/capacity.ts` (`listCapacitySummary`). Hay un
  bloque explicativo en lenguaje llano que conviene ampliar.
- Comandos reales (raíz, `package.json`): `npm run test:unit` (jest de
  `apps/api`), `npm run typecheck` (api + api-client + web),
  `npm run contracts:generate` (openapi:generate + api-client:generate),
  `npm run build:api-client`, `npm run build`. NO inventar comandos.

## Forma de la consulta Prisma (decisión de diseño cerrada en la tarea)

Dentro de `summary()`, tras resolver `scoped`/`userIn` y el `monthDate`, añadir
UNA consulta agregadora de tareas. Filtrado en BD (aprovecha índices) + mapeo de
mes exacto en memoria:

```ts
// Importar al inicio del archivo:
import { TaskStatus } from '../plan/task-status';

// Rango del mes consultado [primer día, primer día del mes siguiente) en UTC.
const monthStart = monthDate; // monthStringToDate(query.month)
const nextMonth = new Date(
  Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
);

// Tareas candidatas en alcance: responsable NO nulo, en alcance de persona,
// no TERMINADA, con estimación > 0 (los hitos tienen 0 y no aportan), y que
// TOQUEN el mes por startDate O endDate (acota en BD; el mapeo exacto va en
// memoria). Seleccionar solo lo necesario.
const planTasks = await this.prisma.task.findMany({
  where: {
    responsibleUserId: userIn ? { in: userIn } : { not: null },
    status: { not: TaskStatus.TERMINADA },
    estimateHours: { gt: 0 },
    OR: [
      { startDate: { gte: monthStart, lt: nextMonth } },
      // startDate null -> cae por endDate dentro del mes.
      { AND: [{ startDate: null }, { endDate: { gte: monthStart, lt: nextMonth } }] },
    ],
  },
  select: {
    responsibleUserId: true,
    estimateHours: true,
    startDate: true,
    endDate: true,
  },
});
```

Mapeo tarea → mes (en memoria, regla simple, NO prorratear):
- mes de referencia = `startDate` si no es null; si no, `endDate`; si ambos null
  la tarea no cuenta (ya excluido por el `where`).
- comparar año+mes en UTC contra `query.month` (usar `dateToMonthString(ref) ===
  query.month`). Sumar `estimateHours` por `responsibleUserId` en un
  `Map<string, number>` `planByUser` (ignorar `responsibleUserId` null por
  seguridad de tipos).

Notas:
- El `where` por fechas es una COTA amplia (una tarea con startDate en el mes
  pero endDate fuera, o viceversa, entra a BD); el mapeo exacto en memoria
  decide con la regla startDate-o-endDate, evitando doble conteo.
- NO introducir una frontera de proceso para `planificado`: es carga de la
  PERSONA. Se usa el MISMO `userIn` (de `scopedUserIds`) que el resto de
  `summary()`. Para `'ALL'` (jefe) se usa `responsibleUserId: { not: null }`.
- `planificado` para una persona sin tareas = 0.

## Items

- [ ] 1. Extender `CapacitySummaryRowDto` con los campos nuevos y su
      documentación `@ApiProperty`, sin tocar los existentes.
      Añadir `planificado: number` (0 si ninguna tarea aporta), `utilizacionPlan:
      number | null` (nullable, misma guarda contra división por cero que
      `utilizacion`) y la señal booleana `planSobreDisponible: boolean`. En las
      descripciones dejar claro: `planificado` = horas de tareas del plan
      asignadas a la persona ese mes (estimación), frente a `comprometido` =
      horas registradas manualmente en asignaciones; `planSobreDisponible` es
      informativa y NO altera `estado` ni `sobrecargado`.
      Files: `.worktrees/cap-plan/apps/api/src/modules/capacity/dto/capacity-summary-row.dto.ts`
      Verify: `npm run typecheck:api` compila sin errores.

- [ ] 2. Implementar la derivación de `planificado` en `summary()` y rellenar los
      nuevos campos del DTO.
      En `capacity.service.ts`: (a) importar `TaskStatus` desde
      `../plan/task-status`; (b) tras calcular `userIn`/`monthDate`, añadir la
      consulta `this.prisma.task.findMany` descrita en "Forma de la consulta
      Prisma" y construir `planByUser` con el mapeo mes exacto en memoria;
      (c) añadir el `responsibleUserId` de las tareas al `Set<string> userIds`
      para que aparezcan personas con plan aunque no tengan disponibilidad ni
      asignaciones ese mes (así `planificado` siempre se refleja); (d) al mapear
      cada fila, calcular `planificado = planByUser.get(userId) ?? 0`,
      `utilizacionPlan = disponible && disponible > 0 ? Math.round((planificado /
      disponible) * 100) : null`, y `planSobreDisponible = disponible !== null &&
      disponible > 0 && planificado > disponible`. NO modificar el cálculo de
      `comprometido`, `utilizacion`, `libre`, `estado`, `sobrecargado`,
      `cargaParcial` ni los snapshots de auditoría.
      Nota de implementación: hoy `summary()` hace `return []` cuando
      `userIds.size === 0`; si se añaden personas con solo plan, ese early-return
      debe considerar también a quienes tengan plan (es decir, construir
      `planByUser` antes del chequeo y agregar sus userIds al set antes del
      `if (userIds.size === 0)`), manteniendo el orden alfabético final por
      `userName`.
      Files: `.worktrees/cap-plan/apps/api/src/modules/capacity/capacity.service.ts`
      Verify: `npm run typecheck:api` compila; `npm run test:unit` sigue en verde
      (los 426 tests existentes no deben romperse).

- [ ] 3. Añadir tests unitarios de la derivación de `planificado` en el spec del
      servicio (casos a–f).
      En `capacity.service.spec.ts`: añadir en `createMocks()` el delegado
      `task: { findMany: jest.fn() }` dentro de `prismaObj`, y por defecto en
      `beforeEach` dejar `(m.prismaObj.task as any).findMany.mockResolvedValue([])`
      para que los tests existentes (que no esperan tareas) sigan pasando. Crear
      un `describe('summary - planificado')` con un helper `taskRow(overrides)`
      (campos: `responsibleUserId`, `estimateHours`, `startDate`, `endDate`).
      Casos:
        a. Suma de estimateHours de varias tareas de la misma persona en el mes
           (startDate dentro del mes) → `planificado` = suma; con `disponible`>0,
           `utilizacionPlan = round(planificado/disponible*100)`.
        b. Tarea con `startDate` null pero `endDate` dentro del mes → cuenta por
           endDate.
        c. Tarea con `startDate` y `endDate` ambos null → NO cuenta (verificar
           que no está en el resultado del `where`/mapeo: mockear sin esa fila o
           asegurar que no suma). Y tarea TERMINADA / `estimateHours` 0 (hito) no
           aporta: confirmar vía el `where` (status `{ not: TERMINADA }`,
           `estimateHours { gt: 0 }`) revisando los argumentos de
           `task.findMany.mock.calls[0][0].where`.
        d. `disponible` = 0 o null → `utilizacionPlan` = null (sin división por
           cero), pero `planificado` conserva su valor.
        e. `planificado` > `disponible` (con disponible>0) → `planSobreDisponible`
           = true, mientras `estado`/`sobrecargado` siguen derivando SOLO de
           `comprometido` (p. ej. comprometido bajo → sigue OK aunque el plan
           exceda).
        f. Persona con solo plan (sin disponibilidad ni asignaciones) aparece en
           el resumen con `planificado`>0, `comprometido` 0; y respeto del
           alcance: el `where` de `task.findMany` usa `responsibleUserId: { in:
           [...] }` para integrante/líder y `{ not: null }` para jefe
           (`scopedUserIds` = ALL) — verificar sobre
           `task.findMany.mock.calls[0][0].where`.
      Files: `.worktrees/cap-plan/apps/api/src/modules/capacity/capacity.service.spec.ts`
      Verify: `npm run test:unit` — pasan los nuevos tests y los existentes
      (incluidos los que cuentan llamadas a `assignment.findMany`, que no deben
      verse afectados por el nuevo `task.findMany`).

- [ ] 4. Regenerar el contrato OpenAPI y el cliente tipado tras el cambio de DTO.
      Ejecutar `npm run contracts:generate` (regenera el OpenAPI del backend y el
      cliente) y luego `npm run build:api-client`. Confirmar que el tipo generado
      `CapacitySummaryRowDto` en `packages/api-client` (consumido por
      `apps/web/src/lib/api-client.ts` como `CapacitySummaryRow`) incluye
      `planificado`, `utilizacionPlan` y `planSobreDisponible`. NO declarar tipos
      a mano en el frontend.
      Files: artefactos generados bajo `.worktrees/cap-plan/packages/api-client/`
      y el OpenAPI generado por `apps/api` (los que produzcan los scripts; no
      editar a mano).
      Verify: `npm run typecheck:api-client` compila; `grep` NO es verificación,
      pero sí confirmar la forma del tipo abriendo el archivo generado del
      api-client y comprobando los 3 campos.

- [ ] 5. Mostrar `planificado` y `utilizacionPlan` en la tabla de resumen del
      frontend, diferenciados de `comprometido`.
      En `capacidad-view.tsx`: añadir dos columnas a la tabla "Resumen de carga"
      —`Planificado` y `Utilizacion plan %`— entre las columnas existentes de
      forma legible (p. ej. tras `Comprometido` y tras `Utilizacion %`
      respectivamente, o un bloque "Plan" claramente etiquetado). Renderizar
      `row.planificado` (número; 0 visible) y `row.utilizacionPlan` con el mismo
      patrón que `utilizacion` (`=== null ? '—' : `${v}%``). Mostrar una señal
      accesible cuando `row.planSobreDisponible` sea true (p. ej. un `Badge`
      `outline` con `aria-label` explicando que la carga planificada supera la
      disponibilidad, SIN presentarlo como sobrecarga/bloqueo). Actualizar el
      `<caption>` sr-only si procede y ampliar el bloque explicativo en lenguaje
      llano para distinguir `comprometido` (horas registradas a mano) de
      `planificado` (estimación de tareas del plan). Respetar estados
      loading/vacío/éxito/error ya existentes y la accesibilidad (scope en
      `<th>`, aria-labels).
      Files: `.worktrees/cap-plan/apps/web/src/app/activos/capacidad/capacidad-view.tsx`
      Verify: `npm run typecheck:web` compila (usa el tipo generado, sin `any`).

- [ ] 6. Verificación integral: typecheck del monorepo, tests y build.
      Ejecutar `npm run typecheck` (api + api-client + web), `npm run test:unit`
      (jest api, incluidos los nuevos) y `npm run build` (build api + api-client +
      web). Todo debe pasar sin romper comandos ni tests existentes. Limpiar
      cualquier archivo temporal creado durante la verificación.
      Files: —
      Verify: `npm run typecheck` sin errores; `npm run test:unit` 100% verde;
      `npm run build` termina OK.

- [ ] 7. Verificación funcional real con curl (end-to-end manual).
      Preparación de entorno (si no está arriba): `npm run db:up` (PostgreSQL en
      Docker), aplicar migraciones/semilla según el flujo del repo, y arrancar la
      API (`npm run dev:api`). Autenticarse como un actor con capacidad (p. ej.
      jefe de área del seed) usando el mecanismo de actor del repo
      (header/cookie que use `CurrentUserGuard`; confirmar en el seed/README cómo
      se identifica el actor en desarrollo). Con datos de prueba que incluyan al
      menos una `Task` con `responsibleUserId`, `estimateHours > 0`, `startDate`
      dentro del mes y `status != TERMINADA`, llamar:
      `curl "http://localhost:3000/capacity/summary?month=YYYY-MM" -H "<cabecera de actor>"`
      (ajustar puerto/prefijo global a lo que exponga la API; confirmar en
      `main.ts`/config). Comprobar en la respuesta JSON que las filas incluyen
      `planificado` con la suma esperada de `estimateHours`, `utilizacionPlan`
      coherente con `disponible`, y `planSobreDisponible` acorde; y que
      `comprometido`, `estado` y `sobrecargado` NO cambiaron respecto al
      comportamiento previo (una tarea del plan no debe alterar `comprometido`).
      Files: —
      Verify: la respuesta de `GET /capacity/summary` refleja `planificado` y
      `utilizacionPlan` correctos para datos conocidos, sin alterar
      `comprometido`/`estado`.

## Restricciones y supuestos

- TypeScript estricto, sin `any` injustificado (en el spec se admite el patrón
  `as any` ya usado para los mocks de Prisma, consistente con el archivo
  existente).
- Prisma solo en `apps/api`; el frontend consume exclusivamente el cliente
  tipado generado; la derivación de `planificado` es lógica de negocio y vive en
  el backend.
- Sin dependencias nuevas, sin migración (campos ya existen), sin hardcodear
  configuración.
- Supuesto (sin bloquear): el 5º estado `EN_REVISION` se trata como carga activa
  por la regla `status != TERMINADA`, coherente con el brief (POR_HACER/EN_CURSO/
  BLOQUEADA cuentan).
- Supuesto de verificación: puerto/prefijo de la API y mecanismo de actor en
  desarrollo se confirman en `apps/api` (`main.ts`/README/seed) durante el item 7;
  si el entorno no permite levantar Docker/DB, documentarlo y considerar el item 7
  como verificación manual pendiente, apoyándose en los tests unitarios (items 3 y
  6) como evidencia principal.
```