-- Horas de la Bitácora con decimales (paso 0,25). La conversión INTEGER -> NUMERIC(4,2)
-- es exacta y conserva los valores existentes (0..24).
-- Verificación previa: SELECT count(*) FROM daily_log_activities WHERE hours > 24;
ALTER TABLE "daily_log_activities"
  ALTER COLUMN "hours" DROP DEFAULT,
  ALTER COLUMN "hours" TYPE DECIMAL(4,2) USING "hours"::DECIMAL(4,2),
  ALTER COLUMN "hours" SET DEFAULT 0;

ALTER TABLE "daily_log_activities" ADD CONSTRAINT "daily_log_activities_hours_check"
  CHECK ("hours" >= 0 AND "hours" <= 24 AND ("hours" * 4) = TRUNC("hours" * 4));
