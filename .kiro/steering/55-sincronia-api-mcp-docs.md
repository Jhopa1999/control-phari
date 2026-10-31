# Sincronía API, contrato, MCP y documentación

La API (`apps/api`) es la **fuente de verdad**. Todo lo demás se deriva de ella o
se actualiza **en el mismo cambio (mismo PR)**. Nunca se deja «para después»: un
MCP o una documentación desalineados hacen que un agente (Kiro o el asistente del
portal) actúe sobre un portal que ya no existe.

```text
API (controllers, DTO, servicios)
  → contrato OpenAPI (apps/api/openapi/openapi.json)
    → cliente tipado (packages/api-client)  → apps/web
    → MCP (apps/mcp)                         → Kiro y el asistente del portal
  → documentación (docs/aplicacion/**)
```

# Qué hacer cuando cambias la API

Aplica a todo cambio que añada, quite o modifique un endpoint, un DTO (entrada o
salida), un filtro de consulta, un permiso o una regla visible desde la API.

1. **Documenta el endpoint en OpenAPI.** `@ApiOperation` con `summary` en
   español, `@ApiResponse` para cada resultado y DTO con `@ApiProperty` o
   `@ApiPropertyOptional`. Los filtros de consulta van en un DTO con
   `@ApiPropertyOptional`: el contrato se genera desde el código compilado y los
   publica solo.
2. **Regenera el contrato.** `npm run contracts:generate` y versiona
   `apps/api/openapi/openapi.json` y
   `packages/api-client/src/generated/schema.d.ts` y
   `packages/api-client/src/generated/openapi.json` (copia del contrato que el
   api-client entrega al MCP en runtime). El CI falla si no coinciden.
3. **Actualiza el MCP.** Toda operación nueva o cambiada debe quedar **expuesta
   como tool** (una entrada en el catálogo declarativo `apps/mcp/src/tools/specs/`)
   o **excluida de forma explícita y con motivo** (`apps/mcp/src/tools/exclusions.ts`);
   una operación eliminada o renombrada se retira. Cada tool lleva descripción en
   español y anotaciones (`readOnlyHint`, `destructiveHint`, `idempotentHint`),
   que el motor deriva del campo `access`.
   Reglas del MCP: `.kiro/steering/50-mcp.md`.
4. **Actualiza la documentación** en `docs/aplicacion/`:
   `modulos-backend.md` (endpoints y reglas), `modelo-datos.md` (si cambia el
   esquema), `frontend-pantallas.md` (si cambia la interfaz),
   `autenticacion-autorizacion.md` (si cambian roles o permisos) y una entrada en
   `changelog.json`. Si cambia el catálogo o la identidad del MCP, también
   `apps/mcp/README.md`.
5. **Pruebas.** Jest para la API, `node --test` para el MCP y Playwright si
   cambia un flujo de usuario.
6. **Consumo en el frontend.** Con el cliente tipado generado; nunca con tipos
   copiados a mano.

Al abrir el PR, deja constancia en la descripción (la plantilla ya trae la
lista): qué se tocó en contrato, MCP y documentación, o por qué no hacía falta.

# Reglas derivadas

- Una capacidad nueva **nace en la API**. El MCP y el asistente solo la exponen:
  no implementan reglas de negocio (ver `50-mcp.md`).
- Una tool del MCP **sin endpoint** del contrato no puede existir; un endpoint
  **sin tool y sin exclusión explícita** tampoco debe quedar.
- Las herramientas que escriben datos no se marcan como de solo lectura. Lo que
  borra o reemplaza datos (`DELETE`, importaciones) se marca como destructivo
  (`access: 'destructive'` en el catálogo).
- Los cambios de **solo documentación** o de **solo MCP** no requieren tocar la
  API, pero un cambio de MCP que necesite una capacidad inexistente se resuelve
  creándola primero en la API.

# Cómo se hace cumplir

| Control | Dónde | Efecto |
|---------|-------|--------|
| Contratos regenerados | CI, paso «Verificar que los contratos están actualizados» | **Bloquea** |
| Pruebas del MCP (`npm run test:mcp`) | CI | **Bloquea** |
| Cobertura MCP frente al contrato (cada operación con tool o exclusión motivada, todas las tools anotadas y con esquema) | Pruebas del MCP | **Bloquea** (activo desde el catálogo declarativo del MCP; incluye un tope decreciente de exclusiones «PENDIENTE») |
| Sincronía de documentación | CI, job `docs-sync` | Aviso |
| Lista de verificación del PR | `.github/pull_request_template.md` | Recordatorio visible para quien revisa |
| Recordatorio al guardar | Hook `actualizar-docs-aplicacion` (controllers, servicios, DTO, esquema, páginas, navegación y `apps/mcp`) | Asistencia durante la edición |
