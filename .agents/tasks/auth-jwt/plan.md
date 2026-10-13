# Implementation Plan — Autenticación real por JWT (control-phari / rama feat/auth-jwt)

TODO el trabajo ocurre dentro del worktree. Rutas ABSOLUTAS siempre.

- Worktree: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt`
- El cwd de los agentes es la raíz del repo (`c:\Users\analistabi2\Desarrollo\control-phari`), NO el worktree.
  Para git usa: `git -C c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt ...`
  Para npm/prisma usa `cwd` apuntando al worktree (o a `...\.worktrees\auth-jwt\apps\api`).

## Hallazgos de la exploración (leídos del código; NO re-investigar)

Confirmado leyendo los archivos:
- `apps/api/src/modules/auth/actor-resolver.ts`: `ACTOR_RESOLVER = Symbol('ACTOR_RESOLVER')` e interfaz `ActorResolver { resolve(rawIdentity: string | undefined): Promise<CurrentActor | null> }`. **La firma recibe UN solo string**, no el objeto de headers.
- `apps/api/src/modules/auth/dev-actor.resolver.ts`: `DevActorResolver implements ActorResolver`. Query exacta: `prisma.user.findFirst({ where: { identifier }, include: { grants: { where: { active: true }, include: { role: true, process: true } } } })`; valida `!user || !user.active`; construye `CurrentActor` (userId, name, identifier, grants[], roleCodes:Set<RoleCode>, scopedProcessIds:Set<string>, isJefeArea). Usa `toRoleCode` para filtrar roles fuera del conjunto cerrado. Exporta `DEV_HEADER_AUTH_MODE = 'dev-header'`, `getAuthMode()` (lee `process.env.AUTH_MODE`), `isDevHeaderMode()`. **Confirmado: usa `findFirst` a propósito** (comentario en el archivo explica Prisma 7).
- `apps/api/src/modules/auth/current-user.guard.ts`: `ACTOR_HEADER = 'x-actor-id'`. El guard lee `request.headers[ACTOR_HEADER]`, normaliza con `headerValue()` (soporta string|string[]), llama `resolve()` y lanza `UnauthorizedException` si null. Define la interfaz local `RequestWithActor`.
- `apps/api/src/modules/auth/auth.module.ts`: hoy `{ provide: ACTOR_RESOLVER, useExisting: DevActorResolver }`. `imports: [PrismaModule]`; controllers `[MeController, DevActorsController]`; providers incluyen `DevActorResolver`, `CurrentUserGuard`, `RolesGuard`; exporta `ACTOR_RESOLVER, CurrentUserGuard, RolesGuard`.
- `apps/api/src/modules/auth/dev-actors.controller.ts`: `@Controller('dev')`, `GET /dev/actors`, pública (sin guard); si `!isDevHeaderMode()` lanza `NotFoundException` (404). **Este comportamiento NO debe cambiar.**
- `apps/api/src/modules/auth/me.controller.ts`: `@Controller('me')` con `@UseGuards(CurrentUserGuard)`, expone `GET /me/permissions`. (El endpoint protegido para la prueba funcional es **`GET /me/permissions`**, no `/auth/me` ni `/me`.)
- `apps/api/src/database/prisma.service.ts`: `PrismaService extends PrismaClient`; valida `process.env.DATABASE_URL` en el constructor (lanza error claro si falta). Inyectable; `JwtActorResolver` y el service de login lo inyectan igual que `DevActorResolver`.
- `apps/api/src/app.config.ts`: `configureApp()` registra un `ValidationPipe` global con `whitelist/forbidNonWhitelisted/transform` → los DTO de login con class-validator funcionan sin configurar nada extra. `buildOpenApiConfig()` NO declara esquema bearer (ver paso 8, decisión).
- `apps/api/src/main.ts` y `generate-openapi.ts`: cargan el `.env` **de la raíz del monorepo** vía `loadEnv({ path: path.resolve(__dirname, '../../../.env') })`. `prisma.config.ts` y `seed.ts` cargan `../../.env` / `../../../.env`. **Todas estas rutas se resuelven relativas a la ubicación del worktree**, es decir apuntan a `...\.worktrees\auth-jwt\.env`.
- `apps/api/jest.config.ts`: `rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'`, ts-jest (CommonJS), `clearMocks: true`. Los specs NO tocan Postgres (PrismaService se mockea). Hay **49 archivos `.spec.ts`** en `apps/api/src` (la tarea los refiere como "415 tests"; el conteo de *tests* individuales se valida ejecutando `npm run test:unit`).
- `packages/api-client`: script `generate` = `openapi-typescript ../../apps/api/openapi/openapi.json -o ./src/generated/schema.d.ts`; `build` = `tsc` + copia de schema. Depende de que `apps/api/openapi/openapi.json` esté regenerado ANTES.
- Scripts raíz (`package.json`): `contracts:generate` = `openapi:generate` + `api-client:generate`; `build:api-client`; `typecheck` (api + api-client + web); `test:unit` = `npm run test --workspace apps/api`; `build`. `apps/api` scripts: `prisma:generate`, `prisma:migrate:dev`, `prisma:seed`, `openapi:generate`, `build` (`nest build`), `test` (jest).
- `.env.example` (raíz) y `.env.production.example` (raíz) son los dos ejemplos versionados. **No existe `apps/api/.env.example`.** `.env.example` ya trae `AUTH_MODE=dev-header`; `.env.production.example` trae `AUTH_MODE` comentado. Ninguno trae `JWT_*`.

### HALLAZGO OPERATIVO CRÍTICO (bloqueante si no se atiende)
El `.env` real del repo vive en la raíz del repo principal (`c:\Users\analistabi2\Desarrollo\control-phari\.env`) y define `POSTGRES_PORT=5433` y `DATABASE_URL=postgresql://plantilla_user:change_me_local@localhost:5433/plantilla_portales`, `AUTH_MODE=dev-header`, `ENABLE_SWAGGER_UI=true`.
**El worktree `...\.worktrees\auth-jwt` NO tiene `.env` en su raíz.** Como prisma.config.ts / seed.ts / main.ts resuelven la ruta del `.env` relativa a su propia ubicación (dentro del worktree), al correr migraciones, seed o la API DESDE el worktree, `DATABASE_URL` quedará indefinida y `PrismaService`/seed fallarán con "DATABASE_URL no está definida".
- **Acción requerida (paso 1):** crear el `.env` del worktree copiando el `.env` del repo raíz, para que apunte a la misma BD local (puerto 5433). Es `.env` (NO versionado por `.gitignore`); no introduce secretos nuevos ni se commitea. Verificar que `.env` sigue ignorado por git en el worktree antes de terminar.

### Postgres local
La BD corre en el contenedor Docker del repo (`compose.yaml`, servicio `postgres`, `postgres:17-alpine`), publicado en el host en `${POSTGRES_PORT:-5432}` → con el `.env` real es **5433**. No hace falta levantar un segundo contenedor; usar la BD ya existente. Si no estuviera arriba: `npm run db:up` desde el repo raíz (comparte el mismo volumen/instancia).

### Versiones a instalar (EXACTAS, pinadas, sin rango)
Verificadas en el registry de npm el día de la planificación:
- `@nestjs/jwt@11.0.2` — última de la línea Nest 11 (CommonJS). **NO usar 12.x**: la 12.x es ESM puro alineada a Nest 12 y este proyecto es NestJS 11 compilando a CommonJS (`nest build`, ts-jest CommonJS); 12.x rompería el build/tests.
- `bcrypt@6.0.0` — última estable (MIT). Requiere Node ≥18; el proyecto exige Node ≥20.9. OK.
- `@types/bcrypt@6.0.0` — devDependency, última.
Instalar con versión EXACTA (`npm install --save-exact ...` / `--save-dev --save-exact`) en el workspace `apps/api`, y confirmar que `apps/api/package.json` las lista SIN `^`/`~`.

## Decisión de diseño (punto 5) — cómo el guard elige el header según el modo

**Recomendación: el guard selecciona qué header leer según `getAuthMode()`; cada modo pasa su valor crudo al resolver, manteniendo intacta la firma `resolve(rawIdentity: string | undefined)`.**

Concretamente en `current-user.guard.ts`:
- En modo `jwt` (`getAuthMode() === 'jwt'`): leer el header `authorization` completo (string crudo, p. ej. `"Bearer eyJ..."`) y pasarlo a `resolve()`. El `JwtActorResolver` extrae el bearer, verifica y resuelve.
- En cualquier otro modo (incluido `dev-header` y modo sin definir): leer `x-actor-id` como hoy y pasarlo a `resolve()`. Comportamiento idéntico al actual.
- Añadir una constante `AUTHORIZATION_HEADER = 'authorization'` junto a `ACTOR_HEADER`.
- Documentar la decisión en un comentario en el guard.

**Por qué esta opción y no las alternativas:**
- Mantiene la interfaz `ActorResolver.resolve(string | undefined)` sin cambios → no churnea `DevActorResolver`, el token `ACTOR_RESOLVER`, ni los specs que ya existen.
- Los specs actuales del guard (y `roles.guard.spec.ts`) no definen `AUTH_MODE`, así que el guard cae en la rama `x-actor-id` por defecto y siguen verdes sin tocarlos.
- La alternativa "pasar todo `request.headers` al resolver" obligaría a ampliar la firma de la interfaz (de `string | undefined` a un objeto headers), tocando `DevActorResolver`, el token y la interfaz pública → más superficie de cambio y más riesgo de romper tests. Descartada.
- La alternativa "cada resolver lee `process.env` + headers por su cuenta" acopla cada resolver al transporte HTTP; el guard es el único punto que ya conoce el `request`. El guard eligiendo el header mantiene la responsabilidad donde ya vive.

**Lógica de negocio NO duplicada:** la carga User+grants y la construcción de `CurrentActor` se extrae a un helper compartido `loadActorByIdentifier(prisma, identifier)` en un archivo nuevo del módulo auth, consumido TANTO por `DevActorResolver` (refactor para usarlo) COMO por `JwtActorResolver`. El `JwtActorResolver` solo añade la verificación del token y la extracción del `sub`; la autorización (grants/roles) es exactamente la misma función.

---

## Pasos

- [ ] 1. Crear el `.env` del worktree para que prisma/seed/API encuentren `DATABASE_URL` (puerto 5433) al correr desde el worktree.
      Copiar el contenido de `c:\Users\analistabi2\Desarrollo\control-phari\.env` a `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt\.env`. Añadir al final (para la prueba funcional del paso 12) estas tres líneas sin secretos reales:
      `AUTH_MODE=dev-header` (ya viene; dejar así para no romper el estado por defecto),
      `JWT_SECRET=dev-only-insecure-secret-change-me`,
      `JWT_EXPIRES_IN=8h`.
      Archivos: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt\.env` (NO versionado).
      Verify: `git -C c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt status --porcelain .env` NO lista el `.env` (confirma que `.gitignore` lo ignora); `node -e "require('dotenv').config({path:'.env'});console.log(!!process.env.DATABASE_URL)"` desde el worktree imprime `true`.

- [ ] 2. Añadir `passwordHash String?` al modelo `User` en el schema y generar el client.
      Editar `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt\apps\api\prisma\schema.prisma`: en `model User`, añadir el campo opcional `passwordHash String? @map("password_hash")` (seguir la convención `@map` snake_case del resto del modelo; es nullable para no romper filas existentes ni dev-header). NO tocar ningún otro modelo.
      Archivos: `...\apps\api\prisma\schema.prisma`.
      Verify: `npm run prisma:validate --workspace apps/api` OK; `npm run prisma:generate --workspace apps/api` sin errores (equivale a `npm run prisma:generate` raíz).

- [ ] 3. Crear y aplicar la migración `add_user_password_hash` en la BD local.
      Desde `cwd = ...\.worktrees\auth-jwt\apps\api` ejecutar `npx prisma migrate dev --name add_user_password_hash` (usa `prisma.config.ts`, que carga el `.env` del worktree del paso 1; BD Postgres local en Docker, puerto 5433). Debe crear `apps\api\prisma\migrations\<timestamp>_add_user_password_hash\migration.sql` con un `ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;` (nullable). NO debe generar cambios en otras tablas; si el diff incluye otros modelos, detenerse e investigar.
      Archivos: nueva carpeta de migración bajo `...\apps\api\prisma\migrations\`.
      Verify: el comando termina "in sync"/sin errores; revisar el `migration.sql` generado y confirmar que solo añade la columna nullable a `users`.

- [ ] 4. Instalar dependencias de hashing y JWT con versión EXACTA en apps/api.
      Desde `cwd = ...\.worktrees\auth-jwt\apps\api`: `npm install --save-exact bcrypt@6.0.0 @nestjs/jwt@11.0.2` y `npm install --save-dev --save-exact @types/bcrypt@6.0.0`. (npm actualizará el `package-lock.json` de la raíz del worktree por ser workspaces.)
      Archivos: `...\apps\api\package.json`, `...\package-lock.json` (raíz worktree).
      Verify: `apps/api/package.json` lista `bcrypt": "6.0.0"`, `@nestjs/jwt": "11.0.2"` y `@types/bcrypt": "6.0.0"` SIN `^`/`~`. `node -e "require('bcrypt');require('@nestjs/jwt')"` desde `apps/api` no lanza.

- [ ] 5. Crear el helper de hashing con bcrypt cost 10.
      Nuevo archivo `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt\apps\api\src\modules\auth\password-hash.ts` (o `password.service.ts` si se prefiere un provider inyectable; para una utilidad pura basta funciones exportadas): `export async function hashPassword(plain: string): Promise<string>` (usa `bcrypt.hash(plain, 10)`) y `export async function verifyPassword(plain: string, hash: string): Promise<boolean>` (usa `bcrypt.compare`). Tipado estricto, sin `any`. Exportar `BCRYPT_COST = 10` como constante nombrada.
      Archivos: `...\apps\api\src\modules\auth\password-hash.ts`.
      Verify: cubierto por los tests del paso 11 y por el typecheck del paso 10.

- [ ] 6. Extraer la carga compartida User+grants a un helper reutilizable por ambos resolvers (evita duplicar autorización).
      Nuevo archivo `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt\apps\api\src\modules\auth\load-actor.ts` que exporte `export async function loadActorByIdentifier(prisma: PrismaService, identifier: string | undefined): Promise<CurrentActor | null>`. Mover a esta función la lógica HOY en `DevActorResolver.resolve` (el `findFirst` exacto con `include` de grants activos + role + process, la validación `!user || !user.active`, el bucle que arma `grants/roleCodes/scopedProcessIds/isJefeArea`, y el helper `toRoleCode`). Luego refactorizar `dev-actor.resolver.ts` para que `DevActorResolver.resolve(rawIdentity)` haga `return loadActorByIdentifier(this.prisma, rawIdentity?.trim())`. MANTENER en `dev-actor.resolver.ts` las exportaciones `DEV_HEADER_AUTH_MODE`, `getAuthMode`, `isDevHeaderMode` (otros archivos las importan).
      Archivos: `...\apps\api\src\modules\auth\load-actor.ts`, `...\apps\api\src\modules\auth\dev-actor.resolver.ts`.
      Verify: `npm run test:unit` (ya ejecutable) → specs existentes del guard/roles/module-matrix siguen verdes; typecheck del paso 10 sin errores. Comportamiento de `DevActorResolver` idéntico (misma query `findFirst`, misma construcción).

- [ ] 7. Crear `JwtActorResolver` que verifica el bearer token y reutiliza `loadActorByIdentifier`.
      Nuevo archivo `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt\apps\api\src\modules\auth\jwt-actor.resolver.ts`: `@Injectable() class JwtActorResolver implements ActorResolver`, inyecta `PrismaService` y `JwtService` (de `@nestjs/jwt`). `resolve(rawIdentity)` recibe el header `Authorization` completo: si falta o no empieza por `Bearer ` → `return null`; extrae el token; `jwtService.verifyAsync<{ sub?: string }>(token)` (verifica firma+expiración con el secreto configurado en el `JwtModule`); si falla la verificación → `return null` (envolver en try/catch, NO propagar); si no hay `sub` string → `null`; si todo OK → `return loadActorByIdentifier(this.prisma, payload.sub)` (misma carga/validación `user.active`/grants que dev). Devuelve `null` ante cualquier fallo. Tipado estricto, sin `any` (tipar el payload).
      Archivos: `...\apps\api\src\modules\auth\jwt-actor.resolver.ts`.
      Verify: cubierto por los tests del paso 11 y el typecheck del paso 10.

- [ ] 8. Crear el DTO de entrada, el DTO de respuesta y el service + controller de login público `POST /auth/login`.
      Archivos nuevos bajo `...\apps\api\src\modules\auth\`:
      - `dto/login-request.dto.ts`: `class LoginRequestDto { @IsString() @IsNotEmpty() identifier!: string; @IsString() @IsNotEmpty() password!: string }` (class-validator; el `ValidationPipe` global ya aplica).
      - `dto/login-response.dto.ts`: `class LoginUserDto { @ApiProperty() id; @ApiProperty() name; @ApiProperty() identifier }` y `class LoginResponseDto { @ApiProperty() accessToken: string; @ApiProperty() expiresIn: string; @ApiProperty({ type: LoginUserDto }) user: LoginUserDto }` (tipado con `@ApiProperty` para OpenAPI, igual estilo que `dev-actor-response.dto.ts`).
      - `auth-login.service.ts`: `@Injectable()` inyecta `PrismaService` y `JwtService`. `login(dto)`: `findFirst({ where: { identifier } })`; si `!user || !user.active || !user.passwordHash` o `!(await verifyPassword(password, user.passwordHash))` → `throw new UnauthorizedException('Credenciales inválidas')` (mensaje genérico, NO revelar si el usuario existe; MISMA rama para todos los fallos). Si pasa: `expiresIn = process.env.JWT_EXPIRES_IN ?? '8h'`; `accessToken = await jwtService.signAsync({ sub: user.identifier }, { expiresIn })`; devolver `{ accessToken, expiresIn, user: { id: user.id, name: user.name, identifier: user.identifier } }`.
      - `auth-login.controller.ts`: `@ApiTags('auth') @Controller('auth')`, `@Post('login')` **sin `@UseGuards(CurrentUserGuard)`** (ruta pública), `@ApiResponse` 200 (`type: LoginResponseDto`) y 401. Delega en el service.
      Archivos: los 4 archivos nuevos citados.
      Verify: typecheck del paso 10; tests del paso 11; y en el paso 9 el controller queda registrado para que aparezca en OpenAPI.

- [ ] 9. Cablear el módulo: `JwtModule`, selección de `ACTOR_RESOLVER` por `useFactory`, guard por modo, y fallo de arranque si falta `JWT_SECRET` en modo jwt.
      - `auth.module.ts`: registrar `JwtModule.registerAsync({ useFactory: () => ({ secret: process.env.JWT_SECRET }) })` (secreto SIEMPRE desde env, NUNCA hardcodeado). Añadir providers `JwtActorResolver` y `AuthLoginService`; añadir `AuthLoginController` a `controllers`. Sustituir el provider de `ACTOR_RESOLVER` por `useFactory`:
        `{ provide: ACTOR_RESOLVER, useFactory: (dev: DevActorResolver, jwt: JwtActorResolver) => (getAuthMode() === 'jwt' ? jwt : dev), inject: [DevActorResolver, JwtActorResolver] }`.
        Esto preserva el default actual (cualquier modo distinto de `jwt`, incluido `dev-header` y sin definir, usa `DevActorResolver`). Mantener `DevActorResolver` y `JwtActorResolver` ambos como providers.
      - Validación de arranque: si `getAuthMode() === 'jwt'` y `!process.env.JWT_SECRET` (o vacío), la app debe fallar al arrancar con un error claro (p. ej. lanzar en el `useFactory` del `JwtModule` o del resolver: `throw new Error('AUTH_MODE=jwt requiere JWT_SECRET definido')`). Documentar en comentario.
      - `current-user.guard.ts`: aplicar la decisión de diseño (sección arriba): añadir `AUTHORIZATION_HEADER = 'authorization'`; en `canActivate`, elegir `rawIdentity = getAuthMode() === 'jwt' ? headerValue(request.headers[AUTHORIZATION_HEADER]) : headerValue(request.headers[ACTOR_HEADER])`; importar `getAuthMode` desde `dev-actor.resolver`. Comentar la decisión. NO cambiar la firma de `resolve`.
      - Confirmar que `DevActorsController` NO se modifica (sigue 404 fuera de dev-header).
      Archivos: `...\apps\api\src\modules\auth\auth.module.ts`, `...\apps\api\src\modules\auth\current-user.guard.ts`.
      Verify: typecheck del paso 10; `npm run test:unit` con los specs del guard existentes verdes (no definen `AUTH_MODE` → rama `x-actor-id`); prueba funcional del paso 12.

- [ ] 10. Regenerar contratos y verificar typecheck en el ORDEN conocido.
      Desde `cwd = ...\.worktrees\auth-jwt` (raíz worktree) ejecutar EN ESTE ORDEN: `npm run contracts:generate` (regenera `apps/api/openapi/openapi.json` con `/auth/login` y luego el schema del api-client) → `npm run build:api-client` → `npm run typecheck`. El orden importa: el api-client se genera/compila desde el OpenAPI recién emitido.
      Archivos (regenerados): `...\apps\api\openapi\openapi.json`, `...\packages\api-client\src\generated\schema.d.ts`, `dist` del api-client.
      Verify: los tres comandos terminan sin errores; `openapi.json` contiene la ruta `/auth/login` (POST) y el schema `LoginResponseDto`.

- [ ] 11. Añadir los tests unitarios de `JwtActorResolver` y del service de login (Jest, PrismaService y JwtService mockeados).
      Archivos nuevos `...\apps\api\src\modules\auth\jwt-actor.resolver.spec.ts` y `...\apps\api\src\modules\auth\auth-login.service.spec.ts`, siguiendo el patrón de mocks de `roles.guard.spec.ts` (sin tocar Postgres). Cubrir comportamiento observable (reglas de permisos/validación/errores), no implementación interna:
      - JwtActorResolver: token válido con `sub` de usuario activo con grants → `CurrentActor` correcto (roleCodes/scopedProcessIds/isJefeArea esperados); header ausente o sin `Bearer ` → `null`; token con firma inválida / expirado (mock `verifyAsync` lanza) → `null`; `sub` de usuario inactivo (`active:false`) → `null`.
      - AuthLoginService: credenciales correctas → `{ accessToken, expiresIn, user }` (verifica que firma con `sub = identifier`); password incorrecta → `UnauthorizedException`; usuario inexistente → `UnauthorizedException` con mensaje genérico 'Credenciales inválidas' (sin filtrar existencia); usuario sin `passwordHash` → `UnauthorizedException`.
      Archivos: los 2 specs nuevos.
      Verify: `npm run test:unit` → TODOS los suites verdes, incluidos los nuevos y los 49 specs/415 tests existentes (`current-user.guard`, `roles.guard.spec.ts`, `module-matrix.spec.ts`, etc.).

- [ ] 12. Añadir `passwordHash` de dev al seed (sin romper dev-header) y re-sembrar.
      Editar `...\apps\api\prisma\seed.ts`: importar `hashPassword` del helper del paso 5 (o `bcrypt` directo con cost 10) y, en el bloque de usuarios, setear `passwordHash` hasheando una password de dev conocida y documentada (`'dev1234'`) tanto en el `create` como en el `update` de cada usuario (idempotente). Documentar en comentario la password de dev. NO cambiar identifiers, nombres ni grants; dev-header sigue igual.
      Archivos: `...\apps\api\prisma\seed.ts`.
      Verify: `npm run prisma:seed --workspace apps/api` (o `npx tsx prisma/seed.ts` desde `apps/api`) imprime "Seed OK"; comprobar en BD que `jefe@demo.local` tiene `password_hash` no nulo (p. ej. `npx prisma studio` o una query puntual).

- [ ] 13. Verificación de build completo.
      Desde `cwd = ...\.worktrees\auth-jwt`: `npm run build:api` (o `npm run build` completo). Debe compilar `nest build` sin errores.
      Archivos: `dist` de apps/api (artefacto).
      Verify: `npm run build:api` termina sin errores. (Si se corrió `npm run build` completo, también compilan web y api-client.)

- [ ] 14. Prueba funcional REAL end-to-end en modo JWT ('compila' NO es suficiente).
      Con la BD local arriba y el `.env` del worktree (paso 1). Arrancar la API en modo jwt con un secreto de prueba, SIN hardcodear:
      - Arranque (PowerShell, `cwd = ...\.worktrees\auth-jwt\apps\api`), con override de env para esta corrida:
        `$env:AUTH_MODE='jwt'; $env:JWT_SECRET='dev-only-insecure-secret-change-me'; $env:JWT_EXPIRES_IN='8h'; npm run start:prod` (requiere `npm run build:api` previo) — o `npm run start:dev`. Usar `run_in_background` para el servidor.
      - Login:
        `curl -s -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d "{\"identifier\":\"jefe@demo.local\",\"password\":\"dev1234\"}"` → debe responder 200 con `accessToken`, `expiresIn`, `user`. Guardar el token.
      - Endpoint protegido con el token:
        `curl -s http://localhost:3001/me/permissions -H "Authorization: Bearer <TOKEN>"` → 200 con el actor correcto (userId/name/identifier/grants/allowedModules del jefe).
      - Sin token: `curl -i http://localhost:3001/me/permissions` → 401. Con token basura: `curl -i http://localhost:3001/me/permissions -H "Authorization: Bearer basura"` → 401.
      - Fallo de arranque: arrancar con `AUTH_MODE=jwt` y SIN `JWT_SECRET` → la app debe fallar al iniciar con error claro (verificar en logs). (Detener el servidor en background al terminar.)
      Documentar en el reporte los comandos exactos y las respuestas obtenidas.
      Verify: login 200 con token; `/me/permissions` 200 con token válido y 401 sin token / token inválido; arranque sin `JWT_SECRET` en modo jwt falla con mensaje claro.

- [ ] 15. Confirmar explícitamente que dev-header sigue funcionando igual (no regresión).
      Reiniciar la API con `AUTH_MODE=dev-header` (o sin `AUTH_MODE`, que cae en dev por el default del `useFactory`), `cwd = apps/api`:
      - Selector dev: `curl -s http://localhost:3001/dev/actors` → 200 con la lista de usuarios activos (ruta pública, solo disponible en dev-header).
      - Resolución por header: `curl -s http://localhost:3001/me/permissions -H "x-actor-id: jefe@demo.local"` → 200 con el actor del jefe.
      - Y confirmar que en modo jwt `GET /dev/actors` responde 404 (regla preservada del `DevActorsController`).
      Verify: en dev-header, `/dev/actors` 200 y `/me/permissions` con `x-actor-id` 200; en jwt, `/dev/actors` 404. Documentar comandos y respuestas.

- [ ] 16. Env de ejemplo: documentar `JWT_SECRET` y `JWT_EXPIRES_IN` (sin secretos reales).
      Editar los dos ejemplos versionados de la raíz del worktree:
      - `...\.worktrees\auth-jwt\.env.example`: añadir `JWT_SECRET=` (placeholder vacío, con comentario de que es obligatorio solo en `AUTH_MODE=jwt` y nunca un secreto real versionado) y `JWT_EXPIRES_IN=8h`. `AUTH_MODE` ya existe allí.
      - `...\.worktrees\auth-jwt\.env.production.example`: documentar `AUTH_MODE=jwt` (comentado o con nota de que en prod se usa jwt, no dev-header), `JWT_SECRET=` (placeholder, nota de usar secreto fuerte) y `JWT_EXPIRES_IN=8h`.
      NO poner valores reales. NO tocar el `.env` real (ya cubierto por el paso 1, que es local y no versionado).
      Archivos: `...\.worktrees\auth-jwt\.env.example`, `...\.worktrees\auth-jwt\.env.production.example`.
      Verify: `git -C ...\.worktrees\auth-jwt diff --stat .env.example .env.production.example` muestra solo adiciones de `JWT_*`; ningún valor de secreto real presente.

## Lista de verificación obligatoria (resumen ejecutable para el coder)
Todos desde el worktree (`cwd` = raíz worktree salvo que se indique apps/api):
1. `npm run prisma:generate` sin errores (paso 2).
2. Migración `add_user_password_hash` aplicada en BD local sin errores (paso 3).
3. `npm run contracts:generate` && `npm run build:api-client` && `npm run typecheck` sin errores, en ese orden (paso 10).
4. `npm run test:unit` → TODOS verdes (415 existentes + nuevos) (paso 11).
5. `npm run build:api` (o `npm run build`) sin errores (paso 13).
6. Prueba funcional REAL en modo jwt: login → accessToken; `Authorization: Bearer` contra `/me/permissions` → 200; sin token / token basura → 401; arranque sin `JWT_SECRET` en jwt → falla claro (paso 14).
7. dev-header sigue igual: `/dev/actors` 200 y `/me/permissions` con `x-actor-id` 200 en dev-header; `/dev/actors` 404 en jwt (paso 15).

## Notas y supuestos
- Endpoint protegido para la prueba funcional: **`GET /me/permissions`** (es el único endpoint real bajo `CurrentUserGuard` en el módulo auth; la tarea menciona `/auth/me` o `/me`, que no existen literalmente).
- "415 tests": el repo tiene 49 archivos `.spec.ts` en apps/api; el número de *tests* se valida por el conteo de `npm run test:unit`, no por archivos.
- Afirmación 'ya verificada' sobre `findUnique` vs `findFirst`: confirmada por el comentario y el código de `dev-actor.resolver.ts`; se preserva usando `findFirst` tanto en el helper compartido como en el service de login.
- No se introduce infraestructura nueva (JWT stateless, sin Redis/sesiones). bcrypt y @nestjs/jwt son librerías, no infraestructura.
- `.env` del worktree (paso 1) es local y está ignorado por git; no se commitea y no contiene secretos reales de producción.
