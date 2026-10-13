# Verificación — Autenticación real por JWT (control-phari)

Rama/worktree: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt`
Iteración: primera (no existía `review.json`).
BD: Postgres local en Docker (`plantilla-portales-postgres-1`, puerto host 5433).

Todos los comandos se ejecutaron con el worktree como directorio de trabajo
(`...\.worktrees\auth-jwt` o `...\.worktrees\auth-jwt\apps\api`). El `.env` del
worktree (local, ignorado por git, sin secretos reales) se creó copiando el
`.env` de la raíz y añadiendo `JWT_SECRET`/`JWT_EXPIRES_IN` de desarrollo.

---

## 1. `npm run prisma:generate` sin errores

Comando (cwd `apps/api`):
```
npm run prisma:validate
npm run prisma:generate
```
Resultado:
- `prisma validate` → "The schema at prisma\schema.prisma is valid 🚀".
- `prisma generate` → "✔ Generated Prisma Client (7.10.0) to .\src\generated\prisma". Exit 0.

## 2. Migración aplicada en BD local sin errores

Comando (cwd `apps/api`):
```
npx prisma migrate dev --name add_user_password_hash
```
Resultado:
- Creó y aplicó `prisma/migrations/20261009200659_add_user_password_hash/migration.sql`.
- "Your database is now in sync with your schema." Exit 0.
- Contenido de `migration.sql` (solo añade la columna nullable a `users`, no toca otras tablas):
  ```sql
  -- AlterTable
  ALTER TABLE "users" ADD COLUMN     "password_hash" TEXT;
  ```

## 3. `contracts:generate` && `build:api-client` && `typecheck` sin errores (en ese orden)

Comando (cwd raíz worktree):
```
npm run contracts:generate ; npm run build:api-client ; npm run typecheck
```
Resultado:
- `contracts:generate`: OpenAPI generado en `apps/api/openapi/openapi.json`; api-client regenerado (`schema.d.ts`).
- `build:api-client`: `tsc` + copia de schema OK.
- `typecheck`: en el primer intento falló en `auth-login.service.ts:45` (tipo de `expiresIn`
  no asignable a `number | StringValue`). Se corrigió tipando la opción con
  `JwtSignOptions` (sin `any`). Reejecutado → los tres workspaces (api, api-client, web)
  compilan sin errores. Exit 0.
- Confirmado que `openapi.json` contiene `POST /auth/login` y los schemas
  `LoginResponseDto` y `LoginUserDto`.

## 4. `npm run test:unit` → TODOS verdes (existentes + nuevos)

Comando (cwd `apps/api`, salida JSON a archivo para capturar el resumen):
```
npx jest --config jest.config.ts --ci --json --outputFile=jest-result.json
```
Resultado (totales del JSON):
```
numTotalTestSuites=51 numPassedTestSuites=51 numFailedTestSuites=0
numTotalTests=426    numPassedTests=426    numFailedTests=0
```
- 51 suites (49 existentes + 2 nuevos: `jwt-actor.resolver.spec.ts`,
  `auth-login.service.spec.ts`), 426 tests, todos verdes (415 existentes + 11 nuevos).
- No se rompieron `roles.guard.spec.ts`, `module-matrix.spec.ts` ni el resto.
- El archivo temporal `jest-result.json` se eliminó tras leer los totales.

## 5. Build de apps/api sin errores

Comando (cwd raíz worktree):
```
npm run build:api
```
Resultado: `nest build` sin errores. Exit 0.

## 6. Prueba funcional REAL en modo jwt

Arranque (cwd `apps/api`, override de env solo para esta corrida; el servidor del
repo principal ocupa el 3001, así que se usó `PORT=3010` para el worktree):
```
$env:AUTH_MODE='jwt'; $env:JWT_SECRET='dev-only-insecure-secret-change-me'; $env:JWT_EXPIRES_IN='8h'; $env:PORT='3010'; $env:ENABLE_SWAGGER_UI='false'; node dist/main.js
```
Servidor: "API escuchando en http://localhost:3010".

### 6a. Login (POST /auth/login) con credenciales del seed → 200 + accessToken
```
POST http://localhost:3010/auth/login
Content-Type: application/json
{"identifier":"jefe@demo.local","password":"dev1234"}
```
Respuesta observada: **status 200**
```json
{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqZWZlQGRlbW8ubG9jYWwiLCJpYXQiOjE3OTE1Nzc4NDksImV4cCI6MTc5MTYwNjY0OX0.F2yeiIpPAsycjUcPbRTJkb4PpWso9_lzoVR0gzCfBaU","expiresIn":"8h","user":{"id":"59b588bc-64aa-4f6a-8486-30d6af357f12","name":"Ana Jefa","identifier":"jefe@demo.local"}}
```

### 6b. Endpoint protegido con el token (GET /me/permissions) → 200 + actor correcto
```
GET http://localhost:3010/me/permissions
Authorization: Bearer <accessToken>
```
Respuesta observada: **status 200** con el actor del jefe (userId
`59b588bc-...`, name "Ana Jefa", identifier `jefe@demo.local`, 4 grants
JEFE_AREA en FIBI/FIID/FIAA/FMAA y `allowedModules` completos).

### 6c. Sin token / token basura → 401
```
GET http://localhost:3010/me/permissions                              -> 401 (NO_TOKEN)
GET http://localhost:3010/me/permissions  Authorization: Bearer basura -> 401 (BAD_TOKEN)
```
Respuestas observadas: NO_TOKEN=401, BAD_TOKEN=401.

### 6d. Arranque en modo jwt SIN JWT_SECRET → falla con error claro
Para probarlo realmente hubo que impedir que dotenv inyectara `JWT_SECRET` del
`.env` del worktree: se movió el `.env` aparte y se quitó la variable del proceso.
Comando (cwd `apps/api`):
```
# (.env del worktree movido a .env.bak durante la prueba; restaurado después)
$env:AUTH_MODE='jwt'; Remove-Item Env:JWT_SECRET; $env:PORT='3012'; node dist/main.js
```
Resultado observado: la app **NO arranca** y falla al inicializar el módulo con:
```
ERROR [ExceptionHandler] Error: AUTH_MODE=jwt requiere definir JWT_SECRET (no debe hardcodearse).
    at resolveJwtSecret (...\dist\modules\auth\auth.module.js:26:15)
```
(Nota: un intento previo con `$env:JWT_SECRET=''` NO reprodujo el fallo porque
PowerShell desasigna la variable al ponerla vacía y entonces dotenv inyectaba el
valor del `.env`; la prueba válida es la de arriba, con el `.env` apartado.)

## 7. Dev-header sigue funcionando igual (no regresión)

Arranque (cwd `apps/api`): `$env:AUTH_MODE='dev-header'; $env:PORT='3010'; node dist/main.js`.
```
GET http://localhost:3010/dev/actors                               -> 200  (lista de 5 usuarios activos)
GET http://localhost:3010/me/permissions  x-actor-id: jefe@demo.local -> 200  (actor del jefe, mismos grants/módulos)
GET http://localhost:3010/me/permissions  (sin header)             -> 401
```
Respuestas observadas: DEV_ACTORS=200 con la lista de usuarios; ME_XACTOR=200 con
el actor del jefe; ME_NOHEADER=401. Y en modo jwt (punto 6) `GET /dev/actors`
respondió **404**, preservando la regla del `DevActorsController`.

---

## Notas de seguridad / cumplimiento

- `JWT_SECRET` nunca está hardcodeado: se lee de `process.env`; en modo jwt la
  app falla al arrancar si falta (ver 6d).
- El `.env` del worktree es local, está ignorado por git (`git status` no lo lista)
  y solo contiene un secreto de desarrollo, no de producción.
- `.env.example` y `.env.production.example` documentan `JWT_SECRET` (placeholder
  vacío) y `JWT_EXPIRES_IN`, sin valores reales.
- El login nunca revela si el usuario existe: toda falla (inexistente, inactivo,
  sin passwordHash, password incorrecta) devuelve el mismo
  `UnauthorizedException('Credenciales invalidas')` (cubierto por tests).
- La lógica de autorización (carga User+grants → CurrentActor) no se duplica:
  vive en `load-actor.ts` y la reutilizan tanto `DevActorResolver` como
  `JwtActorResolver`.
- Archivos temporales de verificación (jest-result.json, logs de arranque,
  dh.txt) eliminados.
