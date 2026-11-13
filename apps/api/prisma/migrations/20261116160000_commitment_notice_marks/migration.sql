-- Marcas de idempotencia de los avisos internos de vencimiento de compromisos.
ALTER TABLE "commitments"
  ADD COLUMN "due_soon_notified_at" TIMESTAMP(3),
  ADD COLUMN "due_today_notified_at" TIMESTAMP(3),
  ADD COLUMN "overdue_notified_at" TIMESTAMP(3);

CREATE INDEX "commitments_due_date_state_idx" ON "commitments"("due_date", "state");
