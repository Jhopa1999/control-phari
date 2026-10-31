#!/bin/bash
# Vigilante del respaldo de la base de datos (BL-022).
#
# Comprueba que el ultimo respaldo en S3 tenga menos de MAX_AGE_HOURS horas. Cubre
# lo que OnFailure no ve: que el temporizador no haya corrido (servidor apagado,
# timer deshabilitado) o que el bucket no reciba objetos. Si no hay un respaldo
# reciente, avisa por SNS (notify-sns.sh) y sale con codigo distinto de 0.
#
# Configuracion por /etc/control-phari-backup.env (la misma del respaldo).
set -euo pipefail

: "${S3_BUCKET:?Falta S3_BUCKET (ver /etc/control-phari-backup.env)}"
S3_PREFIX="${S3_PREFIX:-postgres}"
AWS_REGION="${AWS_REGION:-us-east-2}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
AWSCLI_IMAGE="${AWSCLI_IMAGE:-amazon/aws-cli:2.17.0}"
NOTIFY="${NOTIFY_SCRIPT:-/opt/control-phari-ops/notify-sns.sh}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

aws_cli() {
  docker run --rm --network host -e AWS_DEFAULT_REGION="$AWS_REGION" "$AWSCLI_IMAGE" "$@"
}

alert() {
  log "ALERTA: $1"
  "$NOTIFY" "control-phari: respaldo de la BD sin novedad reciente" "$1

Servidor: $(hostname)
Bucket: s3://$S3_BUCKET/$S3_PREFIX/
Que hacer: revisar 'systemctl status control-phari-backup.timer' y 'journalctl -u control-phari-backup.service' en el servidor; si hace falta, lanzar 'systemctl start control-phari-backup.service'. Runbook: docs/respaldo-restauracion-bd.md." || true
  exit 1
}

LAST=$(aws_cli s3api list-objects-v2 --bucket "$S3_BUCKET" --prefix "$S3_PREFIX/" \
  --query 'sort_by(Contents[?ends_with(Key, `.dump`)], &LastModified)[-1].LastModified' \
  --output text) || alert "No se pudo consultar el bucket de respaldos (error de AWS o de permisos) o no hay ningun objeto en el prefijo."

if [ -z "$LAST" ] || [ "$LAST" = "None" ]; then
  alert "No hay ningun respaldo (.dump) en s3://$S3_BUCKET/$S3_PREFIX/."
fi

LAST_EPOCH=$(date -u -d "$LAST" +%s) || alert "No se pudo interpretar la fecha del ultimo respaldo ($LAST)."
AGE_HOURS=$(( ( $(date -u +%s) - LAST_EPOCH ) / 3600 ))

if [ "$AGE_HOURS" -gt "$MAX_AGE_HOURS" ]; then
  alert "El ultimo respaldo es de hace ${AGE_HOURS} horas (limite: ${MAX_AGE_HOURS}). Ultimo: $LAST."
fi

log "RESPALDO_RECIENTE hace ${AGE_HOURS} h (limite ${MAX_AGE_HOURS} h), ultimo: $LAST"
