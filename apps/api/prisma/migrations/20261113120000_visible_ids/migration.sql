-- IDs visibles y automáticos para solicitudes, fases y tareas.
--   Solicitud: PRY-0012       (number de la secuencia requests_number_seq, 4 dígitos mínimo)
--   Fase:      PRY-0012-F2    (contador plans.phase_seq_next)
--   Tarea:     PRY-0012-T07   (contador plans.task_seq_next, 2 dígitos mínimo)
-- Los códigos son inmutables y nunca se reutilizan. Esta migración:
--   1) añade las columnas como NULAS (y los contadores con default 1),
--   2) rellena las filas existentes de forma DETERMINISTA,
--   3) ajusta la secuencia y los contadores a máximo + 1,
--   4) recién entonces pone NOT NULL + UNIQUE.
-- Los pasos de relleno solo tocan filas sin código, así que reejecutarlos no
-- renumera nada.

-- 1) Columnas nulas ---------------------------------------------------------
ALTER TABLE "requests"
  ADD COLUMN IF NOT EXISTS "number" INTEGER,
  ADD COLUMN IF NOT EXISTS "code" TEXT;

ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "phase_seq_next" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "task_seq_next" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "plan_phases" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "code" TEXT;

CREATE SEQUENCE IF NOT EXISTS "requests_number_seq" OWNED BY "requests"."number";

-- 2a) Solicitudes (incluye las eliminadas lógicamente): registered_at, created_at, id.
WITH ranked AS (
  SELECT r."id",
         (SELECT COALESCE(MAX("number"), 0) FROM "requests")
           + ROW_NUMBER() OVER (ORDER BY r."registered_at", r."created_at", r."id") AS n
  FROM "requests" r
  WHERE r."number" IS NULL
)
UPDATE "requests" r
SET "number" = ranked.n
FROM ranked
WHERE r."id" = ranked."id";

UPDATE "requests"
-- OJO: LPAD trunca cuando el texto supera el ancho; por eso el ancho es
-- GREATEST(longitud, mínimo) y los números grandes (5+ dígitos / T100+) no se cortan.
SET "code" = 'PRY-' || LPAD("number"::text, GREATEST(LENGTH("number"::text), 4), '0')
WHERE "code" IS NULL;

-- 2b) Fases por plan: "order", id.
WITH ranked AS (
  SELECT ph."id",
         req."code" AS request_code,
         (p."phase_seq_next" - 1)
           + ROW_NUMBER() OVER (PARTITION BY ph."plan_id" ORDER BY ph."order", ph."id") AS n
  FROM "plan_phases" ph
  JOIN "plans" p ON p."id" = ph."plan_id"
  JOIN "requests" req ON req."id" = p."request_id"
  WHERE ph."code" IS NULL
)
UPDATE "plan_phases" ph
SET "code" = ranked.request_code || '-F' || ranked.n::text
FROM ranked
WHERE ph."id" = ranked."id";

-- 2c) Tareas por plan: fase.order, task.created_at, task.id.
WITH ranked AS (
  SELECT t."id",
         req."code" AS request_code,
         (p."task_seq_next" - 1)
           + ROW_NUMBER() OVER (
               PARTITION BY ph."plan_id"
               ORDER BY ph."order", t."created_at", t."id"
             ) AS n
  FROM "tasks" t
  JOIN "plan_phases" ph ON ph."id" = t."phase_id"
  JOIN "plans" p ON p."id" = ph."plan_id"
  JOIN "requests" req ON req."id" = p."request_id"
  WHERE t."code" IS NULL
)
UPDATE "tasks" t
SET "code" = ranked.request_code || '-T' || LPAD(ranked.n::text, GREATEST(LENGTH(ranked.n::text), 2), '0')
FROM ranked
WHERE t."id" = ranked."id";

-- 3) Secuencia y contadores = máximo + 1 --------------------------------------
SELECT setval(
  'requests_number_seq',
  GREATEST(COALESCE(MAX("number"), 0), 1),
  COALESCE(MAX("number"), 0) >= 1
) FROM "requests";

UPDATE "plans" p
SET "phase_seq_next" = GREATEST(
  p."phase_seq_next",
  1 + COALESCE((
    SELECT MAX(substring(ph."code" FROM '-F([0-9]+)$')::int)
    FROM "plan_phases" ph
    WHERE ph."plan_id" = p."id"
  ), 0)
);

UPDATE "plans" p
SET "task_seq_next" = GREATEST(
  p."task_seq_next",
  1 + COALESCE((
    SELECT MAX(substring(t."code" FROM '-T([0-9]+)$')::int)
    FROM "tasks" t
    JOIN "plan_phases" ph ON ph."id" = t."phase_id"
    WHERE ph."plan_id" = p."id"
  ), 0)
);

-- 4) Restricciones ------------------------------------------------------------
ALTER TABLE "requests" ALTER COLUMN "number" SET DEFAULT nextval('requests_number_seq'::regclass);
ALTER TABLE "requests" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "requests" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "plan_phases" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "requests_number_key" ON "requests"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "requests_code_key" ON "requests"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "plan_phases_code_key" ON "plan_phases"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_code_key" ON "tasks"("code");
