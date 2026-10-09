-- CreateTable
CREATE TABLE "daily_logs" (
    "id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "submitted_at" TIMESTAMP(3),
    "day_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_activities" (
    "id" UUID NOT NULL,
    "daily_log_id" UUID NOT NULL,
    "classification_code" TEXT NOT NULL,
    "project_request_id" UUID,
    "task_id" UUID,
    "asset_ref" TEXT,
    "requester_ref" TEXT,
    "justification" TEXT,
    "description" TEXT,
    "result" TEXT,
    "activity_status" TEXT,
    "hours" INTEGER NOT NULL DEFAULT 0,
    "evidence_url" TEXT,
    "related_issue_id" UUID,
    "next_step" TEXT,
    "next_step_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_log_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reports" (
    "id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "submitted_at" TIMESTAMP(3),
    "results" TEXT,
    "proposals" TEXT,
    "blockers" TEXT,
    "commitments_text" TEXT,
    "decisions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "reported_by_user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type_code" TEXT NOT NULL DEFAULT 'BLOQUEO',
    "related_request_id" UUID,
    "related_task_id" UUID,
    "related_asset_ref" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "impact" TEXT,
    "resolver_user_id" UUID,
    "target_date" DATE,
    "resolution" TEXT,
    "state" TEXT NOT NULL DEFAULT 'EN_CURSO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'BORRADOR',
    "related_request_id" UUID,
    "responsible_user_id" UUID,
    "meeting_date" DATE NOT NULL,
    "meeting_time" TEXT,
    "related_project_request_id" UUID,
    "agenda" TEXT,
    "decisions" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitments" (
    "id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'EN_CURSO',
    "related_request_id" UUID,
    "responsible_user_id" UUID,
    "assigned_user_id" UUID,
    "due_date" DATE NOT NULL,
    "related_project_request_id" UUID,
    "source_meeting_id" UUID,
    "expected_result" TEXT,
    "result" TEXT,
    "blockers" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_logs_process_id_idx" ON "daily_logs"("process_id");

-- CreateIndex
CREATE INDEX "daily_logs_date_idx" ON "daily_logs"("date");

-- CreateIndex
CREATE INDEX "daily_logs_status_idx" ON "daily_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_author_user_id_process_id_date_key" ON "daily_logs"("author_user_id", "process_id", "date");

-- CreateIndex
CREATE INDEX "daily_log_activities_daily_log_id_idx" ON "daily_log_activities"("daily_log_id");

-- CreateIndex
CREATE INDEX "daily_log_activities_classification_code_idx" ON "daily_log_activities"("classification_code");

-- CreateIndex
CREATE INDEX "daily_log_activities_task_id_idx" ON "daily_log_activities"("task_id");

-- CreateIndex
CREATE INDEX "daily_log_activities_project_request_id_idx" ON "daily_log_activities"("project_request_id");

-- CreateIndex
CREATE INDEX "daily_log_activities_related_issue_id_idx" ON "daily_log_activities"("related_issue_id");

-- CreateIndex
CREATE INDEX "weekly_reports_process_id_idx" ON "weekly_reports"("process_id");

-- CreateIndex
CREATE INDEX "weekly_reports_week_start_idx" ON "weekly_reports"("week_start");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reports_author_user_id_process_id_week_start_key" ON "weekly_reports"("author_user_id", "process_id", "week_start");

-- CreateIndex
CREATE INDEX "issues_process_id_idx" ON "issues"("process_id");

-- CreateIndex
CREATE INDEX "issues_reported_by_user_id_idx" ON "issues"("reported_by_user_id");

-- CreateIndex
CREATE INDEX "issues_state_idx" ON "issues"("state");

-- CreateIndex
CREATE INDEX "issues_type_code_idx" ON "issues"("type_code");

-- CreateIndex
CREATE INDEX "meetings_process_id_idx" ON "meetings"("process_id");

-- CreateIndex
CREATE INDEX "meetings_state_idx" ON "meetings"("state");

-- CreateIndex
CREATE INDEX "meetings_meeting_date_idx" ON "meetings"("meeting_date");

-- CreateIndex
CREATE INDEX "meeting_participants_user_id_idx" ON "meeting_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meeting_id_user_id_key" ON "meeting_participants"("meeting_id", "user_id");

-- CreateIndex
CREATE INDEX "commitments_process_id_idx" ON "commitments"("process_id");

-- CreateIndex
CREATE INDEX "commitments_state_idx" ON "commitments"("state");

-- CreateIndex
CREATE INDEX "commitments_assigned_user_id_idx" ON "commitments"("assigned_user_id");

-- CreateIndex
CREATE INDEX "commitments_responsible_user_id_idx" ON "commitments"("responsible_user_id");

-- CreateIndex
CREATE INDEX "commitments_source_meeting_id_idx" ON "commitments"("source_meeting_id");

-- CreateIndex
CREATE INDEX "commitments_due_date_idx" ON "commitments"("due_date");

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log_activities" ADD CONSTRAINT "daily_log_activities_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "daily_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log_activities" ADD CONSTRAINT "daily_log_activities_project_request_id_fkey" FOREIGN KEY ("project_request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log_activities" ADD CONSTRAINT "daily_log_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_log_activities" ADD CONSTRAINT "daily_log_activities_related_issue_id_fkey" FOREIGN KEY ("related_issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_resolver_user_id_fkey" FOREIGN KEY ("resolver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_related_request_id_fkey" FOREIGN KEY ("related_request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_related_task_id_fkey" FOREIGN KEY ("related_task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_related_request_id_fkey" FOREIGN KEY ("related_request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_related_project_request_id_fkey" FOREIGN KEY ("related_project_request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_related_request_id_fkey" FOREIGN KEY ("related_request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_related_project_request_id_fkey" FOREIGN KEY ("related_project_request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_source_meeting_id_fkey" FOREIGN KEY ("source_meeting_id") REFERENCES "meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
