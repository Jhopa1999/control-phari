-- CreateTable
CREATE TABLE "requests" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requester_area" TEXT,
    "requester_name" TEXT,
    "functional_owner" TEXT,
    "target_date" TIMESTAMP(3),
    "reference_url" TEXT,
    "expected_result" TEXT,
    "main_process_id" UUID NOT NULL,
    "operational_state" TEXT NOT NULL DEFAULT 'REGISTRADA',
    "initial_commitment_date" TIMESTAMP(3),
    "change_justification" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_participants" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triages" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "route_code" TEXT,
    "demand_type_code" TEXT,
    "criticality_code" TEXT,
    "size_code" TEXT,
    "data_availability_code" TEXT,
    "total_effort_hours" INTEGER,
    "main_responsible" TEXT,
    "decision" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_user_id" UUID NOT NULL,
    "dependencies" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "triages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priority_evaluations" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "impact" INTEGER NOT NULL,
    "alignment" INTEGER NOT NULL,
    "risk_control" INTEGER NOT NULL,
    "urgency" INTEGER NOT NULL,
    "scope" INTEGER NOT NULL,
    "data_availability" INTEGER NOT NULL,
    "feasibility" INTEGER NOT NULL,
    "reuse" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "justification" TEXT,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "priority_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "previous_state" TEXT NOT NULL,
    "resulting_state" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requests_main_process_id_idx" ON "requests"("main_process_id");

-- CreateIndex
CREATE INDEX "requests_operational_state_idx" ON "requests"("operational_state");

-- CreateIndex
CREATE INDEX "requests_registered_at_idx" ON "requests"("registered_at");

-- CreateIndex
CREATE INDEX "request_participants_process_id_idx" ON "request_participants"("process_id");

-- CreateIndex
CREATE UNIQUE INDEX "request_participants_request_id_process_id_key" ON "request_participants"("request_id", "process_id");

-- CreateIndex
CREATE INDEX "triages_request_id_idx" ON "triages"("request_id");

-- CreateIndex
CREATE INDEX "triages_decided_by_user_id_idx" ON "triages"("decided_by_user_id");

-- CreateIndex
CREATE INDEX "priority_evaluations_request_id_idx" ON "priority_evaluations"("request_id");

-- CreateIndex
CREATE INDEX "priority_evaluations_evaluated_by_user_id_idx" ON "priority_evaluations"("evaluated_by_user_id");

-- CreateIndex
CREATE INDEX "approvals_request_id_idx" ON "approvals"("request_id");

-- CreateIndex
CREATE INDEX "approvals_decided_by_user_id_idx" ON "approvals"("decided_by_user_id");

-- CreateIndex
CREATE INDEX "approvals_decided_at_idx" ON "approvals"("decided_at");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_main_process_id_fkey" FOREIGN KEY ("main_process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_participants" ADD CONSTRAINT "request_participants_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_participants" ADD CONSTRAINT "request_participants_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triages" ADD CONSTRAINT "triages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triages" ADD CONSTRAINT "triages_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_evaluations" ADD CONSTRAINT "priority_evaluations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "priority_evaluations" ADD CONSTRAINT "priority_evaluations_evaluated_by_user_id_fkey" FOREIGN KEY ("evaluated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
