-- Motivo de la decisión de triage (obligatorio al devolver o rechazar). Idempotente.
ALTER TABLE "triages" ADD COLUMN IF NOT EXISTS "decision_reason" TEXT;
