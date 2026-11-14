#!/usr/bin/env bash
# Muestra el avance del despliegue lanzado por launch.sh (solo lectura).
# deploy.ps1 sustituye @@TS@@. Sin secretos.
TS="@@TS@@"
LOG=/opt/backups/deploy-$TS.log
sleep 5
grep -E '^\[|ENSAYO_OK|MIGRACION_OK|SEED_OK|DEPLOY_OK|VERIFICACION_|Applying migration|migrations found|No pending|rror|^(migraciones|ultima|users|requests|plans|tasks|assets|documents|audit_events|daily_logs|task_evidences)=' "$LOG" | tail -40
echo "---- ultimas lineas ----"
tail -n 4 "$LOG"
if grep -q DEPLOY_OK "$LOG"; then echo "ESTADO=TERMINADO_OK"
elif ! pgrep -f "run-$TS.sh" >/dev/null; then echo "ESTADO=TERMINADO_CON_ERROR"
else echo "ESTADO=EN_CURSO"; fi
