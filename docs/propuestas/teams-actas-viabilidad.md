# Informe de viabilidad: agente de actas para reuniones de Microsoft Teams

Estado: investigación de solo lectura sobre `main` (b5dc5ac). No se modificó código, base de datos, producción ni nube.
Convención de evidencia en todo el informe:

- **[DOC]** verificado en documentación oficial (con URL), consultada durante esta investigación.
- **[REPO]** verificado en el repositorio (`archivo:línea`).
- **[SUPUESTO]** no verificado: conocimiento general o inferencia. Debe confirmarse antes de decidir.
- **[NO PUDE CONFIRMAR]** intenté verificarlo y la fuente no estuvo disponible desde el entorno.

---

## 1. Resumen ejecutivo

1. **Veredicto: viable, pero no como «un agente que escucha la llamada».** El camino sensato es leer la **transcripción nativa de Teams** y procesarla con el agente ACTAS que ya existe. No hace falta un bot que se una a la reunión.
2. Teams genera la transcripción y Microsoft Graph la entrega por API con hablante identificado (VTT con `<v Nombre>`) [DOC]. La plataforma ya sabe convertir texto en acta, decisiones y compromisos con responsable y fecha, con revisión humana [REPO].
3. El **bot de medios en tiempo real** exige Windows Server en Azure, .NET y una plataforma en estado «developer preview» [DOC]. Es XL, rompe la arquitectura (monolito en AWS) y no aporta nada que la transcripción nativa no dé. **No se recomienda.**
4. **Recomendación: tres fases.** Fase 1 (MVP, sin tocar el tenant): la persona sube el `.vtt` o `.txt` de la transcripción al acta y la IA la estructura (esfuerzo M). Fase 2: lectura automática por Graph con consulta periódica (L). Fase 3: avisos por webhook (opcional).
5. **Costo de IA bajo:** unos USD 1–2 al mes con 30 reuniones de 45 min, unos USD 12 con 100 reuniones de 90 min (supuestos en §8). Entra holgado en el presupuesto de IA existente de USD 100 [REPO].
6. **El riesgo real no es técnico.** Depende de lo que el cliente controle: que Teams tenga la transcripción habilitada por política, que un administrador de Entra ID dé consentimiento a una aplicación y cree una *application access policy*, y que se acepte el tratamiento de datos personales (voz/palabras de todos los asistentes) bajo la Ley 1581 de 2012.
7. **Bloqueo de partida:** si el tenant no tiene Microsoft 365 con Teams y transcripción habilitada, solo queda la Fase 1 con otra fuente (audio + Amazon Transcribe) o nada. Las 14 preguntas del §10 deciden esto en una reunión de 30 minutos.
8. **Prueba de concepto (§13):** 1–2 días, una reunión real de prueba, éxito medible (transcripción leída por Graph, ≥80 % de compromisos correctos, tiempo de la persona menor a 5 min).
9. Cambios de repo estimados: 1 migración aditiva, 2–3 módulos nuevos en `apps/api`, tools MCP de lectura, 1 pantalla/sección en el acta y documentación (§6). Sin componente aparte para las Fases 1–3.

---

## 2. Alcance de lo verificado y límites de esta investigación

- Pude leer: código y docs del repo; documentación de Microsoft Learn (transcripciones, notificaciones de cambio, política de acceso de aplicaciones, bots de medios, AI insights, política de transcripción) y AWS (Bedrock, Transcribe).
- **[NO PUDE CONFIRMAR]:** precios actuales de Recall.ai (el dominio no resolvió desde el entorno); texto vigente de la Ley 1581 en `secretariasenado.gov.co` (tiempo de espera agotado); precio por minuto de Amazon Transcribe en lote (la página lo carga dinámicamente); precio de Claude Haiku 4.5 en la página de AWS (también dinámico; uso el precio sembrado en el repo, §8); costo de una VM Windows en Azure.
- **Fecha en la documentación:** las páginas de Graph mencionan controles de administrador que «entran en vigor a finales de julio de 2026» [DOC]. Dado que los archivos del repo tienen fechas de noviembre de 2026, asumo que ya rigen.

---

## 3. Lo verificado en el repo (estado actual)

| Hecho | Evidencia |
|---|---|
| Endpoint de estructuración de actas con IA recibe texto y devuelve agenda, decisiones, observaciones y compromisos propuestos; la persona los revisa | `apps/api/src/modules/coordination/meeting/meeting-ai.service.ts:101` (`structure`) |
| Límite de entrada 12000 caracteres (HTTP 413 si se supera) | `meeting/dto/meeting-ai.dto.ts:19`; uso en `meeting-ai.service.ts:109-113` |
| Doble interruptor (global y por agente `ACTAS`) y presupuesto mensual antes de invocar | `meeting-ai.service.ts:116-124` |
| Contexto al modelo: personas del proceso con alias numérico, nombre y si participó; sin ids ni correos | `meeting-ai.service.ts:126-140` |
| Prompt = base editable en BD + contrato de salida fijo en código + contexto | `meeting-ai.service.ts:142-147`; `ai/ai-defaults.ts` (`MEETINGS_BASE_PROMPT`, `MEETINGS_OUTPUT_CONTRACT`, línea ~116) |
| Llamada a Bedrock Converse con región, modelo, `maxTokens` y `timeoutMs` leídos de BD; registro de consumo sin contenido | `meeting-ai.service.ts:167-184`; `schema.prisma:1283-1301` (`AiAgentConfig`, región por defecto `us-east-2` en `:1288`) |
| El agente ACTAS nace apagado, `maxTokens` 4096, timeout 45 s, modelo por defecto Haiku | `ai/ai-defaults.ts:209-219`; `ai-defaults.ts:96` (`MEETINGS_AGENT_CODE = 'ACTAS'`) |
| Tope de 20 compromisos por llamada; fechas válidas solo en una ventana; responsable resuelto por alias, si no, texto libre | `meeting-ai.service.ts:45, 233-265, 284-292` |
| Consumo: tabla `ai_usage` con tokens y costo, sin contenido; presupuesto mensual USD 100 y alerta 80 % | `schema.prisma:1434-1454`; migración `20261101180000_ai_consumo_presupuesto` (precio Haiku 4.5: USD 1 entrada / USD 5 salida por millón de tokens) |
| Acta: `Meeting` (proceso, estado, fecha, `meetingTime` texto, duración, agenda, decisiones, notas, responsable), sin campos de origen externo | `schema.prisma:906-936` |
| Participantes: puente `MeetingParticipant(meetingId, userId)` | `schema.prisma:939-951` |
| Compromiso con `sourceMeetingId`, responsable, asignado, vencimiento obligatorio | `schema.prisma:956-976` |
| `User` solo tiene `identifier`, `name`, `active`, `passwordHash`, `isAdmin`; **no hay campo de correo ni UPN** | `schema.prisma:130-149`; `docs/aplicacion/modelo-datos.md:45` |
| Autenticación propia usuario/contraseña; el restablecimiento por correo busca por `identifier` | `auth/auth-login.service.ts:47`; `docs/aplicacion/autenticacion-autorizacion.md:124-135` |
| SSO/OIDC pospuesto (D20) | `docs/plan-mejora/README.md:94, 110` |
| Cifrado AES-256-GCM de secretos con `SETTINGS_ENCRYPTION_KEY`, reutilizado por IA para las claves de acceso a AWS | `ai/ai-crypto.ts:3-5`; `system-settings/settings-crypto` |
| Planificador de tareas dentro del monolito (`@nestjs/schedule`) | `app.module.ts:38`; `coordination/commitment/commitment-notice.scheduler.ts` |
| Cliente S3 ya existe para evidencias | `storage/storage.service.ts:41` |
| El asistente ya acepta adjuntos (PDF, Word, TXT, audio con Transcribe es-US según el backlog) | `assistant/assistant-attachments.ts:57`; `docs/BACKLOG.md` BL-032 |
| MCP: tools de reuniones `meeting.list/get/create/update/close/reopen` | `apps/mcp/src/tools/specs/lectura.ts:249-254`, `escritura.ts:42-58` |

**Observación sobre la identidad:** no hay correo almacenado. Cruzar participantes de Teams (UPN/correo) con usuarios del portal exige un dato nuevo (§6). **[SUPUESTO]** que el `identifier` suele ser el correo corporativo; no lo pude comprobar sin datos de producción (no se tocó BD). Es la pregunta 12 del §10.

---

## 4. Lo verificado en documentación oficial

### 4.1 Transcripción nativa de Teams por Microsoft Graph

- **Obtener una transcripción** (`GET .../transcripts/{id}` y `/content`). Permisos: delegado `OnlineMeetingTranscript.Read.All`; de aplicación `OnlineMeetingTranscript.Read.All` y `OnlineMeetingTranscript.Read.Chat` (RSC, solo reuniones privadas programadas, **no** reuniones de canal). Con permiso de aplicación el administrador debe crear una *application access policy* y concederla al usuario. La API solo funciona si la reunión no ha expirado. https://learn.microsoft.com/en-us/graph/api/calltranscript-get?view=graph-rest-1.0 [DOC]
- **Formatos:** `text/vtt` (con marcas de tiempo y etiqueta de hablante `<v Nombre>`) y `application/vnd.microsoft.graph.transcript+text` (sin hablante). El administrador del tenant tiene dos controles independientes: «acceso por Graph a transcripciones» (si está apagado, todo devuelve 403 `GraphAccessToTranscriptsDisabled`) y «atribución de hablante» (si está apagada, el VTT con hablante devuelve 403 `SpeakerAttributionNotAllowed`). Mismo enlace. [DOC]
- **Listar todas por organizador** (`getAllTranscripts`, solo permiso de aplicación `OnlineMeetingTranscript.Read.All`, requiere `meetingOrganizerUserId`, admite `delta` para sincronización incremental, **no soporta reuniones de canal**): `GET /users/{id}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{id}',startDateTime=...,endDateTime=...)`. https://learn.microsoft.com/en-us/graph/api/onlinemeeting-getalltranscripts?view=graph-rest-1.0 [DOC]
- **Notificaciones de cambio (webhook):** se puede suscribir a `communications/onlineMeetings/getAllTranscripts` (todo el tenant) con permiso de aplicación `OnlineMeetingTranscript.Read.All`; no soporta reuniones de canal privado. Con vencimiento mayor a 1 hora se exige `lifecycleNotificationUrl`. Con `includeResourceData` hay que aportar certificado de cifrado. Un administrador puede impedir la creación/renovación de suscripciones a transcripciones. https://learn.microsoft.com/en-us/graph/teams-changenotifications-callrecording-and-calltranscript [DOC]
- **Application access policy:** se crea con `New-CsApplicationAccessPolicy` (con los AppIds) y se concede a usuarios con `Grant-CsApplicationAccessPolicy`; los cambios tardan **hasta 30 minutos** en aplicar. https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy [DOC]
- **Política de transcripción:** es por organizador y por usuario; para que una reunión tenga transcripción el organizador debe tenerla habilitada y quien la inicia también. Está activa por defecto en políticas nuevas. Si el organizador apaga Copilot en reuniones de Teams, se apagan también grabación y transcripción. https://learn.microsoft.com/en-us/microsoftteams/meeting-transcription-captions [DOC]
- **Idiomas:** la lista de idiomas de transcripción incluye español de México y de España; **no pude comprobar si incluye español de Colombia** en el texto consultado. Se valida en la PoC. [DOC parcial]
- **Licencias:** la página de transcripción marca como Teams Premium únicamente la *transcripción traducida en vivo* (el organizador necesita Teams Premium para que los asistentes la usen). No encontré en lo consultado un requisito de Teams Premium para transcribir ni para leer la transcripción por Graph. Es la lectura de la documentación, no una garantía del contrato de licencias del cliente: la pregunta 3 del §10 debe confirmarlo. [DOC, con reserva]
- **Costo del API:** Microsoft distingue APIs incluidas en la licencia y APIs medidas (con cobro por uso). https://learn.microsoft.com/en-us/graph/metered-api-overview. En lo consultado no vi las transcripciones listadas como medidas, pero **no revisé la lista completa**. Se confirma en la PoC. [NO PUDE CONFIRMAR]
- **Almacenamiento y grabación:** las grabaciones van al OneDrive del organizador (reunión privada) o a SharePoint (canal); aplica Purview. Una organización externa puede grabar por cumplimiento y los organizadores son notificados. https://learn.microsoft.com/en-us/microsoftteams/cloud-recording [DOC]

### 4.2 Copilot / resumen inteligente

- La API de **AI insights de reuniones** exige que **todos los usuarios de las aplicaciones** tengan licencia de Microsoft 365 Copilot. https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/ai-services/meeting-insights/onlinemeeting-list-aiinsights [DOC]
- El «resumen inteligente» (*Intelligent Meeting Recap*, incluidas «notas y tareas generadas por IA») figura como función de Teams Premium en la tabla de licencias. https://learn.microsoft.com/en-us/microsoftteams/premium-licensing [DOC]. **[NO PUDE CONFIRMAR]** la página específica del resumen; trato el requisito de Copilot/Premium como obligatorio hasta que el cliente diga lo contrario.

### 4.3 Bot de medios en tiempo real

- Un bot con medios alojados por la aplicación requiere la biblioteca .NET `Microsoft.Graph.Communications.Calls.Media`; en producción debe desplegarse en **Windows Server en Azure**; la plataforma de medios en tiempo real aparece «en developer preview». https://learn.microsoft.com/en-us/microsoftteams/platform/bots/calls-and-meetings/requirements-considerations-application-hosted-media-bots [DOC]
- Los permisos exactos de llamadas (p. ej. `Calls.JoinGroupCall.All`, `Calls.AccessMedia.All`), el registro del Azure Bot y los requisitos de red **no los verifiqué** en esta sesión. [SUPUESTO]

### 4.4 AWS

- Bedrock: los proveedores de modelos no tienen acceso a los registros de Bedrock ni a prompts y respuestas de los clientes (modelo de «cuentas de despliegue de modelos» operadas por el servicio). https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html [DOC]. La afirmación de que AWS tampoco usa los datos para entrenar sus propios modelos figura en el *Data Privacy FAQ* (https://aws.amazon.com/compliance/data-privacy-faq/), que **no abrí**: [NO PUDE CONFIRMAR]; debe citarse desde esa fuente en la política interna.
- Bedrock indica que el cliente no debe poner datos sensibles en etiquetas ni campos de nombre (se usan en facturación y diagnóstico). Mismo enlace de protección de datos. [DOC]
- Amazon Transcribe se factura por segundo, con precios escalonados por región; la página usa ejemplos de USD 0,03/min (Call Analytics, nivel 1) y USD 0,01/min (streaming) como ilustración. El precio de lote estándar (el que se usaría) no se pudo leer. https://aws.amazon.com/transcribe/pricing/ [DOC parcial]

### 4.5 Ley 1581 de 2012 (Colombia)

- Texto: https://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html. **[NO PUDE CONFIRMAR]** su contenido desde el entorno (tiempo de espera). Lo siguiente es conocimiento general **[SUPUESTO]** que un asesor jurídico debe validar: principios de finalidad, libertad (autorización previa), transparencia y seguridad (art. 4); autorización del titular (art. 9) e información previa sobre la finalidad (art. 12); prohibición de transferir datos a países sin nivel adecuado de protección, salvo autorización expresa del titular y otras excepciones (art. 26). Aplica el registro ante la SIC si corresponde (https://www.sic.gov.co/tema/proteccion-de-datos-personales).

---

## 5. Comparación de opciones

Costos en USD/mes con supuestos del §8. «Costo de IA» (Bedrock) es común a todas y no se repite.

| Opción | Viabilidad | Esfuerzo | Costo recurrente (adicional a la IA) | Licencias y tenant | Riesgo principal | Encaje con arquitectura y reglas |
|---|---|---|---|---|---|---|
| **e) Subir transcripción (.vtt/.txt) o audio** | Alta. No depende del tenant | **S–M** (solo VTT/TXT: S; con audio y Transcribe: M) | VTT/TXT: USD 0. Audio: minutos × precio de Transcribe (precio por confirmar; 1.350 min/mes en el caso base) | Ninguna adicional. La persona descarga la transcripción desde Teams **[SUPUESTO]** que Teams permite descargar `.vtt`/`.docx` | Depende de que la persona suba el archivo; calidad del VTT | Excelente: monolito, sin credenciales nuevas, reutiliza ACTAS y el patrón de adjuntos |
| **a) Transcripción nativa por Graph** | Alta si el cliente cumple los prerrequisitos | **L** (consulta periódica); L+ con webhook | USD 0 en Graph en lo consultado (confirmar medición) | Microsoft 365 con Teams; transcripción habilitada; consentimiento de administrador; *application access policy* | Prerrequisitos del tenant, privacidad, reuniones de canal no soportadas por `getAllTranscripts` | Muy buena: cabe en el monolito (planificador `@nestjs/schedule`); secreto cifrado como el SMTP/IA |
| **b) Copilot / AI insights** | Media: depende de licencias | **M** | Licencia Copilot por usuario (precio no consultado) | Microsoft 365 Copilot para todos los usuarios de la aplicación; Teams Premium para recap | Costo por usuario alto; caja negra; no estructura según nuestro contrato (responsables del proceso) | Aceptable técnicamente, pero duplica lo que ya hace ACTAS y rompe «reglas de negocio en el backend» |
| **c) Bot de medios en tiempo real** | Baja para este equipo | **XL** | Máquina Windows en Azure + Azure Bot + audio a Transcribe/STT (no consultados) | Registro de bot, permisos de llamadas, políticas de cumplimiento | Developer preview; Windows/.NET/Azure fuera del stack; complejidad operativa; aviso de grabación | Malo: segundo runtime y segunda nube; contradice «no introducir infraestructura sin necesidad demostrada» |
| **d) Tercero que se une como bot (p. ej. Recall.ai)** | Media | **M** | **[NO PUDE CONFIRMAR]** el precio. Suele cobrarse por hora de grabación **[SUPUESTO]** | Ninguna del tenant en el caso típico, pero el bot entra como participante visible | Datos de reuniones salen a un tercero; sin precio verificado; dependencia de proveedor | Regular: una API externa más. Útil solo si el tenant bloquea las transcripciones (a)/(e) |

Conclusión de la tabla: **e → a** en ese orden. b, c y d se descartan salvo las condiciones del §12.

---

## 6. Arquitectura recomendada

### 6.1 Diagrama (texto)

```text
 Teams (organizador crea la reunión)                 Portal control-phari (EC2 AWS, monolito)
 ┌──────────────────────────┐                        ┌────────────────────────────────────────────┐
 │ Reunión programada       │                        │ apps/web  — acta: «Importar de Teams»,     │
 │  transcripción ON        │                        │            borrador, revisar y aceptar     │
 │  joinWebUrl              │                        │                  │                         │
 └──────────┬───────────────┘                        │ apps/api                                    │
            │ al terminar                            │  ┌─ meeting (ya existe)                    │
            ▼                                        │  ├─ meeting-ai  (ya existe: structure)     │
 Microsoft Graph                                     │  ├─ teams-integration (NUEVO)              │
  getAllTranscripts/delta ◄── consulta cada N min ───┤  │    · cliente Graph (token de aplicación)│
  /transcripts/{id}/content (VTT) ──────────────────►│  │    · parser VTT                          │
  [Fase 3: webhook → POST /teams/notifications] ────►│  │    · vínculo reunión ↔ acta              │
            ▲                                        │  ├─ meeting-transcript (NUEVO)             │
            │ OAuth2 client credentials              │  │    · texto, retención, acceso            │
 Entra ID (app registrada, consentimiento admin)     │  └─ ai (Bedrock Haiku 4.5, ACTAS)          │
                                                     │ PostgreSQL (Meeting*, MeetingTranscript…)  │
 Persona (Fase 1): sube .vtt/.txt ──────────────────►│ MCP (apps/mcp): lectura, sin lógica nueva  │
                                                     └────────────────────────────────────────────┘
```

**No requiere componente aparte** en las Fases 1–3: el planificador de NestJS ya existe [REPO], el volumen es de decenas de reuniones al mes y la IA es una llamada HTTP a Bedrock. Un *worker* separado solo se justificaría si el volumen creciera a cientos de reuniones diarias (hoy no hay evidencia de eso).

### 6.2 Flujo de punta a punta

1. **Programar/vincular.** La persona crea el acta (ya existe) y pega el enlace de la reunión de Teams (`joinWebUrl`) o, en Fase 2, elige la reunión de una lista de las suyas. El acta guarda `teamsJoinUrl`.
2. **Transcribir.** Teams transcribe si el organizador lo activó. Fase 1: la persona descarga la transcripción y la sube. Fase 2: el portal la lee por Graph.
3. **Aviso.** Fase 1: no aplica. Fase 2: la consulta periódica detecta transcripciones nuevas de los organizadores configurados. Fase 3: webhook de Graph. En ambos casos se crea una notificación interna al responsable del acta (ya hay sistema de notificaciones [REPO]).
4. **Procesar.** El backend limpia el VTT (agrupa turnos por hablante, quita marcas), aplica fragmentación si es largo (§7) y llama a ACTAS.
5. **Borrador para revisión humana.** El acta queda en `BORRADOR` con agenda, decisiones y observaciones propuestas, y los compromisos propuestos aparte, como hoy.
6. **Aceptar.** La persona revisa, edita y acepta los compromisos (el flujo actual); solo entonces se crean `Commitment`. La IA nunca escribe sola (regla de BL-032 [REPO]).

### 6.3 Mapeo de personas

- Fuente en Graph: el VTT trae el **nombre visible** del hablante; los metadatos de la reunión traen el organizador por id de Entra. **[SUPUESTO]** que los participantes completos se obtienen de la reunión o del registro de asistencia; se valida en la PoC.
- Estrategia: (1) emparejar organizador y asistentes por UPN/correo con el usuario del portal; (2) si no hay correo, por nombre normalizado (sin tildes, mayúsculas) contra las personas del proceso; (3) lo no resuelto se deja como texto de responsable y la persona lo asigna. Es lo que ACTAS ya hace con `assigneeText` [REPO `meeting-ai.service.ts:261`]. **No se inventa un responsable.**
- El nombre del hablante en el texto que va al modelo se sustituye por el **alias numérico** ya usado por ACTAS, para no enviar nombres que no hagan falta cuando el emparejamiento es seguro. Decisión de producto abierta (§11).

### 6.4 Cambios concretos en el repo (sin implementarlos)

**Modelo de datos** (migración aditiva, una sola, `apps/api/prisma/migrations/<fecha>_teams_actas`):

- `Meeting`: `teamsJoinUrl String?`, `teamsOnlineMeetingId String?`, `source String @default("MANUAL")` (`MANUAL`, `TEAMS_UPLOAD`, `TEAMS_GRAPH`), índice único parcial sobre `teamsOnlineMeetingId`.
- `User`: `email String?` único, o tabla `UserExternalIdentity(userId, provider='ENTRA', upn)`. Recomendación: **campo `email` opcional en `User`**, más simple; lo edita el jefe de área. Hoy no existe [REPO `schema.prisma:130-149`].
- `MeetingTranscript` (nueva): `id`, `meetingId`, `source`, `graphTranscriptId?`, `language?`, `text @db.Text`, `charCount`, `status` (`RECIBIDA`, `PROCESADA`, `ERROR`), `createdAt`, `purgeAfter`, `createdByUserId?`. Sin eliminarla del acta hasta el vencimiento.
- `TeamsIntegrationConfig` (nueva, una fila, como `AiGlobalConfig`/`SmtpConfig`): `enabled`, `tenantId`, `clientId`, `clientSecretCipher` (cifrado con `encryptSecret`, igual que la clave AWS de IA [REPO `ai-crypto.ts:3-5`]), `organizerUpns` o relación a usuarios, `pollMinutes`, `retentionDays`, `lastDeltaToken`, `updatedBy`.
- `AiAgentConfig`: no cambia. Se reutiliza `ACTAS`. Si se quiere un modelo/prompt distinto para transcripciones largas, se añade un agente `ACTAS_TRANSCRIPCION` sembrado apagado (patrón de `ai-defaults.ts:180-220`); el seed no llega solo a producción y debe indicarse en el PR (regla `15-reglas-transversales`).

**API (`apps/api`)**:

- `POST /meetings/:id/transcript` (subir texto/VTT; valida tamaño y tipo; Fase 1).
- `POST /meetings/:id/transcript/structure` (procesa la transcripción con fragmentación; devuelve la misma forma que `structure`; reutiliza validación de alias/fechas/20 compromisos del servicio existente).
- `GET /meetings/:id/transcript` (solo roles autorizados, §9).
- `DELETE /meetings/:id/transcript` (borrado anticipado, destructivo).
- Módulo `teams-integration`: `GET/PUT /admin/teams-integration` (config), `POST /admin/teams-integration/test` (verifica token y acceso), servicio de consulta periódica y, en Fase 3, `POST /teams/notifications` público para el *handshake* de validación y las notificaciones (valida `clientState`).
- Todo con `@ApiOperation`/`@ApiProperty` y `npm run contracts:generate` (regla `55-sincronia-api-mcp-docs`).

**MCP (`apps/mcp`)**: tools de **lectura** para el estado de la transcripción (`meeting.transcript.status`, con texto solo si el actor tiene permiso). Las de escritura (importar, procesar) solo si se decide; si no, se agregan a `exclusions.ts` con motivo. El MCP no implementa lógica propia (`.kiro/steering/50-mcp.md`).

**Web (`apps/web`)**: en el acta, sección «Transcripción de Teams»: enlace de la reunión, botón «Subir transcripción», estado, botón de estrella «Generar acta desde transcripción» (reutiliza el panel de propuesta actual), aviso de privacidad visible y botón «Borrar transcripción». En Administración: pantalla «Integración con Teams» (estado, prueba de conexión, retención). La vista nueva se especifica antes con el agente `disenador` (regla `00-estandar-portales`).

**Documentación**: `modulos-backend.md`, `modelo-datos.md`, `frontend-pantallas.md`, `autenticacion-autorizacion.md` (permisos sobre transcripción), `changelog.json`, `apps/mcp/README.md`, y un documento de privacidad (§9).

**Credenciales:** el secreto del cliente de Entra va **cifrado en BD** (como SMTP y las claves de IA), no en variables de entorno ni en Git. Solo `SETTINGS_ENCRYPTION_KEY` sigue en el entorno. Regla `15-reglas-transversales`: lo que el administrador ajusta (retención, intervalo, organizadores, umbral de longitud, prompt) vive en BD y se edita desde la plataforma, con valores por defecto seguros en código.

---

## 7. Transcripciones largas: estrategia y costo en tokens

**Problema.** El límite actual es 12000 caracteres [REPO `meeting-ai.dto.ts:19`]. Una reunión de 45 min produce unos 35.000 caracteres de texto limpio **[SUPUESTO]**: ~130 palabras por minuto × 6 caracteres por palabra (español, con espacios). Una de 90 min, unos 70.000. El VTT añade marcas de tiempo (hasta +30 %), que se eliminan antes de enviar.

**Propuesta (no cambiar el límite de 12000 del endpoint actual; añadir un camino aparte):**

1. **Limpieza determinista** (sin IA): quitar marcas de tiempo y encabezados, fusionar turnos consecutivos del mismo hablante, normalizar nombres.
2. **Si el texto limpio ≤ umbral configurable** (valor inicial sugerido 60.000 caracteres, ajustable en Administración): **una sola llamada** a ACTAS. Haiku 4.5 tiene ventana amplia **[SUPUESTO: 200.000 tokens, confirmar en el catálogo de modelos `AiModel`]**, y una llamada conserva el contexto completo y es más barata.
3. **Si lo supera: map-reduce.** (a) *Map:* dividir en bloques de ~9.000 caracteres cortando en límite de turno, con solapamiento de 2 turnos; cada bloque produce propuestas parciales con cita de origen. (b) *Reduce:* una llamada final recibe las propuestas parciales (no la transcripción) y produce el acta, deduplicando compromisos y respetando el máximo de 20. El contrato de salida es el mismo `MEETINGS_OUTPUT_CONTRACT`.
4. **Salvaguardas ya existentes que se mantienen:** presupuesto mensual, interruptores, tope de 20 compromisos, fechas dentro de la ventana, responsable por alias.
5. **`maxTokens` 4096** [REPO `ai-defaults.ts:217`] alcanza para una acta con 20 compromisos; el *timeout* de 45 s [REPO] puede quedar corto con 60.000 caracteres: se fija un valor propio para este camino, editable desde Administración.

**Calidad: lo que el diseño debe tolerar.** La transcripción automática comete errores de nombres y de fechas relativas («el viernes»). ACTAS ya recibe la fecha de la reunión para resolver fechas relativas [REPO `meeting-ai.service.ts:133`] y descarta fechas fuera de ventana. Por eso la revisión humana es obligatoria, no opcional.

**Costo en tokens por reunión** (supuestos: 3 caracteres por token en español, Haiku 4.5 a USD 1 entrada / USD 5 salida por millón [REPO migración `20261101180000`]):

| Caso | Entrada | Salida | Costo por reunión |
|---|---|---|---|
| 45 min, una llamada (~35.000 car ≈ 12k tokens + prompt 1k) | ~13.000 | ~3.000 | **≈ USD 0,03** |
| 45 min, map-reduce (4 bloques + reducción) | ~21.000 | ~9.000 | **≈ USD 0,07** |
| 90 min, map-reduce (8 bloques + reducción) | ~39.000 | ~16.000 | **≈ USD 0,12** |

---

## 8. Estimación de costo mensual (con supuestos explícitos)

| | Caso base | Caso alto |
|---|---|---|
| Reuniones con transcripción | 30 al mes | 100 al mes |
| Duración | 45 min | 90 min |
| Estrategia | una llamada (≤60.000 car) | map-reduce |
| **Bedrock (Haiku 4.5)** | **≈ USD 0,9** (con map-reduce ≈ USD 2) | **≈ USD 12** |
| Graph/Teams (transcripción nativa) | USD 0 en lo consultado [confirmar medición] | igual |
| Infraestructura nueva (EC2, BD) | USD 0 (monolito existente; BD crece unos MB) | USD 0 |
| Amazon Transcribe (solo si se usa audio, opción e-audio) | 1.350 min × precio/min **[NO CONFIRMADO]** | 9.000 min × precio/min **[NO CONFIRMADO]** |
| Licencias Microsoft | **depende del cliente** (si ya tiene transcripción, USD 0 adicionales) | igual |

Lectura: la IA cuesta centavos por reunión y queda muy por debajo del presupuesto mensual de USD 100 y de la estimación de USD 30 del asistente [REPO BL-032]. El costo relevante del proyecto es **horas de desarrollo y licencias del tenant**, no consumo de nube. Las cifras son órdenes de magnitud calculados con los supuestos de la tabla, no mediciones; la PoC y el registro `ai_usage` los reemplazan por datos reales.

---

## 9. Privacidad, legal y gobierno

1. **Aviso y consentimiento en Teams.** Teams muestra a los participantes un aviso cuando se inicia la grabación o transcripción **[SUPUESTO]** (no abrí la página de consentimiento). El portal no sustituye ese aviso. Recomendación: política interna que informe que las reuniones del equipo se transcriben y se usan para generar actas, con base en la autorización de los titulares.
2. **Ley 1581 (Colombia).** La transcripción es dato personal (nombres, voz transcrita, opiniones). Necesita finalidad definida, autorización/aviso previo y medidas de seguridad. Asistentes **externos** (clientes) refuerzan la necesidad de autorización explícita. Validación por el responsable jurídico [SUPUESTO, ver §4.5].
3. **Transferencia internacional.** El texto se envía a Bedrock en `us-east-2` (EE. UU.) [REPO `schema.prisma:1288`]. Ya ocurre hoy con las notas del acta, pero una transcripción completa es más volumen y más personas. El art. 26 (transferencia) debe revisarse por el área jurídica [SUPUESTO]. Referencia técnica de AWS: los proveedores de modelos no acceden a prompts ni respuestas [DOC].
4. **Minimización.** (a) Enviar al modelo alias en lugar de nombres cuando sea posible; (b) no enviar correos ni ids [ya es así: REPO `meeting-ai.service.ts:126`]; (c) sin contenido en `ai_usage` [REPO `schema.prisma:1434-1454`]; (d) no guardar el VTT original si basta el texto limpio.
5. **Retención y borrado.** Parámetro editable en Administración (`retentionDays`), con valor por defecto corto (propuesta: 30 días tras aceptar el acta), tarea periódica de purga y borrado manual por la persona responsable. El acta aceptada **permanece**; la transcripción cruda se purga. La retención en Teams/OneDrive es independiente y la gobierna el tenant (Purview).
6. **Quién ve la transcripción en el portal.** Propuesta: solo el responsable del acta y el jefe de área/líder del proceso; **no** todos los participantes (puede contener dichos que no pasaron al acta). Hoy el acta es visible por las personas del proceso según el alcance existente [REPO]; la transcripción necesita una regla más estricta. Decisión abierta (§11).
7. **Auditoría.** Registrar en el módulo de auditoría existente: importación, consulta, procesamiento, borrado, cambios de configuración, con actor y fecha, sin contenido.
8. **Superficie de Graph.** La suscripción por webhook es **de todo el tenant** [DOC]: el portal recibiría avisos de reuniones ajenas al equipo. Mitigación: no pedir `includeResourceData`, ignorar al instante organizadores que no estén configurados y limitar el acceso de la aplicación con la *application access policy* a los organizadores del equipo [DOC]. Es el control de mínimo privilegio más importante del diseño.
9. **Secretos.** Secreto de Entra cifrado en BD (AES-256-GCM existente); rotación periódica (los secretos de Entra caducan, **[SUPUESTO]** hasta 24 meses); nunca en Git, logs ni respuestas de API.
10. **CSP/CORS.** Si se añade un origen externo en la web (no previsto), actualizar la CSP en el mismo PR (regla `15-reglas-transversales`). Las llamadas a Graph las hace el backend, no la web.

---

## 10. Prerrequisitos y preguntas para el cliente (no verificables desde el repo)

1. ¿La organización usa Microsoft 365 con Microsoft Teams para estas reuniones, o Teams gratuito/otra herramienta (Meet, Zoom)?
2. ¿Qué licencias hay (Business Basic/Standard/Premium, E1/E3/E5, A-series)? ¿Cuántos usuarios del equipo?
3. ¿Hay **Teams Premium** o **Microsoft 365 Copilot**? ¿Para quiénes? (Cambia la opción b y el resumen inteligente.)
4. ¿La transcripción está **habilitada por política de reuniones** para los organizadores del equipo? ¿Se activa automáticamente o a mano?
5. ¿Hoy se **graban o transcriben** las reuniones? ¿Con qué frecuencia lo hace el equipo?
6. ¿Quién **administra el tenant de Entra ID** y el centro de administración de Teams? ¿Puede dar **consentimiento de administrador** a una aplicación con permiso `OnlineMeetingTranscript.Read.All` y ejecutar PowerShell para la *application access policy*?
7. ¿La política de TI permite el acceso por Graph a transcripciones y la **atribución de hablante** (controles del administrador)? ¿Permiten suscripciones a transcripciones?
8. ¿Quiénes organizan las reuniones del equipo (¿pocas personas o cualquiera?) y son reuniones **programadas**, **de canal** o **ad hoc**? (Las de canal no las cubre `getAllTranscripts`.)
9. ¿Las reuniones incluyen **externos** (clientes, proveedores)? ¿Con qué frecuencia?
10. ¿Qué idioma/acento se habla y en qué configuración de idioma transcribe Teams (español de Colombia no lo pude confirmar)?
11. ¿Existe política de **tratamiento de datos personales** y aviso a los titulares? ¿Quién es el responsable jurídico para validar el uso de transcripciones y el envío a AWS (EE. UU.)?
12. ¿El `identifier` de los usuarios del portal es el correo corporativo de Microsoft 365? ¿Se puede registrar el correo de cada persona?
13. ¿El portal tiene una URL pública HTTPS accesible desde internet (necesaria solo para webhooks de la Fase 3)?
14. ¿Quién decide la retención de transcripciones y quién debe poder leerlas?

---

## 11. Decisiones de producto abiertas

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| P1 | Cómo entra la transcripción | Subida manual / lectura por Graph | Empezar por subida manual; Graph tras superar la PoC |
| P2 | Quién ve la transcripción | Todos los participantes / responsable + jefe y líder | Responsable + jefe y líder |
| P3 | Qué se guarda | Texto limpio / VTT original | Texto limpio, con purga |
| P4 | Retención por defecto | 7 / 30 / 90 días | 30 días tras aceptar el acta, editable |
| P5 | Nombres al modelo | Nombres reales / alias | Alias (ya existe para personas del proceso) |
| P6 | Disparo del procesamiento | Automático al llegar / botón de la persona | Botón en Fase 1–2; automático solo con borrador sin crear compromisos |
| P7 | Reuniones de canal y ad hoc | Excluidas / con otra vía | Excluidas al inicio (limitación de `getAllTranscripts` [DOC]); usar subida manual |
| P8 | Asistentes externos | Sin restricción / bloquear importación si hay externos | Aviso y confirmación de la persona |
| P9 | Modelo de IA | Haiku 4.5 / uno mayor para el paso de reducción | Haiku; medir calidad en la PoC antes de pagar más |
| P10 | Organizadores integrados | Todos / lista autorizada | Lista autorizada (mínimo privilegio) |

---

## 12. Lo que NO recomiendo hacer, y por qué

1. **Bot de medios propio (opción c).** XL, Windows/.NET/Azure, plataforma en preview [DOC]; segunda nube y segundo runtime contra las reglas del repo. Solo se reconsidera si el tenant prohíbe la transcripción nativa **y** hay presupuesto de operación.
2. **Tercero tipo Recall.ai (d) como primera opción.** Saca el audio/texto de reuniones a un proveedor externo, sin precio verificado [NO PUDE CONFIRMAR] y con un bot visible. Solo como plan B.
3. **Copilot / AI insights (b) como base.** Exige licencia Copilot para todos los usuarios de la aplicación [DOC] y no devuelve nuestro contrato (responsable del proceso, fecha, cita). Duplica ACTAS.
4. **Suscribirse al tenant completo sin restringir.** Expone reuniones de toda la organización [DOC]. Siempre con *application access policy* limitada y lista de organizadores.
5. **Crear compromisos automáticamente sin revisión.** Contradice la decisión de BL-032 (la IA propone, la persona confirma [REPO]) y los errores de reconocimiento de voz lo harían peligroso.
6. **Subir el límite de 12000 caracteres del endpoint actual.** Rompe la UI y el costo del flujo de notas. Se crea un camino aparte para transcripciones.
7. **Guardar el VTT original indefinidamente.** Riesgo legal sin beneficio de negocio.
8. **Guardar el secreto de Entra en variables de entorno o Git.** Va cifrado en BD (regla del repo).
9. **Implementar SSO/OIDC solo para esto.** Está pospuesto (D20 [REPO]). El mapeo por correo es suficiente; SSO no es prerrequisito.
10. **Un microservicio o *worker* separado desde el principio.** No hay necesidad demostrada [REPO `00-estandar-portales`].

---

## 13. Plan por fases, criterios y prueba de concepto

### Fase 0: prueba de concepto de viabilidad (1–2 días de trabajo + coordinación con TI)

**Qué se necesita del tenant:** (1) una cuenta de prueba organizadora con transcripción habilitada; (2) un administrador que registre una aplicación en Entra ID con permiso de aplicación `OnlineMeetingTranscript.Read.All`, dé consentimiento y ejecute `New-CsApplicationAccessPolicy` y `Grant-CsApplicationAccessPolicy` para esa cuenta (esperar hasta 30 min [DOC]); (3) 2–3 personas del equipo para una reunión de ~20 min.

**Pasos:**

1. Crear una reunión programada de Teams, activar la transcripción, grabar 15–20 min de conversación realista con 3 compromisos dichos de forma natural (con nombre, tarea y fecha relativa).
2. Con un script local (no en producción, fuera del repo, con el secreto solo en el equipo del administrador): obtener token de aplicación y consultar `getAllTranscripts` del organizador; descargar el contenido en `text/vtt` y en el formato sin hablante.
3. Registrar: tiempo entre fin de reunión y disponibilidad; si el VTT trae hablantes; el idioma detectado; si falla algo (403 de política, expiración).
4. Probar con una reunión de **canal** y una **ad hoc** para confirmar la limitación.
5. Pasar el texto limpio por el agente ACTAS en un entorno de prueba (texto ≤12000 car por fragmentos) y medir resultados.
6. Anotar el costo real en `ai_usage` y confirmar que Graph no cobra.

**Criterios de éxito (medibles):**

| Criterio | Umbral |
|---|---|
| Transcripción obtenida por Graph en reunión programada | Sí, VTT con hablante |
| Tiempo desde el fin de la reunión hasta la disponibilidad | ≤ 30 min en las 3 pruebas (valor a medir; no hay SLA documentado que yo haya verificado) |
| Compromisos propuestos con responsable correcto | ≥ 80 % de los dichos en la reunión |
| Compromisos con fecha correcta | ≥ 70 % |
| Compromisos inventados | ≤ 1 de cada 10 |
| Tiempo de revisión humana del borrador | < 5 min por acta |
| Costo de IA por reunión | < USD 0,15 |
| Cero accesos a reuniones fuera de la lista de organizadores | 100 % |

**Resultados y decisión:** si Graph no entrega la transcripción (política, licencia o consentimiento), se queda en Fase 1 indefinidamente (opción e). Si la calidad de ACTAS no llega a los umbrales, se ajusta el prompt (editable desde Administración) antes de construir más.

### Fase 1: MVP de bajo riesgo (esfuerzo M, sin tocar el tenant)

Subir `.vtt` o `.txt` en el acta; limpieza del texto; camino de estructuración con fragmentación; campos `teamsJoinUrl` y `source`; `MeetingTranscript` con retención; permisos y auditoría; contrato, MCP de lectura y documentación. Sin credenciales de Microsoft.
**Pasar a Fase 2 si:** ≥ 60 % de las reuniones del equipo se suben y generan acta durante 4 semanas, el 80 % de los compromisos propuestos se aceptan con ajustes menores, y el cliente confirma los prerrequisitos de las preguntas 1–8.

### Fase 2: lectura automática por Graph (esfuerzo L)

Configuración cifrada, prueba de conexión, consulta periódica `delta` por organizador autorizado, vínculo por `joinWebUrl`, notificación al responsable, botón «Generar acta». Campo `email` en usuarios.
**Pasar a Fase 3 si:** la consulta periódica genera retrasos que molestan (> 15 min medidos) y el portal tiene URL HTTPS pública estable.

### Fase 3: webhook (esfuerzo M, opcional)

Endpoint público de notificaciones con validación de `clientState`, renovación de suscripción con `lifecycleNotificationUrl` [DOC], sin `includeResourceData`.

### Fase 4: solo si se bloquean las transcripciones nativas

Evaluar el tercero (d) con revisión jurídica, antes que el bot propio (c).

---

## 14. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| El administrador no concede consentimiento / la política no existe | Media | Alto (bloquea Fase 2) | Preguntas 6–7 antes de construir; Fase 1 no depende de ello |
| Transcripción deshabilitada o sin atribución de hablante | Media | Alto | Control de administrador documentado [DOC]; PoC; modo «sin hablante» tolerado con peor calidad de responsables |
| Errores de reconocimiento (nombres, fechas) | Alta | Medio | Revisión humana obligatoria, alias de personas, citas de origen, ventana de fechas |
| Reuniones de canal o ad hoc sin cobertura | Alta | Medio | Subida manual; documentarlo en la UI |
| Datos personales sin base legal | Media | Alto | Política y aviso; retención corta; revisión jurídica antes de Fase 2 |
| Transferencia a EE. UU. | Media | Medio | Revisión jurídica; minimización; Bedrock sin acceso de proveedores [DOC] |
| Suscripción amplia (todo el tenant) | Media | Alto | Application access policy restringida; no usar `includeResourceData`; filtrar organizadores |
| Caducidad del secreto de Entra | Media | Medio | Alerta de vencimiento en Administración; rotación documentada |
| Cambios de Microsoft (controles de administrador desde julio 2026) | Media | Medio | Manejar los códigos `GraphAccessToTranscriptsDisabled` y `SpeakerAttributionNotAllowed` con mensajes claros [DOC] |
| Calidad con transcripciones muy largas | Media | Medio | Map-reduce con solapamiento; umbral configurable; medir en PoC |
| Desalineación API/MCP/docs | Media | Medio | Cumplir `55-sincronia-api-mcp-docs` en cada PR |
| Costos de IA inesperados | Baja | Bajo | Presupuesto mensual y alerta al 80 % ya existentes [REPO] |

---

## 15. Cómo validar lo que aquí es supuesto

| Supuesto | Cómo se valida |
|---|---|
| Español de Colombia soportado en transcripción | PoC paso 1 y revisión de la lista del admin de Teams |
| Teams permite descargar `.vtt`/`.docx` | PoC (Fase 1 depende de ello) |
| Graph no cobra por transcripciones | Revisar lista de APIs medidas y la factura del tenant tras la PoC |
| Disponibilidad ≤ 30 min | PoC paso 3 |
| `identifier` = correo | Consulta de solo lectura del administrador del portal (pregunta 12) |
| Ventana de contexto de Haiku 4.5 | Catálogo `AiModel` / documentación del modelo en Bedrock |
| Precio de Transcribe en lote | Calculadora de AWS; solo si se usa audio |
| Obligaciones de la Ley 1581 | Concepto del área jurídica |
| Precio y condiciones del tercero | Cotización directa; solo si se activa la Fase 4 |

---

## 16. Conclusión

La funcionalidad es viable y de bajo costo en nube si se apoya en la transcripción nativa de Teams y en el agente ACTAS ya probado en producción. El valor está en eliminar el paso manual de escribir el acta; el trabajo restante está en el vínculo con Teams, el tratamiento de datos personales y los permisos del tenant. Se recomienda empezar por la PoC de 1–2 días y, en paralelo, construir la Fase 1 (subida de transcripción), que entrega valor sin depender del administrador de Microsoft 365.
