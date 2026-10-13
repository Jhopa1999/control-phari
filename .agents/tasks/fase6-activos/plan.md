# Implementation Plan · Fase 6 · Activos y documentos (control-phari)

Plan derivado del diseño APROBADO en `.agents/tasks/fase6-activos/design.md`. Replica fielmente los
patrones de las Fases 1–5 ya mergeadas (módulo `coordination` de Fase 5 como molde directo: controller fino
→ service con `prisma.$transaction` + `AuditService.record(tx, …)` → DTOs request/response separados con
`@nestjs/swagger` → alcance por rol en el `where` → 403 rol / 404 alcance / 409 duplicado).

Todas las rutas son ABSOLUTAS bajo el worktree
`c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase6-activos`.

Comandos reales del repo (de `package.json`, no inventados):
- Typecheck: `npm run typecheck:api` (api) / `npm run typecheck` (todo)
- Build API: `npm run build:api`
- Tests unit (Jest): `npm run test:unit`
- Migración: `npm run prisma:migrate:dev --workspace apps/api -- --name fase6_activos`
- Seed: `npm run prisma:seed --workspace apps/api`
- Contrato: `npm run contracts:generate` (openapi:generate + api-client:generate)
- Build api-client: `npm run build:api-client`

Orden por dependencia: cada ítem deja el repo compilable. El backend necesita el schema migrado; el
contrato necesita el backend; los wrappers y pantallas necesitan el contrato regenerado.

---

- [ ] 1. Ampliar el schema Prisma con `Asset`, `Document`, `DocumentVersion` y el gancho FK opcional de Fase 5.
      Añadir los tres modelos (§1.2 del diseño: PK uuid, `@map` snake_case, timestamps; `DocumentVersion`
      append-only sin `updated_at`; `@@unique([documentId, versionNumber], name: "document_version_number_unique")`;
      índices y `@@map`). Añadir las relaciones inversas en `Process` (`assets Asset[]`), `Request`
      (`assets Asset[]`), `User` (`assetsOwned Asset[] @relation("AssetOwner")` + `documentVersionsAuthored
      DocumentVersion[] @relation("DocumentVersionAuthor")`). Añadir en `DailyLogActivity` el campo
      `assetId String? @db.Uuid` + relación `asset Asset? @relation(... onDelete: Restrict)` + `@@index([assetId])`,
      y en `Issue` `assetId String? @db.Uuid` + `relatedAsset Asset? @relation(... onDelete: Restrict)` +
      `@@index([assetId])`. NO tocar campos existentes de Fases 1–5 (`assetRef`/`relatedAssetRef` intactos).
      Todas las FK con `onDelete: Restrict`. La relación `Document↔DocumentVersion` lleva DOS nombres
      (`"DocumentVersions"` para 1:N y `"DocumentCurrentVersion"` para el puntero `currentVersionId`),
      `currentVersionId` nullable.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase6-activos\apps\api\prisma\schema.prisma`
      Verify: `npm run prisma:format --workspace apps/api` y `npm run prisma:validate --workspace apps/api` sin errores.

- [ ] 2. Generar la migración versionada `fase6_activos` y el cliente Prisma.
      Depende del ítem 1. Crea `assets`, `documents`, `document_versions` + columnas `asset_id` nullable en
      `daily_log_activities` e `issues`, todo aditivo (sin backfill). Commitear la carpeta de migración
      generada. NUNCA `db push`.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase6-activos\apps\api\prisma\migrations\<timestamp>_fase6_activos\migration.sql`
      Verify: `npm run prisma:migrate:dev --workspace apps/api -- --name fase6_activos` aplica sin error;
      luego `npm run build:api` compila (incluye `prisma generate`, modelos `AssetModel`/`DocumentModel`/`DocumentVersionModel` disponibles).

- [ ] 3. Sembrar las familias de catálogo nuevas en el seed (idempotente).
      Depende del ítem 2. Añadir al array `CATALOG_ITEMS` de `seed.ts` las familias `TECHNOLOGY`, `SOURCE`,
      `FREQUENCY` y `DOC_CATEGORY` con los valores observados en §7 del diseño (marcados `P`, `active: true`,
      `sortOrder` incremental). NO re-sembrar `ASSET_TYPE` ni `DOC_STATUS` (ya existen). Reutiliza el `upsert`
      por `catalog_code_unique` existente.
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase6-activos\apps\api\prisma\seed.ts`
      Verify: `npm run prisma:seed --workspace apps/api` corre sin error (idempotente); `npm run build:api` compila.

- [ ] 4. Ampliar la auditoría con los tres `objectType` nuevos (en los DOS sitios).
      Añadir `'ASSET' | 'DOCUMENT' | 'DOCUMENT_VERSION'` al union `AuditObjectType` de `audit.service.ts` Y
      al array `OBJECT_TYPES` de `list-audit-events.dto.ts` (lección 2: ambos, o el filtro `?objectType=`
      devuelve 400).
      Files: `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase6-activos\apps\api\src\modules\audit\audit.service.ts`,
      `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase6-activos\apps\api\src\modules\audit\dto\list-audit-events.dto.ts`
      Verify: `npm run build:api` compila; `npm run test:unit` (specs de audit-contract existentes siguen verdes).

- [ ] 5. Crear los enums lógicos de estado y sus helpers (`asset-status.ts`, `doc-status.ts`).
      Replicar el patrón de `coordination/record-state.ts`: `AssetStatus` (`BORRADOR`/`ACTIVO`/`RETIRADO`)
      con transiciones `BORRADOR→ACTIVO`, `ACTIVO→RETIRADO`, `RETIRADO→ACTIVO` (SIN `ACTIVO→BORRADOR`, §4.1);
      `DocStatus` (`BORRADOR`/`VIGENTE`/`ARCHIVADA`) con `BORRADOR→VIGENTE`, `VIGENTE→ARCHIVADA`,
      `ARCHIVADA→VIGENTE`, `VIGENTE→BORRADOR` (§4.2). Cada uno con `is<X>Status`, `is<X>TransitionAllowed`.
      Más dos servicios finos (`asset-state.service.ts`, `document-state.service.ts`) análogos a
      `WorkflowStateService` que lanzan `BadRequestException` (400) ante transición no permitida.
      Files (crear): `.worktrees\fase6-activos\apps\api\src\modules\knowledge\asset\asset-status.ts`,
      `.worktrees\fase6-activos\apps\api\src\modules\knowledge\asset\asset-state.service.ts`,
      `.worktrees\fase6-activos\apps\api\src\modules\knowledge\document\doc-status.ts`,
      `.worktrees\fase6-activos\apps\api\src\modules\knowledge\document\document-state.service.ts`
      (rutas absolutas bajo `c:\Users\analistabi2\Desarrollo\control-phari`).
      Verify: `npm run build:api` compila.

- [ ] 6. Crear `KnowledgeScopeService` (fuente única de alcance por rol).
      En `knowledge/knowledge-scope.service.ts`, replicar `capacity-scope.service.ts`: `assetScopeWhere(actor)`
      (jefe `{}`; resto `{ processId: { in: scopedProcessIds } }`, sin mirar rol — §2.2 NIT-3), helper privado
      `leaderProcessIds(actor)` (grants con `roleCode === RoleCode.LIDER_PROCESO`), y
      `requireAssetWritable(actor, asset, nextStatus)` (jefe ok; líder del proceso ok; integrante solo si
      `asset.status === 'BORRADOR' && nextStatus === 'BORRADOR'`; si no `ForbiddenException` 403). Sin
      variables muertas (TS estricto, finding #1).
      Files (crear): `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase6-activos\apps\api\src\modules\knowledge\knowledge-scope.service.ts`
      Verify: `npm run build:api` compila.

- [ ] 7. Crear los DTOs request/response de Asset y Document con `@nestjs/swagger`.
      Según §3.4: `CreateAssetDto`, `UpdateAssetDto` (sin `status`/`processId`; `name` con regla
      presente⇒requerido, finding #4), `ChangeAssetStatusDto`, `ListAssetsDto`, `AssetResponseDto`;
      `CreateDocumentDto` (`content` `@IsString() @MinLength(1) @MaxLength(200000)`), `UpdateDocumentDto`
      (sin `content`/`status`/`assetId`), `CreateDocumentVersionDto` (`content` igual tope),
      `ChangeDocumentStatusDto`, `ListDocumentsDto`, `DocumentResponseDto` (con `currentVersion: {...}|null`),
      `DocumentVersionResponseDto` (sin `content`), `DocumentContentResponseDto` (con `content`). Reutilizar
      el patrón `trim`/`@Transform` y `@ApiProperty`/`@ApiPropertyOptional` de `create-issue.dto.ts`.
      Files (crear): bajo `.worktrees\fase6-activos\apps\api\src\modules\knowledge\asset\dto\` y
      `...\knowledge\document\dto\` (rutas absolutas).
      Verify: `npm run build:api` compila.

- [ ] 8. Implementar `AssetService` + `AssetController` (`@ApiTags('assets')`, rutas `/assets/*`).
      Depende de 5–7. Service: `list`/`get` con `findFirst`/`findMany` + `assetScopeWhere` (404 fuera);
      `create` (nace `BORRADOR`, valida FK del body `ownerUserId`/`requestId`/códigos de maestra ⇒ 400 según
      MEDIUM-1/D2, dentro de `$transaction` + `audit.record` objectType `ASSET` scopeProcessId `processId`);
      `update` (metadatos, `requireAssetWritable(..., asset.status)`, revalida FK si cambian); `changeStatus`
      (`asset-state.service` valida transición → 400; `requireAssetWritable(..., targetStatus)`). Snapshots
      before/after. `P2002 → ConflictException`. Controller fino con `@UseGuards(CurrentUserGuard, RolesGuard)`
      + `@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)` y `@ApiResponse`.
      Files (crear): `...\knowledge\asset\asset.service.ts`, `...\knowledge\asset\asset.controller.ts`.
      Verify: `npm run build:api` compila.

- [ ] 9. Implementar `DocumentService` + `DocumentController` (`@ApiTags('documents')`, rutas `/documents/*`).
      Depende de 5–8. Endpoints §3.3: `GET /documents`, `GET /documents/:id`, `POST /documents` (crea doc +
      versión 1 y setea `currentVersionId` en la misma `$transaction`), `PATCH /documents/:id`,
      `POST /documents/:id/versions` (editar = nueva versión: `max(versionNumber)+1`, mueve SOLO
      `currentVersionId`, NO toca `status` — D6; un reintento server-side ante `P2002`, luego 409 — finding #7),
      `GET /documents/:id/versions` (historial), `GET /documents/:id/versions/:versionId/content`,
      `GET /documents/:id/content`, `POST /documents/:id/status` (líder/jefe). Alcance heredado del `Asset`
      (resolver asset con `assetScopeWhere` → 404; `requireAssetWritable`). Auditoría `DOCUMENT` y
      `DOCUMENT_VERSION` (snapshot de versión = `versionNumber` + longitud, no el contenido). Los listados
      NUNCA incluyen `content`.
      Files (crear): `...\knowledge\document\document.service.ts`, `...\knowledge\document\document.controller.ts`.
      Verify: `npm run build:api` compila.

- [ ] 10. Crear `KnowledgeModule` y registrarlo en `app.module.ts`.
      `knowledge.module.ts` importa `PrismaModule`/`AuthModule`/`AuditModule`, registra ambos controllers
      (estáticos antes de paramétricos) y los providers (`KnowledgeScopeService`, `AssetStateService`,
      `DocumentStateService`, `AssetService`, `DocumentService`). Añadir `KnowledgeModule` al array `imports`
      de `app.module.ts` (junto a `CoordinationModule`).
      Files (crear): `...\knowledge\knowledge.module.ts`; (modificar)
      `c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\fase6-activos\apps\api\src\app.module.ts`
      Verify: `npm run build:api` compila y arranca el contexto Nest en los tests.

- [ ] 11. Escribir las pruebas unitarias de servicios y módulo (Jest).
      Según §8: `asset-state`/`document-state` (transiciones válidas/inválidas → 400); `AssetService`
      (alcance integrante fuera → 404, integrante cambiando estado → 403, líder/jefe ok; FK inválida → 400);
      `DocumentService` (crear doc crea versión 1 + `currentVersionId`; crear versión incrementa número,
      conserva previa AC-020, mueve solo puntero, NO cambia `status`; `content`/`title` vacío → 400; tope
      200.000 → 400; concurrencia: un reintento y luego 409); auditoría con `scopeProcessId = asset.processId`;
      `knowledge.module.spec.ts` (inyección de controllers/services). Mock de `PrismaService`/`AuditService`
      como en `issue.service.spec.ts`. NO modificar `worklog.service.spec.ts` (Fase 5 debe seguir verde).
      Files (crear): specs `*.spec.ts` junto a cada service y módulo bajo `...\knowledge\`.
      Verify: `npm run test:unit` — todos los specs (nuevos y existentes) pasan.

- [ ] 12. Regenerar el contrato OpenAPI y el api-client, y commitear los artefactos generados.
      Depende de 8–10. Ejecutar `npm run contracts:generate` (regenera `apps/api/openapi/openapi.json` y
      `packages/api-client/src/generated/schema.d.ts`) y `npm run build:api-client`. Commitear
      `apps/api/openapi/openapi.json` + `packages/api-client/src/generated/*`.
      Files (regenerados): `...\apps\api\openapi\openapi.json`,
      `...\packages\api-client\src\generated\schema.d.ts`
      Verify: `npm run contracts:generate` y `npm run build:api-client` sin error; `npm run typecheck:api-client` pasa.

- [ ] 13. Añadir los tipos derivados en `api-client.ts` y los wrappers tipados en `apps/web/src/lib/`.
      Depende del ítem 12. En `apps/web/src/lib/api-client.ts` añadir los `export type` de Fase 6
      (`Asset`, `CreateAsset`, `UpdateAsset`, `ChangeAssetStatus`, `Document`, `CreateDocument`,
      `UpdateDocument`, `CreateDocumentVersion`, `DocumentVersion`, `DocumentContent`, `ChangeDocumentStatus`,
      derivados de `components['schemas'][...]`). Crear `apps/web/src/lib/assets.ts` y
      `apps/web/src/lib/documents.ts` replicando `issues.ts` (clase de error de dominio, `messageForStatus`,
      funciones por endpoint vía `api.GET/POST/PATCH`). En `documents.ts` incluir el helper de descarga `.md`
      (arma un `Blob` `text/markdown` con nombre `${slug(title)}-v${versionNumber}.md` a partir de `/content`).
      Files (modificar/crear): `...\apps\web\src\lib\api-client.ts`, `...\apps\web\src\lib\assets.ts`,
      `...\apps\web\src\lib\documents.ts`
      Verify: `npm run typecheck:web` pasa.

- [ ] 14. Implementar la pantalla SCR-15 (Activos) reemplazando el placeholder.
      Depende del ítem 13. Convertir `activos/catalogo/page.tsx` a la vista real (patrón `capacidad/page.tsx`
      + `capacidad-view.tsx`): tabla filtrable por proceso/solicitud/estado, formulario alta/edición (nombre
      requerido, selects de maestras tipo/tecnología/fuente/frecuencia poblados desde `/catalogs`, solicitud/
      owner opcionales), botón de cambio de estado (gating cosmético por rol), estados loading/vacío/error/
      éxito y conservación de entrada ante error. SOLO vía api-client (sin Prisma, sin interfaces a mano).
      `navigation.ts` NO se toca.
      Files (crear/modificar): `...\apps\web\src\app\activos\catalogo\page.tsx` y los componentes de vista que
      requiera (p. ej. `activos-view.tsx`, `asset-form-dialog.tsx`) en esa carpeta.
      Verify: `npm run typecheck:web` pasa; `npm run build:web` compila.

- [ ] 15. Implementar la pantalla SCR-16 (Documentos) reemplazando el placeholder.
      Depende de 13–14. Convertir `activos/documentos/page.tsx`: lista filtrable (proceso/solicitud/activo/
      estado + búsqueda por texto); editor Markdown con modos editor/vista previa, contador `N/200.000` que
      bloquea Guardar al exceder; Guardar (crea documento ⇒ versión 1, o `POST /versions` si existe);
      Descargar `.md` (helper del ítem 13); historial de versiones (lista `/versions`, ver contenido de una
      versión vía `/versions/:versionId/content`); cambio de estado (publicar/archivar) según rol. SOLO vía
      api-client.
      Files (crear/modificar): `...\apps\web\src\app\activos\documentos\page.tsx` y los componentes de vista
      en esa carpeta.
      Verify: `npm run typecheck:web` pasa; `npm run build:web` compila.

- [ ] 16. Verificación integral de la fase.
      Ejecutar la secuencia completa y confirmar que todo queda verde y el contrato committeado.
      Verify: `npm run typecheck` + `npm run build:api` + `npm run test:unit` + `npm run build:web` pasan;
      `apps/api/openapi/openapi.json` y `packages/api-client/src/generated/*` reflejan los endpoints de Fase 6
      y están committeados; `worklog.service.spec.ts` sigue verde (gancho `assetId` opcional no rompe Fase 5).

---

## Notas de alcance (respetar el diseño, no inventar `P`)

- Asset: SOLO `BORRADOR→ACTIVO→RETIRADO` + recuperar (`RETIRADO→ACTIVO`). NO `ACTIVO→BORRADOR`. Nunca `DELETE`.
- Document: estado SOLO por `POST /documents/:id/status`; crear versión NO mueve el estado.
- Activo `RETIRADO` NO bloquea crear documentos/versiones (candado `P` no implementado).
- Gancho `assetId` de Fase 5: solo columna + relación FK opcional; NO cablear desde flujos de Fase 5; NO
  tocar la validación "SOPORTE requiere `assetRef`".
- `ownerUserId`/`requestId` del body inválidos ⇒ 400 (no 404). Código de maestra inválido ⇒ 400.
