# Despliegue: procedimiento y scripts

Este documento reúne el procedimiento de despliegue de control-phari al stack
Docker por red y a producción (EC2 en AWS por SSM). Las reglas (cuándo, qué debe
dejar listo un PR, rollback) están en `.kiro/steering/70-despliegue.md`; el
registro de esta instalación, en `docs/despliegue-produccion-aws.md`. Los
scripts versionados viven en `scripts/deploy/`.

Un despliegue solo se hace cuando el usuario lo pide. Orden: primero el stack por
red (reversible), después producción, que tiene datos reales del equipo.

## Scripts

| Archivo | Para qué sirve |
|---------|----------------|
| `scripts/deploy/deploy-red.ps1` | Stack por red: respaldo `pg_dump` validado, build en segundo plano, `migrate deploy`, `up -d --force-recreate` y verificación. |
| `scripts/deploy/deploy.ps1` | Orquestador local de producción: genera los scripts, sube el paquete a S3, ejecuta por SSM y limpia. |
| `scripts/deploy/ssm-run.ps1` | Ejecuta un script bash en la instancia por SSM y guarda STATUS, stdout y stderr. |
| `scripts/deploy/preflight.sh` | Solo lectura: disco, contenedores, migraciones, conteos y archivos solo-servidor. |
| `scripts/deploy/prep.sh.tpl` | Plantilla de la preparación: conteos, respaldo, `pg_dump`, código nuevo y `run-<TS>.sh`. |
| `scripts/deploy/launch.sh`, `watch.sh` | Lanzan `run-<TS>.sh` en segundo plano y muestran el avance del log. |
| `scripts/deploy/verify.sh` | Verificación posterior: seguridad, GET autenticados, IDs visibles, migraciones y conteos. |
| `scripts/deploy/ejemplos/seed-param-gracia.sql` | Ejemplo de parámetro de seed idempotente para `-SeedSql`. |
| `scripts/verificar-ids-visibles.sql` | Ejemplo de verificación que aborta (`-VerificacionSql`), usada en el despliegue de #80. |

Los scripts no llevan secretos ni URL prefirmadas. `deploy.ps1` sustituye los
marcadores (`@@TS@@`, `@@URL@@`, `@@ENSAYO@@`, `@@VERIF_B64@@`, `@@SEED_B64@@`) y
escribe los scripts concretos en `%TEMP%\control-phari-deploy-<TS>`, fuera del
repositorio; los borra al terminar.

## Requisitos

- **AWS CLI v2** configurado (`aws sts get-caller-identity` responde) con
  permisos para `ssm:SendCommand`, `ssm:GetCommandInvocation` sobre la instancia
  y `s3:PutObject`, `s3:GetObject` y `s3:DeleteObject` sobre el prefijo temporal
  del bucket de paquetes (`-Bucket` o `PORTAL_DEPLOY_BUCKET`).
- **Git** en el PATH y la rama `main` actualizada (`git archive` empaqueta la
  referencia indicada, no el árbol de trabajo).
- **Docker Desktop** en marcha para el stack por red (`docker info`).
- **PowerShell** 5.1 o 7. Los scripts están escritos para ambos.
- En el servidor (ya existen): `.env.production`, `compose.https.yaml`,
  `renew-cert.sh`, el `nginx.conf` HTTPS y `control-phari-backup.service`. El
  AWS CLI del servidor está roto: no se usa; el código viaja por URL prefirmada.
- Instancia y región por defecto: `i-0879c4806eab55546` y `us-east-2`.
  Se cambian con `-InstanceId` y `-Region`, o con `PORTAL_SSM_INSTANCE` y
  `PORTAL_AWS_REGION`.
- Para verificar con sesión (opcional): en el servidor, un token en
  `/opt/backups/verify.token` o `/opt/backups/verify.env` con
  `VERIFY_IDENTIFIER` y `VERIFY_PASSWORD` de un usuario de solo lectura
  (permisos `600`). Sin ellos, `verify.sh` omite las comprobaciones
  autenticadas. Es el único POST del script (`/api/auth/login`) y no crea datos.

## Pasos

### 1. Stack por red

```powershell
.\scripts\deploy\deploy-red.ps1 -Nombre <etiqueta> -DryRun   # revisa qué haría
.\scripts\deploy\deploy-red.ps1 -Nombre <etiqueta>
```

Hace, en orden: limpia las variables del shell (`NEXT_PUBLIC_*`, `DATABASE_URL`,
`AUTH_MODE`, `CORS_ORIGINS`, `PORT`, `E2E_*`); comprueba `docker info`; respalda
con `pg_dump -Fc` (escrito por `cmd`, porque `>` de PowerShell corrompe el
binario) y valida la cabecera `PGDMP` y el tamaño; construye en segundo plano
con sondeo del log; aplica `prisma migrate deploy`; recrea `api web mcp nginx`;
y verifica `ready`, `AUTH_MODE`, que el HTML de `/login` no contenga
`localhost:3001`, que `X-Actor-Id` sin token dé 401 y los conteos antes y
después. Usa `-p control-phari` para que los contenedores se llamen
`control-phari-*-1` también si se ejecuta desde un worktree. El
`.env.production` del stack por red no está en git: debe existir en `-RepoDir`.

### 2. Producción

```powershell
$env:PORTAL_DEPLOY_BUCKET = '<bucket-temporal>'
.\scripts\deploy\deploy.ps1 -Nombre <etiqueta> -DryRun
.\scripts\deploy\deploy.ps1 -Nombre <etiqueta> -VerificacionSql .\scripts\verificar-ids-visibles.sql
```

Etapas, cada una con pausa para revisar la salida (`-Yes` las omite):

1. **Preflight** (`preflight.sh`): solo lectura. Con `-SoloPreflight` se detiene aquí.
2. **Paquete**: `git archive` de `-Ref` (por defecto `main`) sin `.agents` ni `e2e`,
   subida a S3 y URL prefirmada (`-ExpiraSegundos`, 3600 por defecto).
3. **Prep** (`prep.sh.tpl`): conteos antes, `control-phari-backup.service` (exige
   `RESPALDO_OK`), `pg_dump` validado (`PGDMP`), código nuevo en
   `/opt/control-phari.new` con los archivos solo-servidor copiados, la carpeta
   anterior queda como `/opt/control-phari.prev-<TS>` y se escribe
   `/opt/backups/run-<TS>.sh`. No toca los contenedores ni la BD real. Al
   terminar se borran el paquete de S3 y el archivo local con la URL.
4. **Launch y watch**: `run-<TS>.sh` corre con `nohup`; `watch.sh` se sondea cada
   `-SondeoSegundos` hasta `ESTADO=TERMINADO_OK` o `TERMINADO_CON_ERROR`
   (máximo `-MaxMinutosDespliegue`). El `run` etiqueta las imágenes
   `:prev-<TS>`, construye, ensaya las migraciones, migra la BD real, inserta
   el seed (si lo hay), recrea los servicios y hace `nginx -t` y recarga.
5. **Verify** (`verify.sh`): solo GET y `SELECT`. Compara conteos con los de antes.

Parámetros del ensayo y la verificación:

- Por defecto (sin `-SinEnsayo`): restaura el dump en la base temporal
  `ensayo_migracion`, aplica las migraciones ahí, muestra los conteos de la copia
  y la elimina. Si falla, aborta sin tocar la BD real. Solo se apaga
  (`-SinEnsayo`) en despliegues sin migraciones nuevas.
- `-VerificacionSql <archivo>`: consulta que devuelve filas
  `comprobacion|violaciones` (como `scripts/verificar-ids-visibles.sql`). Se
  ejecuta sobre la copia y sobre la BD real tras migrar; si una fila no da 0, el
  `run` termina con `VERIFICACION_FALLA` y no recrea los servicios.
- `-SeedSql <archivo>`: parámetros nuevos del seed (ver trampas). Debe ser
  idempotente.

### 3. Dry run

`-DryRun` no toca AWS ni Docker: genera los scripts concretos en la carpeta
temporal, comprueba que no queden marcadores sin sustituir, imprime los comandos
que ejecutaría y borra la carpeta.

## Rollback

- **Servicios sin migración nueva incompatible:** etiquetar las imágenes
  `:prev-<TS>` como `latest`, restaurar `/opt/control-phari.prev-<TS>` (renombrar
  carpetas) y `docker compose ... up -d --force-recreate api web mcp nginx`.
- **Con una migración que el código anterior no entiende:** revertir el código
  obliga a revertir también la BD con `/opt/backups/control-phari-<TS>-pre.dump`.
  No restaures un dump sin hablarlo con el usuario: se pierden las escrituras
  posteriores al respaldo. Procedimientos de restauración: `docs/respaldo-restauracion-bd.md`. Ensayo local de restauración y su procedimiento: [`restauracion.md`](restauracion.md).
- **Stack por red:** el dump está en `%USERPROFILE%\control-phari-backups\stack-red-<TS>-pre.dump`.

## Cambio de contraseña obligatorio (migración `20261119090000_user_must_change_password`)

- La migración es aditiva e idempotente y no marca a nadie. Sin variables de entorno
  nuevas ni parámetros de seed. Revertir el código no exige revertir la BD.
- Verificación (sobre la copia del ensayo y sobre la BD real; debe dar `0`, si no se
  aborta): `SELECT count(*) FROM users WHERE must_change_password;`
- **Activación manual**, cuando lo decida el usuario: «Equipo y permisos» → «Exigir
  cambio a todos» (deja auditoría). Antes, decidir si se excluye la cuenta que usa el
  MCP (marcar por selección o `POST /users/force-password-change` con `all: true` y
  `excludeUserIds`, con el Bearer del jefe). No usar SQL directo salvo emergencia: no
  deja rastro en la auditoría.
- Marcha atrás: la misma acción con `enabled: false` o, en emergencia,
  `UPDATE users SET must_change_password = false`. Las sesiones abiertas se
  interrumpen en la siguiente acción de cada persona marcada.

## Trampas conocidas

- **Variables del shell.** El shell persistente arrastra `NEXT_PUBLIC_*`,
  `DATABASE_URL`, `AUTH_MODE`, `CORS_ORIGINS`, `PORT` y `E2E_*` de ejecuciones
  anteriores y contaminan el build y `docker compose`. `deploy-red.ps1` las borra;
  si construyes a mano, hazlo tú (ver `.kiro/steering/35-entorno-local-y-e2e.md`).
- **Docker sin acceso a Docker Hub.** Si el build falla en
  `load metadata for docker.io/...`, la máquina no alcanza Docker Hub: no uses
  `--pull` y reutiliza las imágenes base ya descargadas. `deploy-red.ps1` muestra
  esas líneas del log cuando el build falla.
- **El seed no llega a producción.** No corre en el servidor. Un parámetro nuevo
  (`catalog_items` u otro dato base) se inserta con `-SeedSql` y
  `INSERT ... ON CONFLICT DO NOTHING`; el PR debe decirlo. Ejemplo:
  `scripts/deploy/ejemplos/seed-param-gracia.sql`.
- **Los conteos cambian por actividad del equipo.** Una diferencia entre antes y
  después no es un fallo por sí sola: `verify.sh` lista los `audit_events`
  desde el inicio del despliegue para explicarla. Se investiga antes de darla
  por buena.
- **Archivos solo-servidor.** `.env.production`, `compose.https.yaml`,
  `renew-cert.sh` y el `nginx.conf` HTTPS no llegan con el código; `prep` los
  copia de la carpeta anterior. Si un cambio necesita tocar el nginx de
  producción, dilo en el PR.
- **Variables de entorno nuevas.** Deben tener valor por defecto seguro en
  `compose.prod.yaml` y estar en `.env.production.example`.
- **Historial de SSM.** El contenido de cada script queda en el historial de
  comandos de SSM: por eso no llevan secretos y la URL prefirmada caduca y se
  invalida al borrar el objeto de S3.

## Pendiente

Ver BL-003 (CD automático) y BL-031 (respaldos y archivos solo-servidor) en
`docs/BACKLOG.md`. Estos scripts automatizan el procedimiento manual, pero se
lanzan a mano; no hay disparador automático.
