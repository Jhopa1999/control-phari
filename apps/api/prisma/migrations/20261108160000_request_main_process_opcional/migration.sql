-- El proceso principal de la solicitud se determina en el TRIAGE, no en el
-- registro. La solicitud nace sin proceso: la columna pasa a NULLABLE.
-- Migración aditiva: aplica limpio sobre el esquema actual (no reescribe FK).
ALTER TABLE "requests" ALTER COLUMN "main_process_id" DROP NOT NULL;
