# Diseño técnico · Fase 6 · Activos y documentos (control-phari)

> **Iteración 3 (segunda revisión aplicada).** La iteración 2 cerró los 10 hallazgos del primer review
> (1 HIGH + 6 MEDIUM + 3 NIT). El segundo `design-review.json` (veredicto `CHANGES_REQUESTED`: 0 HIGH +
> 2 MEDIUM + 4 NIT) verificó esos cierres contra el código y abrió 6 hallazgos residuales; esta iteración los
> **resuelve todos** (MEDIUM-1 validación `ownerUserId`/`requestId` con código 400; MEDIUM-2 recorte de la
> transición `ACTIVO→BORRADOR`; NIT-1…NIT-5 de trazabilidad). El detalle está en la sección final
> **"Respuestas a la revisión — iteración 3"**. Se
> **construye encima** de las Fases 1–5 ya mergeadas en `main` (NO se rehacen ni se tocan sus tablas,
> módulos ni pantallas). Fase 6 agrega el corte **FEATURE-007 "Activos y documentos"** (SCR-15 / SCR-16,
> UC-010, US-010, FLOW-006, BR-016/BR-021, AC-020/AC-032): un **inventario de activos** por proceso y una
> **documentación versionada en Markdown** ligada a esos activos. **Fuera de alcance explícito:**
> Frameworks/evidencia (FEATURE-008) y Portafolio/dashboard (FEATURE-010); el gancho de BR-016
> ("evidencia de control se vincula a documento versionado") se deja **preparado** pero no se implementa
> aquí.
>
> **Autoridad y método (steering `.kiro/steering/`).** NestJS es dueño de la lógica de negocio,
> validaciones, autorización, persistencia, API REST y OpenAPI; **Prisma vive solo en `apps/api`**; el
> frontend consume **exclusivamente** vía `@plantilla-portales/api-client` (nunca Prisma/Postgres, nunca
> interfaces a mano). TS estricto, sin `any`. DTOs `class-validator` con `ValidationPipe` global. Migración
> **versionada** con `npx prisma migrate dev --name fase6_activos` desde `apps/api` (nunca `db push`). Cada
> cambio de contrato ⇒ `npm run contracts:generate` + `npm run build:api-client` y se committea
> `openapi.json` + `packages/api-client/src/generated/*`. Monolito modular. No se rompen comandos del repo.
>
> **Patrón heredado (Fases 1–5), replicado tal cual:** controller fino → service con la lógica y
> `prisma.$transaction` → DTOs request/response **separados** con `@nestjs/swagger` → `AuditService.record(tx, …)`
> **dentro de la misma transacción** que cada mutación → `P2002 → ConflictException` →
> `findFirst` + `where` de alcance → `NotFoundException` → política **403 rol / 404 alcance**. El alcance se
> aplica en el `where` del service **por ROL** mirando `actor.grants[].roleCode === LIDER_PROCESO` (NO
> `scopedProcessIds.size`), igual que `capacity-scope.service.ts` y el `coordination` scope.
>
> **Precaución Prisma 7.10 (heredada):** un `@@unique` de **un solo campo** con `name` custom **no** sirve
> como `where` de `findUnique`/`upsert` ⇒ resolver por un solo campo con **`findFirst`**. Los `@@unique`
> **compuestos** sí sirven como `where`. En Fase 6 todas las resoluciones son por `id` (PK) con `findFirst`
> + alcance; no se usa ningún unique de un solo campo como `where`.

---

## Visión general

Fase 6 agrega **tres entidades nuevas** y **ninguna columna calculada persistida**:

- **`Asset` (Activo · SCR-15)** — ficha de inventario de un activo analítico, **anclada a un proceso
  (FK requerida)**, con **nombre requerido** y **estado inicial `BORRADOR`**. Lleva solicitud opcional,
  dueño/responsable (texto), y atributos tomados de maestras `CatalogItem` (tipo, tecnología, fuente,
  frecuencia), referencia documental/repositorio (texto), descripción funcional y dependencias/notas.
  Su ciclo de vida es una **máquina de estados mínima reversible** (`BORRADOR` ↔ `ACTIVO` ↔ `RETIRADO`)
  documentada como decisión reversible — el SDD marca retiro/recuperación como **`P`** y prohíbe el
  **borrado físico** (se usa cambio de estado, nunca `DELETE`).
- **`Document` (Documento · SCR-16)** — metadatos de un documento Markdown: **título requerido**,
  **`assetId` FK REQUERIDA** a `Asset`, **categoría** (maestra `DOC_CATEGORY`), **estado**
  `BORRADOR`/`VIGENTE`/`ARCHIVADA` (maestra `DOC_STATUS`, ya sembrada en Fase 1) y un **puntero a la
  versión vigente** (`currentVersionId`). El contenido **no** vive en `Document`: vive en versiones.
- **`DocumentVersion` (Versión de documento · AC-020/BR-021)** — N filas inmutables por documento, cada
  una con **contenido Markdown** (límite **200.000** caracteres), **número de versión** incremental,
  **autor** y timestamp. **Editar el contenido crea una NUEVA versión y conserva la previa** (AC-020);
  nunca se sobrescribe una versión existente.

El "activo" referenciado en Fase 5 como **texto** (`DailyLogActivity.assetRef`, `Issue.relatedAssetRef`)
**no se migra**: se añade un gancho FK **opcional y nuevo** que **convive** con el texto (§2), sin romper
la validación "soporte requiere su referencia" de Fase 5.

Toda mutación audita vía `AuditService.record(tx, …)` dentro de la `$transaction`, con `objectType` nuevos
**`ASSET`, `DOCUMENT`, `DOCUMENT_VERSION`** y `scopeProcessId = proceso del activo` (siempre existe: el
documento cuelga de un activo, y el activo tiene proceso). Se **amplía `AuditObjectType`** en
`audit.service.ts` **y** `OBJECT_TYPES` en `list-audit-events.dto.ts` (lección 2: ambos, o el filtro
`?objectType=` devuelve 400 pese a registrarse el evento).

### Mapa rápido decisión → fuente

| Decisión | Respaldo |
|---|---|
| Un módulo raíz `knowledge/` con submódulos `asset/` + `document/` | patrón `coordination` Fase 5; §3; D0 |
| `Asset`: nombre req., proceso FK req., estado inicial `BORRADOR` | SCR-15; `09`; `06`; §1.2; D1 |
| `Asset` tipo/tecnología/fuente/frecuencia = maestras `CatalogItem` (código, no FK) | SCR-15; `20`; §1.2; D2 |
| Máquina Asset = SOLO `BORRADOR→ACTIVO→RETIRADO` + recuperar (`RETIRADO→ACTIVO`); SIN `ACTIVO→BORRADOR`; SIN borrado físico | `06` "alta/retiro/recuperación **P**" (transiciones NO confirmadas); no-borrado físico respaldado por `12`; §4.1; D3; MEDIUM-2 |
| `Document` metadatos + puntero `currentVersionId`; **sin** contenido en `Document` | AC-020; BR-021; SCR-16; §1.2; D4 |
| `DocumentVersion` N versiones inmutables; editar ⇒ nueva versión | AC-020; BR-021; §1.2; §2.4; D4 |
| `Document.assetId` **FK requerida** a Asset | `09` "activo requerido"; SCR-16; §1.2 |
| Contenido Markdown ≤ **200.000** chars (validado en DTO) | `09`; SCR-16; §2.4; D5 |
| Máquina Document `BORRADOR` ↔ `VIGENTE` ↔ `ARCHIVADA` (reversible); estado SOLO por `/status` | `06`; BR-021; `19`; §4; D6 |
| Edición de 'Vigente': **crear versión NO mueve el estado** (sin transición automática); degradar-a-BORRADOR solo como variante `P` | `06` "sin transiciones automáticas"; `09`/`19` "edición vigente P"; D6 |
| `assetRef` de Fase 5: **nuevo `assetId` FK opcional que convive con el texto**; NO migrar | brief p.2; Fase 5 §11 D3; §2; D7 |
| Auditar en `$transaction`; `objectType` `ASSET`/`DOCUMENT`/`DOCUMENT_VERSION`; `scopeProcessId`=proceso del activo | lección 2/3; §1.6; §5 |
| Ampliar `AuditObjectType` **y** `OBJECT_TYPES` del filtro | lección 2; §1.6 |
| Alcance por rol en el `where` por ROL (integrante lee/propone, líder gestiona su proceso, jefe el área) | `specs/10`; `04` FLOW-006; §2.2; D8 |
| Contenido `.md` se obtiene por API; **descarga la arma el cliente** (Blob) | SCR-16 "Descargar .md"; §3; §6 |
| Nuevas maestras seed: `TECHNOLOGY`, `SOURCE`, `FREQUENCY`, `DOC_CATEGORY` (si faltan) | `20`; §7 |
| `ASSET_TYPE` y `DOC_STATUS` ya sembradas (Fase 2 / Fase 1) — NO re-sembrar | seed.ts; §7 |
| SCR-15/SCR-16 solo vía api-client; editor Markdown editor/preview, contador 0/200.000, Descargar/Guardar/historial | SCR-15/16; `11`; §6 |

### Supuestos explícitos

1. **El alcance se mira por `grant.roleCode`, no por "tener procesos"** (lección 1 y patrón capacity): el
   integrante **consulta/propone** (lee en alcance, puede crear/editar en `BORRADOR` dentro de su proceso);
   el **líder gestiona su proceso** (crear, editar, cambiar estado, documentos); el **jefe gestiona el
   área** (todo, sin frontera de proceso). Un integrante con grant en un proceso NO se "expande" a gestión
   del proceso.
2. **`Asset.processId` es requerido**; por tanto `scopeProcessId` de auditoría de `ASSET`/`DOCUMENT`/
   `DOCUMENT_VERSION` es **siempre** el proceso del activo (nunca `null`), a diferencia de la
   disponibilidad de Fase 4.
3. **No se implementa** Frameworks (FEATURE-008) ni Portafolio (FEATURE-010). BR-016 queda **preparado**
   (el `Document` es versionado y referenciable), pero la vinculación evidencia↔documento es trabajo de
   Fase 7.
4. `X-Actor-Id`, `CurrentUserGuard`/`RolesGuard`, `CurrentActor`, `AuditService` y el api-client ya existen
   y se reutilizan sin cambios de contrato. `MODULE_MATRIX` ya tiene `asset` y `docs` (los 3 roles) y
   `navigation.ts` ya tiene los items `/activos/catalogo` (`asset`) y `/activos/documentos` (`docs`): **no
   se tocan** salvo convertir las dos páginas placeholder.
5. **No se tocan** Fases 1–5, ni `/catalogs`, ni los comandos del repo.

---

## 1. Modelo de datos (Prisma)

### 1.1 Principios heredados (sin cambios)

- Esquema físico en `apps/api/prisma/schema.prisma`. Modelos PascalCase; columnas `snake_case` vía
  `@map`/`@@map`; PK `String @id @default(uuid()) @db.Uuid`; timestamps `created_at` (`@default(now())`) /
  `updated_at` (`@updatedAt`) en toda tabla mutable. `DocumentVersion` es **append-only / inmutable**: lleva
  solo `created_at` (sin `updated_at`), como `Approval`/`TaskDependency`.
- Solo se modelan las entidades confirmadas de esta fase. No hay entidades de FEATURE-008/010.
- FK a entidades existentes con `onDelete: Restrict` (no se borra un `Process`/`Request`/`User` con activos
  ligados). Las "hijas" de la propia fase (`Document` bajo `Asset`, `DocumentVersion` bajo `Document`) usan
  `onDelete: Restrict` también: **nunca** hay borrado físico en cascada en Fase 6 (ciclo de vida por estado,
  D3/D6).

### 1.2 Entidades y relaciones

```
Process (1) ──< (N) Asset                 [proceso del activo, REQUERIDO]
Request (0..1) ──< (N) Asset              [solicitud de origen, opcional]
User    (0..1) ──< (N) Asset              [owner/responsable como FK opcional; ver nota]
Asset   (1) ──< (N) Document              [documentos del activo; assetId REQUERIDO]
Document(1) ──< (N) DocumentVersion       [versiones; editar crea una nueva, previa conservada]
Document(0..1) ─> (1) DocumentVersion     [currentVersionId: puntero a la última versión de contenido]
User    (1) ──< (N) DocumentVersion       [autor de la versión]

// Gancho Fase 5 (NUEVO, opcional, convive con el texto — §2 D7):
Asset   (0..1) ──< (N) DailyLogActivity   [assetId NUEVO opcional, junto a assetRef (texto)]
Asset   (0..1) ──< (N) Issue              [assetId NUEVO opcional, junto a relatedAssetRef (texto)]
```

Las relaciones inversas se añaden a `Process`, `Request`, `User`, `DailyLogActivity` e `Issue` **sin
alterar sus campos existentes** (Fases 1–5 intactas).

> **`owner` como FK vs texto (DECISIÓN D1b).** SCR-15 lista "responsable/dueño". Fases previas modelan
> actores reales con FK a `User` (p. ej. `Issue.resolverUserId`). Se elige **`ownerUserId String? @db.Uuid`
> FK opcional a `User`** (no texto): es coherente con el patrón del repo, permite selector en el frontend y
> no cuesta más. Si el Site mostrara dueños externos no-usuarios, se añadiría un `ownerText String?` conviviente
> (reversible). Esta FK **no amplía el alcance**: se valida contra `User.active` como **entrada del body**
> (uuid inexistente/inactivo ⇒ **400**, no 404 — ver MEDIUM-1 en §3.4), sin expandir qué activos ve el actor.
>
> **Coherencia 400 vs 404 (MEDIUM-1).** El diseño reserva **404 para "fuera del alcance del actor"** (el
> recurso no existe *para ti*) y **400 para datos de entrada inválidos** (igual que "código de maestra
> inválido ⇒ 400", D2). Por tanto `ownerUserId` y `requestId` del body, cuando apuntan a algo inexistente,
> inactivo o fuera de alcance, se rechazan con **400** (son campos del cuerpo, no el recurso que se resuelve),
> para no mezclar las dos semánticas que el resto del diseño separa con cuidado.
>
> **Nombre de relación y `onDelete` (finding #10).** `AssetOwner` es la **única** relación `Asset↔User` del
> diseño, de modo que nombrarla explícitamente es **opcional** para Prisma; se mantiene el nombre por
> legibilidad y es inofensivo (no colisiona con ninguna otra relación `Asset↔User`). `onDelete: Restrict` en
> `ownerUserId` es coherente con el repo, que **no borra usuarios físicamente** (patrón `User.active`): ningún
> flujo existente hace `DELETE` de `User`, así que el `Restrict` nunca bloqueará un borrado real.

#### Asset (Activo · SCR-15 · `08` Activo)

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| processId | `String @db.Uuid` | `process_id` | FK → Process (`Restrict`); **requerido** (ancla de alcance) |
| requestId | `String? @db.Uuid` | `request_id` | FK → Request (`Restrict`); solicitud de origen, opcional |
| ownerUserId | `String? @db.Uuid` | `owner_user_id` | FK → User (`Restrict`); dueño/responsable, opcional |
| name | `String` | `name` | **requerido** (`09`/SCR-15); `@IsString` 1..300 (trim) |
| status | `String @default("BORRADOR")` | `status` | enum lógico `AssetStatus`; **inicial `BORRADOR`**; read-only vía helper (§4) |
| typeCode | `String?` | `type_code` | maestra `ASSET_TYPE` (ya sembrada); opcional |
| technologyCode | `String?` | `technology_code` | maestra `TECHNOLOGY`; opcional |
| sourceCode | `String?` | `source_code` | maestra `SOURCE`; opcional |
| frequencyCode | `String?` | `frequency_code` | maestra `FREQUENCY`; opcional |
| documentationRef | `String?` | `documentation_ref` | documento/repositorio como **texto libre** (≤ 2000) |
| functionalDescription | `String?` | `functional_description` | descripción funcional (texto; ≤ 20.000) |
| dependencies | `String?` | `dependencies` | dependencias/observaciones (texto; ≤ 20.000) |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

Relaciones: `process Process @relation(…)`, `request Request? @relation(…)`,
`owner User? @relation("AssetOwner", …)`, `documents Document[]`, y las inversas del gancho Fase 5
(`dailyLogActivities DailyLogActivity[]`, `issues Issue[]`).
Índices: `@@index([processId])`, `@@index([requestId])`, `@@index([status])`, `@@index([typeCode])`,
`@@map("assets")`. **Sin `@@unique`**: dos activos pueden compartir nombre (el nombre no es clave; SCR-15 no
exige unicidad). Resolución por `id` con `findFirst` + alcance.

> **Códigos de maestra como `String`, no FK a `CatalogItem` (DECISIÓN D2).** Igual que Fases 2–5
> (`Request.*Code`, `Triage.*Code`, `Issue.typeCode`, `DailyLogActivity.classificationCode`): los atributos
> de catálogo se guardan como **código** (`String`), **no** como FK a `CatalogItem`. Motivos: (a) consistencia
> con todo el repo; (b) `CatalogItem` es configuración mutable (soft-active), no una dimensión referencial
> dura; (c) evita migraciones por reordenar catálogos. La validación de que el código existe y está `active`
> en su familia la hace el **service** (400 si inválido), no una FK de BD.

#### Document (Documento · SCR-16 · `08` Documento)

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| assetId | `String @db.Uuid` | `asset_id` | FK → Asset (`Restrict`); **REQUERIDO** (`09`/SCR-16) |
| title | `String` | `title` | **requerido**; `@IsString` 1..300 (trim) |
| categoryCode | `String?` | `category_code` | maestra `DOC_CATEGORY`; opcional (SCR-16 "categoría") |
| status | `String @default("BORRADOR")` | `status` | maestra/enum lógico `DocStatus` (`BORRADOR`/`VIGENTE`/`ARCHIVADA`); read-only vía helper (§4) |
| currentVersionId | `String? @db.Uuid` | `current_version_id` | FK → DocumentVersion; **puntero a la última versión de contenido** (ortogonal al `status`) |
| createdAt / updatedAt | `DateTime` | `created_at` / `updated_at` | auditoría técnica |

Relaciones: `asset Asset @relation(…)`, `versions DocumentVersion[] @relation("DocumentVersions")`,
`currentVersion DocumentVersion? @relation("DocumentCurrentVersion", fields: [currentVersionId], references: [id], onDelete: Restrict)`.
Índices: `@@index([assetId])`, `@@index([status])`, `@@index([categoryCode])`, `@@map("documents")`.

> **"Revisión" del SDD = número de versión del historial (NIT-5).** `specs/08` lista para Documento "título,
> activo, categoría, estado, contenido Markdown, **revisión**; historial versionado". La "revisión" **no es un
> campo aparte** en este modelo: se materializa como `DocumentVersion.versionNumber` (el correlativo 1..N) y el
> **historial** es la lista de `DocumentVersion` por `documentId`. Es decir, "revisión" ≡ número de versión
> vigente (`currentVersion.versionNumber`) + historial de versiones, no una columna adicional en `Document`.
> Si `specs/08` se refiriera a un flujo de *revisión/aprobación* de documento (revisor que aprueba), eso sería
> adyacente a FEATURE-008 y queda **fuera de alcance `P`** de Fase 6; aquí no se modela.

> **Nota Prisma: relación con auto-referencia por `currentVersionId`.** `Document` y `DocumentVersion` se
> relacionan en **dos** direcciones: 1:N (`Document.versions` ↔ `DocumentVersion.document`) y 1:0..1
> (`Document.currentVersion` → `DocumentVersion`). Prisma exige **nombrar ambas** relaciones
> (`"DocumentVersions"` y `"DocumentCurrentVersion"`) porque hay más de una FK entre los mismos modelos. El
> `currentVersionId` es **nullable** para romper el ciclo de creación: al crear un documento se inserta la
> versión 1 y acto seguido se actualiza el puntero, todo en la **misma `$transaction`** (§2.4).

#### DocumentVersion (Versión · AC-020 · BR-021)

| Campo | Tipo Prisma | Columna | Reglas |
|---|---|---|---|
| id | `String @id @default(uuid()) @db.Uuid` | `id` | PK |
| documentId | `String @db.Uuid` | `document_id` | FK → Document (`Restrict`, rel `"DocumentVersions"`) |
| versionNumber | `Int` | `version_number` | correlativo 1..N por documento (lo asigna el service) |
| content | `String @db.Text` | `content` | **contenido Markdown**; ≤ 200.000 (validado en DTO, §2.4) |
| authorUserId | `String @db.Uuid` | `author_user_id` | FK → User (`Restrict`); autor de la versión |
| createdAt | `DateTime @default(now())` | `created_at` | **inmutable** (sin `updated_at`) |

Relaciones: `document Document @relation("DocumentVersions", fields: [documentId], references: [id], onDelete: Restrict)`,
`author User @relation("DocumentVersionAuthor", …)`, y la inversa del puntero
`currentOf Document[] @relation("DocumentCurrentVersion")`.
Índices: `@@unique([documentId, versionNumber], name: "document_version_number_unique")` (**compuesto →
usable como `where`**; además garantiza números únicos por documento), `@@index([documentId])`,
`@@index([authorUserId])`, `@@map("document_versions")`.

> **El contenido NO vive en `Document` (DECISIÓN D4).** Se separan **metadatos** (`Document`: título,
> estado, categoría, activo, puntero) de **contenido versionado** (`DocumentVersion`: Markdown + número +
> autor + timestamp). Alternativa descartada: guardar el contenido en `Document` y copiarlo a una tabla de
> historial al editar — duplica el campo grande, complica "cuál es la vigente" y arriesga desincronización.
> Con el modelo elegido, **editar = crear una `DocumentVersion` nueva** (número = max+1) y **mover el
> puntero** `currentVersionId`; la versión previa **permanece intacta** (AC-020/BR-021). El historial es la
> lista de `DocumentVersion` por `documentId` ordenada por `versionNumber`.

### 1.3 Gancho de Fase 5 (campos NUEVOS, Fase 5 intacta)

Se añaden **dos columnas FK opcionales nuevas** (ver §2 D7 para la justificación de "convivir, no migrar"):

- `DailyLogActivity.assetId String? @db.Uuid` → `asset Asset? @relation(fields: [assetId], references: [id], onDelete: Restrict)`, `@@index([assetId])`. **Convive** con `assetRef String?` (texto, Fase 5), que **no se toca**.
- `Issue.assetId String? @db.Uuid` → `relatedAsset Asset? @relation(fields: [assetId], references: [id], onDelete: Restrict)`, `@@index([assetId])`. Convive con `relatedAssetRef String?`.

La validación de Fase 5 "**soporte requiere su referencia**" (`worklog.service.ts`, `case 'SOPORTE'` ⇒
`assetRef` no vacío) **no se modifica**: sigue exigiendo el **texto** `assetRef`. El nuevo `assetId` es un
enriquecimiento **opcional** que no participa en esa regla. Así la Fase 5 y sus specs
(`worklog.service.spec.ts`, "SOPORTE sin assetRef → 400") siguen pasando sin cambios.

> **Cableado del `assetId` desde Fase 5 = fuera de alcance de Fase 6 (finding #8).** En Fase 6 solo se
> **agrega la columna + relación** FK opcional. Los endpoints/formularios de Fase 5 **no se tocan** y, por
> ahora, no setean `assetId`. Cuando en una fase futura se cablee ese campo desde los flujos de bitácora/
> novedad, deberá **validar que el activo referenciado existe y está en alcance del actor** (mismo
> `assetScopeWhere`) antes de persistir, para no dejar un `assetId` apuntando a un activo fuera de alcance.
> Queda escrito aquí para que ese cableado futuro no lo pase por alto.

### 1.4 Migración versionada

Un único `npx prisma migrate dev --name fase6_activos` desde `apps/api` que:
1. crea `assets`, `documents`, `document_versions` con sus índices;
2. añade las columnas `asset_id` (nullable) + índice a `daily_log_activities` e `issues`;
3. añade las FK con `ON DELETE RESTRICT`.
Todo **aditivo y nullable** sobre tablas existentes ⇒ no requiere backfill ni rompe datos de Fases 1–5. Se
committea la carpeta de migración generada. **Nunca `db push`.**

### 1.5 `prisma generate` y modelos

Tras editar el schema: `npm run build:api` ejecuta `prisma generate` (cliente en `src/generated/prisma`).
Los services importan los tipos de modelo generados (`AssetModel`, `DocumentModel`, `DocumentVersionModel`)
como en Fases 4–5.

### 1.6 Auditoría — ampliación obligatoria (lección 2)

En `apps/api/src/modules/audit/audit.service.ts` se **amplía** el union `AuditObjectType` con
`'ASSET' | 'DOCUMENT' | 'DOCUMENT_VERSION'`, y en `apps/api/src/modules/audit/dto/list-audit-events.dto.ts`
se añaden esos tres literales al array `OBJECT_TYPES`. **Ambos**: si solo se amplía el service, el filtro
`?objectType=ASSET` de `GET /audit-events` responde **400** aunque el evento sí se registre. `scopeProcessId`
= `asset.processId` en los tres tipos (para `DOCUMENT`/`DOCUMENT_VERSION` se resuelve vía el activo del
documento). La lectura de auditoría por rol **no cambia** (ya la cubre `audit.service.ts`): como estos
eventos siempre tienen `scopeProcessId`, el líder los ve por `scopedProcessIds` y el jefe por área.

---

## 2. Autorización y alcance (política 403 rol / 404 alcance)

### 2.1 Guardas y matriz de módulo

Ambos controllers usan `@UseGuards(CurrentUserGuard, RolesGuard)` y
`@Roles(JEFE_AREA, LIDER_PROCESO, INTEGRANTE)` (los tres roles tienen los módulos `asset`/`docs` en
`MODULE_MATRIX`, ya existente). La diferencia de **qué puede hacer cada rol** se aplica por **alcance en el
service** (403 rol / 404 alcance / 409 duplicado), no por `@Roles`.

### 2.2 Helper de alcance propio: `KnowledgeScopeService` (DECISIÓN D8)

Siguiendo la lección 1 (no reutilizar helpers `private` de otros módulos) y el patrón
`capacity-scope.service.ts` / `coordination` scope, se crea `knowledge/knowledge-scope.service.ts` con un
helper **nombrado** que devuelve el `where` de alcance de `Asset` **por ROL**:

La lectura y la escritura se separan en **helpers con firma explícita y sin variables muertas** (finding
#1 de la revisión: una variable local declarada y no usada rompe el `tsconfig` estricto / lint del repo).
`assetScopeWhere` devuelve **solo** el `where` de lectura; la regla de escritura por rol vive en
`requireAssetWritable`, que usa su propio helper privado `leaderProcessIds`:

```ts
// knowledge/knowledge-scope.service.ts

/**
 * Lectura/consulta. IDÉNTICA para integrante y líder: su(s) proceso(s) con grant activo
 * (`scopedProcessIds` = unión de grants, sin distinguir rol). Jefe = sin frontera ({}).
 * La frontera POR ROL (quién escribe/cambia estado) NO vive aquí: vive solo en
 * `requireAssetWritable`. Este helper nunca mira `roleCode`.
 */
assetScopeWhere(actor: CurrentActor): Prisma.AssetWhereInput {
  if (actor.isJefeArea) return {};                                 // jefe: área completa
  return { processId: { in: Array.from(actor.scopedProcessIds) } }; // todos los grants activos
}

/** Procesos donde el actor es LIDER_PROCESO (no cualquier grant). Patrón capacity-scope. */
private leaderProcessIds(actor: CurrentActor): string[] {
  return actor.grants
    .filter((g) => g.roleCode === RoleCode.LIDER_PROCESO)
    .map((g) => g.processId);
}

/**
 * Escritura/estado: jefe, o líder del proceso del activo. El integrante con grant en el proceso
 * solo puede crear/editar metadatos mientras el activo permanezca en BORRADOR (proponer), nunca
 * cambiar el estado ni tocar un ACTIVO/RETIRADO.
 */
requireAssetWritable(actor: CurrentActor, asset: AssetModel, nextStatus: string): void {
  if (actor.isJefeArea) return;
  if (this.leaderProcessIds(actor).includes(asset.processId)) return;
  const scoped = actor.scopedProcessIds.has(asset.processId);
  const onlyBorrador = asset.status === 'BORRADOR' && nextStatus === 'BORRADOR';
  if (scoped && onlyBorrador) return;
  throw new ForbiddenException('Tu rol solo permite proponer en borrador.');
}
```

- **Lectura (consultar/proponer, `specs/10`: integrante = "Consultar/proponer activos"):** la lectura **no
  distingue rol** — integrante y líder leen **igual** su(s) proceso(s) con grant activo ⇒
  `where = { processId: { in: scopedProcessIds } }` (unión de grants). El jefe ve todo (`{}`). Fuera de ese
  `where` ⇒ **404** (findFirst no encuentra). La distinción por rol (quién puede escribir/cambiar estado)
  aparece **solo** en `requireAssetWritable`, nunca en la lectura (NIT-3).
- **Escritura de activo (crear/editar atributos, cambiar estado):** la resuelve `requireAssetWritable`, que
  recibe el `asset` ya resuelto y el **estado resultante** (`nextStatus`) de la operación:
  - jefe ⇒ ok;
  - líder del proceso del activo (`leaderProcessIds(actor).includes(asset.processId)`) ⇒ ok;
  - integrante con grant en el proceso ⇒ ok **solo** si `asset.status === 'BORRADOR'` **y** `nextStatus === 'BORRADOR'`
    (crear/editar-metadatos sin mover estado); cambiar estado o tocar un no-borrador ⇒ **403** ("Tu rol solo
    permite proponer en borrador");
  - sin grant en el proceso ⇒ el activo ni siquiera se resolvió (404 previo por `assetScopeWhere`).

> **Al crear** un activo no hay `asset` todavía: el service construye el objeto a persistir (siempre
> `status: 'BORRADOR'`) y comprueba el rol de forma equivalente — jefe/líder del `processId` del body ⇒ ok;
> integrante con grant en ese proceso ⇒ ok (nace `BORRADOR`); sin grant ⇒ 403. Para las operaciones que **no**
> mueven el estado (`PATCH` de metadatos, `POST /documents`) se pasa `nextStatus = asset.status` de modo que
> la condición `onlyBorrador` solo deje pasar al integrante cuando el activo ya está en `BORRADOR`.

> **Política 403 vs 404 (idéntica a capacity §2.5).** Si el activo **no está en el `where` de lectura** del
> actor ⇒ **404** ("no existe para ti"). Si está en alcance de lectura pero el **rol** no alcanza para la
> operación (integrante intentando cambiar estado / gestionar) ⇒ **403**. El orden siempre es: resolver con
> `findFirst(assetScopeWhere)` → 404 si no; luego `requireAssetWritable` → 403 si rol insuficiente.

### 2.3 Alcance de documentos y versiones

Documentos y versiones **heredan el alcance del activo** (`Document.assetId` → `Asset.processId`): toda
operación de documento resuelve primero el `Asset` con `assetScopeWhere` (404 fuera de alcance) y luego
aplica la regla de escritura. `specs/10` dice del documento "contribuir docs según grants": el integrante
con grant en el proceso **puede crear documentos y versiones** (contribuir); **gestionar el estado del
documento** (`VIGENTE`/`ARCHIVADA`) es líder/jefe.

> **Autoridad de escritura de documentos — se mira el estado del `Asset`, no el del `Document`.** Como
> `requireAssetWritable(actor, asset, nextStatus)` toma el `status` del **activo**, el integrante solo puede
> crear/editar documentos y versiones mientras el **activo** siga en `BORRADOR` (y la operación no mueva su
> estado); jefe/líder del proceso siempre pueden. El `Document.status` ya **no** condiciona la creación de
> versiones (versionar no mueve estado, D6): quien puede escribir sobre el activo puede crear versiones del
> documento con independencia de si el documento está `BORRADOR`/`VIGENTE`/`ARCHIVADA`. El **cambio de estado
> del documento** (`POST /documents/:id/status`) sí queda reservado a líder/jefe. Resumen por rol:
>
> **Activo `RETIRADO` no restringe la creación de documentos/versiones (NIT-2, candado `P`).** Para
> **líder/jefe**, el estado del activo —incluido `RETIRADO`— **no** bloquea crear documentos ni versiones en
> Fase 6: la decisión de §4.1 (finding #6, opción menos invasiva) es **no** inventar ese candado hasta que el
> Site lo confirme. El implementador **no debe añadir** una validación por `status` del activo (ni un 409 "por
> las dudas") en `POST /documents` / `POST /documents/:id/versions`; la única frontera es rol/alcance. Si el
> Site confirmara el candado, se añadiría entonces como 409 (ver §4.1).

| Operación | Integrante (grant en proceso) | Líder del proceso | Jefe |
|---|---|---|---|
| Listar/ver activos y documentos del proceso | ✓ (consultar) | ✓ | ✓ (área) |
| Crear activo (nace `BORRADOR`) | ✓ (proponer) | ✓ | ✓ |
| Editar atributos de activo `BORRADOR` | ✓ | ✓ | ✓ |
| Editar activo ya `ACTIVO`/`RETIRADO` | ✗ 403 | ✓ | ✓ |
| Cambiar estado de activo | ✗ 403 | ✓ | ✓ |
| Crear documento + versión (activo en `BORRADOR`) | ✓ (contribuir) | ✓ | ✓ |
| Crear documento/versión (activo ya `ACTIVO`/`RETIRADO`) | ✗ 403 | ✓ | ✓ |
| Cambiar estado de documento (`VIGENTE`/`ARCHIVADA`) | ✗ 403 | ✓ | ✓ |
| Fuera del proceso (sin grant) | 404 | 404 | ✓ |

### 2.4 Edición de documento = nueva versión (AC-020) y límite 200.000

El contenido llega en el DTO de **crear documento** (versión 1) y en el DTO de **crear versión** (editar).
En ambos, el campo `content` se valida en el DTO como **requerido no vacío con tope** (finding #5): `@IsString()`
+ `@MinLength(1, { message: 'El contenido es obligatorio.' })` + `@MaxLength(200000, { message: 'El
contenido supera el límite de 200.000 caracteres.' })` (AC-032/`09`: "título, contenido y activo
requeridos"; "documento sin contenido no guarda"). Es decir: **1 es el piso y 200.000 el tope**; un `content`
vacío (`""`) se rechaza con **400**, sin dejarlo a interpretación del implementador. `title` requerido no
vacío con la misma regla (AC-032: no guarda sin requeridos).

> **Carácter `P` del tope 200.000 (NIT-1).** `specs/09` lista el contador 200.000 como valor **observado** en
> UI y deja "**límite efectivo**" (si es rechazo duro o solo advertencia visual) en la columna *Pendiente*
> (`P`). Aquí se implementa como **rechazo 400** por indicación explícita del brief; pero el *carácter de
> rechazo duro* no está confirmado por el Site. Si el Site mostrara que el contador solo **advierte** (sin
> bloquear el guardado), se degradaría a un aviso de UI (contador en rojo, sin `@MaxLength`) **sin cambiar el
> modelo de datos** (`content @db.Text` no impone tope). Queda anotado por trazabilidad, no cambia el código
> de esta fase.

Flujo de **crear versión** (`POST /documents/:id/versions`), todo en una
`$transaction`:
1. resolver `Document` + su `Asset` con alcance (404 fuera) y `requireAssetWritable(actor, asset, asset.status)`
   (403 si integrante y el **activo** no está `BORRADOR`); versionar **no mueve** el estado del documento (D6),
   así que `nextStatus = asset.status`;
2. `max(versionNumber)` del documento → `n+1` (o 1 si no hay); crear `DocumentVersion` con el contenido;
3. actualizar **solo** `Document.currentVersionId` al id de la nueva versión; **el `Document.status` NO se
   toca** (D6: crear versión no publica ni despublica);
4. `AuditService.record(tx, { objectType: 'DOCUMENT_VERSION', action: 'CREATE', scopeProcessId: asset.processId, … })`
   y un `UPDATE` de `DOCUMENT` por el cambio de puntero (`currentVersionId`).
La versión previa **no se toca** ⇒ se conserva (AC-020).

> **Concurrencia (DECISIÓN, finding #7).** `versionNumber = max+1` + `@@unique([documentId, versionNumber])`
> protege de números duplicados. Ante dos ediciones concurrentes que calculen el mismo `n+1`, el segundo
> `create` lanza `P2002`. Se adopta la **Opción B (un único reintento server-side)**: ante `P2002` en el
> `create` de la versión, el service **recomputa `max+1` una vez y reintenta** dentro de la misma lógica;
> solo si el reintento también falla con `P2002` se propaga **409 ConflictException** ("otra edición creó una
> versión; recarga el historial"). Esto conserva ambas ediciones legítimas como versiones sucesivas (v3 y v4)
> en un historial append-only, con el 409 como salvaguarda final. Se elige B sobre A (409 directo + reintento
> del cliente) porque mantiene la UX de "guardar" sin obligar al autor a recargar, con una complejidad
> mínima (un reintento acotado, sin bucles). Postura sobre "versión concurrente `P`" de `specs/19`: sin
> inventar merge de contenido.

---

## 3. Organización del módulo y API REST (OpenAPI)

### 3.1 Módulo `knowledge/` con submódulos (DECISIÓN D0)

Un **único módulo raíz `knowledge`** en `apps/api/src/modules/knowledge/` con **dos submódulos de service**
(no dos módulos Nest), análogo a `coordination` de Fase 5:

```
knowledge/
  knowledge.module.ts            // registra ambos controllers + services; importa AuditModule
  knowledge-scope.service.ts     // assetScopeWhere + requireAssetWritable (fuente única de alcance)
  asset/
    asset.controller.ts          // @ApiTags('assets'), rutas /assets/*
    asset.service.ts
    asset-state.service.ts       // máquina de estado del activo (§4)
    dto/ (create-asset, update-asset, list-assets, change-asset-status, asset-response)
  document/
    document.controller.ts       // @ApiTags('documents'), rutas /documents/*
    document.service.ts
    document-state.service.ts    // máquina de estado del documento (§4)
    dto/ (create-document, update-document, create-document-version,
          list-documents, change-document-status, document-response,
          document-version-response, document-content-response)
```

El `KnowledgeScopeService` (§2.2) importa `Prisma` y `AssetModel` del cliente generado
(`../../generated/prisma/...`), `CurrentActor`, `RoleCode` y `ForbiddenException` de `@nestjs/common`, igual
que `capacity-scope.service.ts`. Justificación del módulo único: ambas áreas comparten el **mismo** helper de
alcance (`assetScopeWhere`/`requireAssetWritable`), los mismos `objectType` de auditoría y las mismas
políticas 403/404; agruparlas evita duplicar el scope (lección 1).
Alternativa descartada: dos módulos independientes (duplican `KnowledgeScopeService`). Cada área expone su
**controller fino** con su `@ApiTags` propio para que OpenAPI quede legible. **Colisión de rutas:** las
estáticas (`/assets`, `/documents`) y las paramétricas (`/assets/:id`, `/documents/:id`,
`/documents/:id/versions`, `/documents/:id/content`) no colisionan porque los literales preceden siempre a
`:id`; si en el futuro se solaparan, se registra el controller de estáticas antes en `knowledge.module.ts`
(precaución heredada de `plan.module.ts`). Un `knowledge.module.spec.ts` compila el módulo y afirma que los
controllers y services se inyectan.

### 3.2 Endpoints de activos (`asset.controller.ts`)

| Método | Ruta | Rol efectivo | Descripción | Códigos |
|---|---|---|---|---|
| GET | `/assets` | los 3 (en alcance) | Lista filtrada por alcance; filtros `processId`, `requestId`, `status` (intersectan, nunca amplían) | 200 / 400 / 403 |
| GET | `/assets/:id` | los 3 (en alcance) | Detalle del activo | 200 / 403 / 404 |
| POST | `/assets` | los 3 | Crea activo (nace `BORRADOR`); integrante solo propone | 201 / 400 / 403 / 404 |
| PATCH | `/assets/:id` | líder/jefe; integrante solo si el activo está `BORRADOR` | Edita atributos (no estado) | 200 / 400 / 403 / 404 |
| POST | `/assets/:id/status` | líder/jefe | Cambia estado por transición válida (§4) | 200 / 400 / 403 / 404 |

> **`POST /assets` — validación de FK del body (MEDIUM-1).** `ownerUserId` y `requestId` del body se validan
> en el service (§3.4): usuario inexistente/inactivo ⇒ **400**; Request inexistente o que no participa del
> `processId` del activo ⇒ **400**. Es **400** (entrada inválida), no 404 (que el diseño reserva a "fuera de
> alcance"). Mismo criterio en `PATCH /assets/:id` si `requestId`/`ownerUserId` cambian.

### 3.3 Endpoints de documentos (`document.controller.ts`)

| Método | Ruta | Rol efectivo | Descripción | Códigos |
|---|---|---|---|---|
| GET | `/documents` | los 3 (en alcance) | Lista filtrada por alcance; filtros `assetId`, `processId`, `requestId`, `status`, `q` (texto en título) | 200 / 400 / 403 |
| GET | `/documents/:id` | los 3 (en alcance) | Metadatos + versión vigente (número/autor/fecha), sin el contenido grande | 200 / 403 / 404 |
| POST | `/documents` | los 3 (contribuir) | Crea documento + versión 1 (contenido Markdown) | 201 / 400 / 403 / 404 / 409 |
| PATCH | `/documents/:id` | líder/jefe; integrante si el **activo** está `BORRADOR` | Edita metadatos (título/categoría); no estado, no contenido | 200 / 400 / 403 / 404 |
| POST | `/documents/:id/versions` | los 3 (contribuir); integrante si el **activo** está `BORRADOR` | **Editar contenido = crear nueva versión** (AC-020) | 201 / 400 / 403 / 404 / 409 |
| GET | `/documents/:id/versions` | los 3 (en alcance) | **Historial**: lista de versiones (número/autor/fecha, sin contenido) | 200 / 403 / 404 |
| GET | `/documents/:id/versions/:versionId/content` | los 3 (en alcance) | **Contenido Markdown** de una versión (para preview y descarga) | 200 / 403 / 404 |
| GET | `/documents/:id/content` | los 3 (en alcance) | Contenido Markdown de la **versión vigente** (atajo) | 200 / 403 / 404 |
| POST | `/documents/:id/status` | líder/jefe | Cambia estado del documento (§4) | 200 / 400 / 403 / 404 |

> **Descarga `.md` (SCR-16 "Descargar .md").** El backend **no** genera un adjunto: expone el **contenido**
> como JSON (`DocumentContentResponseDto { documentId, versionId, versionNumber, title, content }`). La
> **descarga la arma el cliente** (api-client) creando un `Blob` `text/markdown` con nombre
> `${slug(title)}-v${versionNumber}.md` (§6). Decisión coherente con el steering (frontend = presentación)
> y evita cabeceras de descarga server-side. El contenido grande viaja solo en los endpoints `/content`
> (los listados nunca lo incluyen, para no inflar respuestas).

### 3.4 Nombres de campo de los DTOs de request (lección 4)

- **CreateAssetDto:** `processId` (uuid, req), `name` (string, req, trim, 1..300), `requestId?` (uuid),
  `ownerUserId?` (uuid), `typeCode?` (string), `technologyCode?` (string), `sourceCode?` (string),
  `frequencyCode?` (string), `documentationRef?` (string ≤2000), `functionalDescription?` (string ≤20000),
  `dependencies?` (string ≤20000). *(El estado NO va en el DTO: nace `BORRADOR`.)*
  **Validación de FK del body (MEDIUM-1), en `AssetService.create` dentro de la `$transaction`, antes de
  persistir y con el código 400 que fija la convención del diseño (entrada inválida, no "fuera de alcance"):**
  - **`ownerUserId?`:** si viene, `const u = await tx.user.findFirst({ where: { id: ownerUserId, active: true } }); if (!u) throw new BadRequestException('El responsable indicado no existe o está inactivo.');`
    ⇒ **400** (no 404). No expande el alcance de lectura del actor.
  - **`requestId?`:** si viene, resolver la Request **con alcance de proceso** exigiendo que participe del
    mismo `processId` del activo (relación real `Request.participants: RequestParticipant[]`, con
    `RequestParticipant.processId`): `const r = await tx.request.findFirst({ where: { id: requestId, participants: { some: { processId } } } }); if (!r) throw new BadRequestException('La solicitud indicada no existe o no pertenece al proceso del activo.');`
    ⇒ **400**. Esto cierra la fuga de referencia cruzada: un actor no puede ligar un activo a una Request de
    otro proceso fuera de su alcance, porque la Request debe participar del `processId` del propio activo
    (que a su vez ya pasó el control de escritura por rol/alcance). El `mainProcessId` de la Request siempre
    se materializa como participante (invariante BR-001/D2 del schema), de modo que `participants.some` cubre
    tanto el proceso principal como los participantes.
  - **`typeCode`/`technologyCode`/`sourceCode`/`frequencyCode`:** si vienen, el service valida que el código
    exista y esté `active` en su familia de `CatalogItem` (D2) ⇒ **400** si inválido.
- **UpdateAssetDto:** todos opcionales excepto que **no** incluye `status` ni `processId` (el proceso del
  activo no se reasigna en Fase 6): `name?`, `requestId?` (uuid|null para desligar), `ownerUserId?`
  (uuid|null), `typeCode?`, `technologyCode?`, `sourceCode?`, `frequencyCode?`, `documentationRef?`,
  `functionalDescription?`, `dependencies?`. **Regla de requeridos en PATCH (finding #4):** si `name` está
  **presente**, se valida igual que en creación (`@IsOptional() @IsString() @Transform(trim) @MinLength(1)
  @MaxLength(300)`); `name: ""` o solo-espacios ⇒ **400** (AC-032: no se persiste un activo sin nombre vía
  edición). Semántica general del PATCH: **presente ⇒ debe cumplir el requerido; ausente ⇒ no se toca**.
  **Si `requestId`/`ownerUserId` vienen con un uuid (reasignación), se aplican las mismas validaciones de FK
  del body que en `create` (MEDIUM-1): usuario inexistente/inactivo ⇒ 400; Request inexistente o fuera del
  `processId` del activo ⇒ 400.** El valor `null` desliga la FK (permitido).
- **ChangeAssetStatusDto:** `targetStatus` (`@IsIn(['BORRADOR','ACTIVO','RETIRADO'])`, req), `reason?`
  (string ≤2000).
- **ListAssetsDto (query):** `processId?` (uuid), `requestId?` (uuid), `status?` (`@IsIn` de los 3),
  `take?` (int 1..500).
- **CreateDocumentDto:** `assetId` (uuid, req), `title` (string, req, trim, 1..300), `categoryCode?`
  (string), `content` (string, req, `@IsString() @MinLength(1) @MaxLength(200000)`). *(estado nace
  `BORRADOR`; versión 1 se crea con `content`.)*
- **UpdateDocumentDto:** `title?` (string, 1..300), `categoryCode?` (string|null). *(no `content`, no
  `status`, no `assetId`.)* **Regla de requeridos en PATCH (finding #4):** si `title` está **presente**, se
  valida igual que en creación (`@IsOptional() @IsString() @Transform(trim) @MinLength(1) @MaxLength(300)`);
  `title: ""`/solo-espacios ⇒ **400** (AC-032: no se deja un documento sin título vía edición). `ausente ⇒ no se toca`.
- **CreateDocumentVersionDto:** `content` (string, req, `@IsString() @MinLength(1) @MaxLength(200000)`).
  *(editar contenido = nueva versión.)*
- **ChangeDocumentStatusDto:** `targetStatus` (`@IsIn(['BORRADOR','VIGENTE','ARCHIVADA'])`, req), `reason?`
  (string ≤2000).
- **ListDocumentsDto (query):** `assetId?` (uuid), `processId?` (uuid), `requestId?` (uuid), `status?`
  (`@IsIn` de los 3), `q?` (string ≤200, búsqueda en título), `take?` (int 1..500).

Response DTOs separados: `AssetResponseDto`, `DocumentResponseDto` (incluye `currentVersion:
{ id, versionNumber, authorUserId, createdAt } | null`), `DocumentVersionResponseDto`
(sin `content`), `DocumentContentResponseDto` (con `content`). Todos con `@ApiProperty`.

---

## 4. Máquinas de estado (mínimas, reversibles, documentadas — `specs/28` P)

El SDD marca retiro/recuperación de activos y transiciones/candados de documento como **`P`**. Se adoptan
máquinas **mínimas y reversibles**, nunca como regla afirmada del Site, con helper read-only
(`asset-state.service.ts` / `document-state.service.ts`) — el estado **no** se escribe por DTO libre, solo
por el endpoint `/status`.

> **Por qué no se reutiliza `coordination/workflow-state.service.ts` (finding #9).** Existe ese helper de
> máquina de estado reversible, pero está **acoplado al grafo `RECORD_STATE`** (Borrador/En curso/Bloqueado/
> Completado/Archivado) de Fase 5. `Asset` usa el grafo `ASSET_STATUS` y `Document` el grafo `DOC_STATUS`,
> que son **grafos distintos**. Reutilizar `WorkflowStateService` obligaría a parametrizarlo o a mezclar
> estados ajenos; en su lugar se **replica el patrón** (helper read-only, transición no permitida ⇒ 400) con
> los grafos propios de cada entidad. No es duplicación injustificada: es el mismo patrón sobre datos
> distintos.

### 4.1 Asset (`AssetStatus`)

```
BORRADOR ──activar──▶ ACTIVO ──retirar──▶ RETIRADO
                        ▲                     │
                        └──────recuperar──────┘
```

Transiciones permitidas (reversibles vía recuperar): `BORRADOR→ACTIVO` (activar), `ACTIVO→RETIRADO`
(retirar), `RETIRADO→ACTIVO` (recuperar). **No se incluye `ACTIVO→BORRADOR`** (ver abajo). Cualquier otra
transición ⇒ **400** ("transición de estado no permitida").

> **`ACTIVO→BORRADOR` eliminada del grafo permitido (MEDIUM-2, opción preferida).** `specs/06` solo nombra
> para activos el "ciclo de **alta, retiro y recuperación**" (marcado `P`); "volver a borrador" desde ACTIVO
> **no aparece en ningún spec** (`06`/`09`/`12`), y `specs/12` cierra con "No diseñar una acción … si no se
> confirma en el Site". El brief pide **no inventar transiciones**, no "inventar solo las reversibles". Por
> eso el grafo mínimo se reduce a las **tres** transiciones que `specs/06` sí nombra —`BORRADOR→ACTIVO`,
> `ACTIVO→RETIRADO`, `RETIRADO→ACTIVO`—, todas reversibles vía `recuperar`, sin la cuarta inventada. Si el
> Site confirmara una necesidad de "volver a borrador", se añadiría luego como transición explícita; hasta
> entonces no se habilita (coherente con cómo la máquina de documento trata `VIGENTE→BORRADOR`, ver §4.2).

> **Procedencia de estas transiciones (corregido por el finding #3 + MEDIUM-2).** `specs/06` marca el "ciclo
> de alta, retiro y recuperación" de activos como **pendiente (`P`)** y `specs/12` lista "borrado/retirada/
> restauración" en la columna *por cotejar* y cierra con **"No diseñar una acción de borrado o restauración
> si no se confirma en el Site."** Por tanto, estas transiciones de ciclo de vida (activar/retirar/recuperar)
> **no están confirmadas por el Site**: se adoptan como **máquina mínima reversible por decisión
> conservadora, pendiente de cotejo con Site**, no como regla afirmada. Lo que `specs/12` **sí** exige y aquí
> se cumple es el **no-borrado físico**: el retiro es un **cambio de estado** (`ACTIVO→RETIRADO`), reversible
> con `recuperar`, **nunca `DELETE`** (D3).

Un activo `RETIRADO` sigue listándose (con su estado) y sus documentos siguen consultables.

> **Documentos sobre un activo `RETIRADO` (DECISIÓN, finding #6 — opción menos invasiva).** `specs/19` lista
> "activo retirado" como caso borde a **observar en Site**, no a inventar. Se elige **NO bloquear** por el
> estado del activo en Fase 6: `POST /documents` y `POST /documents/:id/versions` **no** rechazan por que el
> activo esté `RETIRADO` (la autorización por rol/alcance sí aplica). El escenario "activo RETIRADO +
> creación/versionado de documentos" queda documentado como **`P`** a cotejar; si el Site confirmara el
> candado, se añadiría como **409 ConflictException** en ambos endpoints con mensaje fijo. Así no se inventa
> una regla de negocio no confirmada ni se mezclan códigos 409/400.

### 4.2 Document (`DocStatus`)

```
BORRADOR ──publicar──▶ VIGENTE ──archivar──▶ ARCHIVADA
   ▲                     │  ▲                    │
   └──despublicar────────┘  └──reactivar─────────┘
(crear versión NO mueve el estado — solo POST /documents/:id/status lo hace, D6)
```

Transiciones permitidas (reversibles), **todas por el endpoint explícito `POST /documents/:id/status`**:
`BORRADOR→VIGENTE` (publicar), `VIGENTE→ARCHIVADA` (archivar), `ARCHIVADA→VIGENTE` (reactivar),
`VIGENTE→BORRADOR` (despublicar). Cualquier otra ⇒ **400**.

> **Edición de 'Vigente' — NO hay transición automática (DECISIÓN D6, corregida por el finding #2).**
> `specs/06` cierra con "los nombres de catálogo **no deben codificar transiciones automáticas**" y
> `09`/`19` dejan "edición de documento vigente" como caso **`P`** a observar en Site. Por tanto, **crear una
> versión NO mueve el estado del documento**: `POST /documents/:id/versions` conserva `Document.status` tal
> cual (una versión nueva no publica ni despublica). El cambio de estado ocurre **únicamente** por el
> endpoint explícito `POST /documents/:id/status`. Así "editar" nunca dispara una transición no observada, y
> AC-020 se respeta igual porque la versión previa es **inmutable** y queda en el historial. Es decir: se
> puede crear una versión sobre un documento `VIGENTE` (el contenido vigente queda apuntado por
> `currentVersionId` solo si así se decide — ver abajo) y el estado del documento no cambia por sí solo.
>
> **Puntero `currentVersionId` al crear versión:** se mueve a la versión recién creada (la "última edición"
> es la vigente de contenido), pero esto es un puntero de contenido, **no** un cambio del `status`
> (`BORRADOR`/`VIGENTE`/`ARCHIVADA`), que es ortogonal y solo lo mueve `/status`.
>
> **Variante `P` documentada, no por defecto:** la alternativa "editar un `VIGENTE` lo degrada
> automáticamente a `BORRADOR`" queda registrada **solo como variante pendiente de cotejo con Site**; no se
> implementa como comportamiento por defecto para no inventar una transición automática. Si el Site la
> confirmara, se añadiría luego como regla explícita.

---

## 5. Patrón de servicio y auditoría (idéntico a Fases 4–5)

Cada mutación: resolver con `findFirst` + `assetScopeWhere` (404 fuera) → `requireAssetWritable` (403 rol) →
`prisma.$transaction(async (tx) => { … mutación …; await audit.record(tx, {...}); })`. `P2002` →
`ConflictException` (409). Snapshots `before`/`after` en los `audit.record` (como `assignmentSnapshot`):
para `DOCUMENT_VERSION` el snapshot incluye `versionNumber` y **longitud** del contenido (no el contenido
completo, para no inflar la tabla de auditoría — se referencia por id). `scopeProcessId` = `asset.processId`
en los tres `objectType`. Lecturas (`findMany`) aplican `assetScopeWhere` y nunca incluyen el campo `content`
en los listados.

---

## 6. Frontend (SOLO vía `@plantilla-portales/api-client`)

Se convierten las dos páginas placeholder (hoy `UnderConstruction`):
- `apps/web/src/app/activos/catalogo/page.tsx` → **SCR-15 Activos**.
- `apps/web/src/app/activos/documentos/page.tsx` → **SCR-16 Documentos**.

`navigation.ts` **ya** tiene los items (`asset`/`docs`): **no se toca** (revisado). El frontend **no**
importa Prisma ni define interfaces a mano: usa los tipos y clientes **generados** por
`npm run contracts:generate` tras implementar la API.

- **SCR-15 (Activos):** tabla filtrable por proceso/solicitud/estado; formulario de alta/edición con
  nombre (requerido), selects de maestras (tipo/tecnología/fuente/frecuencia poblados desde `/catalogs`),
  solicitud/owner opcionales, textos; botón de cambio de estado (activar/retirar/recuperar) visible solo si
  el rol/alcance lo permite (gating cosmético; el control real es server-side). Estados loading/vacío/
  error/éxito y conservación de la entrada ante error (AC-031 heredado).
- **SCR-16 (Documentos):** lista filtrable (proceso/solicitud/activo/estado + búsqueda por texto); editor
  Markdown con modos **editor/vista previa**, **contador `N/200.000`** (bloquea Guardar al exceder, atajo
  Ctrl+S opcional), botón **Guardar** (crea documento ⇒ versión 1, o `POST /versions` si ya existe),
  **Descargar .md** (el api-client pide `/content` y arma un `Blob` `text/markdown` en el cliente),
  **historial de versiones** (lista de `/versions`, con ver contenido de una versión concreta vía
  `/versions/:versionId/content`), y cambio de estado (publicar/archivar) según rol.

---

## 7. Seed de catálogo (`apps/api/prisma/seed.ts`)

`ASSET_TYPE` (10 valores) **ya existe** (Fase 2) y `DOC_STATUS` (`BORRADOR`/`VIGENTE`/`ARCHIVADA`) **ya
existe** (Fase 1): **no se re-siembran**. Se **añaden** (idempotente, con el `upsert` por
`catalog_code_unique` existente) solo las familias que faltan, con los valores observados en el SDD
(`specs/20`):

> **Carácter `P` del seed de maestras (NIT-4).** `specs/20` presenta TECHNOLOGY/SOURCE/FREQUENCY **"como
> ejemplos"** y advierte explícitamente que **"la lista no es exhaustiva"**. Por tanto estas tres familias se
> siembran como **seed inicial `P`** (valores observados, no cerrados), **ampliable por gestión de maestras**
> sin migración (son `CatalogItem` con `active`/`sortOrder`), igual que `DOC_CATEGORY`. No se tratan como
> lista cerrada confirmada por el Site.

- **`TECHNOLOGY`** (plataforma/tecnología; valores de ejemplo `P`): `QLIK` "Qlik", `AWS` "AWS", `PYTHON`
  "Python", `SQL` "SQL", `TALEND` "Talend", `POWER_BI` "Power BI".
- **`SOURCE`** (fuente; valores de ejemplo `P`): `DATA_LAKE` "Data Lake", `API` "API", `BASE_DATOS` "Base de
  datos", `ARCHIVO` "Archivo", `APLICACION` "Aplicación".
- **`FREQUENCY`** (frecuencia; valores de ejemplo `P`): `TIEMPO_REAL` "Tiempo real", `CADA_HORA` "Cada hora",
  `DIARIA` "Diaria", `SEMANAL` "Semanal", `MENSUAL` "Mensual", `BAJO_DEMANDA` "Bajo demanda".
- **`DOC_CATEGORY`** (categoría de documento): `specs/20` lista "categoría de documento" como familia pero
  **no enumera valores** ⇒ se siembra un conjunto **mínimo reversible** marcado `P` en comentario:
  `TECNICA` "Técnica", `FUNCIONAL` "Funcional", `OPERATIVA` "Operativa", `OTRO` "Otro". No se inventan más;
  queda documentado como `P` (cotejo con Site).

El código del seed replica el patrón existente (array `CATALOG_ITEMS` + `upsert` por
`catalog_code_unique`), con `active: true` y `sortOrder` incremental por familia.

---

## 8. Testing

- **Unit (Jest, mock de `PrismaService`/`AuditService`), por service:** máquina de estado de Asset
  (transiciones válidas/inválidas → 400); máquina de Document (transiciones solo por `/status`) y que
  **crear versión NO cambia `Document.status`** (D6); `createDocument` crea versión 1 y setea
  `currentVersionId`; `createVersion` incrementa `versionNumber`, conserva la previa (AC-020) y mueve solo el
  puntero; `content`/`title` vacíos → 400 y límite 200.000 (DTO) → 400 (AC-032); PATCH con `title`/`name`
  vacío → 400 (finding #4); alcance: integrante fuera de proceso → 404, integrante cambiando estado → 403,
  líder de su proceso → ok, jefe → ok; concurrencia: **un reintento server-side** recomputa `max+1` y, si
  reincide, P2002 → 409 (finding #7); auditoría registrada con `scopeProcessId = asset.processId`.
- **Module spec:** `knowledge.module.spec.ts` compila el módulo y afirma inyección de los dos controllers y
  sus services.
- **Integración (api-client):** tras `contracts:generate`, un smoke del flujo crear activo → crear documento
  → editar (nueva versión) → historial → contenido de versión. (E2E Playwright de SCR-15/16 queda para la
  fase de pruebas de UI; no se amplía aquí el runner.)
- **Fase 5 intacta:** `worklog.service.spec.ts` ("SOPORTE sin assetRef → 400") debe seguir **verde** sin
  cambios (el gancho `assetId` es opcional y no participa en esa regla).

Antes de dar por terminada la fase: `npm run typecheck` + `npm run build:api` + tests + `contracts:generate`
+ `build:api-client`, y commit de `openapi.json` + `packages/api-client/src/generated/*`.

---

## 9. Resumen de decisiones clave

- **Modelo de versionado:** `Document` (metadatos + `currentVersionId`) + `DocumentVersion` N inmutables
  (`versionNumber` correlativo, Markdown ≤200.000, autor, timestamp). **Editar = nueva versión**; la previa
  se conserva (AC-020); el `@@unique([documentId, versionNumber])` protege de carreras (409).
- **Gancho `assetRef`:** se añade `assetId` **FK opcional NUEVO** en `DailyLogActivity` e `Issue` que
  **convive** con el texto `assetRef`/`relatedAssetRef`; **no se migra** y **no se toca** la validación
  "soporte requiere su referencia" de Fase 5 (opción menos invasiva, aditiva y reversible).
- **Alcance por rol (en el `where`, por `grant.roleCode`):** integrante consulta/propone (lee su(s)
  proceso(s), crea/edita en `BORRADOR`); líder gestiona su proceso (atributos, estado, documentos); jefe el
  área. Fuera de alcance ⇒ **404**; rol insuficiente ⇒ **403**.
- **Máquinas de estado mínimas reversibles (todas `P`, pendientes de cotejo con Site):** Asset
  `BORRADOR↔ACTIVO↔RETIRADO` (retiro = cambio de estado, **nunca** borrado físico — lo único que `12` sí
  exige; las transiciones retirar/recuperar son decisión conservadora `P`, no confirmadas). Document
  `BORRADOR↔VIGENTE↔ARCHIVADA`, con el **estado movido SOLO por `POST /documents/:id/status`**: crear una
  versión **no dispara ninguna transición automática** (finding #2); la variante "editar `VIGENTE` ⇒
  `BORRADOR`" queda solo documentada como `P`.
- **Auditoría:** `ASSET`/`DOCUMENT`/`DOCUMENT_VERSION` añadidos en `audit.service.ts` **y** en
  `OBJECT_TYPES` del filtro; `scopeProcessId = asset.processId`.
- **Módulo:** `knowledge/` (raíz) con submódulos `asset/` + `document/` y `KnowledgeScopeService` único.
- **Seed:** se añaden `TECHNOLOGY`, `SOURCE`, `FREQUENCY`, `DOC_CATEGORY` (esta última mínima, `P`);
  `ASSET_TYPE` y `DOC_STATUS` ya existen.

---

## 10. Respuestas a la revisión (`design-review.json`, veredicto CHANGES_REQUESTED)

Las fuentes citadas en los findings #2, #3 (`specs/06`, `specs/12`), el patrón `capacity-scope.service.ts` y
el `CurrentActor` se **releyeron** para verificar los hallazgos antes de resolverlos. Resolución de los 10:

| # | Severidad | Resolución | Dónde |
|---|---|---|---|
| 1 | HIGH | **Resuelto.** Se separan `assetScopeWhere` (solo `where` de lectura) y `requireAssetWritable(actor, asset, nextStatus)`, con un helper privado `leaderProcessIds(actor)`. **Sin variables muertas** (el `leaderProcessIds` suelto desapareció), firmas explícitas, compila bajo TS estricto/lint. | §2.2 |
| 2 | MEDIUM | **Resuelto.** Crear versión **NO mueve** `Document.status` (sin transición automática, `specs/06`). El estado cambia **solo** por `POST /documents/:id/status`. La degradación `VIGENTE→BORRADOR` queda **solo como variante `P`**, no por defecto. | §4.2, §2.4, mapa decisión→fuente |
| 3 | MEDIUM | **Resuelto.** Corregida la cita: `specs/12` respalda **solo el no-borrado físico**; las transiciones retirar/recuperar son `P` (de `specs/06`), decisión conservadora pendiente de cotejo con Site. Se quitó `12` como respaldo de las transiciones. | §4.1, mapa decisión→fuente |
| 4 | MEDIUM | **Resuelto.** `UpdateDocumentDto.title` y `UpdateAssetDto.name`: si están **presentes** se validan como en creación (`@MinLength(1)` tras trim) ⇒ vacío/espacios = **400**; ausente = no se toca. | §3.4 |
| 5 | MEDIUM | **Resuelto.** `content` = `@IsString() @MinLength(1) @MaxLength(200000)` en `CreateDocumentDto` y `CreateDocumentVersionDto`: piso 1, tope 200.000; vacío ⇒ 400 (AC-032). | §2.4, §3.4 |
| 6 | MEDIUM | **Resuelto (opción menos invasiva).** Fase 6 **no bloquea** por activo `RETIRADO`; el caso "activo RETIRADO + documentos" queda `P`. Si el Site lo confirma, sería **409** en `POST /documents` y `POST /documents/:id/versions`. Se eliminó la mezcla 409/400. | §4.1 |
| 7 | MEDIUM | **Resuelto (Opción B).** Un **único reintento server-side** recomputa `max+1` ante `P2002`; si reincide, **409**. Conserva ambas ediciones legítimas como versiones sucesivas. | §2.4, §8, §9 |
| 8 | NIT | **Resuelto.** Anotado que el cableado del `assetId` desde Fase 5 queda **fuera de alcance de Fase 6** (solo columna+relación) y que, al cablearse, deberá validar existencia y alcance del activo. | §1.3 |
| 9 | NIT | **Resuelto.** Justificado por qué no se reutiliza `WorkflowStateService` (acoplado a `RECORD_STATE`); se replica el patrón con los grafos propios `ASSET_STATUS`/`DOC_STATUS`. | §4 (intro) |
| 10 | NIT | **Resuelto.** Confirmado que `AssetOwner` es la única relación `Asset↔User` (nombre explícito opcional, se mantiene) y que `onDelete: Restrict` es coherente con el no-borrado físico de usuarios del repo. | §1.2 |

---

## 11. Respuestas a la revisión — iteración 3 (`design-review.json`, veredicto CHANGES_REQUESTED: 0 HIGH / 2 MEDIUM / 4 NIT)

Antes de resolver se **releyó el código real** del worktree para fundar los fixes: `schema.prisma`
(`Request.participants: RequestParticipant[]` con `RequestParticipant.processId`, e invariante de que el
`mainProcessId` siempre se materializa como participante — BR-001/D2) y la convención 400/404 del propio
diseño. Resolución de los 6 hallazgos:

| # | Severidad | Resolución | Dónde |
|---|---|---|---|
| MEDIUM-1 | MEDIUM | **Resuelto.** `ownerUserId` del body ⇒ `tx.user.findFirst({ id, active: true })`, si no **400** (ya no 404; coherente con "404 = fuera de alcance / 400 = entrada inválida"). `requestId` del body ⇒ se resuelve la Request **con alcance de proceso** exigiendo `participants: { some: { processId } }` (el `processId` del activo), si no **400** — cierra la fuga de referencia cruzada a Requests de otro proceso. Mismas reglas en `PATCH` al reasignar. Códigos de maestra inválidos ⇒ 400 (D2). | §1.2 (nota owner), §3.2 (nota POST /assets), §3.4 (CreateAssetDto/UpdateAssetDto) |
| MEDIUM-2 | MEDIUM | **Resuelto (opción preferida).** Se **quita `ACTIVO→BORRADOR`** del grafo permitido de Asset: quedan solo las tres transiciones que `specs/06` nombra (`BORRADOR→ACTIVO`, `ACTIVO→RETIRADO`, `RETIRADO→ACTIVO`), todas reversibles vía recuperar. No se inventa "volver a borrador"; si el Site lo confirmara se añadiría luego (coherente con el trato de `VIGENTE→BORRADOR` del documento). | §4.1 (grafo + nota), mapa decisión→fuente, §9 |
| NIT-1 | NIT | **Resuelto.** Anotado que el tope 200.000 es "límite efectivo" `P` en `specs/09`: se implementa como rechazo **400** por indicación del brief, degradable a aviso de UI sin tocar el modelo (`content @db.Text`) si el Site mostrara que solo advierte. | §2.4 |
| NIT-2 | NIT | **Resuelto.** Afirmado explícitamente que para **líder/jefe** el estado `RETIRADO` del activo **no** restringe crear documentos/versiones (candado `P`, finding #6); el implementador no debe añadir un 409 por `status` del activo salvo confirmación del Site. | §2.3 |
| NIT-3 | NIT | **Resuelto.** Aclarado en el comentario de `assetScopeWhere` y en el bullet de lectura que la **lectura es idéntica para integrante y líder** (su(s) proceso(s) con grant) y que la frontera por rol vive **solo** en `requireAssetWritable`; el helper de lectura nunca mira `roleCode`. | §2.2 |
| NIT-4 | NIT | **Resuelto.** `TECHNOLOGY`/`SOURCE`/`FREQUENCY` marcados como **valores de ejemplo `P`** ("la lista no es exhaustiva", `specs/20`), seed inicial ampliable por gestión de maestras, igual que `DOC_CATEGORY`. | §7 |
| NIT-5 | NIT | **Resuelto.** La "revisión" de `specs/08` se mapea a `DocumentVersion.versionNumber` + historial (no es un campo aparte); un flujo de revisión/aprobación, de existir, sería adyacente a FEATURE-008 y queda fuera de alcance `P`. | §1.2 (tabla Document) |

Con esto, los 2 MEDIUM y los 4 NIT del segundo review quedan cerrados; no se abren decisiones arquitectónicas
nuevas (los fixes son validaciones de entrada, un recorte de grafo y notas de trazabilidad), y el resto del
diseño —aprobado en lo esencial por el review— se mantiene intacto.
