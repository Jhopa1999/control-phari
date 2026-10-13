# Verificación · Responsable principal del Triage como FK (`mainResponsibleUserId`)

Iteración: primera (no existía `review.json`). Implementado desde cero según
`design.md` (revisión 2) y `plan.md`. Todos los comandos ejecutados en Windows
(PowerShell), desde la raíz del monorepo salvo donde se indica `apps/api`.

## Resultados (comando exacto → resultado / exit code)

| # | Comando | Dir | Resultado | Exit |
|---|---|---|---|---|
| 1 | `npm run prisma:validate` | raíz | "The schema at prisma\schema.prisma is valid 🚀" | 0 |
| 2 | `npx prisma migrate status` (antes de migrar) | apps/api | "Database schema is up to date!" (9 migraciones) | 0 |
| 3 | `npm run prisma:migrate:dev -- --name triage_main_responsible_fk` | apps/api | Creada y aplicada `20261013055736_triage_main_responsible_fk`; "Your database is now in sync with your schema." | 0 |
| 4 | `npx prisma generate` | apps/api | "Generated Prisma Client (7.10.0)" (cliente regenerado con la relación `mainResponsible`) | 0 |
| 5 | `npm run typecheck:api` | raíz | sin errores de tipos | 0 |
| 6 | `npm run test:unit` | raíz | **440 passed, 440 total** (51 suites), incl. los 6 casos nuevos del responsable | 0 |
| 7 | `npm run contracts:generate` | raíz | OpenAPI regenerado + `schema.d.ts` regenerado (openapi-typescript 7.13.0) | 0 |
| 8 | `npm run build:api-client` | raíz | `tsc` + copy-schema OK | 0 |
| 9 | `npm run typecheck:web` | raíz | sin errores de tipos | 0 |
| 10 | `npm run prisma:validate` (final) | raíz | schema válido | 0 |
| 11 | `npm run typecheck` (api + api-client + web) | raíz | sin errores | 0 |
| 12 | `npm run build` (build:api + build:api-client + build:web) | raíz | nest build OK; api-client OK; next build "Compiled successfully", 29 rutas generadas | 0 |
| 13 | `npx prisma migrate status` (final) | apps/api | 10 migraciones; "Database schema is up to date!" | 0 |

## Notas

- Nota runtime del plan (NIT-2): la base estaba al día y la última migración
  previa era `20261009200659_add_user_password_hash`; no había triage legado, así
  que el `DROP COLUMN "main_responsible"` no perdió datos de valor. El SQL
  generado (`migration.sql`) hace `DROP COLUMN "main_responsible"`,
  `ADD COLUMN "main_responsible_user_id" UUID`, crea el índice
  `triages_main_responsible_user_id_idx` y la FK
  `REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`.
- `prisma migrate dev` encadenó `prisma generate` pero el primer `typecheck:api`
  todavía veía el cliente anterior; se ejecutó `npx prisma generate` (paso 4)
  y a partir de ahí el typecheck quedó en verde. No se editó ningún artefacto
  generado a mano.
- No se levantaron dev servers ni procesos de larga duración.
- `test:e2e` no se ejecutó: el diseño/revisión confirmó que no hay flujo
  Playwright que escriba este campo. La regla de autorización del nuevo campo
  queda cubierta por pruebas Jest unitarias (ver abajo).
- No se crearon archivos temporales.

## Pruebas Jest añadidas (`triage.service.spec.ts`)

Cubren la validación/autorización del nuevo campo:
- responsable = líder del proceso principal → OK y persiste la FK.
- responsable NO elegible con proceso que sí tiene líderes → 400 sin mutación.
- proceso sin líderes (respaldo) + miembro del proceso → OK.
- proceso sin líderes + persona que no es miembro → 400.
- `mainResponsibleUserId` undefined → OK sin consultar candidatos.
- `findForRequest` publica los mismos candidatos que valida `create`
  (demuestra no-divergencia desplegable/validación).
