---
inclusion: fileMatch
fileMatchPattern: '**/*.{spec,test,e2e-spec}.{ts,tsx}'
---

# Estrategia

Jest:

- unitarias
- servicios
- backend

Playwright:

- flujos E2E críticos

# Prioridad

Probar comportamiento observable y reglas importantes.

Priorizar:

- reglas de negocio
- permisos
- validaciones
- errores
- flujos críticos

Evitar pruebas que solo repliquen la implementación interna.

# Corrección de bugs

Cuando sea razonable:

1. reproducir el fallo
2. crear una prueba que falle
3. aplicar la corrección
4. comprobar que la prueba pasa

# Aislamiento

Las pruebas no deben depender del entorno ni dejar rastro.

- Jest no depende de variables de entorno del shell o de la CI
  (`CORS_ORIGINS`, `AUTH_MODE`, `PORT`, `DATABASE_URL`...). Si el código lee
  `process.env`, la prueba fija o borra la variable y la restaura en
  `finally`/`afterEach`. La CI define `CORS_ORIGINS`: una prueba que pasa en
  local y falla en CI suele ser esto.
- Los e2e no modifican a los usuarios demo del seed (`jefe@`, `lider@`,
  `integrante@`, `admin@demo.local`): ni contraseña, ni roles, ni estado. Si un
  flujo cambia credenciales (restablecer contraseña, activar cuenta), usa un
  usuario creado por la propia prueba con un identificador único, o restaura el
  valor original en `afterEach` aunque la prueba falle.
- Los datos de prueba llevan un prefijo identificable (`E2E …`) y se limpian
  con filtro estricto. Nunca `deleteMany({})` sin `where`.
- Las fechas que se siembran en la BD se generan en UTC; columnas `timestamp`
  sin zona interpretan la hora local de Windows (UTC-5) y caducan antes de
  tiempo.

# Comandos

No inventar comandos.
Usar scripts reales declarados en package.json.
Cómo levantar la app para los e2e: `35-entorno-local-y-e2e.md`.
