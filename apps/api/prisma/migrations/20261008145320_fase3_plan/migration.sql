-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "commitment_date" TIMESTAMP(3),
    "risks" TEXT,
    "mitigations" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "submitted_at" TIMESTAMP(3),
    "submitted_by_user_id" UUID,
    "authorized_at" TIMESTAMP(3),
    "authorized_by_user_id" UUID,
    "return_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_phases" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "deliverable" TEXT,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "phase_id" UUID NOT NULL,
    "process_id" UUID,
    "title" TEXT NOT NULL,
    "responsible_user_id" UUID,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "estimate_hours" INTEGER,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "acceptance_criteria" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POR_HACER',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "framework_phase_required" TEXT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" UUID,
    "evidence_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" UUID NOT NULL,
    "dependent_task_id" UUID NOT NULL,
    "predecessor_task_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plans_status_idx" ON "plans"("status");

-- CreateIndex
CREATE UNIQUE INDEX "plans_request_id_key" ON "plans"("request_id");

-- CreateIndex
CREATE INDEX "plan_phases_plan_id_idx" ON "plan_phases"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_phases_plan_id_order_key" ON "plan_phases"("plan_id", "order");

-- CreateIndex
CREATE INDEX "tasks_phase_id_idx" ON "tasks"("phase_id");

-- CreateIndex
CREATE INDEX "tasks_responsible_user_id_idx" ON "tasks"("responsible_user_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "task_dependencies_predecessor_task_id_idx" ON "task_dependencies"("predecessor_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_dependent_task_id_predecessor_task_id_key" ON "task_dependencies"("dependent_task_id", "predecessor_task_id");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_authorized_by_user_id_fkey" FOREIGN KEY ("authorized_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_phases" ADD CONSTRAINT "plan_phases_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "plan_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependent_task_id_fkey" FOREIGN KEY ("dependent_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_task_id_fkey" FOREIGN KEY ("predecessor_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
