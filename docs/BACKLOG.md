# Backlog de pendientes

Lista de cosas por desarrollar cuando se decida. Se agregan con "agrega al backlog: ..." y se ejecutan con "toma del backlog BL-XXX".

Estados: `pendiente` | `en curso` | `hecho` | `descartado`
Prioridad: `alta` | `media` | `baja`

## Pendientes

| ID | Título | Prioridad | Estado | Detalle / contexto |
|----|--------|-----------|--------|--------------------|
| BL-015 | Evidencias de tarea en S3: migración, variables y prueba real | alta | pendiente | Integrado en `main` (PR #2). Falta, por ambiente: aplicar la migración `20261029180000_tarea_evidencia` (`prisma migrate deploy`), configurar las variables de S3 (ver `compose.prod.yaml`) y probar subida/descarga contra un S3 real. El CI solo la valida con su base efímera. Acción del usuario / ambiente. |
| BL-002 | Abrir puerto 8080 en firewall y verificar acceso del equipo | alta | pendiente | Portal y MCP en `http://192.168.0.116:8080` (MCP en `/mcp/`, con barra final). Confirmar que los compañeros están en la subred 192.168.0.x. |
| BL-007 | IA Fase 1: módulo IA en Admin + agente de Triage que sugiere | alta | pendiente | Diseño aprobado en `.agents/tasks/ia-fase1-triage/` (requirements.md, design.md). Config en BD editable desde Admin, feature flag on/off, dependencia `@aws-sdk/client-bedrock-runtime` con versión exacta. La IA solo sugiere, no escribe en BD. Cubrir las 5 maestras del triage. **Estado real (verificado 2026-10-29):** ya existe implementación (`apps/api/src/modules/ai/`: config, cifrado, cliente Bedrock, `triage-suggestion`; vista `administracion/ia` y `lib/ai-triage.ts` en el web). Falta contrastarla contra el diseño y cerrar la fila. |
| BL-005 | Upgrade Next.js 16.4.0 → 16.4.3 | media | pendiente | Aviso de vulnerabilidad. La última 16.x publicada es 16.4.3 (verificado 2026-10-29). Hacerlo aparte y de forma controlada: PR propio, `npm run build:web` y E2E en CI. No usar el botón "Upgrade now" del dev server (secuestra `npm run dev:web`). |
| BL-012 | Eliminar las 94 advertencias de lint (carga de datos en `useEffect`) | media | pendiente | `apps/web/eslint.config.mjs` deja como `warn` las reglas del React Compiler (`react-hooks/set-state-in-effect`, `refs`, `preserve-manual-memoization`). Meta: corregirlas y subirlas a `error`. Opciones: Server Components para el primer render, o una capa de caché (SWR/TanStack Query; dependencia nueva, justificar). Hay además 2 `eslint-disable` de `exhaustive-deps` (`compliance-panel.tsx`, `catalogs-view.tsx`). Cambio grande: decidir enfoque antes. |
| BL-013 | Token de sesión de `localStorage` a cookie `httpOnly` | media | pendiente | Hoy `lib/actor-context.tsx` guarda token y usuario en `localStorage`; un XSS podría leerlos. Riesgo bajo hoy (no hay `dangerouslySetInnerHTML`). Cambio en backend (Set-Cookie, CORS con credenciales, CSRF) y en `lib/api-client.ts`. Decisión de diseño previa. |
| BL-018 | Documentar/permitir correr los E2E en local sin tocar la BD de desarrollo | media | pendiente | Los E2E asumen `AUTH_MODE=dev-header`, el seed (`jefe@`, `lider@`, `integrante@demo.local`) y los puertos 3000/3001; en local chocan con `.env.local` en modo `jwt` y con la BD compartida (5433). Hoy solo se validan de forma fiable en CI. Idea: script con Postgres desechable y puertos distintos. |
| BL-003 | CD automático (Fase C parte 2) | media | pendiente | Bloqueado por decisión: falta destino y disparador del CD (no hay host definido). |
| BL-004 | Runbook de backup de BD (Fase C parte 2) | media | pendiente | Bloqueado por decisión: definir dónde se guardan los backups y la retención. |
| BL-008 | IA Fase 2: más agentes (redactar requerimiento, resumir estado, sugerir tareas) | media | pendiente | Reutiliza el módulo de BL-007. |
| BL-009 | IA Fase 3: base de conocimiento tipo Obsidian | media | pendiente | Markdown + enlaces `[[dobles]]` + búsqueda, gestionable desde la plataforma. |
| BL-014 | Dividir las vistas más grandes del frontend | baja | pendiente | Ya extraídos `PlanSummary` y `PlanGuidePanel` (PR #1 y #3). Siguiente: `renderPhases`/`renderTasks` de `plan-view.tsx` (~1410 líneas, ~30 `useState`), `triage-view.tsx` (~886), `documentos-view.tsx` (~808), `capacidad-view.tsx` (~789), `bitacora-view.tsx` (~689). Hacerlo con el E2E `plan-inline-status` como red de seguridad y sin cambios de comportamiento. |
| BL-006 | Corregir mojibake en `docs/aplicacion/changelog.json` | baja | pendiente | Caracteres corruptos heredados de sesiones previas (12 apariciones de `Ã`/`â€`/`Â` al leer como UTF-8, verificado 2026-10-29). Arreglo aparte; revisar que el hook `actualizar-docs-aplicacion` no los reintroduzca. |
| BL-010 | IA Fase 4: conectar la base de conocimiento como contexto de agentes (RAG) | baja | pendiente | Depende de BL-007 y BL-009. |
| BL-011 | Ampliar matcher del hook `actualizar-docs-aplicacion` a `apps/mcp` | baja | pendiente | Hoy no cubre cambios del MCP, así que la documentación no se actualiza al editarlo. Verificado 2026-10-29 en `.kiro/hooks/actualizar-docs-aplicacion.json`. |
| BL-016 | CI: acciones con Node 20 deprecado y migración de `ubuntu-latest` | baja | pendiente | El CI avisa que `actions/checkout@v4`, `setup-node@v4` y `upload-artifact@v4` apuntan a Node 20 y corren forzadas en Node 24; `ubuntu-latest` migra a Ubuntu 26. Revisar versiones en `.github/workflows/ci.yml`. |
| BL-017 | Cabeceras de seguridad HTTP (CSP, X-Frame-Options, etc.) | baja | pendiente | `apps/web/next.config.ts` no las define. Verificar si Nginx ya las sirve en producción; si no, agregarlas donde corresponda. |
| BL-019 | Pruebas de unidad para módulos de `apps/web/src/lib` que hoy no se pueden cargar en Node | baja | pendiente | `plan-phases`, `task-dependencies` y `priority` importan `api-client`, que crea el cliente HTTP al cargarse y lanza sin `NEXT_PUBLIC_API_BASE_URL`; por eso no están en `e2e/web-lib.spec.ts`. Su lógica es sobre todo mapear códigos HTTP a mensajes. |

## Hechos / descartados

| ID | Título | Estado | Fecha | Nota |
|----|--------|--------|-------|------|
| - | Fases A–E de calidad, Kanban de tareas y MCP por HTTP | hecho | 2026-10 | Integrados en main y desplegados en el stack prod. |
| BL-001 | Crear PR de `feature/mejoras-fases-abcde-kanban` | hecho | 2026-10-29 | Obsoleto: la rama ya es ancestro de `main` (0 commits por delante, verificado). Rama remota eliminada. |
| - | ESLint en el web + paso de lint en CI, carga diferida de Markdown, `PlanSummary` | hecho | 2026-10-29 | PR #1. |
| - | CI en verde: seed antes de los E2E, reporter `github` y specs obsoletos corregidos | hecho | 2026-10-29 | PR #1. `main` estaba en rojo desde la corrida #2; vuelve a verde en la #12. |
| - | Evidencias de tarea en S3, panel lateral de tarea, avance y alertas en portafolio | hecho | 2026-10-29 | PR #2 (queda BL-015 por ambiente). |
| - | Extraer `PlanGuidePanel` de `plan-view.tsx` | hecho | 2026-10-29 | PR #3. |
| - | GitHub CLI (`gh`) instalado y autenticado | hecho | 2026-10-29 | Permite abrir PRs y leer logs del CI desde la terminal. |
