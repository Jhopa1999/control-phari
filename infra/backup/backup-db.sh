#!/bin/bash
# Respaldo de la base de datos PostgreSQL de control-phari a S3 (BL-004).
#
# Pensado para correr como servicio systemd (ver control-phari-backup.service) en
# el servidor de produccion. Toda la configuracion sale de variables de entorno
# (archivo /etc/control-phari-backup.env); no hay valores fijos de ambiente aqui.
#
# Que hace:
#   1. pg_dump en formato custom (-Fc) desde el contenedor de PostgreSQL.
#   2. Valida que el volcado se pueda leer (pg_restore --list) antes de darlo por bueno.
#   3. Sube el volcado y su suma SHA-256 a S3 (cifrado SSE-S3) y comprueba el tamano remoto.
#   4. Borra copias locales mas viejas que LOCAL_RETENTION_DAYS.
# La retencion en S3 la aplica una regla de ciclo de vida del bucket, no este script.
#
# Sale con codigo distinto de 0 ante CUALQUIER fallo (systemd lo marca como fallido) y
# nunca deja un archivo ".partial" valido: solo se renombra el volcado ya verificado.
set -euo pipefail

: "${S3_BUCKET:?Falta S3_BUCKET (ver /etc/control-phari-backup.env)}"
PG_CONTAINER="${PG_CONTAINER:-control-phari-postgres-1}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/control-phari}"
S3_PREFIX="${S3_PREFIX:-postgres}"
AWS_REGION="${AWS_REGION:-us-east-2}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
# Imagen oficial de AWS CLI con version fija. Usa el rol IAM de la instancia
# (--network host permite llegar al servicio de metadatos de EC2).
AWSCLI_IMAGE="${AWSCLI_IMAGE:-amazon/aws-cli:2.17.0}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { log "ERROR: $*"; exit 1; }

aws_cli() {
  docker run --rm --network host \
    -e AWS_DEFAULT_REGION="$AWS_REGION" \
    -v "$BACKUP_DIR":/data:ro \
    "$AWSCLI_IMAGE" "$@"
}

STAMP=$(date -u +%Y%m%d-%H%M%S)
NAME="control-phari-$STAMP.dump"
FILE="$BACKUP_DIR/$NAME"
KEY="$S3_PREFIX/$NAME"

umask 077
mkdir -p "$BACKUP_DIR"

log "1/4 pg_dump desde $PG_CONTAINER"
docker exec "$PG_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$FILE.partial" \
  || { rm -f "$FILE.partial"; fail "pg_dump fallo"; }
[ -s "$FILE.partial" ] || { rm -f "$FILE.partial"; fail "el volcado quedo vacio"; }

log "2/4 validando que el volcado se puede leer (pg_restore --list)"
docker exec -i "$PG_CONTAINER" pg_restore --list < "$FILE.partial" > /dev/null \
  || { rm -f "$FILE.partial"; fail "el volcado no es legible"; }
mv "$FILE.partial" "$FILE"
( cd "$BACKUP_DIR" && sha256sum "$NAME" > "$NAME.sha256" )
SIZE=$(stat -c %s "$FILE")
log "volcado OK: $NAME ($SIZE bytes)"

log "3/4 subiendo a s3://$S3_BUCKET/$KEY"
aws_cli s3 cp "/data/$NAME" "s3://$S3_BUCKET/$KEY" --sse AES256 --only-show-errors \
  || fail "no se pudo subir el volcado a S3"
aws_cli s3 cp "/data/$NAME.sha256" "s3://$S3_BUCKET/$KEY.sha256" --sse AES256 --only-show-errors \
  || fail "no se pudo subir la suma SHA-256 a S3"
REMOTE_SIZE=$(aws_cli s3api head-object --bucket "$S3_BUCKET" --key "$KEY" --query ContentLength --output text) \
  || fail "no se pudo verificar el objeto en S3"
[ "$REMOTE_SIZE" = "$SIZE" ] || fail "tamano distinto en S3 ($REMOTE_SIZE) y local ($SIZE)"

log "4/4 limpiando copias locales con mas de $LOCAL_RETENTION_DAYS dias"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'control-phari-*.dump*' -mtime "+$LOCAL_RETENTION_DAYS" -print -delete || true

log "RESPALDO_OK s3://$S3_BUCKET/$KEY $SIZE bytes"
