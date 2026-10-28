# Despliegue (producción, un solo servidor)

Esta plantilla se empaqueta con Docker Compose para un único servidor. No usa
Kubernetes, ECS, Terraform ni Helm: la arquitectura es un **monolito modular**
detrás de **Nginx**.

## Arquitectura de producción

```
Internet
   |
   v
 Nginx (:80, único punto público)
   |  /        -> web  (Next.js, :3000, interno)
   |  /api/    -> api  (NestJS, :3001, interno)  [se quita el prefijo /api]
   |  /mcp/    -> mcp  (MCP HTTP, :3002, interno) [se quita el prefijo /mcp]
   v
 api  ----> postgres (:5432, solo red interna de Compose)
 mcp  ----> api (http://api:3001, solo red interna de Compose)
```

- Solo **Nginx** publica puertos al host (80 y, con HTTPS habilitado, 443; ver
  sección «HTTPS»).
- `web`, `api`, `mcp` y `postgres` **no** publican puertos al host.
- `api` se conecta a PostgreSQL por el nombre de servicio `postgres:5432`.
- El navegador consume la API por el mismo dominio bajo `/api` (lo resuelve
  Nginx), por lo que normalmente **no hace falta CORS** en producción.

Archivos:

- `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/mcp/Dockerfile` —
  multi-stage, Node 24 (`node:24-bookworm-slim`), usuario no-root, sin secretos
  en la imagen.
- `infra/nginx/nginx.conf` — reverse proxy (se monta en
  `/etc/nginx/conf.d/default.conf`).
- `compose.prod.yaml` — orquesta nginx + web + api + mcp + postgres.
- `.env.production.example` — plantilla de variables (copiar a `.env.production`).

El `compose.yaml` de la raíz sigue siendo **solo para desarrollo** y no se toca.

## Variables de producción

Copia la plantilla y completa secretos reales (no la versiones):

```bash
cp .env.production.example .env.production
```

| Variable | Uso |
|----------|-----|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Credenciales de PostgreSQL. |
| `NEXT_PUBLIC_API_BASE_URL` | Pública; por defecto `/api` (mismo dominio vía Nginx). Se incrusta en el build de la web. |
| `CORS_ORIGINS` | Lista separada por comas. Vacío = sin CORS (correcto con `/api`). |
| `HTTP_PORT` | Puerto público del host (80 por defecto). |

`DATABASE_URL` del backend la construye `compose.prod.yaml` como
`postgresql://<user>:<pass>@postgres:5432/<db>`.

## Procedimiento de despliegue (manual)

```bash
# 1. Clonar el repositorio en el servidor
git clone <repo> && cd plantilla-portales

# 2-3. Variables de entorno
cp .env.production.example .env.production
#     editar .env.production y completar los secretos

# 4. Construir imágenes
npm run docker:prod:build
#     equiv: docker compose -f compose.prod.yaml --env-file .env.production build

# 5. Levantar PostgreSQL (y el resto de servicios)
npm run docker:prod:up

# 6. Ejecutar migraciones (paso EXPLÍCITO, no en el arranque)
npm run docker:prod:migrate
#     equiv: docker compose -f compose.prod.yaml --env-file .env.production \
#            run --rm api npm run prisma:migrate:deploy --workspace apps/api

# 7. Los servicios ya están arriba tras el paso 5.

# 8. Validar
curl http://localhost/            # Next.js (redirige a /catalogs)
curl http://localhost/api/health  # NestJS -> { "status": "ok", ... }
# MCP por red (requiere un token de usuario real; ver sección "MCP por red"):
curl -i -X POST http://localhost/mcp/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"c","version":"0"}}}'
#     Sin Authorization => HTTP 401 (correcto). Con "Authorization: Bearer <token>" => 200 + Mcp-Session-Id.
```

Las migraciones usan `prisma migrate deploy` (nunca `migrate dev` en
producción) y **no** se ejecutan automáticamente al arrancar el contenedor: son
un paso explícito y controlado del despliegue.

## Start / stop / logs

```bash
npm run docker:prod:up      # levantar en segundo plano
npm run docker:prod:down    # detener (conserva el volumen de datos)
npm run docker:prod:logs    # seguir logs de todos los servicios
# o directamente:
docker compose -f compose.prod.yaml logs -f
```

No se incluye stack de observabilidad (ELK/Loki/Prometheus/Grafana) todavía;
los logs se consultan con `docker compose logs`.

## Rollback (básico)

1. Vuelve a la revisión/imagen anterior (git checkout de la revisión previa, o
   reusa las imágenes anteriores si las etiquetaste).
2. Reconstruye si hace falta: `npm run docker:prod:build`.
3. Relevanta: `npm run docker:prod:up`.

Precaución con las migraciones: una migración ya aplicada no se revierte sola.
Si una versión nueva añadió migraciones, el rollback de código puede requerir
una migración compensatoria. No se implementa blue/green todavía.

## HTTPS

`infra/nginx/nginx.conf` sirve HTTP (puerto 80) por defecto e incluye un bloque
`server` comentado de ejemplo para HTTPS. Para producción real: terminar TLS en
Nginx con certificados de Let's Encrypt (Certbot), montando los certificados en
el contenedor. **Nunca** versionar llaves privadas ni certificados.

### Procedimiento con Let's Encrypt (webroot + Certbot)

Patrón reutilizable para habilitar HTTPS sin reconstruir imágenes, usando el
contenedor oficial `certbot/certbot` en modo `webroot` y dos volúmenes
compartidos con Nginx (certificados y el directorio del challenge ACME):

1. **Requisito previo:** un **nombre de dominio** que resuelva a la IP pública
   del servidor. Let's Encrypt **no** emite certificados para una IP desnuda.
   Si no hay dominio propio, un servicio tipo `sslip.io`/`nip.io`
   (`<ip>.sslip.io` resuelve a `<ip>`) sirve como nombre válido provisional.
   Conviene además que la IP pública sea **fija** (Elastic IP en AWS) para que
   el certificado y el DNS no se rompan si la instancia se reinicia.

2. **Publicar 80 y 443 y montar los volúmenes.** Un override de Compose
   (p. ej. `compose.https.yaml`) añade al servicio `nginx` los puertos `80:80`
   y `443:443` y los volúmenes `letsencrypt:/etc/letsencrypt` y
   `certbot_www:/var/www/certbot`. Se levanta con los dos ficheros:

   ```bash
   docker compose -f compose.prod.yaml -f compose.https.yaml \
     --env-file .env.production up -d
   ```

3. **Config de Nginx para el challenge + redirección.** El bloque `server` de
   escucha en 80 sirve `location /.well-known/acme-challenge/ { root /var/www/certbot; }`
   (esto **no** debe redirigirse a HTTPS) y redirige el resto a HTTPS con
   `return 301`. El bloque `server` de escucha en 443 (`ssl`) usa
   `ssl_certificate` / `ssl_certificate_key` apuntando a
   `/etc/letsencrypt/live/<dominio>/fullchain.pem` y `privkey.pem`. Como Nginx
   no arranca si referencia un certificado que aún no existe, el primer arranque
   usa una config **bootstrap** solo-HTTP (que ya sirve el challenge) y, tras
   emitir el certificado, se cambia a la config con el bloque 443.

4. **Emitir el certificado** (webroot):

   ```bash
   docker run --rm \
     -v <proyecto>_letsencrypt:/etc/letsencrypt \
     -v <proyecto>_certbot_www:/var/www/certbot \
     certbot/certbot certonly --webroot -w /var/www/certbot \
     -d <dominio> --agree-tos --no-eff-email \
     --register-unsafely-without-email --non-interactive
   ```

   (`--register-unsafely-without-email` evita el registro con correo; usa
   `--email <correo-valido>` si quieres avisos de expiración. Un dominio `.local`
   como correo lo rechaza Let's Encrypt.)

5. **Activar la config HTTPS y recargar.** Copiar la config con el bloque 443 a
   `infra/nginx/nginx.conf` y recargar Nginx. **Ojo:** un `up -d nginx` **no**
   relee la config montada si el servicio no cambió; fuerza la recarga con:

   ```bash
   docker exec <proyecto>-nginx-1 nginx -t     # validar sintaxis
   docker exec <proyecto>-nginx-1 nginx -s reload
   ```

6. **Actualizar `APP_WEB_URL`** en `.env.production` a `https://<dominio>` y
   recrear `api` (es la fuente única de los enlaces de los correos de reset de
   contraseña e invitación).

### Renovación automática del certificado

Los certificados de Let's Encrypt duran 90 días. Automatiza la renovación con un
pequeño script que ejecute `certbot renew` (webroot) y recargue Nginx, lanzado a
diario. En distribuciones **sin cron** (p. ej. Amazon Linux 2023, que no trae
`/etc/cron.d` ni `cronie`) usa un **systemd timer**:

- `renew-cert.sh`: `docker run --rm -v <proyecto>_letsencrypt:/etc/letsencrypt
  -v <proyecto>_certbot_www:/var/www/certbot certbot/certbot renew --webroot -w
  /var/www/certbot --quiet` seguido de `docker exec <proyecto>-nginx-1 nginx -s
  reload`.
- `certbot-renew.service` (`Type=oneshot`, `ExecStart=.../renew-cert.sh`) +
  `certbot-renew.timer` (`OnCalendar` diario, `Persistent=true`), habilitado con
  `systemctl enable --now certbot-renew.timer`.
- Verifica con `certbot renew --dry-run` antes de confiar en el timer.

## MCP por red (`/mcp`)

El servicio `mcp` expone el servidor Model Context Protocol por **HTTP
(Streamable HTTP)** para que el equipo lo use por red sin instalar nada. Nginx
lo publica en `/mcp` (quita el prefijo con la barra final de `proxy_pass`) y
reenvía `Authorization` tal cual al upstream.

- El servicio corre con `MCP_TRANSPORT=http`, `MCP_HTTP_PORT=3002`,
  `MCP_API_BASE_URL=http://api:3001` (red interna de Compose) y
  `MCP_AUTH_MODE=jwt`. **No publica puerto al host**: solo Nginx habla con él.
- **Identidad por persona:** cada petición debe traer
  `Authorization: Bearer <token>`. El MCP reenvía ese token al backend para esa
  sesión; nunca se comparte identidad entre usuarios. Sin `Bearer` válido => 401.
- Para la configuración del cliente Kiro (URL `http://<host>:<HTTP_PORT>/mcp` +
  cabecera `Authorization: Bearer`) y cómo cada persona obtiene su token con
  `POST /api/auth/login`, ver `apps/mcp/README.md` (sección "Transporte HTTP").

Validación de la configuración de Nginx (sintaxis), con el stack levantado:

```bash
docker compose -f compose.prod.yaml --env-file .env.production exec nginx nginx -t
```

> Nota: `nginx -t` solo resuelve los nombres de upstream (`web`, `api`, `mcp`)
> cuando corre dentro de la red de Compose con los servicios arriba; fuera de
> ella fallará por DNS aunque la sintaxis sea correcta.

## Backups

El volumen Docker **NO es un backup**: borrarlo (p. ej. `docker compose down -v`)
destruye los datos. Define una estrategia de backup de PostgreSQL. Ejemplo
manual puntual:

```bash
docker compose -f compose.prod.yaml exec postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup_$(date +%F).sql
```

No se incluyen cronjobs de backup todavía; es responsabilidad del operador
programarlos y almacenar las copias fuera del servidor.

## CI (GitHub Actions)

`.github/workflows/ci.yml` valida en cada push a `main`/`master` y en cada PR:
`npm ci` -> `contracts:generate` + verificación de que los generados estén
sincronizados -> `test:unit` -> `typecheck` -> `build` -> `prisma migrate deploy`
-> instalar Chromium -> `test:e2e`. Usa un service container de PostgreSQL 17
con credenciales exclusivas de CI. Es **solo CI**: no despliega a ningún servidor
(no hay CD automático todavía).
