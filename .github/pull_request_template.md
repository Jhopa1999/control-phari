## Resumen

<!-- Qué cambia y por qué, en pocas líneas. -->

## Probado

<!-- Comandos ejecutados y resultado: typecheck, lint, pruebas, build, E2E. Qué NO se pudo verificar. -->

## Sincronía API · contrato · MCP · documentación

<!-- Regla: .kiro/steering/55-sincronia-api-mcp-docs.md. Marca lo que aplique o escribe «No aplica» con el motivo. -->

- [ ] **No toca la API** (controllers, DTO, filtros, permisos), o bien todo lo siguiente está hecho:
- [ ] Endpoints y DTO documentados en OpenAPI (`@ApiOperation`, `@ApiResponse`, `@ApiPropertyOptional`)
- [ ] Contrato regenerado: `npm run contracts:generate` (`openapi.json` y `schema.d.ts`)
- [ ] MCP: cada operación nueva o cambiada tiene tool (con anotaciones) o exclusión motivada; las retiradas se quitaron
- [ ] Documentación en `docs/aplicacion/` y entrada en `changelog.json`
- [ ] `apps/mcp/README.md` si cambió el catálogo o la identidad del MCP
- [ ] Pruebas añadidas o ajustadas (Jest, `node --test` del MCP, Playwright si cambia un flujo)

## Despliegue

<!-- Migraciones, variables de entorno, permisos de AWS o cambios de infraestructura. «Ninguno» si no hay. -->
