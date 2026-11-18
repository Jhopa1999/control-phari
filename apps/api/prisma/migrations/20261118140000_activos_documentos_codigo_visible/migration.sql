-- ID visible para activos (ACT-0007) y documentos (DOC-0012), oleada 3 PR-D.
-- Solo se guarda el número (secuencia de Postgres); el código se calcula en la API.
-- Migración aditiva e idempotente:
--   1) crea la secuencia y la columna nula,
--   2) rellena SOLO las filas sin número, de forma determinista
--      (created_at, id), a continuación del máximo existente,
--   3) lleva la secuencia a un valor que no reutiliza números (nunca la baja),
--   4) recién entonces pone DEFAULT, NOT NULL y UNIQUE.
-- Reejecutarla no renumera nada ni cambia el estado final.

-- Activos ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS "assets_number_seq";
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "number" INTEGER;

WITH ranked AS (
  SELECT a."id",
         (SELECT COALESCE(MAX("number"), 0) FROM "assets")
           + ROW_NUMBER() OVER (ORDER BY a."created_at", a."id") AS n
  FROM "assets" a
  WHERE a."number" IS NULL
)
UPDATE "assets" a
SET "number" = ranked.n
FROM ranked
WHERE a."id" = ranked."id";

DO $$
DECLARE
  max_number INTEGER;
  last_issued BIGINT;
BEGIN
  SELECT COALESCE(MAX("number"), 0) INTO max_number FROM "assets";
  SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END
    INTO last_issued FROM "assets_number_seq";
  IF max_number >= 1 AND max_number > last_issued THEN
    PERFORM setval('assets_number_seq', max_number, true);
  END IF;
END $$;

ALTER TABLE "assets" ALTER COLUMN "number" SET DEFAULT nextval('assets_number_seq'::regclass);
ALTER TABLE "assets" ALTER COLUMN "number" SET NOT NULL;
ALTER SEQUENCE "assets_number_seq" OWNED BY "assets"."number";
CREATE UNIQUE INDEX IF NOT EXISTS "assets_number_key" ON "assets"("number");

-- Documentos ------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS "documents_number_seq";
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "number" INTEGER;

WITH ranked AS (
  SELECT d."id",
         (SELECT COALESCE(MAX("number"), 0) FROM "documents")
           + ROW_NUMBER() OVER (ORDER BY d."created_at", d."id") AS n
  FROM "documents" d
  WHERE d."number" IS NULL
)
UPDATE "documents" d
SET "number" = ranked.n
FROM ranked
WHERE d."id" = ranked."id";

DO $$
DECLARE
  max_number INTEGER;
  last_issued BIGINT;
BEGIN
  SELECT COALESCE(MAX("number"), 0) INTO max_number FROM "documents";
  SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END
    INTO last_issued FROM "documents_number_seq";
  IF max_number >= 1 AND max_number > last_issued THEN
    PERFORM setval('documents_number_seq', max_number, true);
  END IF;
END $$;

ALTER TABLE "documents" ALTER COLUMN "number" SET DEFAULT nextval('documents_number_seq'::regclass);
ALTER TABLE "documents" ALTER COLUMN "number" SET NOT NULL;
ALTER SEQUENCE "documents_number_seq" OWNED BY "documents"."number";
CREATE UNIQUE INDEX IF NOT EXISTS "documents_number_key" ON "documents"("number");
