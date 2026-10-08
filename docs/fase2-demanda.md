# Fase 2 · Flujo de demanda — notas de implementacion

Documentacion de decisiones y correcciones tecnicas surgidas durante la
construccion de la Fase 2 (flujo de demanda: Solicitud → Triage → Priorizacion →
Aprobacion). El diseno completo esta en
`.agents/tasks/fase2-demanda/design.md`.

## Correcciones de routing

### Orden de controllers que comparten el prefijo `requests`

**Sintoma (descubierto en la verificacion de FEAT-004).** `GET
/requests/pending-approval` respondia `400 Validation failed (uuid is
expected)` en lugar de devolver la cola de aprobacion.

**Causa.** El prefijo `requests` lo comparten dos controllers:

- `RequestController` expone `GET /requests/:id` (parametrica, con
  `ParseUUIDPipe` sobre `:id`).
- `ApprovalController` expone `GET /requests/pending-approval` (estatica).

En NestJS sobre Express, el enrutado hace match segun el **orden de registro de
los controllers del modulo**. Como `RequestController` estaba declarado antes
que `ApprovalController` en `RequestModule.controllers`, la ruta parametrica
`:id` capturaba el segmento literal `pending-approval` y `ParseUUIDPipe` lo
rechazaba con 400 antes de llegar al handler correcto.

**Correccion (minima e idiomatica).** Declarar el controller que expone la
ruta estatica **antes** del que expone la parametrica. En
`apps/api/src/modules/request/request.module.ts` el arreglo es reordenar
`controllers` para que `ApprovalController` quede antes que `RequestController`:

```ts
controllers: [
  ApprovalController, // ruta estatica GET /requests/pending-approval
  RequestController,  // ruta parametrica GET /requests/:id
  TriageController,
  PriorityController,
],
```

**Alcance del cambio.** Es solo orden de registro de routing:

- No cambia el contrato OpenAPI (mismo conjunto de paths, operationIds y
  schemas). `npm run contracts:generate` solo reordena el orden en que Swagger
  emite los paths en `openapi.json`/`schema.d.ts`; el contenido semantico es
  identico, por lo que los artefactos generados y committeados en FEAT-003 se
  mantienen sin cambios.
- No altera permisos ni comportamiento aprobado: `pending-approval` sigue
  restringida a los roles con capacidad `review` (`JEFE_AREA`,
  `LIDER_PROCESO`) y filtrada por alcance de `mainProcessId`.

**Regresion fijada.** `apps/api/src/modules/request/request.module.spec.ts`
afirma que `ApprovalController` se registra antes que `RequestController` en el
modulo. El test falla con el orden anterior (reproduce el bug) y pasa con el
corregido, de modo que la colision no reaparece.
