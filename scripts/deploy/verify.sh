#!/usr/bin/env bash
# Verificacion posterior al despliegue. SOLO LECTURA: peticiones GET (nunca crea
# datos de prueba en produccion) y consultas SELECT. deploy.ps1 sustituye @@TS@@.
#
# Autenticacion (sin secretos en este archivo). En el servidor, una de:
#   /opt/backups/verify.token   un token Bearer vigente (una sola linea)
#   /opt/backups/verify.env     VERIFY_IDENTIFIER=... y VERIFY_PASSWORD=... de un
#                               usuario de solo lectura; permisos 600. Solo con
#                               esto el script hace un POST /api/auth/login para
#                               obtener el token (no crea datos).
# Sin ninguno de los dos se omiten las comprobaciones autenticadas.
TS="@@TS@@"
BASE="${VERIFY_BASE:-https://localhost}"
sleep "${VERIFY_ESPERA:-60}"
code() { curl -sk -o /dev/null -w '%{http_code}' "$@"; }

echo "== servicios =="
docker ps --format '{{.Names}} {{.Status}}'
echo "ready: $(code $BASE/api/health/ready)"
echo "AUTH_MODE: $(docker exec control-phari-api-1 sh -c 'echo $AUTH_MODE')"
echo "mcp: $(docker inspect -f '{{.State.Health.Status}}' control-phari-mcp-1)"
echo "login page: $(code $BASE/login)"
echo "login html contiene localhost:3001 (debe ser 0): $(curl -sk $BASE/login | grep -c 'localhost:3001')"

echo "== seguridad =="
for p in requests users area-control/attention; do echo "X-Actor-Id sin token /api/$p (esperado 401): $(code -H 'X-Actor-Id: x' $BASE/api/$p)"; done
echo "sin token /api/requests (esperado 401): $(code $BASE/api/requests)"
curl -sk -D - -o /dev/null $BASE/login | grep -iE '^(content-security-policy|x-frame-options|strict-transport-security|x-content-type-options|referrer-policy|x-powered-by)' | cut -c1-120
echo "API x-powered-by (debe ser 0): $(curl -sk -D - -o /dev/null $BASE/api/health/ready | grep -ci '^x-powered-by')"

TOKEN=""
if [ -s /opt/backups/verify.token ]; then
  TOKEN=$(tr -d '\r\n' < /opt/backups/verify.token)
elif [ -f /opt/backups/verify.env ]; then
  . /opt/backups/verify.env
  TOKEN=$(curl -sk -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"$VERIFY_IDENTIFIER\",\"password\":\"$VERIFY_PASSWORD\"}" \
    | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
  unset VERIFY_PASSWORD
fi
if [ -z "$TOKEN" ]; then
  echo "SIN TOKEN: se omiten las comprobaciones autenticadas (ver cabecera de verify.sh)"
else
  H="Authorization: Bearer $TOKEN"
  echo "== GET autenticados =="
  for p in requests portfolio my-work tasks/pending-review area-control/attention processes; do
    echo "GET /api/$p: $(code -H "$H" $BASE/api/$p)"
  done
  echo "GET portfolio estado invalido (esperado 400): $(code -H "$H" "$BASE/api/portfolio?state=XXX")"
  echo "== IDs visibles =="
  REQ=$(curl -sk -H "$H" $BASE/api/requests)
  echo "solicitudes con code PRY-: $(echo "$REQ" | grep -o '"code":"PRY-[0-9]*"' | wc -l)"
  echo "primeros codigos: $(echo "$REQ" | grep -o '"code":"PRY-[0-9]*"' | head -3 | tr '\n' ' ')"
  echo "== conteos por API (con este usuario) =="
  echo "requests_ids=$(echo "$REQ" | grep -o '"id"' | wc -l)"
  echo "portfolio_ids=$(curl -sk -H "$H" $BASE/api/portfolio | grep -o '"requestId"\|"id"' | wc -l)"
fi
unset TOKEN H

echo "== migraciones =="
docker exec -i control-phari-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' <<'SQL'
select count(*) || ' / ' || max(migration_name) from _prisma_migrations where finished_at is not null;
select 'pendientes fallidas=' || count(*) from _prisma_migrations where finished_at is null;
SQL

echo "== conteos DESPUES vs ANTES =="
docker exec -i control-phari-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' < /opt/backups/conteos-$TS.sql > /opt/backups/conteos-$TS-despues.txt
if diff /opt/backups/conteos-$TS-antes.txt /opt/backups/conteos-$TS-despues.txt; then
  echo "SIN DIFERENCIAS"
else
  echo "HAY DIFERENCIAS: el equipo trabaja a cualquier hora; investigar en audit_events (abajo) antes de darlas por buenas"
  INICIO=$(cat /opt/backups/inicio-$TS.txt 2>/dev/null)
  docker exec -i control-phari-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F " | "' <<SQL
select to_char(created_at at time zone 'America/Lima','HH24:MI:SS'), object_type, action, coalesce(actor_user_id::text,'-') from audit_events where created_at > '${INICIO:-1970-01-01}'::timestamptz order by created_at;
SQL
fi

echo "errores API ultimos 6 min: $(docker logs --since 6m control-phari-api-1 2>&1 | grep -cE '"level":(50|60)' || true)"
df -h / | tail -1
echo "ESTADO_VERIFY=FIN"
