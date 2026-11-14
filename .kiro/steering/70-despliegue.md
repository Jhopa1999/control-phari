---
inclusion: auto
name: Despliegue a producción y al stack por red
description: Reglas para desplegar control-phari al stack Docker por red (192.168.0.116:8080) y a producción (EC2 en AWS), con respaldo, ensayo de migraciones, verificación y rollback. Aplicar cuando el usuario pida desplegar, cuando se prepare un PR que añada variables de entorno, migraciones o parámetros del seed, o al revertir un despliegue.
---

# Despliegue

Procedimiento detallado y scripts: `docs/despliegue/README.md` y
`scripts/deploy/`.

## Cuándo

- Solo cuando el usuario lo pide. Producción tiene datos reales del equipo.
- Orden: primero el stack por red (reversible), después producción.
- Si el despliegue obliga a algo visible para el equipo (volver a iniciar
  sesión, una regla nueva que rechaza datos), díselo al usuario antes.

## Lo que un PR debe dejar listo para desplegar

- **Variables de entorno nuevas:** con valor por defecto seguro en
  `compose.prod.yaml` (`${VAR:-valor}`) que funcione en https (producción) y en
  http (stack por red) sin editar `.env.production` del servidor. Documéntalas
  en `.env.production.example`.
- **Migraciones:** nuevas, nunca editando una aplicada. Si rellenan datos, el
  PR incluye una consulta de verificación (sin nulos ni duplicados) que el
  despliegue ejecuta sobre la copia y sobre la BD real.
- **Parámetros del seed:** el seed no corre en producción. Si el PR añade un
  `catalog_items` u otro dato base, el PR lo dice y el despliegue lo inserta
  con `INSERT ... ON CONFLICT DO NOTHING`.
- **Archivos solo-servidor** (`.env.production`, `compose.https.yaml`,
  `renew-cert.sh`, `infra/nginx/nginx.conf` HTTPS): no llegan con el código.
  Si un cambio necesita tocar el nginx de producción, dilo en el PR.

## Pasos obligatorios en producción

1. Preflight de solo lectura: migraciones aplicadas y conteos.
2. Respaldo gestionado (`control-phari-backup.service`, exigir `RESPALDO_OK`)
   y `pg_dump` validado (cabecera `PGDMP`).
3. Etiquetar las imágenes actuales `:prev-<TS>` y conservar la carpeta de código
   anterior.
4. Ensayar las migraciones sobre una copia de la BD (`ensayo_migracion`); si
   falla o la verificación no da 0, abortar sin tocar la BD real.
5. Migración real, recrear servicios, `nginx -t` y recarga.
6. Verificar solo con `GET` (nunca crear datos de prueba en producción) y
   comparar conteos. Una diferencia se investiga en `audit_events` antes de
   darla por buena: el equipo trabaja a cualquier hora.
7. Borrar el paquete temporal de S3 y los archivos locales con URL prefirmada.

## Rollback

Imágenes `:prev-<TS>` y carpeta `/opt/control-phari.prev-<TS>`. Si el
despliegue trajo una migración que el código anterior no entiende, revertir el
código obliga a revertir también la BD con el dump previo: no restaures un dump
sin hablarlo con el usuario, porque se pierden las escrituras posteriores.
