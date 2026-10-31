#!/bin/bash
# Publica un aviso en el tema SNS de alertas de control-phari (BL-022).
#
# Uso: notify-sns.sh "<asunto>" "<mensaje>"
#
# Lo usan la unidad control-phari-backup-alert.service (cuando el respaldo falla) y
# el vigilante check-backup-fresh.sh (cuando no hay un respaldo reciente). Sin
# SNS_TOPIC_ARN en /etc/control-phari-backup.env no avisa a nadie pero NO falla:
# solo deja la advertencia en el journal, para no ocultar el fallo original.
#
# Usa el rol IAM de la instancia (sin llaves), igual que backup-db.sh.
set -uo pipefail

SUBJECT="${1:?Falta el asunto}"
MESSAGE="${2:?Falta el mensaje}"
AWS_REGION="${AWS_REGION:-us-east-2}"
AWSCLI_IMAGE="${AWSCLI_IMAGE:-amazon/aws-cli:2.17.0}"

if [ -z "${SNS_TOPIC_ARN:-}" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] AVISO: SNS_TOPIC_ARN no esta definido; no se envia alerta: $SUBJECT"
  exit 0
fi

# SNS limita el asunto a 100 caracteres, sin saltos de linea.
SUBJECT=$(printf '%s' "$SUBJECT" | tr '\r\n' '  ' | cut -c1-100)

if docker run --rm --network host -e AWS_DEFAULT_REGION="$AWS_REGION" "$AWSCLI_IMAGE" \
  sns publish --topic-arn "$SNS_TOPIC_ARN" --subject "$SUBJECT" --message "$MESSAGE" \
  --query MessageId --output text; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] alerta enviada: $SUBJECT"
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: no se pudo publicar la alerta en SNS: $SUBJECT"
  exit 1
fi
