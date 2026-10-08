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
   v
 api  ----> postgres (:5432, solo red interna de Compose)
```

- Solo **Nginx** publica un puerto al host (80; 443 cuando se configure HTTPS).
- `web`, `api` y `postgres` **no** publican puertos al host.
- `api` se conecta a PostgreSQL por el nombre de servicio `postgres:5432`.
- El navegador consume la API por el mismo dominio bajo `/api` (lo resuelve
  Nginx), por lo que normalmente **no hace falta CORS** en producción.

Archivos:

- `apps/api/Dockerfile`, `apps/web/Dockerfile` — multi-stage, Node 24
  (`node:24-bookworm-slim`), usuario no-root, sin secretos en la imagen.
- `infra/nginx/nginx.conf` — reverse proxy (se monta en
  `/etc/nginx/conf.d/default.conf`).
- `compose.prod.yaml` — orquesta nginx + web + api + postgres.
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
