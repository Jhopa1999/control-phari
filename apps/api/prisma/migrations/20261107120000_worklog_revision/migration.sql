-- Revision de bitacoras: el estado REVISADO ya existia pero nadie podia llegar a el.
-- Se registra quien reviso (o devolvio) un diario o un semanal, cuando y, en las
-- devoluciones, el motivo. Aditivo: columnas nulas, sin tocar los datos existentes.
ALTER TABLE "daily_logs"
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by_user_id" UUID,
  ADD COLUMN "returned_at" TIMESTAMP(3),
  ADD COLUMN "returned_by_user_id" UUID,
  ADD COLUMN "return_reason" TEXT;

ALTER TABLE "weekly_reports"
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by_user_id" UUID,
  ADD COLUMN "returned_at" TIMESTAMP(3),
  ADD COLUMN "returned_by_user_id" UUID,
  ADD COLUMN "return_reason" TEXT;

ALTER TABLE "daily_logs"
  ADD CONSTRAINT "daily_logs_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "daily_logs_returned_by_user_id_fkey" FOREIGN KEY ("returned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "weekly_reports"
  ADD CONSTRAINT "weekly_reports_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "weekly_reports_returned_by_user_id_fkey" FOREIGN KEY ("returned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
