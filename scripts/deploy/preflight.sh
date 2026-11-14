#!/usr/bin/env bash
# Preflight de SOLO LECTURA en el servidor: disco, contenedores, directorios,
# migraciones aplicadas y conteos. No modifica nada.
# Se ejecuta por SSM (ssm-run.ps1). Sin secretos.
echo "== disco =="; df -h / | tail -1
echo "== contenedores =="; docker ps --format '{{.Names}} {{.Status}}'
echo "== directorios =="; ls -d /opt/control-phari* | tail -5
echo "AUTH_MODE=jwt lineas: $(grep -c 'AUTH_MODE=jwt' /opt/control-phari/.env.production)"
echo "== archivos solo-servidor presentes =="
for f in .env.production compose.https.yaml renew-cert.sh infra/nginx/nginx.conf; do
  [ -f "/opt/control-phari/$f" ] && echo "ok  $f" || echo "FALTA $f"
done
echo "== ultimo deploy =="; cat /opt/backups/last-deploy-date.txt
echo "== respaldo diario =="; systemctl is-active control-phari-backup.timer
echo "== migraciones en codigo desplegado (ultimas 4) =="; ls /opt/control-phari/apps/api/prisma/migrations | grep -v toml | tail -4
docker exec -i control-phari-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' <<'SQL' 2>&1
select 'migraciones=' || count(*) from _prisma_migrations where finished_at is not null;
select 'ultima=' || migration_name from _prisma_migrations order by finished_at desc limit 1;
select 'fallidas=' || count(*) from _prisma_migrations where finished_at is null;
select 'users=' || count(*) from users;
select 'requests=' || count(*) from requests;
select 'tasks=' || count(*) from tasks;
SQL
echo PREFLIGHT_FIN
