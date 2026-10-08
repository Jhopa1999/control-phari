---
inclusion: always
---

# Objetivo

Esta es una plantilla estándar reutilizable para desarrollar portales internos.
No debe contener reglas de negocio de una aplicación específica.

# Stack oficial

- Monorepo con npm workspaces
- Next.js + TypeScript en apps/web
- NestJS + TypeScript en apps/api
- PostgreSQL
- Prisma
- REST
- OpenAPI
- Tailwind CSS
- shadcn/ui
- Docker Compose
- Nginx
- Jest
- Playwright
- Git
- GitHub
- GitHub Actions

Las versiones concretas instaladas actualmente están documentadas en
docs/README.md y package.json.
No hardcodear versiones dentro del steering salvo que sean necesarias para una
regla de compatibilidad.

# Límites arquitectónicos

Mantener estrictamente estas responsabilidades:

apps/web

- presentación
- navegación
- experiencia de usuario
- formularios
- estados visuales
- consumo de APIs

apps/api

- lógica de negocio
- autorización
- validaciones
- acceso a datos
- integración con servicios
- exposición de API

PostgreSQL

- persistencia transaccional

Prisma

- solo puede utilizarse desde apps/api

packages/api-client

- reservado para cliente TypeScript generado a partir de OpenAPI

# Reglas obligatorias

- El frontend nunca accede directamente a PostgreSQL.
- El frontend nunca utiliza Prisma.
- Prisma pertenece al backend.
- Las reglas de negocio pertenecen al backend.
- No duplicar reglas de negocio entre frontend y backend.
- El futuro MCP no debe implementar una segunda lógica de negocio.
- MCP deberá reutilizar capacidades controladas por el backend.
- TypeScript debe permanecer en modo estricto.
- Evitar `any` salvo justificación técnica explícita.
- No almacenar secretos en Git.
- No hardcodear valores que correspondan a configuración.
- No introducir microservicios sin una necesidad demostrada.
- No introducir Kubernetes, Kafka, Redis u otra infraestructura por defecto.
- Mantener una arquitectura de monolito modular mientras sea suficiente.
- Favorecer soluciones simples, mantenibles y comprobables.
- No romper los comandos existentes del repositorio.
- Antes de considerar terminado un cambio, debe compilar y pasar las
  validaciones correspondientes.

# Forma de trabajo

Trabajar en incrementos pequeños.

Antes de cambios importantes:

1. revisar estructura existente
2. entender el impacto
3. proponer o aplicar el cambio mínimo necesario
4. verificar typecheck
5. ejecutar pruebas correspondientes
6. verificar build cuando corresponda

No reestructurar áreas no relacionadas con la tarea actual.
No agregar dependencias si una solución razonable ya existe con el stack actual.
