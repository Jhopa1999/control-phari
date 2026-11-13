-- Adjuntos de ocurrencias de actividades recurrentes (FEAT-002). Solo CREATE TABLE.
CREATE TABLE "recurring_occurrence_evidences" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_occurrence_evidences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recurring_occurrence_evidences_storage_key_key" ON "recurring_occurrence_evidences"("storage_key");

CREATE INDEX "recurring_occurrence_evidences_occurrence_id_idx" ON "recurring_occurrence_evidences"("occurrence_id");

ALTER TABLE "recurring_occurrence_evidences" ADD CONSTRAINT "recurring_occurrence_evidences_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "recurring_activity_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recurring_occurrence_evidences" ADD CONSTRAINT "recurring_occurrence_evidences_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

