-- Rediseno de "Actividades recurrentes" (FEAT-001): esfuerzo en horas, dias de
-- preparacion (ventana), evidencia requerida, autor de "tomar" y cancelacion.
-- Migracion SEGURA sobre datos existentes: solo ADD COLUMN (nullable o con
-- DEFAULT para el backfill) y UPDATE. No se borra ni se cambia el estado de
-- ninguna fila.

-- 1) Definiciones: backfill estimated_hours = 1; prep_days = 2 (SEMANAL) o 5 (resto).
ALTER TABLE "recurring_activities"
  ADD COLUMN "estimated_hours" DECIMAL(6,2) NOT NULL DEFAULT 1,
  ADD COLUMN "prep_days" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "requires_evidence" BOOLEAN NOT NULL DEFAULT false;

UPDATE "recurring_activities" SET "prep_days" = 2 WHERE "cadence" = 'SEMANAL';

-- El schema no define default para estimated_hours ni prep_days: se obliga a
-- informarlos al crear (requires_evidence conserva DEFAULT false).
ALTER TABLE "recurring_activities"
  ALTER COLUMN "estimated_hours" DROP DEFAULT,
  ALTER COLUMN "prep_days" DROP DEFAULT;

ALTER TABLE "recurring_activities"
  ADD CONSTRAINT "recurring_activities_estimated_hours_positive" CHECK ("estimated_hours" > 0),
  ADD CONSTRAINT "recurring_activities_prep_days_non_negative" CHECK ("prep_days" >= 0);

-- 2) Ocurrencias: snapshot de horas, horas reales, autor/fecha de "tomar",
--    cancelacion y marcas de aviso.
ALTER TABLE "recurring_activity_occurrences"
  ADD COLUMN "estimated_hours" DECIMAL(6,2) NOT NULL DEFAULT 1,
  ADD COLUMN "actual_hours" DECIMAL(6,2),
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "started_by_user_id" UUID,
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancel_reason" TEXT,
  ADD COLUMN "window_notified_at" TIMESTAMP(3),
  ADD COLUMN "due_notified_at" TIMESTAMP(3),
  ADD COLUMN "overdue_notified_at" TIMESTAMP(3);

-- Cada ocurrencia existente hereda las horas de su definicion.
UPDATE "recurring_activity_occurrences" AS o
SET "estimated_hours" = a."estimated_hours"
FROM "recurring_activities" AS a
WHERE a."id" = o."activity_id";

ALTER TABLE "recurring_activity_occurrences"
  ALTER COLUMN "estimated_hours" DROP DEFAULT;

ALTER TABLE "recurring_activity_occurrences"
  ADD CONSTRAINT "recurring_activity_occurrences_estimated_hours_positive" CHECK ("estimated_hours" > 0),
  ADD CONSTRAINT "recurring_activity_occurrences_actual_hours_positive" CHECK ("actual_hours" IS NULL OR "actual_hours" > 0);

ALTER TABLE "recurring_activity_occurrences"
  ADD CONSTRAINT "recurring_activity_occurrences_started_by_user_id_fkey"
  FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "recurring_activity_occurrences_started_by_user_id_idx"
  ON "recurring_activity_occurrences"("started_by_user_id");
