# Revisión de diseño — Rol ADMIN + Configuración SMTP en runtime

Tarea: `admin-smtp-config` · Worktree: `.worktrees/admin-smtp` · Iteración de revisión: 1

Revisión realizada en frío sobre `design.md`, verificando sus afirmaciones contra el código fuente real del worktree. El diseño está bien estructurado y la mayoría de sus supuestos sobre el repositorio son correctos. Hay, no obstante, varias lagunas concretas que deben cerrarse antes de implementar: la principal es que `APP_WEB_URL` se lee de `process.env` dentro de los servicios de reset/invite y el diseño mueve `appWebUrl` a BD sin reconciliar ambas fuentes; y que la resolución dinámica del transporter exige refactorizar `MailService` (que hoy recibe el transporter y la config por DI en el constructor), no solo el provider.

---

## Hallazgos

### 1. (HIGH) `appWebUrl` queda en dos fuentes sin reconciliar: reset/invite seguirán leyendo `process.env.APP_WEB_URL`

El diseño propone `SmtpConfig.appWebUrl` como campo persistido en BD (sección (b)) y lo incluye en el DTO/formulario (secciones (e)/(g)), presentándolo como la fuente de la URL base para los enlaces. Pero verifiqué `auth-reset.service.ts` y `user-invite.service.ts`: ambos construyen la URL así:

```ts
private buildUrl(path: string, token: string): string {
  const base = process.env.APP_WEB_URL ?? '';
  const normalized = base.replace(/\/+$/, '');
  return `${normalized}/${path}?token=${encodeURIComponent(token)}`;
}
```

Es decir, leen **exclusivamente** `process.env.APP_WEB_URL`, nunca una config resuelta. El diseño en "Env / Docker" dice textualmente "APP_WEB_URL conviene seguir documentándola (reset/invite la usan para los enlaces aunque el SMTP venga de BD)", lo que reconoce la dependencia de env, pero entra en conflicto directo con haber puesto `appWebUrl` como campo editable en la pantalla SMTP: un admin que configure `appWebUrl` en BD y deje `APP_WEB_URL` vacía producirá enlaces rotos (`base = ''` ⇒ `/{path}?token=...` sin host). Esto es una contradicción entre secciones (b)/(e)/(g) y "Env / Docker", y una laguna funcional real.

**Fix (elegir uno y fijarlo en el diseño):**
- **Opción A (recomendada):** sacar `appWebUrl` de `SmtpConfig`. La URL base del front sigue siendo responsabilidad de `APP_WEB_URL` (env) tal como hoy; la pantalla SMTP no la gestiona. Elimina la ambigüedad y evita tocar `auth-reset`/`user-invite`.
- **Opción B:** mantener `appWebUrl` en BD, pero entonces el diseño debe especificar que `auth-reset.service` y `user-invite.service` dejan de usar `process.env.APP_WEB_URL` y resuelven la URL base vía el `MailConfigResolver` (BD>env), definiendo el `buildUrl` que recibe esa base por parámetro. Hay que listar explícitamente estos dos servicios como modificados y añadir pruebas de que el enlace usa la base de BD cuando existe.

### 2. (HIGH) La "resolución dinámica" exige refactorizar `MailService`, no solo el provider; el diseño subestima el alcance

El diseño (sección (d)) dice que `mail-transporter.provider.ts` "deja de crear el transporter en el arranque" y que "MailService obtiene el transporter bajo demanda". Verifiqué `mail.service.ts`: hoy `MailService` recibe el transporter y la config **por inyección en el constructor**:

```ts
constructor(
  @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
  @Inject(MAIL_CONFIG) private readonly config: MailConfig,
) {}
```

y los métodos `sendPasswordReset`/`sendUserInvitation` usan `this.transporter` y `this.config` directamente. Eliminar el provider que construye en arranque **rompe la DI de `MailService`** (los tokens `MAIL_TRANSPORTER`/`MAIL_CONFIG` dejarían de resolver, o resolverían a `null`/lanzarían). El cambio real es reescribir `MailService` para: (a) ya no inyectar transporter/config, (b) inyectar el `MailConfigResolver`, (c) resolver config → construir transporter → `formatFrom()` desde la config resuelta en cada envío, (d) exponer `isEnabled()`. También hay que actualizar `mail.module.ts` (hoy registra `mailConfigProvider`, `mailTransporterProvider`, `MailService`) y **todas las pruebas que inyectan el doble vía `MAIL_TRANSPORTER`** (el propio comentario del token dice que los tests inyectan un doble por ahí).

El diseño menciona "Tests de mail.service" en el paso 5 pero no reconoce que el contrato de construcción de `MailService` y de `MailModule` cambia, ni que los tests existentes que usan `MAIL_TRANSPORTER` deben migrarse. Es un alcance mayor que "el provider deja de construir".

**Fix:** reescribir la sección (d) para especificar el nuevo contrato de `MailService` (constructor sin `MAIL_TRANSPORTER`/`MAIL_CONFIG`, dependencia del resolver, factory de transporter por envío), los cambios en `mail.module.ts`, y un ítem explícito de "migrar pruebas existentes de mail que inyectaban `MAIL_TRANSPORTER`". Definir cómo los tests inyectarán ahora el doble (p. ej. mockeando el resolver o `nodemailer.createTransport`).

### 2b. (MEDIUM) `formatFrom()` depende de `this.config`; con resolución por envío debe recibir la config como argumento

Relacionado con el #2: `MailService.formatFrom()` usa `this.config.fromName`/`this.config.from`. Si la config pasa a resolverse por envío, `formatFrom`, `buildText`, `buildHtml` y los métodos `send*` deben recibir la `MailConfig` resuelta (o el transporter + from) como parámetro. El diseño no especifica esta firma.

**Fix:** definir en el diseño las firmas nuevas, p. ej. `sendPasswordReset(payload)` → internamente `const cfg = await resolver.resolve(); if (!cfg) { logDisabled(); return; } const t = createTransport(cfg); await t.sendMail({ from: formatFrom(cfg), ... })`.

### 3. (MEDIUM) `isEnabled()` no es suficiente para preservar los contratos; falta precisar el punto de decisión en reset/invite

El diseño dice que `MailService` expone `isEnabled()/send*()` y que "si está deshabilitado, loguea el enlace". Pero `forgotPassword` y `invite` hoy llaman `await this.mail.sendPasswordReset(...)` / `sendUserInvitation(...)` **sin** consultar `isEnabled()`. Para preservar los contratos (204 / 204) sin lanzar, la decisión "enviar vs. loguear" debe vivir **dentro** de `send*()` (que nunca lanza por ausencia de SMTP), o bien reset/invite deben consultar `isEnabled()` antes. El diseño mezcla ambas ideas ("expone isEnabled()" y "send\* loguea el enlace") sin fijar cuál es la de verdad.

**Fix:** fijar que `sendPasswordReset`/`sendUserInvitation` resuelven la config internamente y, si es `null`, registran `warn` con el enlace y **retornan void sin lanzar** (no se toca `auth-reset`/`user-invite` salvo lo del hallazgo #1). `isEnabled()` queda como helper opcional para el endpoint `test`/UI, no como gate en los flujos. Así `forgot-password` sigue 204 y `reset-password` sigue 200 sin cambios en esos servicios.

### 4. (MEDIUM) `loadMailConfig` no estricto: el diseño asume una variante que no existe y no define su firma ni la validación parcial

El diseño (sección (d), punto 2) habla de "una variante de `loadMailConfig` que devuelve `null` si faltan obligatorias en vez de lanzar". Verifiqué `mail.config.ts`: solo existe `loadMailConfig()` que lanza vía `requireVar`. La variante no existe y el diseño no define su nombre, firma, ni qué considera "config completa" (p. ej., ¿`SMTP_USER`/`SMTP_PASSWORD` son obligatorias si el relay no autentica? el campo `username` del modelo es opcional, pero `loadMailConfig` exige `SMTP_USER`/`SMTP_PASSWORD`). Hay inconsistencia entre "username/password opcionales" (modelo SmtpConfig) y "SMTP_USER/SMTP_PASSWORD obligatorias" (env actual).

**Fix:** definir explícitamente `loadMailConfigOrNull(): MailConfig | null` (o similar) y su regla de completitud, reconciliando qué campos son obligatorios en cada fuente. Decidir si auth es opcional de forma uniforme en BD y env (recomendado: host/port/from/appWebUrl obligatorios; user/pass opcionales en ambas fuentes).

### 5. (MEDIUM) Endpoint de promoción a ADMIN marcado como "abierto / a criterio" — requisito sin cerrar

El requisito #10 del usuario ("quiero que exista el rol de admin") y la sección (h)/"SUPUESTOS NO VERIFICADOS" dejan **sin decidir** si existe un mecanismo para que un ADMIN promueva a otros usuarios (`PATCH /admin/users/:id/admin-flag`) o si solo se siembra el admin inicial. El diseño reconoce que es "ABIERTA de alcance". Un diseño listo para implementar no puede dejar un endpoint con decoradores, DTO y auditoría a medio especificar ("si entra en alcance"). Además el plan de implementación (paso 9) lo lista como "si entra en alcance", lo que deja al implementador decidiendo producto.

**Fix:** tomar la decisión en el diseño. Recomendado el mínimo viable ya esbozado: `PATCH /admin/smtp-config`… no — definir `PATCH /admin/users/:id/admin-flag` con `@Roles(ADMIN)`, DTO `{ isAdmin: boolean }`, auditoría `objectType: 'USER'` (ya existe) y Swagger. Si se decide NO incluirlo en esta iteración, declararlo fuera de alcance de forma inequívoca (no "a criterio del implementador") y confirmar que el seed del admin inicial satisface el requisito "que exista el rol admin".

### 6. (MEDIUM) `AuditObjectType` es un union cerrado: añadir `'SMTP_CONFIG'` es obligatorio si se audita, pero el diseño lo deja opcional/ambiguo

Verifiqué `audit.service.ts`: `AuditObjectType` es efectivamente un union cerrado (`'PROCESS' | 'USER' | 'GRANT' | ...`), sin `'SMTP_CONFIG'`. `AuditRecordInput.objectType` lo tipa, así que llamar `audit.record` con `'SMTP_CONFIG'` **no compila** hasta añadirlo al union. El diseño dice "se añade 'SMTP_CONFIG' … Si se prefiere no auditar … se documenta y se omite". Eso es una decisión binaria que afecta a si el `SmtpConfigService.update` compila con auditoría o no; dejarla abierta es una laguna.

**Fix:** decidir: si se audita (recomendado), el diseño debe listar como cambio obligatorio añadir `'SMTP_CONFIG'` al union `AuditObjectType` (y opcionalmente al `@ApiQuery` de `audit.controller.ts`). Fijar `objectId = id de la fila singleton`, `scopeProcessId: null`, `action: 'UPDATE'`. Nota: `AuditEvent.objectId` es `String` sin FK (verificado en `schema.prisma`), por lo que usar el id del singleton es consistente.

### 7. (MEDIUM) Convención de "limpiar password" subespecificada y contradictoria

En la sección (e), `UpdateSmtpConfigDto.password`: "si viene y no está vacío se cifra; si se omite se conserva; … convenio documentado para 'limpiar' el password, p. ej. enviar cadena vacía explícita no se acepta, se usa un campo `clearPassword?: boolean`". La frase está a medio escribir ("convenio documentado … se usa un campo clearPassword") y no define la interacción entre `password` y `clearPassword` (¿qué pasa si llegan ambos? ¿`clearPassword:true` + `password:'x'`?). Es ambigüedad con múltiples interpretaciones válidas.

**Fix:** especificar reglas deterministas: `password` ausente ⇒ conservar; `password` no vacío ⇒ cifrar y reemplazar; `clearPassword: true` ⇒ poner `passwordCiphertext = null` (y si además viene `password`, rechazar con 400 por combinación inválida, o dar prioridad a uno y documentarlo). Reflejarlo en el DTO con `@ApiProperty` y en la validación.

### 8. (MEDIUM) El `source` 'db'|'env'|'none' no está definido de forma consistente con la resolución y la completitud parcial

La sección (e) define `GET` devolviendo `source: 'db'|'env'|'none'`, y (d) dice que la fila de BD se usa "si existe y tiene host/port/from/appWebUrl". ¿Qué `source` se reporta si existe fila en BD pero **incompleta** (cae a env)? ¿Y si BD incompleta y env también incompleta (none) pero hay una fila guardada? El GET debe mostrar los campos actuales del formulario además del `source`; no está claro si GET muestra los valores de la fila de BD aunque la resolución efectiva caiga a env. Esto puede confundir al admin (ve datos en el formulario pero `source: 'env'`).

**Fix:** definir la semántica exacta: p. ej. GET siempre refleja los campos de la **fila de BD** si existe (para que el admin edite lo guardado), y `source` indica de dónde saldría el envío **ahora** (db si la fila está completa, env si cae a env, none si nada). Documentar el caso "fila incompleta en BD".

### 9. (NIT) El diseño afirma que `ModuleKey`/`RoleCode` "se reflejan en el contrato"; en realidad `allowedModules` es `string[]` en OpenAPI

Verifiqué `my-permissions-response.dto.ts`: `allowedModules` está anotado `@ApiProperty({ type: [String] })`, por lo que en OpenAPI es `string[]`, no un enum. El `ModuleKey` del frontend (`navigation.ts`) es un **union mantenido a mano**, duplicado del backend. El diseño sí reconoce la duplicación en los RIESGOS, pero la sección (i) afirma que "ModuleKey del backend se refleja en el contrato", lo cual es engañoso: añadir `systemSettings` requiere editar a mano el union del front; el contrato no lo aporta.

**Fix:** corregir la redacción de (i): el contrato NO tipa `ModuleKey`; `systemSettings` debe añadirse manualmente al union `ModuleKey` y a `MODULE_LABELS` en `navigation.ts` (hoy `Record<ModuleKey, string>`, exhaustivo), además de a `MODULE_MATRIX`/`ModuleKey` del backend.

### 10. (NIT) Falta especificar validación de `port` como número tras transporte y el `transform` del ValidationPipe

`app.config.ts` usa `ValidationPipe({ whitelist, forbidNonWhitelisted, transform: true })`. Para `UpdateSmtpConfigDto.port` (IsInt) con `transform:true`, un `port` enviado como string JSON number está bien, pero conviene fijar `@Type(() => Number)` si llega como query/string. Es menor porque el body es JSON, pero el diseño no lo menciona.

**Fix:** anotar `port` con `@Type(() => Number)` + `@IsInt() @Min(1) @Max(65535)` para robustez, coherente con el patrón de otros DTOs.

---

## Supuestos verificados (correctos)

- **CORS no habilita PUT** — `app.config.ts`: `methods: ['GET','POST','PATCH','DELETE']`. La decisión de usar PATCH (no PUT) es correcta y necesaria.
- **`role-code.ts`** es un enum cerrado con los 3 roles y `ROLE_CODES = Object.values(RoleCode)`; añadir `ADMIN` lo incluye automáticamente. Correcto.
- **`load-actor.ts`** usa `findFirst` con `include: { grants: { include: { role, process } } }` y **sin `select`**, por lo que el modelo `User` trae `isAdmin` automáticamente al añadir la columna. `roleCodes`/`scopedProcessIds` se construyen desde grants; añadir `roleCodes.add(ADMIN)` si `user.isAdmin` sin tocar `scopedProcessIds` es viable tal como se describe. Correcto.
- **`current-actor.ts`** tiene `isJefeArea: boolean`; añadir `isAdmin: boolean` análogo es directo. Correcto.
- **`main.ts`** hace `bootstrap()` sin try/catch y un provider que lance en su factory aborta el arranque. Hoy `mailTransporterProvider`/`mailConfigProvider` llaman `loadMailConfig()` (que lanza) en `useFactory`, confirmando la causa del fallo de arranque sin SMTP. Correcto.
- **Contratos de auth:** `auth-reset.controller.ts` → `forgot-password` `@HttpCode(NO_CONTENT)` (204), `reset-password` `@HttpCode(OK)` (200) + `LoginResponseDto`. `user-invite.controller.ts` → `@Post(':id/invite') @HttpCode(NO_CONTENT)` (204), `@Roles(JEFE_AREA)`. Correcto.
- **El envío ya ocurre fuera de la transacción** en `auth-reset.service` (`forgotPassword`) y `user-invite.service` (`invite`). Correcto.
- **`module-matrix.ts`:** `admin` = `[JEFE_AREA]`, `team` = `[JEFE_AREA]`; `allowedModulesFor` hace unión por rol. No reutilizar `admin` para la pantalla SMTP es correcto. `MODULE_MATRIX` es `Record<ModuleKey, readonly RoleCode[]>`, así que añadir la clave al union obliga (por exhaustividad TS) a añadirla al record. Correcto.
- **`audit.service.ts`:** `AuditObjectType` es un union cerrado; `AuditEvent.objectId` es `String` sin FK (schema). Correcto (ver hallazgo #6 sobre su carácter obligatorio).
- **`dev-actors.controller.ts`:** lista usuarios activos con `select: { identifier, name }` sin filtrar por grants, así que el admin inicial (sin grants) aparece y es impersonable en dev-header sin cambios de código. Correcto.
- **`seed.ts`:** patrón `findFirst` + `create/update` por `identifier`; añadir un usuario admin con `isAdmin: true` encaja; `isAdmin` default false deja al resto en false. Correcto. (El admin no necesita grants.)
- **`schema.prisma`:** `User` sin `select` explícito en consultas de actor; `Grant @@unique(userId, roleId, processId)` con FKs `onDelete: Restrict`; no hay modelo de settings. Añadir `isAdmin` y `smtp_config` como migración nueva es aditivo y no toca lo aplicado. Correcto.
- **`crypto`, `class-validator`, `nodemailer`, shadcn** ya están en el stack; no se añaden dependencias. Plausible y coherente con el repo.
- **Patrón `lib/team.ts`** confirma el estilo de consumo del `api-client` (`api.GET/POST`, `toApiError`) que la nueva `lib/smtp-config.ts` debe seguir. Correcto.

## Supuestos no verificados / incorrectos

- **INCORRECTO/ENGAÑOSO:** "reset/invite usan APP_WEB_URL de env" coexiste con "appWebUrl editable en BD" sin reconciliación — ver hallazgo #1 (los servicios SOLO leen `process.env.APP_WEB_URL`).
- **SUBESTIMADO:** "el provider deja de construir en arranque" no basta; `MailService` recibe transporter/config por DI en el constructor y debe reescribirse — ver #2/#2b/#3.
- **INEXISTENTE:** la "variante no estricta de `loadMailConfig`" no existe aún y su contrato/completitud no está definido — ver #4.
- **ENGAÑOSO:** "ModuleKey del backend se refleja en el contrato" — `allowedModules` es `string[]` en OpenAPI; el `ModuleKey` del front es manual — ver #9.
- **NO VERIFICADO (declarado por el propio diseño):** existencia/forma de un route guard server-side en `apps/web` para `/administracion/*`; `docs/README.md`. El diseño asume que el gating por `allowedModules` basta (como en `team`/`review`). Queda como supuesto abierto a confirmar por el implementador; no bloqueante pero debe verificarse al implementar.
- **NO VERIFICADO:** API de `nodemailer` (`createTransport`/`sendMail`/`verify`) estable — razonable, ya se usa hoy.

---

## Veredicto

**CHANGES_REQUESTED.** 9 hallazgos HIGH/MEDIUM (2 HIGH: #1, #2; 7 MEDIUM: #2b, #3, #4, #5, #6, #7, #8) más 2 NIT (#9, #10). Los dos HIGH (reconciliación de `APP_WEB_URL` y el alcance real del refactor de `MailService`) deben cerrarse en el diseño antes de escribir código; los MEDIUM eliminan ambigüedad en reset/invite degradado, el DTO de password, el `source`, la variante de config y la decisión de auditoría/promoción.
