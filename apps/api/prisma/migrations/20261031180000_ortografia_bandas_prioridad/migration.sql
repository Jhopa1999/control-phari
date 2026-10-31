-- BL-026 (complemento): las glosas de PRIORITY_BAND de los ambientes poblados
-- por SQL directo usan " - " como separador y no el " · " del seed, asi que la
-- migracion 20261031120000 no las encontro. Esta las lleva a la forma del seed
-- y del codigo, ya con tildes.
--
-- Mismas garantias que la anterior: migracion de DATOS, idempotente, y solo
-- actualiza una fila si su etiqueta sigue siendo EXACTAMENTE el valor original
-- (con " - " y sin tildes). Los `code` no cambian.
--
-- Reversion manual: repetir el UPDATE intercambiando old_label y new_label.

UPDATE "catalog_items" AS c
SET "label" = v.new_label,
    "updated_at" = NOW()
FROM (
  VALUES
    ('PRIORITY_BAND', 'P1', 'P1 - Primera consideracion para compromiso', 'P1 · Primera consideración para compromiso'),
    ('PRIORITY_BAND', 'P2', 'P2 - Programacion en el horizonte cercano', 'P2 · Programación en el horizonte cercano'),
    ('PRIORITY_BAND', 'P3', 'P3 - Planificacion ordinaria segun capacidad', 'P3 · Planificación ordinaria según capacidad'),
    ('PRIORITY_BAND', 'P4', 'P4 - Reserva de demanda, reformulacion o cierre motivado', 'P4 · Reserva de demanda, reformulación o cierre motivado')
) AS v(catalog, code, old_label, new_label)
WHERE c."catalog" = v.catalog
  AND c."code" = v.code
  AND c."label" = v.old_label;
