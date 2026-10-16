-- Backfill idempotente: garantiza el area ANALITICA y asigna todos los
-- procesos sin area a dicha area. Seguro de re-ejecutar (ON CONFLICT / WHERE
-- area_id IS NULL). gen_random_uuid() requiere PostgreSQL >= 13 (nucleo).

-- (a) Asegurar el area ANALITICA (no duplica si ya existe por code).
INSERT INTO "areas" ("id", "code", "name", "active", "sort_order", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'ANALITICA', 'Analitica', true, 0, now(), now())
ON CONFLICT ("code") DO NOTHING;

-- (b) Asignar a ANALITICA los procesos que aun no tienen area.
UPDATE "processes"
SET "area_id" = (SELECT "id" FROM "areas" WHERE "code" = 'ANALITICA')
WHERE "area_id" IS NULL;
