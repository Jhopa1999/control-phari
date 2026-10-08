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

# Comandos

No inventar comandos.
Usar scripts reales declarados en package.json.
