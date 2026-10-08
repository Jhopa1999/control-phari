---
inclusion: fileMatch
fileMatchPattern: 'apps/api/**'
---

# Arquitectura backend

NestJS es el propietario de:

- lógica de negocio
- validaciones
- autorización
- persistencia
- integración con servicios
- API REST
- OpenAPI

Organizar el backend como monolito modular.
Una funcionalidad debe agruparse conceptualmente en módulos de negocio.

Evitar carpetas globales gigantes como:

controllers/
services/
repositories/

si terminan mezclando funcionalidades no relacionadas.

Preferir una organización similar a:

src/
├── modules/
│   └── usuarios/
│       ├── usuarios.module.ts
│       ├── usuarios.controller.ts
│       ├── usuarios.service.ts
│       ├── dto/
│       └── ...
├── common/
├── config/
└── main.ts

No crear esta estructura anticipadamente si todavía no se necesita.

# Controllers

Los controllers deben:

- recibir solicitudes
- delegar lógica
- devolver respuestas

No deben contener lógica de negocio compleja.

# Services

Los services concentran casos de uso y lógica de negocio.

# DTO

Toda entrada externa debe validarse mediante DTO cuando corresponda.
No confiar directamente en datos provenientes del cliente.

# Configuración

Configuración mediante variables de entorno y módulos/configuración
centralizada.

No hardcodear:

- URLs
- credenciales
- tokens
- claves
- puertos configurables
- nombres de servicios externos

# Errores

Utilizar excepciones HTTP apropiadas.

No exponer:

- stack traces
- credenciales
- información interna sensible

# API

REST es la interfaz principal.
OpenAPI debe representar el contrato público del backend.

Cuando se incorpore packages/api-client, debe generarse desde OpenAPI en lugar
de duplicar manualmente contratos TypeScript.

# Datos

Prisma solo se utiliza dentro del backend.
Evitar consultas innecesarias.

Revisar:

- relaciones
- índices
- transacciones
- restricciones

cuando corresponda al caso de uso.
