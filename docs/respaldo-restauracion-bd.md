# Respaldo y restauración de la base de datos (producción)

Runbook del respaldo automático de PostgreSQL de **control-phari** en la EC2
"EC2 Vigia" (ver [despliegue-produccion-aws.md](despliegue-produccion-aws.md)).
Cierra BL-004.

## Resumen

| | |
|---|---|
| Qué se respalda | La base `POSTGRES_DB` del contenedor `control-phari-postgres-1` (`pg_dump -Fc`) |
| Cuándo | Todos los días a las **03:00 UTC** (22:00 hora de Colombia), más una espera aleatoria de hasta 5 min |
| Dónde | `s3://control-phari-backups-<cuenta>/postgres/` (us-east-2) y copia local en `/var/backups/control-phari` |
| Retención | **30 días en S3** (regla de ciclo de vida) y **7 días** en el servidor |
| Seguridad del bucket | Privado, bloqueo de acceso público, cifrado SSE-S3 y política que **deniega tráfico sin TLS** |
| Cómo sube a S3 | Con el **rol IAM de la instancia**; no hay llaves en el script ni en el repo |
| RPO (cuántos datos se pueden perder) | Hasta 24 h si no hay un respaldo manual más reciente |

Cada ejecución genera dos objetos: `control-phari-AAAAMMDD-HHMMSS.dump` y su
suma `.dump.sha256`.

## Qué NO cubre

- **El bucket de evidencias** (`control-phari-evidencias-<cuenta>`): los archivos
  adjuntos de las tareas no se copian. La base solo guarda sus referencias.
- **Archivos solo-servidor**: `.env.production`, `compose.https.yaml`,
  `renew-cert.sh`, `infra/nginx/nginx.conf` (versión HTTPS) y los certificados.
  Se conservan en cada re-despliegue (`/opt/control-phari.prev-*`), pero no tienen
  copia fuera del servidor.
- **El stack por red y el entorno local** (Docker en el equipo del desarrollador):
  tienen sus propias bases; se respaldan a mano.
- **Alertas**: si un respaldo falla, systemd lo marca como fallido pero **nadie
  recibe aviso**. Ver "Verificar" y "Mejoras pendientes".

## Cómo funciona

- `infra/backup/backup-db.sh` (instalado en `/opt/control-phari-ops/`, fuera de la
  carpeta de la aplicación para que un re-despliegue no lo toque):
  1. `pg_dump` en formato custom desde el contenedor.
  2. Valida que el volcado sea legible con `pg_restore --list`; si no, aborta.
  3. Sube volcado y suma a S3 (`--sse AES256`) y compara el tamaño remoto con el local.
  4. Borra copias locales con más de `LOCAL_RETENTION_DAYS` días.
  Termina con `RESPALDO_OK <ruta> <bytes>` o con un `ERROR:` y código distinto de 0.
- La subida usa la imagen oficial `amazon/aws-cli` (versión fija) con
  `--network host`, porque el AWS CLI instalado en la instancia no funciona.
  Hereda las credenciales del rol de la instancia por el servicio de metadatos.
- `control-phari-backup.service` (oneshot) + `control-phari-backup.timer`
  (`OnCalendar=*-*-* 03:00:00 UTC`, `Persistent=true`: si el servidor estaba
  apagado, corre al encenderse).
- Configuración en `/etc/control-phari-backup.env` (sin secretos). Ver
  `infra/backup/control-phari-backup.env.example`.

## Verificar que está funcionando

En el servidor (por SSM):

```bash
systemctl list-timers control-phari-backup.timer --no-pager      # próxima y última ejecución
journalctl -u control-phari-backup.service --no-pager -n 20      # debe terminar en RESPALDO_OK
systemctl is-failed control-phari-backup.service                 # "inactive" = bien; "failed" = revisar
ls -l /var/backups/control-phari
```

Desde cualquier equipo con credenciales de AWS:

```bash
aws s3 ls s3://control-phari-backups-<cuenta>/postgres/ --region us-east-2
```

Debe haber un `.dump` (y su `.sha256`) por cada día de los últimos 30. **Revísalo a
mano de vez en cuando** mientras no existan alertas.

## Respaldo manual inmediato

Hazlo siempre **antes de un despliegue con migraciones** o de cualquier operación
riesgosa:

```bash
systemctl start control-phari-backup.service    # espera a que termine
journalctl -u control-phari-backup.service --no-pager -n 6
```

## Restaurar

### A) Simulacro en una copia desechable (probado el 2026-10-30)

No toca producción. Se puede hacer desde cualquier equipo con Docker y AWS CLI.

```bash
# 1. Elegir y bajar el respaldo (y su suma)
aws s3 ls s3://control-phari-backups-<cuenta>/postgres/ --region us-east-2
aws s3 cp s3://control-phari-backups-<cuenta>/postgres/<archivo>.dump        . --region us-east-2
aws s3 cp s3://control-phari-backups-<cuenta>/postgres/<archivo>.dump.sha256 . --region us-east-2
sha256sum -c <archivo>.dump.sha256        # en Windows: Get-FileHash .\<archivo>.dump -Algorithm SHA256

# 2. PostgreSQL desechable (misma versión mayor que producción: 17)
docker run -d --name restore-simulacro -e POSTGRES_PASSWORD=simulacro -e POSTGRES_DB=restore_test postgres:17-alpine

# 3. Restaurar (--exit-on-error: cualquier problema detiene y se ve)
docker cp <archivo>.dump restore-simulacro:/tmp/r.dump
docker exec restore-simulacro pg_restore -U postgres -d restore_test --no-owner --no-privileges --exit-on-error /tmp/r.dump

# 4. Comprobar datos y limpiar
docker exec restore-simulacro psql -U postgres -d restore_test -c "select count(*) from requests"
docker rm -f restore-simulacro
```

Resultado del simulacro del 2026-10-30: SHA-256 correcto, `pg_restore` sin errores y
**11 de 11 conteos idénticos a producción** (43 tablas, 25 migraciones, 9 usuarios,
9 solicitudes, 4 planes, 9 tareas, 2 activos, 2 documentos, 190 eventos de
auditoría, 1 evidencia, 1 agente de IA).

### B) Restauración real en producción (recuperación de desastre)

> **Este procedimiento NO se ha ejecutado en producción**; solo el simulacro (A).
> Léelo completo antes de empezar y, si hay tiempo, ensáyalo antes en una copia.

Reemplaza los datos actuales por los del respaldo: **se pierde todo lo escrito
después del respaldo**.

1. Haz un respaldo del estado actual, aunque esté dañado:
   `systemctl start control-phari-backup.service`.
2. Elige el respaldo, descárgalo al servidor con una URL prefirmada (el AWS CLI de
   la instancia no funciona) y verifica su SHA-256.
3. Detén quien escribe en la base:
   `docker compose -f compose.prod.yaml -f compose.https.yaml --env-file .env.production stop api web mcp`.
4. Restaura sobre la base existente:
   ```bash
   docker cp control-phari-AAAAMMDD-HHMMSS.dump control-phari-postgres-1:/tmp/r.dump
   docker exec control-phari-postgres-1 sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error /tmp/r.dump'
   docker exec control-phari-postgres-1 rm -f /tmp/r.dump
   ```
5. Si el respaldo es de una versión anterior de la aplicación, alinea el esquema:
   `... run --rm api npm run prisma:migrate:deploy --workspace apps/api`.
6. Levanta todo: `... up -d` y recarga nginx
   (`docker exec control-phari-nginx-1 nginx -s reload`).
7. Verifica: `/api/health/ready`, login, y que los datos recientes estén.

Si el servidor se perdió por completo, hay que reconstruirlo primero (ver
[despliegue-produccion-aws.md](despliegue-produccion-aws.md)), reinstalar el
respaldo automático (abajo) y luego restaurar.

## Instalar el respaldo en un servidor nuevo

Requisitos: Docker, un contenedor PostgreSQL llamado `control-phari-postgres-1`
(o ajustar `PG_CONTAINER`) y un rol de instancia con permiso de escritura en el
bucket (en "EC2 Vigia" el rol `test-session-manager` ya tiene S3).

1. Crear el bucket (privado, cifrado, solo HTTPS y expiración a 30 días en `postgres/`).
   Los comandos usados están en el historial del BL-004; en resumen:
   `create-bucket`, `put-public-access-block` (los 4 en `true`), `put-bucket-encryption`
   (AES256), `put-bucket-lifecycle-configuration` (prefijo `postgres/`, 30 días) y
   `put-bucket-policy` que deniega `aws:SecureTransport = false`.
2. Copiar al servidor `infra/backup/backup-db.sh` a `/opt/control-phari-ops/`
   (permisos `750`), y las unidades `control-phari-backup.service` y
   `control-phari-backup.timer` a `/etc/systemd/system/`.
3. Crear `/etc/control-phari-backup.env` (permisos `600`) con `S3_BUCKET=<bucket>`.
4. `systemctl daemon-reload && systemctl enable --now control-phari-backup.timer`.
5. Probar: `systemctl start control-phari-backup.service` y revisar `RESPALDO_OK`.

Si cambia el script en el repositorio, hay que **volver a copiarlo** a
`/opt/control-phari-ops/`: el re-despliegue no lo actualiza.

## Cambiar parámetros

- **Retención en S3:** regla de ciclo de vida del bucket (`expirar-respaldos-postgres-30-dias`).
- **Retención local, bucket, prefijo, imagen de AWS CLI:** `/etc/control-phari-backup.env`.
- **Hora:** `OnCalendar` en el `.timer`, luego `systemctl daemon-reload`.

## Mejoras pendientes

- **Alerta si falla o no corre** (por ejemplo SNS; el rol de la instancia ya tiene
  permiso) en vez de depender de revisar a mano.
- **Versionado del bucket** (con expiración de versiones antiguas) para protegerse de
  borrados accidentales; hoy el rol de la instancia tiene `S3FullAccess`, más amplio
  de lo necesario.
- **Copia en otra región** y respaldo del bucket de evidencias.
- **Ensayar la restauración real (B)** en una instancia de pruebas.
