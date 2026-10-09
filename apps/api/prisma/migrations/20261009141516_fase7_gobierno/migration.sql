-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "blocked_at" TIMESTAMP(3),
ADD COLUMN     "blocked_by_user_id" UUID,
ADD COLUMN     "blocked_reason" TEXT,
ADD COLUMN     "blocked_resolved_at" TIMESTAMP(3),
ADD COLUMN     "blocked_resolved_by_user_id" UUID,
ADD COLUMN     "governance_route" TEXT;

-- CreateTable
CREATE TABLE "gate_checks" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "gate_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "condition_text" TEXT NOT NULL,
    "authority_text" TEXT NOT NULL,
    "waiver_reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_pending_items" (
    "id" UUID NOT NULL,
    "gate_check_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "owner_user_id" UUID,
    "review_date" DATE,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_pending_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_records" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "gate_check_id" UUID,
    "validation_type_code" TEXT NOT NULL,
    "test_case" TEXT NOT NULL,
    "version" TEXT,
    "environment" TEXT,
    "result_code" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "blocking_resolved" BOOLEAN NOT NULL DEFAULT false,
    "blocking_resolved_at" TIMESTAMP(3),
    "blocking_resolved_by_user_id" UUID,
    "evidence_ref" TEXT,
    "evidence_document_id" UUID,
    "evidence_document_version_id" UUID,
    "executed_by_user_id" UUID NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "validation_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gate_checks_request_id_idx" ON "gate_checks"("request_id");

-- CreateIndex
CREATE INDEX "gate_checks_status_idx" ON "gate_checks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "gate_checks_request_id_gate_code_key" ON "gate_checks"("request_id", "gate_code");

-- CreateIndex
CREATE INDEX "gate_pending_items_gate_check_id_idx" ON "gate_pending_items"("gate_check_id");

-- CreateIndex
CREATE INDEX "gate_pending_items_resolved_idx" ON "gate_pending_items"("resolved");

-- CreateIndex
CREATE INDEX "validation_records_request_id_idx" ON "validation_records"("request_id");

-- CreateIndex
CREATE INDEX "validation_records_gate_check_id_idx" ON "validation_records"("gate_check_id");

-- CreateIndex
CREATE INDEX "validation_records_validation_type_code_idx" ON "validation_records"("validation_type_code");

-- CreateIndex
CREATE INDEX "validation_records_result_code_idx" ON "validation_records"("result_code");

-- CreateIndex
CREATE INDEX "validation_records_blocking_idx" ON "validation_records"("blocking");

-- CreateIndex
CREATE INDEX "validation_records_blocking_resolved_idx" ON "validation_records"("blocking_resolved");

-- CreateIndex
CREATE INDEX "requests_governance_route_idx" ON "requests"("governance_route");

-- CreateIndex
CREATE INDEX "requests_blocked_at_idx" ON "requests"("blocked_at");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_blocked_by_user_id_fkey" FOREIGN KEY ("blocked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_blocked_resolved_by_user_id_fkey" FOREIGN KEY ("blocked_resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_checks" ADD CONSTRAINT "gate_checks_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_checks" ADD CONSTRAINT "gate_checks_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pending_items" ADD CONSTRAINT "gate_pending_items_gate_check_id_fkey" FOREIGN KEY ("gate_check_id") REFERENCES "gate_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pending_items" ADD CONSTRAINT "gate_pending_items_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_records" ADD CONSTRAINT "validation_records_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_records" ADD CONSTRAINT "validation_records_gate_check_id_fkey" FOREIGN KEY ("gate_check_id") REFERENCES "gate_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_records" ADD CONSTRAINT "validation_records_evidence_document_id_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_records" ADD CONSTRAINT "validation_records_evidence_document_version_id_fkey" FOREIGN KEY ("evidence_document_version_id") REFERENCES "document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_records" ADD CONSTRAINT "validation_records_executed_by_user_id_fkey" FOREIGN KEY ("executed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_records" ADD CONSTRAINT "validation_records_blocking_resolved_by_user_id_fkey" FOREIGN KEY ("blocking_resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
