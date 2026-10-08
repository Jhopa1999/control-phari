# infra

Infraestructura de despliegue de la plantilla.

- `nginx/nginx.conf` — Nginx como reverse proxy y único punto público de
  producción (`/` → web, `/api/` → api). Se monta en
  `/etc/nginx/conf.d/default.conf` dentro del servicio `nginx` de
  `compose.prod.yaml`.

El orquestador de producción es `compose.prod.yaml` (en la raíz), junto con los
Dockerfiles de `apps/api` y `apps/web`. El procedimiento completo de despliegue
está en `docs/deployment.md`.

No se versionan certificados ni llaves privadas (ver sección HTTPS en
`docs/deployment.md`).
