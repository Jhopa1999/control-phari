-- Duración de la reunión en minutos (múltiplo de 15, entre 15 y 1440).
-- Aditiva y nullable: las reuniones existentes quedan sin duración (sin backfill).
-- La API la exige solo al cerrar el acta.
ALTER TABLE "meetings" ADD COLUMN "duration_minutes" INTEGER;

ALTER TABLE "meetings" ADD CONSTRAINT "meetings_duration_minutes_check"
  CHECK ("duration_minutes" IS NULL OR ("duration_minutes" BETWEEN 15 AND 1440 AND "duration_minutes" % 15 = 0));
