---
inclusion: always
---

# Reglas transversales del portal

Decisiones ya tomadas que cruzan módulos. Antes de cambiarlas, consulta al
usuario.

## Todo gestionable desde la plataforma

Lo que un administrador pueda querer ajustar (parámetros, umbrales, días de
gracia, textos de ayuda, prompts y modelos de IA, catálogos) vive en la base de
datos y se edita desde la plataforma (Maestras o Administración), no en
constantes del código ni en variables de entorno. El código lleva un valor por
defecto seguro por si el parámetro falta.

- Un parámetro nuevo que crea el seed **no llega solo a producción**: el PR
  debe decirlo y el despliegue lo inserta (ver `70-despliegue.md`).
- Los secretos sí van en variables de entorno o cifrados, nunca en texto plano
  en la BD.

## Alcance de solicitudes

Hay un único alcance de lectura de solicitudes: `RequestScopeService`
(`apps/api/src/modules/request/request-scope.service.ts`). Jefe y líder ven
todas las solicitudes no eliminadas; el integrante, las de sus procesos más las
que creó. No crees otro `where` de alcance: reutiliza ese y añade encima los
filtros propios del caso (estado, proceso del diario, responsable...). Los
filtros solo intersectan el alcance, nunca lo amplían.

## IDs visibles

Solicitud `PRY-0012`, fase `PRY-0012-F2`, tarea `PRY-0012-T07`.

- Los asigna el sistema, son inmutables y no se reutilizan.
- El prefijo vive en una sola constante de la API.
- En la web se muestran con `IdChip` (forma corta donde el proyecto ya está a
  la vista; completa en vistas que mezclan proyectos).
- Toda pantalla, DTO de respuesta o notificación nueva que nombre una
  solicitud, fase o tarea incluye su código.
- Los `:id` de las rutas siguen siendo UUID.

## Sesión y autenticación

- La web se autentica con la cookie `portal_session` (`HttpOnly`,
  `SameSite=Lax`, `Secure` en https). El token nunca se guarda en
  `localStorage`, `sessionStorage` ni en JavaScript.
- Toda escritura (`POST/PUT/PATCH/DELETE`) que llega por cookie exige la
  cabecera `X-Portal-Csrf: 1`; el cliente tipado la añade. Un `fetch` nuevo
  fuera del cliente tipado (SSE, subidas) debe enviar `credentials: 'include'`
  y esa cabecera.
- El MCP, el asistente y los scripts usan `Authorization: Bearer` y no
  necesitan CSRF. No rompas ese camino.
- CORS con credenciales solo para `CORS_ORIGINS`; nunca `*`.
- Las cabeceras de seguridad (CSP, `X-Frame-Options`, HSTS en https) se
  definen en `apps/web/next.config.ts` y en la API. Si añades un origen
  externo (imágenes, scripts, conexiones), actualiza la CSP en el mismo PR.

## Texto en español

Los textos, la documentación y los mensajes de commit van en español con
tildes, en UTF-8 sin BOM.

- En Windows, PowerShell puede corromper las tildes al escribir archivos
  (`Set-Content`, `Out-File`, `>`) o al pasar mensajes a git. Escribe archivos
  con la herramienta de edición o con
  `[IO.File]::WriteAllText(ruta, texto, (New-Object Text.UTF8Encoding $false))`.
- Para commits con tildes, escribe el mensaje en un archivo UTF-8 y usa
  `git commit -F archivo`.
- Antes de commitear, comprueba que no aparezcan secuencias como `Ã`, `â€` o <!-- check-encoding:ignore -->
  `├` en el texto (salvo los caracteres de dibujo de árboles en bloques de
  código). La CI lo verifica con `npm run check:encoding` (`scripts/check-encoding.mjs`) en `docs/`, `e2e/`, `apps/*/src/`, `.kiro/` y los `*.md` de la raíz, y también rechaza un BOM al inicio. Una línea que cita esas secuencias a propósito lleva `check-encoding:ignore` en un comentario.
