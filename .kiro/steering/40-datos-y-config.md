---
inclusion: auto
name: Datos y configuración
description: Reglas sobre datos (PostgreSQL, Prisma, migraciones), datos de desarrollo, variables de entorno y configuración por ambiente. Aplicar al trabajar con base de datos, ORM, migraciones, seeds, fixtures, .env, secretos o cualquier valor configurable entre ambientes.
---

# Datos

PostgreSQL es la base transaccional estándar.
Prisma es el ORM estándar.
Prisma solo pertenece a apps/api.

Las migraciones deben permanecer versionadas.
No modificar una migración aplicada en producción para cambiar su historia;
crear una nueva cuando corresponda.

# Datos de desarrollo

Usar datos ficticios o anonimizados.

No incluir datos productivos sensibles en:

- repositorio
- fixtures
- ejemplos
- pruebas
- documentación

# Variables de entorno

Los secretos deben vivir fuera del repositorio.
Mantener `.env.example` cuando se incorporen variables de entorno.
`.env.example` debe contener nombres de variables y ejemplos seguros, nunca
secretos reales.

# Configuración

Valores que puedan cambiar entre ambientes deben ser configurables.

Ejemplos:

- URLs
- puertos
- dominios
- credenciales
- IDs externos
- flags
- nombres de buckets
- endpoints

No convertir en configuración valores que realmente son constantes propias del
dominio o del código.
