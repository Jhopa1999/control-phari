# Real JWT authentication for control-phari (security review)

The change adds a real authentication mode (`AUTH_MODE=jwt`) alongside the existing dev-header mode. It introduces a public `POST /auth/login` that verifies an identifier + password against a bcrypt `passwordHash` and issues a signed JWT, plus a `JwtActorResolver` that verifies the bearer token and reuses the exact same User+grants load as dev-header. The authorization logic (grants → roles → scope → `CurrentActor`) was extracted verbatim into a shared `load-actor.ts` so both resolvers share one source of truth. The actor resolver and the header the guard reads are selected by `AUTH_MODE` through a NestJS factory, and the JWT secret is read only from the environment with a fail-at-startup guard in jwt mode.

Watch for: nothing blocking. The login error path is uniform and generic (confirmed), the secret is never hardcoded and fails closed at startup (confirmed by evidence 6d), authorization logic is deduplicated into `load-actor.ts` (confirmed), and dev-header is untouched (confirmed). Minor non-blocking observations are noted below.

**Verdict**: APPROVED

## High-level view

The login path funnels every failure — unknown user, inactive user, missing `passwordHash`, wrong password — through a single `UnauthorizedException('Credenciales invalidas')`. There is no early return or distinct message on any branch, so the response does not reveal whether a user exists. Password verification runs through bcrypt. The unit spec covers all four failure branches plus the happy path.

The JWT secret is sourced from `process.env.JWT_SECRET` via `JwtModule.registerAsync`. In jwt mode a missing or blank secret throws at module construction, so the app refuses to boot rather than silently signing with an undefined/empty key. No secret value appears in any versioned file; `.env.example` and `.env.production.example` ship empty placeholders.

`JwtActorResolver` adds only token concerns: it extracts the `Bearer` token, verifies signature and expiry, pulls `sub`, and delegates to `loadActorByIdentifier`. Any token problem (absent, malformed, no `Bearer` prefix, bad signature, expired, missing `sub`) and any user problem (nonexistent, inactive) resolve to `null`, which the guard turns into 401. The verify exception is swallowed, not propagated. Authorization is not duplicated — `DevActorResolver` now also delegates to the same shared function.

Mode selection is clean and documented: a factory picks `jwt`→`JwtActorResolver` else `DevActorResolver`, and the guard reads `Authorization` in jwt mode and `X-Actor-Id` otherwise. Dev-header behavior is preserved — specs that don't set `AUTH_MODE` fall through the else branch unchanged, and `DevActorsController` still 404s outside dev-header (that file is not touched by the diff).

Stack discipline holds: no new infrastructure, Prisma stays in apps/api, bcrypt is pinned exactly to the genuine `6.0.0`, the `findFirst` pattern is preserved, and no unjustified `any` enters production code. `POST /auth/login` is in the generated OpenAPI and carries no `CurrentUserGuard`, so it is public.

<details>
<summary>Issues (2)</summary>

1. **Login response is a 200 for OpenAPI only, no explicit 500/validation doc** — non-blocking. The 400 from the global `ValidationPipe` (whitelist/forbidNonWhitelisted on `LoginRequestDto`) is not documented in the OpenAPI responses for `/auth/login`. Cosmetic; the validation itself is in place.
2. **No per-request constant-time guarantee on the unknown-user branch** — non-blocking. When the user is not found, bcrypt never runs, so the unknown-user path is faster than the wrong-password path, a theoretical timing side channel. The message/status are identical and this matches the task's stated requirement (same error path, generic message); flagged only for awareness, not required for this change.

</details>

<details>
<summary>Details</summary>

## Uniform, non-enumerating login failure

`AuthLoginService.login` loads the user with `findFirst({ where: { identifier } })` and then evaluates a single boolean:

```ts
if (
  !user ||
  !user.active ||
  !user.passwordHash ||
  !(await verifyPassword(dto.password, user.passwordHash))
) {
  throw new UnauthorizedException(INVALID_CREDENTIALS);
}
```

All four conditions converge on the same `UnauthorizedException('Credenciales invalidas')` with no branch-specific message or status, so unknown user, inactive user, missing `passwordHash`, and wrong password are indistinguishable to the caller (confirmed). `signAsync` is only reached after the guard passes, so no token is minted on any failure — the spec asserts `signAsync` is not called for wrong-password and missing-hash cases (confirmed). The `INVALID_CREDENTIALS` constant is defined once and reused, so the two documented 401 descriptions and the thrown message stay aligned.

One timing nuance: the unknown-user branch short-circuits before bcrypt, so it returns faster than the wrong-password branch that runs `bcrypt.compare` — a theoretical enumeration side channel. Status and body are identical and the task's requirement (uniform error path) is met, so this is non-blocking.

## Secret from env, fail-closed at startup

`resolveJwtSecret` reads `process.env.JWT_SECRET` and throws when the mode is jwt and the secret is missing or whitespace-only:

```ts
function resolveJwtSecret(): string | undefined {
  const secret = process.env.JWT_SECRET;
  if (isJwtMode() && (!secret || secret.trim() === '')) {
    throw new Error('AUTH_MODE=jwt requiere definir JWT_SECRET (no debe hardcodearse).');
  }
  return secret;
}
```

Wired through `JwtModule.registerAsync({ useFactory: () => ({ secret: resolveJwtSecret() }) })`, the throw happens during module construction, so a jwt-mode boot without a secret fails before the app serves traffic — fail-closed, not a silent sign with an empty key. Verification evidence 6d reproduces this: the app does not start and logs the exact error from `resolveJwtSecret`. The `.trim()` check also rejects whitespace-only values, and the one earlier false-negative in testing (PowerShell unsetting an empty var so dotenv re-injected the `.env` value) is documented in the evidence and does not reflect a code gap. No fallback default secret exists anywhere in the diff, and both env example files ship `JWT_SECRET=` empty with explanatory comments (confirmed).

## JwtActorResolver verifies the token and reuses the shared load

`JwtActorResolver.resolve` is narrowly scoped to token handling. It requires the `Bearer ` prefix, strips it, verifies via `jwtService.verifyAsync`, and requires a non-empty string `sub` before delegating:

```ts
let payload: JwtPayload;
try {
  payload = await this.jwtService.verifyAsync<JwtPayload>(token);
} catch {
  return null;
}
if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
  return null;
}
return loadActorByIdentifier(this.prisma, payload.sub);
```

Every token fault — absent header, missing `Bearer` prefix, empty token, bad signature, expiry, missing/blank `sub` — returns `null`, and the verify exception is caught rather than propagated, so a malformed token yields a clean 401 through the guard rather than a 500. The spec covers absent header, non-Bearer header, invalid/expired signature, inactive user, and missing-`sub` (confirmed). Expiry is enforced by `verifyAsync` because the token is signed with `expiresIn`; the "invalid signature or expired → null" spec case exercises the catch branch.

Authorization is not re-implemented here. The grants→roles→scope mapping lives once in `loadActorByIdentifier`, and both resolvers call it:

```
AUTH_MODE=jwt       Authorization: Bearer <jwt>
   guard reads Authorization header
      JwtActorResolver.resolve  --- verify token, extract sub --->  loadActorByIdentifier
                                                                         |
AUTH_MODE=dev-header  X-Actor-Id: <identifier>                           |  (same function,
   guard reads X-Actor-Id header                                         |   same User+grants
      DevActorResolver.resolve  ----------------------------------->  loadActorByIdentifier
                                                                         |   query, same
                                                                         v   CurrentActor map)
```

The extracted `loadActorByIdentifier` is a line-for-line move of the former `DevActorResolver` body, including the `findFirst` rationale comment and the `toRoleCode` helper, so the dev-header authorization semantics are preserved exactly while the jwt path inherits them for free. This directly satisfies the "do not duplicate authorization logic" requirement.

## Mode-driven header and resolver selection

Two selection points switch on `AUTH_MODE`, both documented inline. The resolver is chosen by a factory:

```ts
{
  provide: ACTOR_RESOLVER,
  useFactory: (dev, jwt) => getAuthMode() === JWT_MODE_AUTH ? jwt : dev,
  inject: [DevActorResolver, JwtActorResolver],
}
```

and the guard chooses which header to read:

```ts
const rawIdentity = isJwtMode()
  ? headerValue(request.headers[AUTHORIZATION_HEADER])
  : headerValue(request.headers[ACTOR_HEADER]);
```

Both default to the dev-header path for any non-jwt value, including undefined. The guard's `resolve(string | undefined)` signature is unchanged, so existing specs that never set `AUTH_MODE` keep reading `X-Actor-Id` and behave as before — this is why the 415 pre-existing tests stay green per the evidence. `DevActorsController` still gates on `isDevHeaderMode()` and 404s in jwt mode (that controller is unchanged by this diff; evidence 6/7 confirm 404 in jwt and 200 in dev-header).

## Stack and secret-hygiene compliance

No new runtime infrastructure is introduced — `@nestjs/jwt` and `bcrypt` are libraries, not services, consistent with the modular-monolith constraint. Prisma access stays inside apps/api (`load-actor.ts`, the login service, and the seed). `bcrypt` is pinned to an exact `6.0.0` in `apps/api/package.json` with `@types/bcrypt@6.0.0`, and the lockfile resolves it from `https://registry.npmjs.org/bcrypt/-/bcrypt-6.0.0.tgz` — the genuine package, not a typosquat. The `findFirst` pattern is preserved in the extracted loader and the login service, each carrying the custom-unique rationale. No unjustified `any` reaches production: the single `expiresIn as JwtSignOptions['expiresIn']` cast is a typed narrowing with a comment, and the `as unknown as PrismaService` casts appear only in test mocks. The working tree is clean with no tracked `.env`; both example files carry empty secret placeholders.

## OpenAPI and public login route

The generated `openapi.json` contains `POST /auth/login` with `LoginRequestDto`/`LoginResponseDto`/`LoginUserDto` schemas (confirmed in the diff and the evidence). `AuthLoginController` carries no `CurrentUserGuard`, so the route is public — correct, since login is where identity is obtained. The response DTO exposes only `id`, `name`, `identifier` and never `passwordHash`, and `passwordHash` is `String?` in the schema, nullable so existing rows and dev-header are unaffected. The one cosmetic gap is that the global `ValidationPipe` 400 is not listed in the OpenAPI responses for the route; the validation (`@IsString`/`@IsNotEmpty`, whitelist) is present, only the doc entry is absent. Non-blocking.

## Test coverage

Two new specs: `auth-login.service.spec.ts` (happy path plus wrong-password, unknown-user with generic-message assertion, missing-hash, inactive) and `jwt-actor.resolver.spec.ts` (valid token, absent header, non-Bearer header, invalid/expired signature, inactive user, missing `sub`). Together they cover every security-relevant branch called out in the task. Per the evidence, 426 tests across 51 suites pass (415 pre-existing + 11 new), and the pre-existing `roles.guard` / `module-matrix` suites remain green, confirming no regression. Not tested at the unit level: the startup fail-closed on missing secret and the end-to-end 401/200 flows — but these are covered by the functional evidence (6a–6d, 7), so the gap is addressed outside the unit suite.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/modules/auth/auth-login.controller.ts` — new public `POST /auth/login`, no guard.
- `apps/api/src/modules/auth/auth-login.service.ts` — credential check + JWT sign; uniform generic 401.
- `apps/api/src/modules/auth/jwt-actor.resolver.ts` — bearer verify + delegate to shared loader; null on any fault.
- `apps/api/src/modules/auth/load-actor.ts` — extracted shared User+grants→CurrentActor mapping.
- `apps/api/src/modules/auth/dev-actor.resolver.ts` — now delegates to `loadActorByIdentifier`; adds `isJwtMode`/`JWT_AUTH_MODE`.
- `apps/api/src/modules/auth/auth.module.ts` — JwtModule wiring, env secret guard, mode-based resolver factory.
- `apps/api/src/modules/auth/current-user.guard.ts` — header selection by mode (Authorization vs X-Actor-Id).
- `apps/api/src/modules/auth/password-hash.ts` — bcrypt hash/verify helpers (cost 10).
- `apps/api/src/modules/auth/dto/login-request.dto.ts`, `dto/login-response.dto.ts` — login I/O DTOs.
- `apps/api/src/modules/auth/*.spec.ts` — new unit specs for login service and jwt resolver.
- `apps/api/prisma/schema.prisma` — nullable `passwordHash` column.
- `apps/api/prisma/migrations/.../migration.sql` — add nullable `password_hash` to `users`.
- `apps/api/prisma/seed.ts` — seeds dev bcrypt hash of `dev1234`.
- `apps/api/package.json` / `package-lock.json` — pin `@nestjs/jwt`, `bcrypt@6.0.0`, `@types/bcrypt`.
- `apps/api/openapi/openapi.json`, `packages/api-client/src/generated/schema.d.ts` — regenerated contract with `/auth/login`.
- `.env.example`, `.env.production.example` — document `AUTH_MODE=jwt`, empty `JWT_SECRET`, `JWT_EXPIRES_IN`.

Full diff: `git -C c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\auth-jwt diff main...feat/auth-jwt`

</details>
