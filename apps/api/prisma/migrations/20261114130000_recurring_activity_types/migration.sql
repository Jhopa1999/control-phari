-- Tipos de actividad recurrente (catálogo RECURRING_ACTIVITY_TYPE).
-- Hasta ahora solo los sembraba prisma/seed.ts, que no corre en producción ni en
-- el stack por red: el selector «Tipo de actividad» quedaba vacío y no se podía
-- crear ninguna actividad recurrente. La migración es idempotente: no duplica ni
-- pisa filas existentes (p. ej. las ya cargadas a mano o editadas en Maestras).
INSERT INTO "catalog_items" ("id", "catalog", "code", "label", "active", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'RECURRING_ACTIVITY_TYPE', 'REPORTE', 'Reporte', true, 1, now(), now()),
  (gen_random_uuid(), 'RECURRING_ACTIVITY_TYPE', 'VALIDACION', 'Validación', true, 2, now(), now()),
  (gen_random_uuid(), 'RECURRING_ACTIVITY_TYPE', 'REVISION', 'Revisión', true, 3, now(), now())
ON CONFLICT ("catalog", "code") DO NOTHING;
