-- Vínculos de las sugerencias de tiempo de la Bitácora (aceptadas / descartadas).
-- Una fila por (autor, origen): la unicidad evita contar dos veces un mismo origen.
CREATE TABLE "daily_log_suggestion_links" (
    "id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "source_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "activity_id" UUID,
    "meeting_id" UUID,
    "occurrence_id" UUID,
    "task_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_log_suggestion_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_log_suggestion_links_kind_check"
      CHECK ("kind" IN ('MEETING', 'OCCURRENCE', 'TASK')),
    CONSTRAINT "daily_log_suggestion_links_status_check"
      CHECK ("status" IN ('ACEPTADA', 'DESCARTADA')),
    CONSTRAINT "daily_log_suggestion_links_activity_check"
      CHECK (("status" = 'ACEPTADA') = ("activity_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "daily_log_suggestion_links_activity_id_key" ON "daily_log_suggestion_links"("activity_id");
CREATE UNIQUE INDEX "daily_log_suggestion_links_author_user_id_source_key_key" ON "daily_log_suggestion_links"("author_user_id", "source_key");
CREATE INDEX "daily_log_suggestion_links_author_user_id_work_date_idx" ON "daily_log_suggestion_links"("author_user_id", "work_date");

ALTER TABLE "daily_log_suggestion_links" ADD CONSTRAINT "daily_log_suggestion_links_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_log_suggestion_links" ADD CONSTRAINT "daily_log_suggestion_links_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "daily_log_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_log_suggestion_links" ADD CONSTRAINT "daily_log_suggestion_links_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "daily_log_suggestion_links" ADD CONSTRAINT "daily_log_suggestion_links_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "recurring_activity_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "daily_log_suggestion_links" ADD CONSTRAINT "daily_log_suggestion_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
