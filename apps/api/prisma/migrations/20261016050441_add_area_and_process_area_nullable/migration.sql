-- AlterTable
ALTER TABLE "processes" ADD COLUMN     "area_id" UUID;

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "areas_active_idx" ON "areas"("active");

-- CreateIndex
CREATE INDEX "areas_sort_order_idx" ON "areas"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "areas_code_key" ON "areas"("code");

-- AddForeignKey
ALTER TABLE "processes" ADD CONSTRAINT "processes_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
