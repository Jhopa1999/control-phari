#!/usr/bin/env bash
# Lanza en segundo plano el despliegue preparado por prep.sh.tpl.
# deploy.ps1 sustituye @@TS@@. Sin secretos.
TS="@@TS@@"
nohup bash /opt/backups/run-$TS.sh > /opt/backups/deploy-$TS.log 2>&1 &
sleep 2
echo started
tail -n 3 /opt/backups/deploy-$TS.log
