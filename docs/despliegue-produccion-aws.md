# Instalación de producción en AWS (EC2 "EC2 Vigia")

Registro operativo de la instalación **concreta** de control-phari en AWS. La
guía genérica y reutilizable está en [deployment.md](deployment.md); este
documento recoge los datos y decisiones específicos de **esta** máquina. No es
parte de la plantilla reutilizable.

> Los secretos (contraseñas, `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY`) viven solo
> en `.env.production` del servidor; **no** se documentan aquí ni se versionan.

## Acceso

- **URL pública:** `https://3.22.84.134.sslip.io` (HTTPS con certificado válido
  de Let's Encrypt; HTTP redirige a HTTPS con 301).
- **Acceso interno (red corporativa):** `http://10.1.143.133` (IP privada).
- Usuarios sembrados y contraseña inicial común: ver el seed del backend
  (`apps/api/prisma/seed.ts`); cada persona debe cambiar la contraseña al entrar.

## Infraestructura

| Recurso | Valor |
|---------|-------|
| Cuenta AWS | 481133585213 |
| Región | us-east-2 (Ohio) |
| Instancia EC2 | `i-0879c4806eab55546` ("EC2 Vigia"), t2.xlarge, Amazon Linux 2023 |
| Elastic IP | `3.22.84.134` (`eipalloc-0bd7f3b1ad4883eab`) — IP fija |
| IP privada | `10.1.143.133` |
| Nombre DNS (HTTPS) | `3.22.84.134.sslip.io` (sslip.io resuelve a la IP, sin DNS propio) |
| Volumen raíz | 24 GB gp3 (ampliado desde 8 GB; filesystem xfs) |
| VPC | `vpc-01c7cedbf7ffc4bda` |
| Subred | `subnet-0fbaebb0a7171c1f0` |
| Route table | `rtb-0c8b960449a5e672f` (no main; asociada solo a esta subred) |
| Internet Gateway | `igw-0a5327e3036d12fab` |
| Security Group | `sg-0b5608dadf9ea4c28` (`default`) |

> La instancia comparte host con un proceso nocturno de data lake ajeno al
> portal. Está prácticamente ociosa (CPU/RAM de sobra); el único recurso que fue
> necesario ampliar es el disco.

## Red: cómo se hizo accesible desde internet

La subred es, por diseño, **privada**: su ruta por defecto salía por un NAT
Gateway y hay un Virtual Private Gateway (`vgw-0d4b67917013cc24d`) para la red
corporativa (VPN/Direct Connect). Como la route table de la subred **no es la
main y está asociada solo a esta subred**, cambiar su ruta por defecto no afecta
a otras subredes ni al data lake.

Cambio aplicado: la ruta `0.0.0.0/0` pasó de NAT Gateway a Internet Gateway.

```bash
aws ec2 replace-route --region us-east-2 \
  --route-table-id rtb-0c8b960449a5e672f \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id igw-0a5327e3036d12fab
```

Las rutas específicas a la red corporativa (`172.21.x`, `10.125.x`, `10.100.x`…
vía el VGW) son más específicas que `0.0.0.0/0`, así que se conservan: la
instancia sigue hablando con la red corporativa por la VPN; solo el tráfico
genérico de internet pasó a entrar/salir por el IGW con la Elastic IP.

**Revertir a privado** (si hiciera falta):

```bash
aws ec2 replace-route --region us-east-2 \
  --route-table-id rtb-0c8b960449a5e672f \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id nat-00e70c782319a3713
```

> **Security Group:** el SG `default` permite todo el tráfico entrante desde
> `0.0.0.0/0` (heredado; no se endureció a petición del operador). Endurecerlo a
> solo 80/443 (y SSH restringido) queda como mejora de seguridad pendiente.

## HTTPS

Montado con Let's Encrypt (webroot + `certbot/certbot`) siguiendo el
procedimiento de [deployment.md](deployment.md#procedimiento-con-lets-encrypt-webroot--certbot).
Particularidades de esta instalación:

- Dominio del certificado: `3.22.84.134.sslip.io`.
- Override de Compose `compose.https.yaml` publica 80 y 443 y monta los
  volúmenes `control-phari_letsencrypt` y `control-phari_certbot_www`.
- La config activa `infra/nginx/nginx.conf` es la variante con el bloque 443
  (challenge ACME en 80 sin redirigir + `return 301` del resto a HTTPS).
- **Renovación automática:** systemd timer `certbot-renew.timer` (diario ~03:30
  UTC) → `certbot-renew.service` → `/opt/control-phari/renew-cert.sh`
  (`certbot renew` + `nginx -s reload`). Amazon Linux 2023 no trae cron, por eso
  se usa systemd timer. Comprobado con `certbot renew --dry-run`.

Arrancar **siempre** con HTTPS (los dos ficheros de Compose):

```bash
docker compose -f compose.prod.yaml -f compose.https.yaml \
  --env-file .env.production up -d
```

## Operación sin SSH (AWS SSM)

La instancia se administra por **AWS Systems Manager (Run Command / Session
Manager)**; no se usa SSH. La instancia está registrada en SSM (rol de instancia
`test-session-manager`, con `AmazonSSMManagedInstanceCore` y `AmazonS3FullAccess`).

Notas prácticas aprendidas en esta instalación:

- **El AWS CLI instalado *dentro* de la instancia está roto**
  (`ModuleNotFoundError: dateutil`). No ejecutar `aws` en el servidor. Para
  transferir archivos al servidor: subirlos a un bucket S3 temporal desde una
  máquina con CLI que funcione, generar una **URL prefirmada**
  (`aws s3 presign`) y descargarla con `curl -fsSL` en el servidor.
- El código de la app vive en `/opt/control-phari` (tarball del working tree,
  sin `node_modules`/`.git`/`.agents`).
- Túnel opcional para un admin fuera de la red corporativa (ya no necesario al
  ser público): `aws ssm start-session --target i-0879c4806eab55546
  --region us-east-2 --document-name AWS-StartPortForwardingSession
  --parameters '{"portNumber":["80"],"localPortNumber":["8080"]}'` y abrir
  `http://localhost:8080`. Requiere el Session Manager plugin instalado.

## Base de datos y seed

- PostgreSQL corre como contenedor `control-phari-postgres-1` (no publica puerto
  al host; solo accesible en la red interna de Compose). Credenciales y
  `DATABASE_URL` salen de `.env.production`.
- Migraciones: `docker compose -f compose.prod.yaml -f compose.https.yaml
  --env-file .env.production run --rm api npm run prisma:migrate:deploy
  --workspace apps/api`.
- **Seed:** el seed TypeScript (`tsx`) **no** corre dentro del contenedor de
  producción (runtime minimalista, sin `prisma/`, `src/` ni cliente generado).
  Se sembró con SQL directo vía `psql` en el contenedor postgres (CTEs +
  `ON CONFLICT`, ids con `gen_random_uuid()`, `updated_at = CURRENT_TIMESTAMP`),
  equivalente a `apps/api/prisma/seed.ts`. Los hashes bcrypt de las contraseñas
  se generan con `docker exec control-phari-api-1 node -e
  "require('bcrypt').hash('<pw>',10).then(h=>console.log(h))"`.

## Re-desplegar una versión nueva

1. Reempaquetar el working tree (sin `node_modules`/`.git`/`.agents`) y subirlo
   al servidor (S3 prefirmado + `curl`), extrayendo en `/opt/control-phari`.
2. `docker compose -f compose.prod.yaml -f compose.https.yaml --env-file
   .env.production build` y `… up -d`. Las imágenes **no** se reconstruyen solas.
3. Si cambió el schema: haz antes un respaldo manual
   (`systemctl start control-phari-backup.service`, ver
   [respaldo-restauracion-bd.md](respaldo-restauracion-bd.md)) y corre las
   migraciones (ver arriba).
4. Si cambió la config de Nginx: `docker exec control-phari-nginx-1 nginx -s
   reload` (un `up -d nginx` no relee la config montada si el servicio no cambió).

## Pendientes

- **HTTPS con dominio propio:** cuando exista (p. ej.
  `portal.pharitechservices.com`), apuntar un registro DNS A a `3.22.84.134`,
  reemitir el certificado para ese nombre, cambiar `server_name` en Nginx y
  actualizar `APP_WEB_URL`.
- **Endurecer el Security Group** a solo 80/443 y SSH restringido.
- ~~**Backups de PostgreSQL** programados y almacenados fuera del servidor~~
  **Hecho (BL-004):** respaldo diario a S3 con retención de 30 días. Ver
  [respaldo-restauracion-bd.md](respaldo-restauracion-bd.md). Pendiente dentro de
  eso: alertas si un respaldo falla.
