# Diseno tecnico - Rol ADMIN + Configuracion SMTP en runtime

Tarea: admin-smtp-config - Rama: feat/rol-admin-smtp-config
Worktree: .worktrees/admin-smtp - Iteracion: 1 (primera).

Documento de DISENO (sin codigo). Entrega JUNTAS dos funcionalidades acopladas:
PARTE 1 (rol ADMIN de sistema) y PARTE 2 (configuracion SMTP en runtime).

---

## PROBLEMA

1. Roles: catalogo cerrado (JEFE_AREA, LIDER_PROCESO, INTEGRANTE); toda
   autorizacion sale de Grant (user+role+process). No hay rol de sistema para
   la config tecnica, independiente del area.
2. SMTP: se lee SOLO del entorno (mail.config.ts/loadMailConfig) y el
   transporter se crea UNA vez al arrancar. Si falta SMTP_HOST, Nest aborta.
   compose.prod.yaml NO pasa SMTP/MAIL al servicio api => el deploy actual no
   arranca. No hay forma de editar el SMTP sin tocar .env y reconstruir.

## REQUISITOS (de la tarea; fuente de verdad)

- ADMIN rol de SISTEMA/GLOBAL, SEPARADO; NO depende de proceso; independiente de
  JEFE_AREA en ambos sentidos.
- load-actor.ts expone el rol en roleCodes + helper isAdmin.
- Seed crea >=1 ADMIN inicial (dev y prod).
- API arranca sin SMTP; sin config el envio se deshabilita y reset/invite
  degradan sin romper arranque ni los contratos de /auth/forgot-password (204)
  y /auth/reset-password (200 + LoginResponseDto).
- Config SMTP en tabla nueva (fila unica); password AES-256-GCM (crypto nativo),
  nunca en claro ni devuelto al frontend; clave de cifrado en env NUEVA, error
  claro SOLO al leer/escribir secreto.
- Resolucion dinamica BD>env; recrear transporter al cambiar.
- Endpoints bajo modulo de administracion, @Roles(ADMIN)+guards: GET sin
  password, update validado, prueba de envio. Swagger completo.
- Frontend en administracion/... patron maestras + formularios; SIEMPRE
  api-client.

## RESTRICCIONES (steering)

- apps/web nunca toca PostgreSQL/Prisma; Prisma solo en apps/api.
- Logica/validacion/autorizacion/persistencia en backend (modulo de negocio).
  Entradas con DTO. Nunca exponer secretos ni stack traces.
- Sin dependencias nuevas (crypto, class-validator, nodemailer, shadcn ya estan).
- Migraciones nuevas, no tocar las aplicadas. No romper comandos ni reestructurar
  areas ajenas.

## ESTADO ACTUAL DEL REPOSITORIO (verificado)

- Roles: auth/role-code.ts (enum cerrado + ROLE_CODES).
- Actor: load-actor.ts -> CurrentActor (current-actor.ts) con roleCodes:Set,
  scopedProcessIds:Set, isJefeArea. toRoleCode descarta codes no tipados.
- Autorizacion: @Roles + RolesGuard (OR de roles) + CurrentUserGuard. Resolvers
  Dev (X-Actor-Id) y Jwt, ambos via loadActorByIdentifier.
- Modulos/menu: module-matrix.ts (MODULE_MATRIX, allowedModulesFor);
  GET /me/permissions (me.controller.ts) -> allowedModules. Frontend
  (lib/navigation.ts, lib/actor-context.tsx) filtra el menu por esas claves.
- Equipo: gobierno/equipo/equipo-view.tsx + GrantController/GrantService
  (JEFE_AREA, filtra por scopedProcessIds). CreateGrantDto.roleCode es enum.
- Mail: mail.config.ts, mail.module.ts (providers leen env al arrancar),
  mail.service.ts. Consumen auth-reset.service.ts y user-invite.service.ts
  (el envio YA ocurre fuera de la transaccion en ambos).
- Prisma: User, Role (@@unique code), Grant (@@unique userId+roleId+processId,
  FKs onDelete:Restrict), Process, AuthToken. Client en apps/api/src/generated/prisma.
- Seed: prisma/seed.ts (dev, upsert por clave natural) y
  .agents/tasks/demo-data/prod-seed-users.mjs (prod). Password dev dev1234.
- Contrato: openapi:generate -> apps/api/openapi/openapi.json -> api-client
  generate+build; script raiz contracts:generate. Frontend tipa desde
  components[schemas][...].
- Infra: .env.example, .env.production.example, apps/api/Dockerfile,
  compose.prod.yaml. CORS (app.config.ts) habilita SOLO GET/POST/PATCH/DELETE
  (NO PUT) => el update de SMTP usa PATCH.
- main.ts: un provider que lance en su factory aborta el arranque (bootstrap sin
  try/catch).

## OPCIONES — asignacion global del rol ADMIN

Tres formas de representar un rol que NO cuelga de un proceso, dado que hoy todo rol se asigna via Grant (user+role+process):

- A. Proceso-sistema centinela: sembrar un Process oculto (p. ej. code __SYSTEM__) y conceder ADMIN como un Grant normal contra ese proceso. Reutiliza toda la tuberia (Grant, seed, load-actor, GrantController).
- B. Flag booleano User.isAdmin: columna nueva en users; ADMIN deja de ser una fila de roles/grants y pasa a ser un atributo global del usuario.
- C. Tabla puente nueva (p. ej. system_roles o user_system_role) que relaciona User con roles globales sin processId.


### TRADE-OFFS

- A (centinela): cero cambios de esquema, pero CONTAMINA el modelo de negocio. ADMIN entraria en user.grants, por lo que scopedProcessIds incluiria el proceso centinela y load-actor tendria que filtrarlo; GrantController/equipo-view listarian/concederian grants de ese proceso; el proceso falso apareceria en selectores de proceso del front. Viola 'ADMIN no depende de proceso' y obliga a parches defensivos en varias areas (reestructura areas no relacionadas).
- B (User.isAdmin): una columna booleana. ADMIN queda LIMPIAMENTE separado de los grants por proceso (no toca scopedProcessIds, grants, ni el flujo de equipo). Cambio minimo, aditivo, back-compat (default false). Mapea 1:1 con la decision 'rol de sistema, global, independiente'. La autorizacion sigue por RoleCode: load-actor inyecta RoleCode.ADMIN en roleCodes cuando user.isAdmin, sin fila Grant.
- C (tabla puente): mas flexible para futuros roles globales, pero introduce una tabla y relaciones nuevas sin necesidad demostrada (solo hay un rol global hoy). Mas superficie que B para el mismo resultado.

### RECOMENDACION (decision tomada): Opcion B — User.isAdmin

Justificacion: es el cambio minimo que respeta el steering y la decision ya tomada ('ADMIN no requiere process'). No reutiliza Grant (que es intrinsecamente por-proceso) para algo global, evitando contaminar scopedProcessIds y el modulo de equipo. ADMIN sigue siendo un RoleCode a efectos de @Roles/RolesGuard: la unica diferencia es su ORIGEN (columna booleana, no Grant). Si en el futuro aparecen mas roles globales, se migra a la opcion C sin romper el contrato de autorizacion (RoleCode).


---

## (a) Mecanismo exacto de ADMIN

- role-code.ts: anadir ADMIN='ADMIN' al enum RoleCode. ROLE_CODES lo incluye automaticamente (Object.values). Comentario: ADMIN es rol de SISTEMA, no se concede por Grant/proceso; su origen es User.isAdmin.
- Prisma: User gana isAdmin Boolean @default(false) @map('is_admin'). No se crea fila Role ADMIN NI se usa Grant para ADMIN (mantener el enum y la columna como unica fuente evita dos verdades). El seed de roles sigue sembrando solo los 3 roles por-proceso.
- load-actor.ts: tras construir roleCodes desde grants, si user.isAdmin -> roleCodes.add(RoleCode.ADMIN). ADMIN NO agrega processId a scopedProcessIds (es global). Se expone isAdmin: user.isAdmin en CurrentActor.
- current-actor.ts: CurrentActor gana isAdmin: boolean (analogo a isJefeArea). Doc: true si el usuario es ADMIN de sistema; independiente de isJefeArea.
- El select de load-actor debe incluir isAdmin (hoy hace findFirst con include grants; basta con que el modelo lo traiga, sin select explicito que lo omita).
- Independencia: isAdmin y los grants por-proceso son ortogonales. Un ADMIN sin grants NO tiene JEFE_AREA; un JEFE_AREA sin isAdmin NO ve administracion de sistema.


## (b) Tablas nuevas Prisma y migracion

Modelo SmtpConfig (tabla smtp_config), fila UNICA (singleton):

- id String @id @default(uuid()) @db.Uuid
- host String
- port Int
- secure Boolean @default(false)
- username String?  (SMTP user; opcional: algunos relays no autentican)
- passwordCiphertext String? @map('password_ciphertext')  (base64 iv:tag:data; NUNCA en claro)
- fromAddress String @map('from_address')  (MAIL_FROM)
- fromName String? @map('from_name')
- appWebUrl String @map('app_web_url')
- updatedByUserId String? @map('updated_by_user_id') @db.Uuid  (auditoria ligera; FK a users onDelete:SetNull)
- createdAt/updatedAt timestamps estandar (@map created_at/updated_at)
- @@map('smtp_config')

Singleton: no hay clave natural; el service garantiza una sola fila (busca la primera; si no existe la crea en el update). Alternativa considerada y DESCARTADA: un modelo generico SystemSetting key/value JSON — mas flexible pero obliga a (de)serializar y valida peor con class-validator; SmtpConfig tipado es mas simple y comprobable (sesgo a simplicidad). Si luego hay mas settings, se agregan modelos hermanos o se migra a SystemSetting.

Migracion: nueva carpeta prisma/migrations/<timestamp>_add_admin_and_smtp_config con: ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false; CREATE TABLE smtp_config (...); FK updated_by_user_id -> users(id) ON DELETE SET NULL. Se genera con prisma migrate dev (NO se edita a mano una migracion ya aplicada; esta es nueva). prisma generate regenera el client (incluye isAdmin y SmtpConfig).


## (c) Cifrado AES-256-GCM y manejo de la clave

Utilidad en el modulo system-settings (p. ej. settings-crypto.ts), con el modulo crypto nativo (sin dependencias):

- Clave: variable de entorno NUEVA SETTINGS_ENCRYPTION_KEY. Formato: 32 bytes codificados en base64 (clave AES-256). Se decodifica y se valida longitud exacta de 32 bytes; si no, error claro que NOMBRA la variable sin imprimir su valor (patron mail.config.ts).
- encrypt(plaintext): genera iv aleatorio de 12 bytes (crypto.randomBytes), cipher = createCipheriv('aes-256-gcm', key, iv), concatena, obtiene authTag (16 bytes). Devuelve string 'iv.tag.ciphertext' en base64 (separador '.'), que se guarda en passwordCiphertext.
- decrypt(stored): parsea las 3 partes, createDecipheriv con iv y setAuthTag(tag); si el authTag no valida (dato manipulado o clave distinta), lanza error controlado -> el service responde 500 generico sin filtrar detalle.
- La clave se lee PEREZOSAMENTE (lazy), SOLO al cifrar/descifrar (es decir, al leer una config con password o al guardar password), NUNCA en el arranque ni en el constructor del modulo. Asi el API arranca aunque SETTINGS_ENCRYPTION_KEY no este definida; solo falla la operacion concreta que necesita el secreto, con mensaje claro.
- Nunca se loguea la clave, el iv/tag ni el texto plano. El password descifrado solo vive en memoria el tiempo de construir el transporter o enviar el correo de prueba.
- .env.example / .env.production.example / compose.prod.yaml documentan la variable con placeholder vacio y una nota de como generar 32 bytes base64 (p. ej. openssl rand -base64 32), sin valor real.


## (d) Reset/invite sin SMTP y resolucion dinamica del transporte

### Resolucion dinamica (BD > env > ninguna)

- Nuevo MailConfigResolver (en el modulo mail o system-settings) con metodo async resolve(): Promise<MailConfig | null>. Orden: 1) lee la fila smtp_config; si existe y tiene host/port/from/appWebUrl, la usa (descifrando el password si lo hay). 2) Si no hay fila (o esta incompleta), intenta el entorno de forma NO estricta (una variante de loadMailConfig que devuelve null si faltan obligatorias en vez de lanzar). 3) Si ninguna fuente da config completa, devuelve null = 'correo deshabilitado'.
- mail-transporter.provider.ts: DEJA de crear el transporter con loadMailConfig en el arranque. En su lugar, MailService obtiene el transporter bajo demanda via una factory que, dada una MailConfig, hace nodemailer.createTransport(...). Como el transporter ya no se construye en el provider al bootstrap, el API ARRANCA aunque no haya SMTP (se elimina la causa del fallo de arranque).
- Recreacion al cambiar: no se cachea para siempre. Opcion simple recomendada: construir el transporter por envio a partir de la MailConfig resuelta en ese momento (coste despreciable frente a la latencia SMTP). Alternativa: cachear transporter + hash de la config e invalidar cuando el PATCH actualiza smtp_config. Se recomienda la primera por simplicidad; la segunda queda documentada como optimizacion futura.
- Back-compat: sin fila en BD pero con SMTP_* en env, resolve() cae al entorno y el comportamiento es identico al de hoy (incluido Office365 587/STARTTLS por SMTP_SECURE).


### Comportamiento degradado (sin SMTP)

MailService expone isEnabled()/send*() que resuelven la config primero. Si resolve() da null:

- MailService NO lanza por correo deshabilitado: registra un log de nivel warn entendible, SIN secretos, indicando que el correo esta deshabilitado y que se debe configurar el SMTP en Administracion. Para reset/invite, en vez de enviar, LOGUEA el enlace (resetUrl/inviteUrl) a nivel warn para no bloquear al equipo en entornos sin SMTP (es un enlace de un solo uso, no un secreto permanente; se documenta el riesgo en logs y se recomienda SMTP en prod).
- forgot-password (auth-reset.service.ts): mantiene su contrato. Hoy ya emite el token en transaccion y envia FUERA. El cambio es que el 'envio' pasa por MailService que, si esta deshabilitado, loguea el enlace en vez de mandarlo. El controller SIGUE respondiendo 204 exista o no el usuario y haya o no SMTP (no se revela nada; el estado del correo no cambia el status code).
- reset-password: NO envia correo; no se ve afectado. Sigue 200 + LoginResponseDto.
- user-invite.service.ts (invite): hoy el envio es fuera de la transaccion. Con MailService deshabilitado, loguea el inviteUrl a warn. El endpoint POST /users/:id/invite mantiene 204. Nota: queda a criterio del implementador si, con correo deshabilitado, se devuelve 204 igualmente (recomendado, para no romper el contrato) y se confia en el log; se documenta que el admin debe configurar SMTP para envios reales.
- Ningun camino lanza por ausencia de SMTP: el objetivo es que ni el arranque ni los flujos existentes se rompan.


## (e) Modulo de administracion de sistema: endpoints REST

Nuevo modulo backend apps/api/src/modules/system-settings/ (monolito modular; no carpeta global): system-settings.module.ts, .controller.ts, .service.ts, settings-crypto.ts, mail-config-resolver.ts (o en mail), dto/.

Controller SmtpConfigController, base path /admin/smtp-config, protegido a nivel de clase con @UseGuards(CurrentUserGuard, RolesGuard) + @Roles(RoleCode.ADMIN). @ApiTags('admin-smtp').

Endpoints:

- GET /admin/smtp-config -> 200 SmtpConfigResponseDto. Devuelve la config actual SIN password: incluye passwordSet: boolean (true si hay passwordCiphertext) y source: 'db'|'env'|'none' (de donde se resuelve hoy). 200 con cuerpo 'vacio/none' si no hay config (no 404), para que el front muestre el formulario en blanco.
- PATCH /admin/smtp-config -> 200 SmtpConfigResponseDto. Crea o actualiza la fila singleton. Cuerpo UpdateSmtpConfigDto validado. Se usa PATCH (no PUT) porque el CORS del backend (app.config.ts) solo habilita GET/POST/PATCH/DELETE; PUT seria rechazado por CORS en prod.
- POST /admin/smtp-config/test -> 200 SmtpTestResultDto. Cuerpo SmtpTestRequestDto { to: email }. Resuelve la config (BD>env), construye un transporter efimero y envia un correo de prueba a 'to' (o hace verify()). Devuelve { ok: boolean, message: string } con error legible (sin credenciales ni stack) si falla. Si no hay config, ok:false con mensaje claro.


DTOs (class-validator + @ApiProperty):

- UpdateSmtpConfigDto: host (IsString, IsNotEmpty, MaxLength), port (IsInt, Min 1, Max 65535), secure (IsBoolean, opcional default false), username (IsOptional IsString), password (IsOptional IsString; write-only: si viene y no esta vacio se cifra y reemplaza; si se omite se conserva el actual; convenio documentado para 'limpiar' el password, p. ej. enviar cadena vacia explicita no se acepta, se usa un campo clearPassword?: boolean opcional), fromAddress (IsEmail), fromName (IsOptional IsString), appWebUrl (IsUrl o IsString con validacion de URL). @ApiPropertyOptional donde aplique. Trim en strings (patron CreateUserDto).
- SmtpConfigResponseDto: host, port, secure, username (nullable), passwordSet: boolean, fromAddress, fromName (nullable), appWebUrl, source: 'db'|'env'|'none', updatedAt. NUNCA incluye password ni ciphertext.
- SmtpTestRequestDto: to (IsEmail).
- SmtpTestResultDto: ok: boolean, message: string.

Swagger: @ApiTags('admin-smtp'); cada handler con @ApiOperation + @ApiResponse (200, 400 datos invalidos, 401 sin actor, 403 rol insuficiente). @ApiBody en PATCH y test. Esto hace que openapi.json refleje los nuevos schemas/paths para el api-client.

Servicio SmtpConfigService: getCurrent() (resuelve y mapea a response), update(actor, dto) (upsert singleton, cifra password si viene, guarda updatedByUserId; audita via AuditService con objectType nuevo p. ej. 'SMTP_CONFIG' si el enum de audit lo permite, o se documenta como no auditado si el tipo es cerrado — verificar audit.service), test(dto) (envio de prueba). Errores con excepciones HTTP de Nest; nunca exponer secretos.


Nota auditoria (verificado): AuditObjectType es un union CERRADO en audit.service.ts ('PROCESS'|'USER'|'GRANT'|...). Para auditar el cambio de SMTP se anade 'SMTP_CONFIG' a ese union y, opcionalmente, al enum de @ApiQuery objectType en audit.controller.ts. Es un cambio aditivo acotado al modulo audit (no reestructura nada). Si se prefiere no auditar en esta entrega, se documenta y se omite el record; recomendado auditarlo (action UPDATE, objectId = id de la fila singleton, scopeProcessId: null) por ser config sensible.

## (f) Cambios en load-actor/current-actor y modulos/permisos

- current-actor.ts: anadir isAdmin: boolean a CurrentActor.
- load-actor.ts: incluir user.isAdmin en el objeto devuelto; roleCodes.add(RoleCode.ADMIN) si user.isAdmin; isAdmin: user.isAdmin. No tocar scopedProcessIds.
- module-matrix.ts: anadir una ModuleKey nueva 'systemSettings' (o 'adminSmtp') para la pantalla de configuracion SMTP, con MODULE_MATRIX['systemSettings'] = [RoleCode.ADMIN] (SOLO ADMIN). No reutilizar 'admin' (que hoy es Maestras y pertenece a JEFE_AREA): mezclar romperia la separacion de roles. allowedModulesFor ya hace la union por rol, asi que un ADMIN vera systemSettings y, si ademas tuviera grants de jefe, los suyos.
- GET /me/permissions: sin cambios de forma; allowedModules incluira 'systemSettings' cuando el actor sea ADMIN. MyPermissionsResponseDto.allowedModules es ModuleKey[] y se regenera en el contrato.
- RolesGuard/@Roles: sin cambios; @Roles(RoleCode.ADMIN) ya funciona porque ADMIN estara en actor.roleCodes.


## (g) Cambios de UI

### Menu (lib/navigation.ts)

- Anadir el ModuleKey 'systemSettings' al type ModuleKey del frontend (debe coincidir EXACTAMENTE con el backend; es la misma lista duplicada por diseno existente).
- Anadir MODULE_LABELS['systemSettings'] = 'Configuracion SMTP' (o 'Configuracion del sistema').
- Anadir un NavItem al grupo 'administracion': { href: '/administracion/configuracion-smtp', label: 'Configuracion SMTP', moduleKey: 'systemSettings', icon: <uno de lucide ya importado, p. ej. Settings/Mail> }. El filtrado getVisibleNavGroups ya oculta el item si 'systemSettings' no esta en allowedModules => solo ADMIN lo ve. Control real: backend @Roles(ADMIN).

### Gating de la pantalla

- La vista usa useActor(): si allowedModules no incluye 'systemSettings', muestra el aviso de acceso restringido (mismo patron que equipo-view con 'team': estado 'forbidden' sin llamar al backend; un 403 cae al mismo aviso). El control efectivo es el backend.


### Pantalla (apps/web/src/app/administracion/configuracion-smtp/)

- page.tsx (metadata + render de la vista) y configuracion-smtp-view.tsx ('use client'), siguiendo el patron de administracion/maestras y de los views existentes (PageLayout, PageHeader, Section, estados loading/vacio/error/exito, toast). Formularios con labels claros, validacion junto al campo, confirmacion.
- Campos del formulario: host (text), puerto (number), secure (checkbox), usuario (text), contrasena (password, write-only: si passwordSet=true mostrar placeholder 'configurada' y no revelarla; dejar el campo vacio conserva la actual; opcion 'cambiar contrasena' para enviar una nueva), remitente MAIL_FROM (email), nombre remitente (text opcional), APP_WEB_URL (url). Boton 'Probar envio' que abre un dialog pidiendo una direccion destino y llama al endpoint test, mostrando ok/mensaje.
- Estados: carga inicial (GET), guardar (PATCH, toast exito/error), probar (POST test, feedback inline). Mostrar 'source' (db/env/none) para que el admin sepa si esta usando BD o el entorno.
- Nuevo lib/smtp-config.ts (analogo a lib/me.ts/lib/team.ts): funciones getSmtpConfig/updateSmtpConfig/testSmtp que usan el cliente api (packages/api-client). Tipos SmtpConfig/UpdateSmtpConfig/SmtpTestResult/SmtpTestRequest se derivan de components['schemas'][...] en lib/api-client.ts (sin tipos manuales).
- apps/web NO toca Prisma ni la BD: solo consume el contrato.


## (h) Seed y usuario ADMIN inicial

- prisma/seed.ts (dev): anadir un usuario ADMIN inicial, p. ej. { identifier: 'admin@demo.local', name: 'Alex Admin' }, y al upsert de usuarios setear isAdmin: true para ese identifier (los demas quedan isAdmin: false). Mantener el patron idempotente findFirst + create/update. El admin inicial NO necesita grants (es global). Password dev compartida (DEV_PASSWORD 'dev1234') igual que el resto, para login JWT en local.
- prod-seed-users.mjs (.agents/tasks/demo-data): replicar el mismo usuario admin@demo.local con isAdmin: true (el script usa el client compilado; isAdmin existira tras migrar+generar). Mantener la nota existente de que dev1234 es credencial inicial a cambiar.
- Documentar en docs/README.md (o donde esten las credenciales dev) el nuevo usuario admin y que es el ADMIN de sistema. No se versiona ningun secreto real.
- Flujo de activacion: el admin inicial se siembra directamente (no por invitacion) para no quedar bloqueados sin SMTP. Un ADMIN existente puede luego marcar isAdmin a otros (ver decision de asignacion mas abajo).

### Dev-header: impersonar ADMIN

- GET /dev/actors lista usuarios activos por nombre/identifier; el admin inicial aparecera automaticamente (es un User activo). El selector dev podra impersonarlo sin cambios de codigo. DECISION: SI se permite impersonar ADMIN en modo dev-header (es coherente con que dev-header no es frontera de seguridad real y facilita probar la pantalla). No se expone isAdmin en DevActorResponseDto (no es necesario para el selector).


### Asignacion de ADMIN a otros usuarios (decision)

Dado que ADMIN = User.isAdmin (no es un Grant), NO se asigna por la pantalla de Equipo (que crea grants por-proceso y es de JEFE_AREA). Opciones y recomendacion:

- Recomendado (alcance minimo de esta entrega): el admin inicial se siembra; los admins adicionales se gestionan por un endpoint ADMIN dedicado y, si hay tiempo, un control en la pantalla de Administracion. Minimo viable: PATCH /admin/users/:id/admin-flag (o extender el modulo system-settings) protegido @Roles(ADMIN) que setea isAdmin, con auditoria. Mantiene la gestion de ADMIN separada de la de grants (coherente con la separacion de roles).
- Alternativa descartada por ahora: anadir isAdmin al UpdateUserDto del modulo user (controller users es @Roles(JEFE_AREA)); se descarta porque dejaria que un JEFE_AREA se auto-promueva a ADMIN, rompiendo la separacion de privilegios.
- Si se decide NO construir UI de gestion de admins en esta iteracion, el seed cubre el requisito de 'no quedar bloqueados' y la promocion adicional queda como endpoint ADMIN documentado. Esta decision se marca como ABIERTA de alcance (ver supuestos).


## (i) Regeneracion de contrato OpenAPI / api-client

- Tras implementar DTOs y controllers con decoradores Swagger: ejecutar npm run contracts:generate (encadena openapi:generate -> apps/api/openapi/openapi.json y api-client:generate -> packages/api-client schema.d.ts), luego build:api-client. Esto expone SmtpConfigResponseDto, UpdateSmtpConfigDto, SmtpTestRequestDto, SmtpTestResultDto y los paths /admin/smtp-config[/test] en components['schemas']/paths.
- lib/api-client.ts del front anade los type aliases nuevos derivados de components['schemas'] (sin interfaces manuales). RoleCode y ModuleKey del backend se reflejan en el contrato via los DTOs que los usan (p. ej. MyPermissionsResponseDto.allowedModules).
- No cambian los scripts; se reutiliza el pipeline existente. predev:web ya reconstruye el api-client.

## Env / Docker (configuracion)

- Nueva variable SETTINGS_ENCRYPTION_KEY en .env.example y .env.production.example (placeholder vacio + nota: 32 bytes base64, p. ej. openssl rand -base64 32; obligatoria solo al leer/escribir el password SMTP).
- compose.prod.yaml servicio api: pasar SETTINGS_ENCRYPTION_KEY: \ y, para back-compat opcional, las SMTP_*/MAIL_*/APP_WEB_URL (hoy ausentes). Como el arranque ya no exige SMTP, estas quedan OPCIONALES: si no se definen, el admin configura por la pantalla. APP_WEB_URL conviene seguir documentandola (reset/invite la usan para los enlaces aunque el SMTP venga de BD).
- Dockerfile api: no requiere cambios (las variables se inyectan por entorno, no en la imagen).


## IMPACTO

- Esquema: +1 columna (users.is_admin) y +1 tabla (smtp_config). Una migracion nueva.
- Backend: role-code.ts (+ADMIN), load-actor/current-actor (+isAdmin), module-matrix (+systemSettings), modulo mail (resolucion dinamica, provider no lanza en arranque), modulo nuevo system-settings, audit (+SMTP_CONFIG), seed dev+prod.
- Frontend: navigation (+modulo/label/item), nueva pantalla + lib/smtp-config.ts, api-client lib (+tipos).
- Contrato: regenerado (nuevos schemas/paths).
- Infra: +SETTINGS_ENCRYPTION_KEY (y SMTP_* opcionales) en .env examples y compose.prod.
- Arranque: el API deja de abortar por SMTP ausente (corrige el deploy dockerizado actual).
- Comandos existentes: sin cambios; se reutiliza contracts:generate, prisma:migrate, seed.

## RIESGOS

- Perder/rotar SETTINGS_ENCRYPTION_KEY invalida el password cifrado guardado: el envio fallara hasta reconfigurar el password. Mitigacion: documentar la variable como critica y persistente; el GET expone source y passwordSet para diagnosticar.
- Loguear enlaces de reset/invite cuando no hay SMTP: enlaces de un solo uso en logs. Mitigacion: nivel warn, documentar, recomendar SMTP en prod; TTL corto ya existente.
- Duplicacion de la lista ModuleKey (front/back) ya existe por diseno; anadir systemSettings en ambos lados es obligatorio para no desincronizar el menu.
- Construir el transporter por envio anade coste minimo; aceptable frente a la latencia SMTP. Si se vuelve problema, cachear+invalidar (ya documentado).
- Olvidar regenerar el contrato dejaria al front sin tipos: incluir contracts:generate en el checklist de verificacion.


## PLAN DE IMPLEMENTACION (incremental; para el Desarrollador)

1. Prisma: anadir User.isAdmin y modelo SmtpConfig a schema.prisma; prisma migrate dev (migracion nueva); prisma generate. Verificar typecheck:api.
2. Rol ADMIN: role-code.ts (+ADMIN); current-actor.ts (+isAdmin); load-actor.ts (incluir isAdmin, roleCodes.add(ADMIN) si isAdmin). Ajustar/añadir tests de load-actor.
3. Modulos/permiso: module-matrix.ts (+systemSettings = [ADMIN]); tests de matriz.
4. Cifrado: settings-crypto.ts (AES-256-GCM, lectura perezosa de SETTINGS_ENCRYPTION_KEY) + test unitario (round-trip, authTag invalido, clave ausente).
5. Resolucion mail: mail-config-resolver (BD>env>null) + loadMailConfig no estricto; mail-transporter.provider deja de construir en arranque; MailService isEnabled + degradacion (log de enlace). Tests de mail.service (deshabilitado loguea, no lanza).
6. Modulo system-settings: service + controller + DTOs + Swagger; @Roles(ADMIN). Tests de service (get sin password, update cifra, test).
7. Auditoria: +SMTP_CONFIG en AuditObjectType (+ enum @ApiQuery).
8. Seed: admin inicial (dev y prod) con isAdmin.
9. Endpoint de promocion a ADMIN (@Roles(ADMIN)) + auditoria, si entra en alcance.
10. Contrato: contracts:generate + build:api-client.
11. Frontend: navigation (+systemSettings/label/item); lib/api-client (+tipos); lib/smtp-config.ts; pantalla configuracion-smtp (page+view) con gating; prueba de envio.
12. Infra: .env.example, .env.production.example, compose.prod.yaml (+SETTINGS_ENCRYPTION_KEY; SMTP_* opcionales).
13. Verificacion: npm run typecheck; npm run test:unit; npm run build; e2e si aplica. Confirmar que el API arranca sin SMTP ni SETTINGS_ENCRYPTION_KEY, que forgot-password sigue 204 y reset-password 200.


## DECISIONES TOMADAS (resumen)

- ADMIN se modela como User.isAdmin (opcion B), NO como Grant ni proceso centinela: global, independiente, cambio minimo, sin contaminar scopedProcessIds ni el modulo de equipo. ADMIN sigue siendo un RoleCode para @Roles.
- Tabla smtp_config singleton; password cifrado AES-256-GCM con crypto nativo; clave SETTINGS_ENCRYPTION_KEY (32 bytes base64) leida perezosamente.
- El transporter se resuelve en runtime (BD>env>none); el provider ya no construye en arranque, por lo que el API arranca sin SMTP. Sin config, reset/invite loguean el enlace (warn) y los endpoints mantienen sus contratos (204 / 200).
- Endpoints @Roles(ADMIN): GET /admin/smtp-config, PATCH /admin/smtp-config, POST /admin/smtp-config/test. PATCH (no PUT) por el CORS actual. GET nunca devuelve el password (passwordSet + source).
- Nuevo ModuleKey systemSettings = [ADMIN] en la matriz; el front anade item/label y gatea la pantalla; control real en backend.
- Seed crea admin@demo.local con isAdmin (dev y prod). Dev-header puede impersonar ADMIN.

## SUPUESTOS NO VERIFICADOS / ABIERTOS

- Alcance del endpoint/UI de PROMOCION de otros usuarios a ADMIN: recomendado un endpoint @Roles(ADMIN) dedicado; queda a confirmar si entra en esta iteracion o solo el seed. El usuario pidio que exista el rol admin y la pantalla SMTP; la gestion de 'quien mas es admin' no fue detallada.
- No verifique el contenido de docs/README.md ni de apps/web middleware/guard de rutas (route guard) linea a linea; asumo que el gating por allowedModules basta como en 'team'/'review'. El Desarrollador debe confirmar el guard de ruta de /administracion/* si existe uno server-side.
- No verifique si AuditService.record exige que objectId exista como FK; para smtp_config el objectId sera el id de la fila singleton (no hay FK de audit a smtp_config, consistente con otros objectType string).
- Formato exacto de la clave (base64 de 32 bytes) es una recomendacion; podria aceptarse hex. Debe fijarse en la utilidad y documentarse igual en los .env.example.
- nodemailer 10.1.0: se asume API createTransport/sendMail/verify estable (ya usada hoy).

