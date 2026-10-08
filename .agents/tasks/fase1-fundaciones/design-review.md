# Revisión de diseño · Fase 1 · Fundaciones (control-phari)

Revisión en frío del documento `design.md` (Revisión 3) contra la especificación en
`SDD_control-phari/specs` y contra las reglas de arquitectura del repo. Se leyó el diseño
completo y se verificó cada afirmación material contra el código fuente real del worktree
(`apps/api`, `apps/web`, `prisma`) y contra los specs 02, 05, 07, 08, 10, 11, 15, 20, 22, 25, 28.

Veredicto: **CHANGES_REQUESTED** (2 MEDIUM, 0 HIGH, 2 NIT).

El diseño es sólido en lo esencial y resuelve correctamente los hallazgos de rondas previas
(límites de arquitectura, no reintroducir auth real como función propia, AuditEvent completo,
política 403/404 para recursos por proceso, cardinalidad multi-grant tratada como decisión P y
no como afirmación del spec, deadlock de arranque del selector dev resuelto). Los dos MEDIUM
restantes son defectos verificables y acotados: una contradicción con el agrupamiento de
módulos del propio spec que el diseño cita, y un mecanismo de "seed" que no corresponde a la
versión de Prisma instalada. Ninguno exige rediseño; ambos tienen corrección concreta.

---

## Hallazgos

### 1 · MEDIUM — "Equipo y permisos" se agrupa bajo Administración, pero `02-modules.md` lo ubica en Gobierno

**Dónde:** §5.1 (árbol de rutas: `administracion/equipo/page.tsx ← SCR-22 Equipo y permisos`) y
§5.2 ("El sidebar refleja los 6 grupos de `02-modules.md`… **Inicio, Demanda, Seguimiento,
Activos, Administración, Gobierno**").

**Problema:** El diseño afirma reflejar los grupos de `02-modules.md`, pero contradice a ese
mismo spec en la ubicación de SCR-22. Verificado en `specs/02-modules.md`:

- Grupo **Administración**: solo "Configuración y maestras" (SCR-18).
- Grupo **Gobierno**: "Cumplimiento de frameworks", "Aprobaciones", "Auditoría",
  **"Equipo y permisos" (SCR-22)** y "Mis permisos" (SCR-23).

El diseño coloca `administracion/equipo` (SCR-22, módulo `team`) bajo **Administración**, cuando
el spec lo coloca bajo **Gobierno**. `administracion/maestras` (SCR-18) sí coincide (va en
Administración), y `gobierno/auditoria` / `gobierno/mis-permisos` también coinciden. Solo SCR-22
está mal ubicado. Es una incoherencia entre el diseño y la fuente que declara seguir; produce un
menú que no corresponde al mapa de módulos documentado.

**Fix concreto:** mover la pantalla de equipo al grupo Gobierno para alinear con el spec:

```
app/
  administracion/
    maestras/page.tsx        ← SCR-18 Configuración/maestras (Administración)
  gobierno/
    equipo/page.tsx          ← SCR-22 Equipo y permisos (Gobierno)   [movido]
    auditoria/page.tsx       ← SCR-21 Auditoría
    mis-permisos/page.tsx    ← SCR-23 Mis permisos
```

y actualizar la lista de archivos de §9 en consecuencia. Si por criterio de producto se prefiere
dejar "Equipo y permisos" en Administración, el diseño debe decirlo explícitamente como
**decisión** y dejar de afirmar que "refleja los grupos de `02-modules.md`", porque ahí no está.

---

### 2 · MEDIUM — El "seed" se declara con `prisma.seed` en `prisma.config.ts`, campo que no existe en Prisma 7

**Dónde:** §1.4 ("Se añade `prisma.seed` en `apps/api/prisma.config.ts` y un script npm real
`"prisma:seed": "tsx prisma/seed.ts"`…").

**Problema:** Verificado contra el repo: `apps/api/prisma.config.ts` usa
`defineConfig` importado de `prisma/config` (Prisma ORM v7; `prisma`/`@prisma/client` `^7.10.0`
en `apps/api/package.json`). En Prisma 7 el comando de seed se configura dentro de
`defineConfig` bajo la clave **`migrations.seed`**, no con un campo `prisma.seed`. El término
`prisma.seed` corresponde al mecanismo legado `package.json#prisma.seed` de Prisma ≤5, que ya no
aplica. Tal como está redactado, el seed no quedaría cableado y `prisma db seed` no lo
ejecutaría. Esto es relevante porque el seed es el que garantiza las 3 filas de `Role` de las que
depende §4.2.1 (si faltan, el diseño mismo prevé un `500`): el mecanismo de cableado tiene que
ser correcto.

**Fix concreto:** declarar el seed en el `defineConfig` existente usando la clave de Prisma 7:

```ts
// apps/api/prisma.config.ts
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
```

y mantener el script npm `"prisma:seed": "tsx prisma/seed.ts"` como atajo. Reescribir la frase de
§1.4 para que diga "`migrations.seed` en `defineConfig`", no "`prisma.seed`".

---

### 3 · NIT — `prisma migrate dev` no es un comando del repo; se invoca ad-hoc con `npx`

**Dónde:** §1.3 (`npx prisma migrate dev --name fase1_fundaciones`).

**Problema:** Verificado: `apps/api/package.json` solo declara `prisma:migrate:deploy`
(para despliegue) y no un script de migración de desarrollo. El diseño invoca `migrate dev`
directamente con `npx`, lo cual es válido y no rompe comandos existentes (steering), pero deja la
creación de migraciones fuera de los scripts versionados, a diferencia del resto del flujo
(`prisma:generate`, `contracts:generate`, etc.).

**Fix concreto (opcional):** añadir `"prisma:migrate:dev": "prisma migrate dev"` a
`apps/api/package.json` y referenciarlo, para que el comando de creación de migraciones quede
documentado y reproducible como el resto. No bloquea.

---

### 4 · NIT — La política 403 vs 404 es una decisión del diseño, no una regla del spec; está bien disclosed pero conviene marcarla como tal en el resumen

**Dónde:** §2.4 ("Resumen operativo: 403 = … 404 = …").

**Problema:** Verificado: ningún spec (`10`, `11`, `18`, `28`) menciona códigos HTTP 403/404 ni
una política de "ocultar existencia". `specs/18` (AC-025) solo exige "Servidor deniega **sin
filtrar datos no autorizados**" y `specs/10` control 2 "denegar **sin filtrar datos**". El mapeo
concreto rol→403 / fuera-de-alcance→404 es una decisión de diseño razonable y coherente con esos
controles, y el diseño la explica. El único matiz: el "Resumen operativo" la presenta en tono de
regla establecida; convendría etiquetarla explícitamente como **decisión de Fase 1** (como se
hace con la cardinalidad multi-grant en §1.2) para no sugerir respaldo literal del spec.

**Fix concreto:** anteponer "Decisión de Fase 1:" al resumen 403/404 y citar que deriva de
AC-025 / control negativo 2 ("denegar sin filtrar datos"), no de un código HTTP del spec.

---

## Suposiciones verificadas (contra el código real)

1. **Patrón del módulo `catalog`** (controller fino → service con lógica → DTOs class-validator →
   `P2002` → `ConflictException`, `findOne` → `NotFoundException`): confirmado en
   `apps/api/src/modules/catalog/catalog.service.ts` y `catalog.controller.ts`. El diseño lo
   describe con fidelidad.
2. **`CurrentUserGuard` por módulo (no `APP_GUARD` global):** factible. `CatalogModule`
   registra `controllers`/`providers` de forma estándar; aplicar `@UseGuards` a nivel de
   controller es directo. Confirmado en `catalog.module.ts`.
3. **`GET /health` existe y debe quedar exenta:** confirmado en
   `apps/api/src/health/health.controller.ts` (`@Controller('health')`) y `app.module.ts`.
4. **CORS methods hoy `['GET','POST','PATCH']`:** confirmado en `app.config.ts`; añadir
   `'DELETE'` (§4.1) es correcto y necesario para `DELETE /grants/:id`.
5. **`ValidationPipe` global (whitelist + forbidNonWhitelisted + transform):** confirmado en
   `app.config.ts`. El diseño lo cita correctamente.
6. **Modelo `CatalogItem` reutilizable, PK `String @id @default(uuid()) @db.Uuid`,
   `snake_case` vía `@map`, `created_at`/`updated_at`:** confirmado en `prisma/schema.prisma`.
   El patrón de modelado del diseño (§1.1) coincide con el existente.
7. **`npm run prisma:generate`, `contracts:generate` (`openapi:generate` + `api-client:generate`),
   `test:unit`, `test:e2e`, `test:all`, `typecheck`, `build`:** todos existen en los `package.json`
   raíz / `apps/api`. El diseño no inventa comandos (salvo el NIT 3).
8. **`tsx` disponible como devDependency** para `seed.ts`: confirmado en `apps/api/package.json`.
9. **`generate-openapi.ts` no abre conexión a BD** (§4.5): confirmado. Usa
   `NestFactory.create(AppModule)` sin `app.init()`/`listen()`, por lo que `onModuleInit`
   (`$connect`) no corre. Añadir módulos que inyectan `PrismaService` no cambia esto; solo exige
   que `DATABASE_URL` esté **definida** (el constructor de `PrismaService` la valida), no accesible.
   La afirmación del diseño es correcta.
10. **Frontend consume solo vía `@plantilla-portales/api-client`:** confirmado en
    `apps/web/src/lib/api-client.ts` (`createApiClient`); no hay acceso a Prisma ni a PostgreSQL.
11. **Patrón de traducción de errores por status** (`messageForStatus` 400/404/409, sin exponer
    JSON ni Prisma): confirmado en `apps/web/src/lib/catalog.ts`. El diseño lo extiende con 401/403.
12. **AC-031 (conservar la entrada ante error) coincide con el patrón existente:** confirmado.
    En `catalogs-view.tsx`, `setDialogOpen(false)` ocurre solo en el camino de éxito (tras los
    `await` dentro del `try`); el `catch` solo muestra `toast.error`, de modo que el diálogo y los
    valores del formulario se conservan ante error. La afirmación de §5.5 es exacta.
13. **Matriz de módulos (`MODULE_MATRIX`):** las 21 claves que enumera §3.3 (`demandOverview`,
    `dashboard`, `requests`, `triage`, `priority`, `plan`, `portfolio`, `project`, `assigned`,
    `task`, `log`, `meeting`, `asset`, `docs`, `capacity`, `admin`, `frameworks`, `review`,
    `audit`, `team`, `permissions`) coinciden exactamente con la "Matriz de módulos configurada"
    de `specs/10-roles-permissions.md`, incluidos los ejemplos (`admin:[JEFE]`, `team:[JEFE]`,
    `triage:[JEFE,LIDER]`, `permissions:[todos]`, `audit:[todos con alcance]`).
14. **AuditEvent captura actor/acción/objeto/alcance/antes-después/timestamp** (§1.2, §6):
    cubre literalmente lo corroborado en `specs/15` ("actor, acción, registro, before, after y
    timestamp") y `specs/08` fila Auditoría; append-only; retención/export/timezone marcados fuera
    de alcance (todos **P** en `15`/`28` punto 8). Correcto, no inventa cobertura.
15. **Reglas de negocio citadas existen:** BR-003 (BI→FIBI, etc.), BR-019 (rol+alcance),
    BR-020 (líder no concede grants), BR-024 (trazabilidad) confirmadas en
    `specs/05-business-rules.md`. Criterios AC-025..031 confirmados en `specs/18-acceptance-criteria.md`;
    SCR-18/21/22/23 confirmados en `specs/11-ui-behavior.md`.
16. **No reintroduce autenticación real:** el contexto de usuario es una capa dev (`X-Actor-Id` →
    `DevActorResolver` detrás de interfaz `ActorResolver`, modo `AUTH_MODE=dev-header`), sin login
    ni provisión. Coherente con `specs/28` punto 10 y `specs/00`/`01`/`10` (acceso al Site como
    condición separada). No es un hallazgo.
17. **No se apoya en ocultar el menú:** §2.1 y §5.2 afirman explícitamente que el filtrado de menú
    es cosmético y el control real es server-side (BR-019, UI-07). Correcto.
18. **BR-001 no se usa para Grant:** el diseño retiró BR-001 (regla de Solicitud, FEATURE-002) y la
    nota del mapa decisión→spec lo deja claro. La cardinalidad multi-grant se trata como decisión
    de Fase 1 sobre una regla **P**, no como invención de regla pendiente. Correcto respecto a la
    restricción de no inventar reglas marcadas **P** en `specs/28`.

## Suposiciones no verificadas o incorrectas

1. **INCORRECTA — Mecanismo de seed `prisma.seed` en `prisma.config.ts`** (Hallazgo 2): no existe
   ese campo en el `defineConfig` de Prisma 7; corresponde `migrations.seed`.
2. **INCORRECTA / INCONSISTENTE — Agrupamiento de SCR-22 bajo Administración** (Hallazgo 1):
   contradice `specs/02-modules.md`, que ubica "Equipo y permisos" en Gobierno.
3. **NO VERIFICADA — Manejo de `AUTH_MODE` como variable de entorno** (§3.2/§3.4): no existe hoy
   gestión de `AUTH_MODE` en el repo (no hay `@nestjs/config`; la configuración se lee vía
   `process.env`, p. ej. en `app.config.ts`/`prisma.config.ts`). El diseño lo introduce como nueva
   variable configurable, coherente con el steering (no hardcodear configuración) y factible con
   `process.env`. No bloquea, pero es nuevo: se asume que se añade a `.env.example`.
4. **NO VERIFICADA — Comando `prisma migrate dev`** (Hallazgo 3, NIT): no es un script del repo;
   se invoca ad-hoc. Válido pero no versionado.
5. **PARCIAL — "docs/ documenta la capa dev"** (§3.2): no se verificó el contenido de `docs/`; es
   una acción futura del implementador, no una afirmación sobre el estado actual. No bloquea.

---

## Conclusión

Dos hallazgos MEDIUM verificables (agrupamiento de SCR-22 contra `02-modules.md`; mecanismo de
seed incorrecto para Prisma 7) hacen el veredicto **CHANGES_REQUESTED**. Ambos son correcciones
de documento acotadas, sin rediseño. Resueltos esos dos puntos (y, deseablemente, los dos NIT),
el diseño queda listo para implementación: respeta los límites de arquitectura (NestJS dueño de
la lógica, Prisma solo en `apps/api`, frontend solo vía api-client, TS estricto), modela
correctamente Grant y el alcance multiproceso sin inventar reglas **P**, cubre los controles
negativos de `specs/10` con enforcement server-side real, define una política 403/404 coherente
con "denegar sin filtrar datos", mantiene el contexto de usuario como capa dev reemplazable sin
reconstruir auth, y especifica un AuditEvent que captura actor/acción/objeto/alcance/antes-después.
