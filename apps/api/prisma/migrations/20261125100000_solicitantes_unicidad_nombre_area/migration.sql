-- Solicitantes: la unicidad pasa de «nombre global» a «nombre dentro del área» (D23).
--
-- Aditiva e idempotente, sin borrar ni fusionar datos:
--   1. Si ya hubiera filas repetidas en (name_key, area_id) NO se crea el índice
--      único ni se toca el global; solo se crea el índice de búsqueda. El
--      servicio sigue impidiendo duplicados nuevos y el reporte de los
--      existentes es la consulta de verificación del despliegue:
--        SELECT name_key, area_id, count(*) FROM requesters
--        GROUP BY 1, 2 HAVING count(*) > 1;   -- debe dar 0 filas
--   2. Si no hay duplicados, se crea primero el índice único nuevo y después se
--      quita el global (name_key solo), así nunca queda la tabla sin protección.
--      Hoy no puede haberlos: el índice global ya impedía repetir name_key.
--
-- El esquema (`@@unique([nameKey, areaId])` y `@@index([nameKey])` en
-- `Requester`) coincide con la rama 2. Si alguna vez se tomara la rama 1, la
-- base quedaría distinta del esquema: hay que resolver los duplicados a mano y
-- crear después `requesters_name_key_area_id_key` y quitar
-- `requesters_name_key_key` para reconciliarla.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "requesters" GROUP BY "name_key", "area_id" HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'requesters: hay duplicados (name_key, area_id); no se crea el índice único. Se valida en el servicio.';
    CREATE INDEX IF NOT EXISTS "requesters_name_key_idx" ON "requesters"("name_key");
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "requesters_name_key_area_id_key" ON "requesters"("name_key", "area_id");
    CREATE INDEX IF NOT EXISTS "requesters_name_key_idx" ON "requesters"("name_key");
    DROP INDEX IF EXISTS "requesters_name_key_key";
  END IF;
END $$;
