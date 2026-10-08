# Verificacion de cierre · Fase 3 (FEAT-003)

Evidencia de la verificacion integral ejecutada tras implementar el frontend de
Fase 3. Todos los comandos son los declarados en `package.json` (no se inventan
comandos). Entorno: Windows + PowerShell; worktree
`.worktrees/fase3-plan` (rama `feat/fase3-plan`); PostgreSQL via Docker en el
puerto 5433 (contenedor `plantilla-portales-postgres-1`, compartido con el
workspace padre).

## Resultado por comando

| Comando | Resultado |
|---|---|
| `npm run typecheck` (api + api-client + web) | OK, sin errores ni `any` no justificado |
| `npm run build` (build:api + build:api-client + build:web) | OK; `next build` lista las rutas `/seguimiento/plan`, `/seguimiento/tareas`, `/mi-trabajo`, `/administracion/revision` |
| `npm run test:unit` | OK, 23 suites / 161 tests |
| `npm run test:e2e` | OK, 3 tests (catalogs.spec) |
| `npm run contracts:generate` | OK; sin diffs en `openapi.json` ni `schema.d.ts` |

## Detalle

### typecheck

`npm run typecheck` compila los tres workspaces sin errores. El frontend queda
tipado contra el contrato (`components['schemas'][...]`) gracias a la copia del
schema a `dist/` del api-client (ver `docs/fase3-plan.md`).

### build

`npm run build` completa. La salida de `next build` incluye las cuatro rutas de
Fase 3 ademas de las de Fases 1-2 (`/catalogs`, `/administracion/maestras`,
`/demanda/*`, `/gobierno/*`), confirmando que no se rompio ninguna pantalla
existente.

### test:unit

```
Test Suites: 23 passed, 23 total
Tests:       161 passed, 161 total
```

Incluye las suites del modulo `plan/` (plan, phase, task, dependency,
plan-state, plan-guide, task-status, plan-status, plan.module) y las de Fases
1-2 (request, triage, priority, approval, request-state, request-flow, auth,
audit, catalog/process/user).

### test:e2e

```
Running 3 tests using 1 worker
  ok 1 catalogs.spec.ts > flujo principal de maestras
  ok 2 catalogs.spec.ts > duplicado muestra feedback entendible (409)
  ok 3 catalogs.spec.ts > el formulario requiere los campos obligatorios
  3 passed
```

La suite valida la cadena completa navegador → Next.js → api-client → NestJS →
Prisma → PostgreSQL sobre `/catalogs` y `/catalog-items` (Fase 1), de modo que
confirma que esas pantallas siguen operativas.

Para que el navegador limpio enviara `X-Actor-Id` se añadio
`e2e/global-setup.ts` + `storageState` en `playwright.config.ts`, que seedea el
actor dev `jefe@demo.local` en `localStorage`. Tambien fue necesario incorporar
`AUTH_MODE=dev-header` al `.env` del worktree (no versionado). Sin estos dos
ajustes de entorno el backend responde 401 ante peticiones sin actor, que es el
comportamiento correcto.

### Migracion aplicada

`npx prisma migrate status` (desde `apps/api`, con la BD arriba) reporta
"Database schema is up to date!" con 4 migraciones, incluida
`20261008145320_fase3_plan`. El seed (`npm run prisma:seed --workspace apps/api`)
es idempotente: "3 roles, 4 procesos, 4 usuarios, 7 grants, 45 maestras".

### contracts:generate

`npm run contracts:generate` regenera `apps/api/openapi/openapi.json` y
`packages/api-client/src/generated/schema.d.ts` y `git status` no muestra cambios
en esos dos artefactos: el contrato de FEAT-002 ya era correcto y FEAT-003 no lo
altera.

## Fases 1-2, /catalogs y /catalog-items

- Fases 1-2: cubiertas por las suites unitarias (todas en verde) y, en el caso
  de catalogos, por la E2E.
- `/catalogs` y `/catalog-items`: E2E en verde (3/3) tras los ajustes de
  entorno; la seccion de Fase 3 en `/administracion/revision` se añadio sin
  alterar la cola de compromiso de Fase 2.
