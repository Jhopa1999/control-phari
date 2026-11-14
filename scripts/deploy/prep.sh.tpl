#!/usr/bin/env bash
# PLANTILLA de la preparacion del despliegue. NO se ejecuta tal cual:
# deploy.ps1 sustituye los marcadores y la sube por SSM. Sin secretos.
#
# Marcadores:
#   @@TS@@          identificador del despliegue (p. ej. 20261115-bitacora)
#   @@URL@@         URL prefirmada (S3) del paquete de codigo (git archive)
#   @@ENSAYO@@      1 = ensayar migraciones sobre una copia; 0 = omitir
#   @@VERIF_B64@@   SQL de verificacion (base64) o vacio. Debe devolver filas
#                   "comprobacion|violaciones"; si alguna da distinto de 0, aborta
#   @@SEED_B64@@    SQL de parametros nuevos del seed (base64) o vacio. Debe ser
#                   idempotente (INSERT ... ON CONFLICT DO NOTHING)
#
# La preparacion NO toca los contenedores en marcha ni la BD real: respalda,
# descarga el codigo y deja listo /opt/backups/run-<TS>.sh para launch.sh.
set -e
TS="@@TS@@"
cd /opt
echo "disco antes:"; df -h / | tail -1
docker builder prune -f >/dev/null 2>&1 || true
curl -fsSL "@@URL@@" -o /tmp/deploy.tar.gz
ls -l /tmp/deploy.tar.gz
set -a; . /opt/control-phari/.env.production; set +a
echo "== conteos ANTES (misma hora que el respaldo) =="
cat > /opt/backups/conteos-$TS.sql <<'SQL'
select 'migraciones=' || count(*) from _prisma_migrations where finished_at is not null;
select 'ultima=' || migration_name from _prisma_migrations order by finished_at desc limit 1;
select 'users=' || count(*) from users;
select 'requests=' || count(*) from requests;
select 'plans=' || count(*) from plans;
select 'tasks=' || count(*) from tasks;
select 'assets=' || count(*) from assets;
select 'documents=' || count(*) from documents;
select 'audit_events=' || count(*) from audit_events;
select 'daily_logs=' || count(*) from daily_logs;
select 'task_evidences=' || count(*) from task_evidences;
SQL
docker exec -i control-phari-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' < /opt/backups/conteos-$TS.sql > /opt/backups/conteos-$TS-antes.txt
cat /opt/backups/conteos-$TS-antes.txt
date -u +%FT%TZ > /opt/backups/inicio-$TS.txt
echo "== respaldo gestionado (S3 + copia en otra region) =="
systemctl start control-phari-backup.service
OKS=$(journalctl -u control-phari-backup.service --since "-4min" --no-pager | grep -c RESPALDO_OK || true)
echo "RESPALDO_OK en el journal (ultimos 4 min): $OKS"
[ "$OKS" -ge 1 ]
echo "== pg_dump local validado =="
docker exec control-phari-postgres-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /opt/backups/control-phari-$TS-pre.dump
SZ=$(stat -c %s /opt/backups/control-phari-$TS-pre.dump)
HDR=$(head -c 5 /opt/backups/control-phari-$TS-pre.dump)
echo "dump size=$SZ header=$HDR"
[ "$SZ" -gt 100000 ] && [ "$HDR" = "PGDMP" ]
VERIF_B64="@@VERIF_B64@@"
SEED_B64="@@SEED_B64@@"
if [ -n "$VERIF_B64" ]; then echo "$VERIF_B64" | base64 -d > /opt/backups/verificar-$TS.sql; echo "verificacion: $(wc -l < /opt/backups/verificar-$TS.sql) lineas"; fi
if [ -n "$SEED_B64" ]; then echo "$SEED_B64" | base64 -d > /opt/backups/seed-$TS.sql; echo "seed: $(wc -l < /opt/backups/seed-$TS.sql) lineas"; fi
echo "== codigo nuevo =="
rm -rf /opt/control-phari.new && mkdir /opt/control-phari.new
tar -xzf /tmp/deploy.tar.gz -C /opt/control-phari.new
rm -f /tmp/deploy.tar.gz
# Archivos que solo existen en el servidor (no llegan con el codigo)
cp /opt/control-phari/.env.production /opt/control-phari.new/.env.production
cp /opt/control-phari/compose.https.yaml /opt/control-phari.new/compose.https.yaml
cp /opt/control-phari/renew-cert.sh /opt/control-phari.new/renew-cert.sh
cp /opt/control-phari/infra/nginx/nginx.conf /opt/control-phari.new/infra/nginx/nginx.conf
echo "proxy_read_timeout 300s en el nginx del servidor: $(grep -c 'proxy_read_timeout 300s' /opt/control-phari.new/infra/nginx/nginx.conf)"
ls /opt/control-phari.new/apps/api/prisma/migrations | grep -v toml | tail -4
mv /opt/control-phari /opt/control-phari.prev-$TS
mv /opt/control-phari.new /opt/control-phari
cat > /opt/backups/run-$TS.sh <<'EOS'
set -e
TS="@@TS@@"
ENSAYO=@@ENSAYO@@
cd /opt/control-phari
C="docker compose -f compose.prod.yaml -f compose.https.yaml --env-file .env.production"
set -a; . ./.env.production; set +a
DUMP=/opt/backups/control-phari-$TS-pre.dump
PGX="docker exec -i control-phari-postgres-1"
VERIF=/opt/backups/verificar-$TS.sql
SEED=/opt/backups/seed-$TS.sql
cleanup() { $PGX psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS ensayo_migracion" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Ejecuta la verificacion en la base indicada; aborta si alguna fila no da 0.
verificar() {
  [ -f "$VERIF" ] || return 0
  echo "-- verificacion en $1 --"
  RES=$($PGX psql -U "$POSTGRES_USER" -d "$1" -At -F'|' -v ON_ERROR_STOP=1 < "$VERIF")
  echo "$RES"
  MAL=$(echo "$RES" | awk -F'|' 'NF>=2 && $NF != 0' | wc -l)
  if [ "$MAL" -ne 0 ]; then echo "VERIFICACION_FALLA en $1 ($MAL comprobaciones distintas de 0)"; return 1; fi
  echo "VERIFICACION_OK en $1"
}
echo "[0/4] imagenes actuales etiquetadas para rollback rapido"
for s in api web mcp; do docker tag control-phari-$s:latest control-phari-$s:prev-$TS; done
echo "[1/4] build (los contenedores actuales siguen sirviendo)"
$C build
if [ "$ENSAYO" = "1" ]; then
  echo "[2/4] ENSAYO de las migraciones sobre una COPIA del respaldo (base temporal ensayo_migracion)"
  $PGX psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ensayo_migracion"
  $PGX psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ensayo_migracion"
  $PGX pg_restore -U "$POSTGRES_USER" -d ensayo_migracion --no-owner < $DUMP
  $C run --rm -e DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/ensayo_migracion" api npm run prisma:migrate:deploy --workspace apps/api
  echo "-- conteos en la copia ya migrada --"
  $PGX psql -U "$POSTGRES_USER" -d ensayo_migracion -At < /opt/backups/conteos-$TS.sql
  verificar ensayo_migracion
  cleanup
  echo ENSAYO_OK
else
  echo "[2/4] ENSAYO omitido por parametro (solo para despliegues sin migraciones nuevas)"
fi
echo "[3/4] migracion REAL"
$C run --rm api npm run prisma:migrate:deploy --workspace apps/api
echo MIGRACION_OK
if [ -f "$SEED" ]; then
  echo "-- parametros nuevos del seed (idempotentes) --"
  $PGX psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 < "$SEED"
  echo SEED_OK
fi
verificar "$POSTGRES_DB"
echo "[4/4] recrear servicios"
$C up -d --force-recreate api web mcp nginx
sleep 30
docker exec control-phari-nginx-1 nginx -t
docker exec control-phari-nginx-1 nginx -s reload
date +%F > /opt/backups/last-deploy-date.txt; echo "$TS" >> /opt/backups/last-deploy-date.txt
echo DEPLOY_OK
EOS
echo "PREP_OK (run-$TS.sh listo; NO lanzado)"
