-- Línea base de entrega del plan: fecha fin comprometida, congelada al autorizar.
-- Columna nullable y aditiva. Relleno de los planes ya autorizados con la misma
-- regla que aplica la API al autorizar: compromiso, si no fin del periodo y, si
-- tampoco, la última fecha fin de sus tareas.
ALTER TABLE "plans" ADD COLUMN "baseline_date" TIMESTAMP(3);

UPDATE "plans" p
SET "baseline_date" = COALESCE(
  p."commitment_date",
  p."period_end",
  (
    SELECT MAX(t."end_date")
    FROM "tasks" t
    JOIN "plan_phases" ph ON ph."id" = t."phase_id"
    WHERE ph."plan_id" = p."id"
  )
)
WHERE p."status" = 'AUTORIZADO';
