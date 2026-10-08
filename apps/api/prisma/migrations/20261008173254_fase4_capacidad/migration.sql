-- CreateTable
CREATE TABLE "monthly_availabilities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "available_hours" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "process_id" UUID NOT NULL,
    "request_id" UUID,
    "committed_hours" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_availabilities_month_idx" ON "monthly_availabilities"("month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_availabilities_user_id_month_key" ON "monthly_availabilities"("user_id", "month");

-- CreateIndex
CREATE INDEX "assignments_user_id_month_idx" ON "assignments"("user_id", "month");

-- CreateIndex
CREATE INDEX "assignments_process_id_idx" ON "assignments"("process_id");

-- CreateIndex
CREATE INDEX "assignments_request_id_idx" ON "assignments"("request_id");

-- AddForeignKey
ALTER TABLE "monthly_availabilities" ADD CONSTRAINT "monthly_availabilities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
