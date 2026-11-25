# Ensayo de restauración de respaldos (BL-031, punto 3)

Procedimiento para comprobar que un respaldo `pg_dump` de control-phari se
restaura completo, y resultado del ensayo del **2026-11-24**. Complementa el runbook
[`docs/respaldo-restauracion-bd.md`](../respaldo-restauracion-bd.md) (que define el
respaldo automático y la restauración real en producción, procedimiento B).

> El ensayo se hizo **solo en local**: no se tocó producción, AWS ni la base de
> desarrollo (puerto 5433). Los comandos por SSM de la sección «Referencia de
> producción» **no se ejecutaron en este ensayo**.

## Resultado del ensayo (2026-11-24)

| | |
|---|---|
| Respaldo usado | `stack-red-20261124-oleada4-pre.dump` (stack por red, previo a la oleada 4) |
| Origen del respaldo | Stack por red. En `control-phari-backups` no había un dump de producción (los despliegues a producción dejan su respaldo en el servidor y en S3). |
| Tamaño | 212 331 bytes (formato custom, cabecera `PGDMP`, creado el 2026-11-24 20:39 UTC) |
| Servidor temporal | `postgres:17-alpine` (misma versión mayor que producción), contenedor `cp-restore-bl031`, puerto `127.0.0.1:55432`, sin volúmenes con nombre |
| Comando de restauración | `pg_restore --no-owner --no-privileges --exit-on-error` en una BD nueva (`restore_test`) |
| Errores de restauración | Ninguno (código de salida 0) |
| Tiempo de `pg_restore` | **2,1 s** |
| Tiempo desde el contenedor creado hasta PostgreSQL listo | 9,2 s |
| Tiempo hasta restaurado | **11,8 s** |
| Tiempo hasta terminar las verificaciones de datos | 39,3 s (la mayor parte es el conteo tabla por tabla con un `docker exec` por tabla) |
| `prisma migrate status` contra la copia | «Database schema is up to date!» (55 migraciones, ninguna pendiente) |

**RTO medido con este volumen de datos:** unos **40 s** desde cero hasta una copia
verificada, sin contar la descarga del respaldo ni el arranque de la aplicación. El
dato es optimista: la base tiene 212 KB, y el tiempo de `pg_restore` crece con el
volumen. En producción hay que sumar la descarga desde S3, la parada y el arranque de
`api`, `web` y `mcp`, y la verificación manual.

### Integridad verificada

- **Tablas:** 51 en `public` (incluye `_prisma_migrations`).
- **Claves foráneas:** 114, todas validadas (0 sin validar) y sin errores durante la restauración.
- **Migraciones:** 55 aplicadas y terminadas, 0 sin terminar. Última:
  `20261119090000_user_must_change_password`, igual que la última carpeta en
  `apps/api/prisma/migrations` (55 carpetas). El dump era de la última migración y no
  hizo falta `prisma migrate deploy`.
- **Conteos de las tablas principales** (el origen vivo del stack por red ya cambió
  desde el respaldo, así que solo se compara contra el contenido del dump):

| Tabla | Filas | Tabla | Filas |
|---|---|---|---|
| `requests` | 5 | `audit_events` | 111 |
| `plans` | 3 | `catalog_items` | 111 |
| `plan_phases` | 9 | `grants` | 14 |
| `tasks` | 10 | `gate_checks` | 15 |
| `users` | 9 | `approvals` | 3 |
| `roles` | 3 | `triages` | 4 |
| `processes` | 4 | `priority_evaluations` | 5 |
| `assets` | 4 | `ai_agent_config` / `ai_model` | 2 / 2 |
| `requesters` | 1 | `areas` | 1 |

  Las demás tablas (adjuntos, bitácoras, reuniones, compromisos, notificaciones,
  actividades recurrentes, documentos, evidencias, tokens de autenticación, etc.)
  estaban vacías en ese respaldo.
- No se imprimió contenido personal (correos, hashes, textos): solo conteos y estados.

### Limpieza

Se eliminó el contenedor con `docker rm -f -v` y los archivos temporales. El dump no
se copió fuera de `control-phari-backups`; solo estuvo dentro del contenedor, que ya
no existe.

## Procedimiento paso a paso (local)

Requisitos: Docker, Node con las dependencias del repositorio instaladas y un dump
`pg_dump -Fc`. Usa un puerto libre distinto de 5433 (desarrollo) y de cualquier
servidor propio; abajo se usa 55432.

1. **Comprobar el archivo.** La cabecera debe ser `PGDMP` y, si hay suma, coincidir:
   ```powershell
   $f = "$env:USERPROFILE\control-phari-backups\<archivo>.dump"
   -join ([IO.File]::ReadAllBytes($f)[0..4] | % { [char]$_ })   # PGDMP
   (Get-FileHash $f -Algorithm SHA256).Hash
   ```
2. **Levantar un PostgreSQL desechable**, con la misma versión mayor que producción
   (17), sin tocar `compose.yaml`:
   ```powershell
   docker run -d --name cp-restore-bl031 -p 127.0.0.1:55432:5432 `
     -e POSTGRES_PASSWORD=ensayo -e POSTGRES_DB=restore_test postgres:17-alpine
   docker exec cp-restore-bl031 pg_isready -U postgres -d restore_test   # repetir hasta "accepting connections"
   ```
   Tras `pg_isready` conviene esperar unos 3 s: la imagen reinicia el servidor una vez
   al inicializar y una conexión inmediata puede fallar.
3. **Restaurar** (`--exit-on-error`: cualquier problema detiene y se ve):
   ```powershell
   docker cp $f cp-restore-bl031:/tmp/r.dump
   docker exec cp-restore-bl031 pg_restore -U postgres -d restore_test --no-owner --no-privileges --exit-on-error /tmp/r.dump
   $LASTEXITCODE   # debe ser 0
   ```
4. **Verificar integridad.** Puntos de verificación:
   ```sql
   -- tablas y claves foráneas
   select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';
   select count(*) from pg_constraint where contype='f';
   select count(*) from pg_constraint where contype='f' and not convalidated;   -- debe ser 0
   -- migraciones
   select count(*), max(migration_name) from _prisma_migrations where finished_at is not null;
   select count(*) from _prisma_migrations where finished_at is null;           -- debe ser 0
   ```
   Para los conteos de filas, una sola consulta es mucho más rápida que un `docker exec`
   por tabla:
   ```sql
   select table_name,
          (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::int as filas
   from information_schema.tables
   where table_schema='public' and table_type='BASE TABLE' order by 1;
   ```
   Compara con los conteos de la base de origen cuando esté disponible (por ejemplo
   el archivo `conteos-stack-red-ANTES.txt` que genera el despliegue al stack por red).
5. **Comprobar el esquema contra el código.** Desde `apps/api`, apuntando solo a la copia:
   ```powershell
   $env:DATABASE_URL = 'postgresql://postgres:ensayo@127.0.0.1:55432/restore_test?schema=public'
   npx prisma migrate status      # "Database schema is up to date!"
   ```
   Si el dump es anterior a la última migración, el comando lista las pendientes. Se
   aplican **solo en la copia** con `npx prisma migrate deploy` (mismo `DATABASE_URL`).
   Comprueba que la salida diga `restore_test` en `127.0.0.1:55432` antes de ejecutarlo.
6. **Medir el tiempo** total desde el paso 2 hasta el 5 y anótalo como RTO de la prueba.
7. **Limpiar:**
   ```powershell
   docker rm -f -v cp-restore-bl031
   Remove-Item Env:DATABASE_URL
   ```
   No dejes copias del dump fuera de `control-phari-backups`.

## Referencia de producción (no ejecutado en este ensayo)

La restauración real se describe en el procedimiento B del runbook. Los comandos
se envían a la instancia «EC2 Vigia» por SSM (`scripts/deploy/ssm-run.ps1` o
`aws ssm send-command` con `AWS-RunShellScript`); la instancia no tiene un AWS CLI
funcional, así que el respaldo se baja con una URL prefirmada.

```bash
# NO EJECUTADO EN ESTE ENSAYO. Reemplaza los datos de producción.
# 0. Respaldo del estado actual, aunque esté dañado
systemctl start control-phari-backup.service
journalctl -u control-phari-backup.service --no-pager -n 6        # RESPALDO_OK

# 1. Elegir el respaldo (S3, us-east-2; o la copia de us-west-2) y bajarlo al servidor
aws s3 ls s3://control-phari-backups-<cuenta>/postgres/ --region us-east-2
#    (URL prefirmada desde un equipo con credenciales; descargar con curl en el servidor y comprobar sha256sum -c)

# 2. Detener a quien escribe en la base
cd /opt/control-phari
docker compose -f compose.prod.yaml -f compose.https.yaml --env-file .env.production stop api web mcp

# 3. Restaurar sobre la base existente
docker cp control-phari-AAAAMMDD-HHMMSS.dump control-phari-postgres-1:/tmp/r.dump
docker exec control-phari-postgres-1 sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error /tmp/r.dump'
docker exec control-phari-postgres-1 rm -f /tmp/r.dump

# 4. Alinear el esquema si el respaldo es de una versión anterior
docker compose -f compose.prod.yaml -f compose.https.yaml --env-file .env.production run --rm api npm run prisma:migrate:deploy --workspace apps/api

# 5. Levantar y verificar
docker compose -f compose.prod.yaml -f compose.https.yaml --env-file .env.production up -d
docker exec control-phari-nginx-1 nginx -s reload
curl -fsS https://<dominio>/api/health/ready
```

Después de restaurar, repite los puntos de verificación del paso 4 (tablas, claves
foráneas, migraciones, conteos) con `psql` dentro del contenedor y comprueba el inicio
de sesión y que los datos recientes estén.

## Hallazgos del ensayo

- El procedimiento A del runbook funciona tal cual con el contenedor desechable; la
  restauración no dio errores ni claves foráneas sin validar.
- **No hay `npm run` para `prisma migrate status`.** El `package.json` de `apps/api`
  solo define `prisma:migrate:deploy`; el estado se consulta con `npx prisma migrate status`
  desde `apps/api`. Con `DATABASE_URL` definido en la sesión, `prisma.config.ts` lo
  prefiere al del `.env` de la raíz (no lo sobrescribe), pero hay que verificar en la
  salida que apunta a la copia y no a la base de desarrollo.
- En PowerShell, `npx` escribe su aviso `injected env` por stderr: con
  `$ErrorActionPreference = 'Stop'` o al redirigir `2>&1` aparece como error aunque
  el código de salida sea 0.
- El conteo tabla por tabla con un `docker exec` por tabla tardó unos 28 s de los 39 s
  totales. La consulta única de arriba lo evita.
- El simulacro del 2026-10-30 citaba 43 tablas y 25 migraciones; hoy son 51 tablas y 55
  migraciones. Los números de ese runbook son históricos, no valores de control.
- **La carpeta `control-phari-backups` guarda solo dumps del stack por red** (y de
  desarrollo). La restauración de un dump real de producción desde S3 sigue sin
  ensayarse; ver pendientes.

## Pendiente (resto de BL-031)

- Ensayar el procedimiento B **en una instancia de pruebas en AWS** con un dump de
  producción bajado de S3 (y verificar la suma SHA-256), midiendo descarga y arranque
  de la aplicación. Este ensayo local cubre el formato, la integridad y el esquema, no
  el camino por SSM ni el rendimiento con el volumen real.
- Respaldo cifrado de los archivos solo-servidor y más destinatarios de alertas
  (puntos 2 y 4 de BL-031).
