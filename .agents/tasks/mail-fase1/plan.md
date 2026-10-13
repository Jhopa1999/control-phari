# Implementation Plan — Correo transaccional (Fase 1)

Worktree raíz: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\mail-fase1`.
Todas las rutas de este plan son absolutas bajo ese worktree.

## Decisiones de diseño (breves, con justificación)

- **Nodemailer pin exacto:** `nodemailer@10.1.0` (runtime) y `@types/nodemailer@8.0.2` (dev). Son las versiones `latest` estables (sin tags preliminares); nodemailer 10.1.0 declara `engines.node >=20.0.0` (compatible con el repo `>=20.9.0`) y `@types/nodemailer@8.0.2` es el tag `ts5.9` (compatible con TypeScript 5.9.3). Verificado con `npm view`.
- **Transporter inyectable para test:** `MailService` crea el transporter vía una fábrica (`createTransport` de nodemailer) encapsulada en un provider/token inyectable, de modo que los tests Jest inyectan un doble tipado del transporter con `sendMail` mockeado sin librerías de mocking (igual patrón que el mock de `PrismaService`). Sin esto, probar `MailService` exigiría red SMTP real.
- **Hash de token:** SHA-256 (crypto nativo) sobre el token en claro de ≥32 bytes de `crypto.randomBytes`. Para tokens de alta entropía (aleatorios, no adivinables) SHA-256 es suficiente y no requiere el coste de bcrypt; bcrypt es para contraseñas de baja entropía. Se justifica en comentario en el código. En BD solo se guarda el hash; el token en claro solo viaja por correo.
- **Unificación reset/invitación:** un único `AuthTokenService` emite y valida `AuthToken` para ambos `purpose` (`PASSWORD_RESET`, `USER_INVITATION`). El flujo de "establecer contraseña" es idéntico para reset y activación (hashea contraseña, marca `usedAt`); el `purpose` solo controla semántica/copy del correo y la URL destino. Se evita duplicar lógica de token.
- **Endpoint de activación:** se reutiliza `POST /auth/reset-password` como mecanismo común de "establecer contraseña por token" (valida token de cualquier purpose válido para set-password y actualiza `passwordHash`). La activación de invitación usa el MISMO endpoint; el frontend solo cambia el copy. Menos duplicación que un `/auth/accept-invitation` separado. Documentado en el controller.
- **Envío de correo fuera de la transacción:** la transacción de BD (crear token / actualizar contraseña + auditoría) se confirma primero; el `sendMail` ocurre después. Para `forgot-password` un fallo SMTP no revierte el token (el usuario puede reintentar) y nunca cambia la respuesta genérica 204. Documentado en el service.
- **No revelar existencia:** `POST /auth/forgot-password` responde SIEMPRE `204 No Content` exista o no el usuario, replicando la política de `auth-login.service.ts`.
- **Protección de invitar:** `POST /users/:id/invite` se protege con `CurrentUserGuard + RolesGuard + @Roles(RoleCode.JEFE_AREA)`, idéntico a `user.controller.ts`.

## Variables de entorno nuevas (todas en `.env.example` raíz y, con placeholders vacíos para secretos, en `.env.production.example`)

- `SMTP_HOST` (ej. `smtp.office365.com`), `SMTP_PORT` (`587`), `SMTP_SECURE` (`false`; Office365 587 → STARTTLS), `SMTP_USER` (secreto, vacío en repo), `SMTP_PASSWORD` (secreto, vacío en repo), `MAIL_FROM` (secreto/por-ambiente, vacío en repo), `MAIL_FROM_NAME` (`Notificaciones`), `APP_WEB_URL` (`http://localhost:3000`).
- `PASSWORD_RESET_TTL` (default `1h`), `USER_INVITATION_TTL` (default `72h`), `PASSWORD_MIN_LENGTH` (default `8`).

## Orden global

Backend módulo de correo → Prisma modelo + migración → servicios reset/invitación + endpoints → contrato OpenAPI (`contracts:generate`) + build api-client → frontend → verificación final.

---

- [ ] 1. **Dependencia y módulo de correo.** Instalar `nodemailer@10.1.0` (dep) y `@types/nodemailer@8.0.2` (devDep) en `apps/api` con pin exacto. Crear `MailModule` y `MailService` con transporter Nodemailer SMTP leído de env (`SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `MAIL_FROM`, `MAIL_FROM_NAME`, `APP_WEB_URL`). Validación al arrancar: si falta una var obligatoria, lanzar `Error` con mensaje claro SIN exponer secretos (patrón de `PrismaService`/`resolveJwtSecret`). Métodos tipados `sendPasswordReset({ to, name, resetUrl, expiresLabel })` y `sendUserInvitation({ to, name, inviteUrl, expiresLabel })` con plantillas HTML inline + texto plano en español (sin motor de plantillas). Transporter creado por fábrica inyectable (token `MAIL_TRANSPORTER`) para permitir mock en tests. `MailModule` exporta `MailService`.
      Archivos: `apps/api/package.json`, `apps/api/src/modules/mail/mail.module.ts`, `apps/api/src/modules/mail/mail.service.ts`, `apps/api/src/modules/mail/mail.config.ts` (lectura/validación de env), `apps/api/src/modules/mail/mail-transporter.provider.ts` (fábrica + token), `apps/api/src/modules/mail/mail.types.ts` (interfaces de los payloads).
      Verify: `npm run typecheck:api` desde la raíz del worktree compila sin errores.

- [ ] 2. **Test de MailService.** Añadir `apps/api/src/modules/mail/mail.service.spec.ts` siguiendo el patrón del repo: inyectar un doble tipado del transporter con `sendMail: jest.fn()`; cubrir que `sendPasswordReset` y `sendUserInvitation` llaman `sendMail` con `from` (MAIL_FROM/MAIL_FROM_NAME), `to`, `subject`, `text` y `html` que incluyen la URL y el nombre. Depende del item 1.
      Archivos: `apps/api/src/modules/mail/mail.service.spec.ts`.
      Verify: `npm run test:unit` desde la raíz pasa el nuevo spec.

- [ ] 3. **Modelo Prisma AuthToken + migración.** Añadir al final de `apps/api/prisma/schema.prisma` el modelo `AuthToken` (tabla `auth_tokens`): `id` uuid, `userId` fk a `User` (`@db.Uuid`, `onDelete: Cascade`), `purpose` String, `tokenHash` String, `expiresAt`, `usedAt?`, `createdAt`; índices `@@index([userId])` y `@@index([tokenHash])`, mapeos snake_case con `@map`/`@@map`. Añadir la relación inversa `authTokens AuthToken[]` en el modelo `User`. Generar migración `prisma migrate dev --name create_auth_tokens` usando el `.env` local (puerto host 5433); si la BD no está arriba, dejar la migración creada igual (documentar que requiere PostgreSQL) — NO `db push`. Regenerar el cliente Prisma (`npm run prisma:generate --workspace apps/api`). Depende de nada previo.
      Archivos: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_create_auth_tokens/migration.sql`.
      Verify: `npm run prisma:validate --workspace apps/api` ok y `npm run typecheck:api` compila con el cliente regenerado (modelo `AuthToken` disponible en `apps/api/src/generated/prisma`).

- [ ] 4. **AuthTokenService (emisión/validación de tokens).** Crear servicio que: genere token en claro con `crypto.randomBytes(32)` (base64url), guarde solo `sha256(token)` en `tokenHash`; `issue(tx, { userId, purpose, ttl })` crea el `AuthToken` e (recomendado) invalida tokens previos no usados del mismo purpose; `consume(token, allowedPurposes)` hashea el recibido, busca por `tokenHash`, rechaza expirado/usado (errores 400/410 sin filtrar internos), marca `usedAt` dentro de transacción. TTL por env con defaults (`PASSWORD_RESET_TTL=1h`, `USER_INVITATION_TTL=72h`). Depende del item 3.
      Archivos: `apps/api/src/modules/auth/auth-token.service.ts`, `apps/api/src/modules/auth/auth-token.util.ts` (hash + generación + parseo TTL).
      Verify: `npm run typecheck:api` compila.

- [ ] 5. **Reset de contraseña (service + DTOs + endpoints).** `AuthResetService` con `forgotPassword({ identifier })` (busca usuario con `findFirst`; si existe y `active`, en `$transaction` emite `AuthToken` PASSWORD_RESET, audita sin token; envía correo FUERA de la transacción; responde void SIEMPRE) y `resetPassword({ token, newPassword })` (consume token, valida longitud mínima configurable `PASSWORD_MIN_LENGTH` default 8, `hashPassword`, actualiza `passwordHash`, marca `usedAt`, audita, todo en transacción; 400/410 adecuados). DTOs class-validator con `@ApiProperty`/`@ApiPropertyOptional` tipados. Endpoints públicos en `AuthResetController`: `POST /auth/forgot-password` (`@HttpCode(204)`) y `POST /auth/reset-password` (`@HttpCode(204)` o 200). Registrar providers/controllers en `AuthModule` (importa `AuditModule`, `MailModule`). `resetUrl = ${APP_WEB_URL}/restablecer-contrasena?token=...`. Depende de items 1 y 4.
      Archivos: `apps/api/src/modules/auth/auth-reset.service.ts`, `apps/api/src/modules/auth/auth-reset.controller.ts`, `apps/api/src/modules/auth/dto/forgot-password.dto.ts`, `apps/api/src/modules/auth/dto/reset-password.dto.ts`, `apps/api/src/modules/auth/auth.module.ts` (editar).
      Verify: `npm run typecheck:api` compila.

- [ ] 6. **Tests de reset.** `apps/api/src/modules/auth/auth-reset.service.spec.ts` con mock tipado de `PrismaService`, `AuditService`, `MailService` y `AuthTokenService` según el patrón del repo. Cubrir: forgot-password con usuario inexistente NO lanza y NO envía fuga (responde igual), con usuario activo emite token + envía correo + audita; reset-password token válido actualiza passwordHash + marca usedAt + audita; token inválido/expirado/usado → error 400/410; contraseña corta → 400. Depende del item 5.
      Archivos: `apps/api/src/modules/auth/auth-reset.service.spec.ts`.
      Verify: `npm run test:unit` pasa el nuevo spec.

- [ ] 7. **Invitación/activación (service + endpoint).** `UserInviteService` (en módulo user o auth) con `invite(actor, userId)`: valida que el usuario existe y está activo, en `$transaction` emite `AuthToken` USER_INVITATION y audita; envía `sendUserInvitation` FUERA de la transacción con `inviteUrl = ${APP_WEB_URL}/activar-cuenta?token=...`. Endpoint `POST /users/:id/invite` protegido con `CurrentUserGuard + RolesGuard + @Roles(RoleCode.JEFE_AREA)` (idéntico a `user.controller.ts`); permite reenviar (vuelve a emitir e invalida anterior). La activación reutiliza `POST /auth/reset-password` (purpose USER_INVITATION aceptado por `consume`). Registrar en el módulo correspondiente (importar `MailModule`, `AuditModule`, `AuthModule`). Depende de items 1, 4, y que `resetPassword` acepte el purpose de invitación (item 5).
      Archivos: `apps/api/src/modules/user/user-invite.service.ts`, `apps/api/src/modules/user/user-invite.controller.ts` (o endpoint en `user.controller.ts`), `apps/api/src/modules/user/user.module.ts` (editar), `apps/api/src/modules/user/dto/invite-user-response.dto.ts` si aplica.
      Verify: `npm run typecheck:api` compila.

- [ ] 8. **Tests de invitación.** `apps/api/src/modules/user/user-invite.service.spec.ts`: usuario inexistente → 404; usuario válido → emite token USER_INVITATION + audita + envía correo; reenvío invalida token previo. Mock de `PrismaService`, `AuditService`, `MailService`, `AuthTokenService` según patrón. Depende del item 7.
      Archivos: `apps/api/src/modules/user/user-invite.service.spec.ts`.
      Verify: `npm run test:unit` pasa el nuevo spec.

- [ ] 9. **Documentación OpenAPI + regenerar contrato.** Anotar los endpoints nuevos con `@ApiTags`, `@ApiOperation`, `@ApiBody`, `@ApiProperty`/`@ApiPropertyOptional` con `type` explícito (sin CLI plugin, estilo del repo). Ejecutar `npm run contracts:generate` desde la raíz del worktree y versionar `apps/api/openapi/openapi.json` y `packages/api-client/src/generated/schema.d.ts`; ejecutar `npm run build:api-client` para que `apps/web` compile contra los tipos nuevos. Depende de items 5 y 7.
      Archivos: `apps/api/openapi/openapi.json`, `packages/api-client/src/generated/schema.d.ts`, `packages/api-client/dist/*` (regenerado por build).
      Verify: `npm run contracts:generate` termina ok; `git diff --stat` muestra cambios en `openapi.json` y `schema.d.ts`; `npm run typecheck:api-client` compila.

- [ ] 10. **Frontend: wrappers api-client y pantallas.** En `apps/web/src/lib` crear wrappers tipados reutilizando el api-client generado y `toApiError` (patrón de `lib/catalog.ts`/`lib/auth.ts`): `requestPasswordReset({ identifier })` → `POST /auth/forgot-password`; `setPasswordWithToken({ token, newPassword })` → `POST /auth/reset-password`. Pantallas App Router: `/olvide-contrasena` (form identifier, mensaje genérico "si existe una cuenta, enviaremos un correo"), `/restablecer-contrasena` (lee `?token=`, nueva contraseña + confirmación, estados loading/éxito/error, enlace a login), `/activar-cuenta` (misma lógica con copy de activación). Añadir enlace "¿Olvidaste tu contraseña?" en `login-form.tsx` que lleva a `/olvide-contrasena`. Usar `Field`, `FormError`, `Button`, `Card`, `InlineNotice`; traducir errores a español sin exponer JSON. Depende del item 9.
      Archivos: `apps/web/src/lib/password-reset.ts`, `apps/web/src/app/olvide-contrasena/page.tsx` (+ form client component), `apps/web/src/app/restablecer-contrasena/page.tsx` (+ form), `apps/web/src/app/activar-cuenta/page.tsx` (+ form), `apps/web/src/app/login/login-form.tsx` (editar).
      Verify: `npm run typecheck:web` compila.

- [ ] 11. **Variables de entorno de ejemplo.** Añadir las vars nuevas a `.env.example` (raíz) con valores de desarrollo y comentarios (SMTP_USER/PASSWORD/MAIL_FROM marcados como secretos/por-ambiente, vacíos en repo; `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `MAIL_FROM_NAME=Notificaciones`, `APP_WEB_URL=http://localhost:3000`, TTLs y `PASSWORD_MIN_LENGTH`). Replicar las mismas vars con placeholders vacíos para secretos en `.env.production.example`. NO tocar el `.env` local real. Puede hacerse en paralelo con el backend; situado aquí para no olvidarlo.
      Archivos: `.env.example`, `.env.production.example`.
      Verify: revisión visual de que las claves están presentes y los secretos vacíos; no rompe build.

- [ ] 12. **Verificación final.** Desde la raíz del worktree: `npm run typecheck`, `npm run build`, `npm run test:unit`. Confirmar que compila todo (api, api-client, web, mcp), que los specs nuevos pasan y que el contrato está regenerado/versionado. Limpiar cualquier archivo temporal. Si PostgreSQL no estuvo disponible para la migración, documentar en los findings que `prisma migrate dev` debe correrse contra la BD local (5433) antes de desplegar.
      Archivos: ninguno nuevo.
      Verify: `npm run typecheck` + `npm run build` + `npm run test:unit` terminan sin errores desde `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\mail-fase1`.
