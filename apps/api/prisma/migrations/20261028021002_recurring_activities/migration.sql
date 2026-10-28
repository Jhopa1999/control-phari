-- CreateTable
CREATE TABLE "recurring_activities" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "activity_type" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "interval_count" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "anticipation_days" INTEGER,
    "responsible_kind" TEXT NOT NULL,
    "responsible_user_id" UUID,
    "responsible_area_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_activity_occurrences" (
    "id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "target_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "completed_at" TIMESTAMP(3),
    "completed_by_user_id" UUID,
    "completion_comment" TEXT,
    "period_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_activity_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_activities_active_idx" ON "recurring_activities"("active");

-- CreateIndex
CREATE INDEX "recurring_activities_responsible_user_id_idx" ON "recurring_activities"("responsible_user_id");

-- CreateIndex
CREATE INDEX "recurring_activities_responsible_area_id_idx" ON "recurring_activities"("responsible_area_id");

-- CreateIndex
CREATE INDEX "recurring_activities_activity_type_idx" ON "recurring_activities"("activity_type");

-- CreateIndex
CREATE INDEX "recurring_activities_cadence_idx" ON "recurring_activities"("cadence");

-- CreateIndex
CREATE INDEX "recurring_activity_occurrences_status_idx" ON "recurring_activity_occurrences"("status");

-- CreateIndex
CREATE INDEX "recurring_activity_occurrences_target_date_idx" ON "recurring_activity_occurrences"("target_date");

-- CreateIndex
CREATE INDEX "recurring_activity_occurrences_status_target_date_idx" ON "recurring_activity_occurrences"("status", "target_date");

-- CreateIndex
CREATE INDEX "recurring_activity_occurrences_completed_by_user_id_idx" ON "recurring_activity_occurrences"("completed_by_user_id");

-- CreateIndex
CREATE INDEX "recurring_activity_occurrences_activity_id_idx" ON "recurring_activity_occurrences"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_activity_occurrences_activity_id_target_date_key" ON "recurring_activity_occurrences"("activity_id", "target_date");

-- AddForeignKey
ALTER TABLE "recurring_activities" ADD CONSTRAINT "recurring_activities_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_activities" ADD CONSTRAINT "recurring_activities_responsible_area_id_fkey" FOREIGN KEY ("responsible_area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_activity_occurrences" ADD CONSTRAINT "recurring_activity_occurrences_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "recurring_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_activity_occurrences" ADD CONSTRAINT "recurring_activity_occurrences_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK: exactamente un responsable (USER con user_id, o AREA con area_id;
-- nunca ambos ni ninguno). Espejo en BD de isResponsibleAssignmentValid().
ALTER TABLE "recurring_activities" ADD CONSTRAINT "recurring_activities_responsible_exactly_one_check" CHECK (
    (responsible_kind = 'USER' AND responsible_user_id IS NOT NULL AND responsible_area_id IS NULL)
    OR (responsible_kind = 'AREA' AND responsible_area_id IS NOT NULL AND responsible_user_id IS NULL)
);
