---
inclusion: fileMatch
fileMatchPattern: 'apps/web/**'
---

# Responsabilidad

Next.js administra presentación y experiencia de usuario.
No contiene persistencia directa ni reglas críticas de negocio.

# Arquitectura

Utilizar App Router.

Separar razonablemente:

- páginas/rutas
- componentes
- funcionalidades
- hooks
- utilidades

No crear abstracciones prematuras.

# UI

Stack:

- Tailwind CSS
- shadcn/ui

Priorizar componentes reutilizables cuando exista reutilización real.
No crear un componente genérico únicamente porque podría reutilizarse en el
futuro.

# Estados obligatorios

Las pantallas que consuman datos deben contemplar cuando corresponda:

- loading
- vacío
- éxito
- error

# Formularios

Deben mostrar:

- labels claros
- validaciones entendibles
- errores junto al campo correspondiente
- estado de envío
- confirmación cuando aplique

# UX

Evitar interfaces que dependan de conocimiento técnico del usuario.

Los mensajes deben explicar:

- qué ocurrió
- qué debe hacer el usuario
- cómo puede continuar

# Accesibilidad

Utilizar HTML semántico.
Mantener navegación por teclado y labels accesibles cuando corresponda.

# Backend

No utilizar Prisma.
No conectarse directamente a PostgreSQL.
Consumir la API del backend.

Cuando exista packages/api-client, preferir ese cliente sobre contratos
duplicados manualmente.
