-- CreateTable
CREATE TABLE "task_evidences" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_evidences_storage_key_key" ON "task_evidences"("storage_key");

-- CreateIndex
CREATE INDEX "task_evidences_task_id_idx" ON "task_evidences"("task_id");

-- AddForeignKey
ALTER TABLE "task_evidences" ADD CONSTRAINT "task_evidences_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_evidences" ADD CONSTRAINT "task_evidences_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;