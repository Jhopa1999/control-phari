-- Datos maestros de la integración Bitácora: categorías REUNION y RECURRENTE y la
-- jornada diaria (WORKDAY_HOURS). seed.ts no corre en producción, por eso va en migración.
-- Idempotente: no pisa lo que se haya editado desde Maestras.
INSERT INTO "catalog_items" ("id", "catalog", "code", "label", "description", "active", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'ACTIVITY_CLASS', 'REUNION', 'Reunión', 'Tiempo de una reunión registrada en Reuniones.', true, 5, now(), now()),
  (gen_random_uuid(), 'ACTIVITY_CLASS', 'RECURRENTE', 'Actividad recurrente', 'Tiempo de una actividad recurrente completada.', true, 6, now(), now()),
  (gen_random_uuid(), 'WORKLOG_PARAM', 'WORKDAY_HOURS', '9', 'Jornada diaria en horas; el total del día por encima de este valor muestra un aviso.', true, 2, now(), now())
ON CONFLICT ("catalog", "code") DO NOTHING;
