-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by_user_id" UUID,
ADD COLUMN     "requester_id" UUID;

-- CreateTable
CREATE TABLE "requesters" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "area_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requesters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requesters_area_id_idx" ON "requesters"("area_id");

-- CreateIndex
CREATE INDEX "requesters_active_idx" ON "requesters"("active");

-- CreateIndex
CREATE UNIQUE INDEX "requesters_name_key_key" ON "requesters"("name_key");

-- AddForeignKey
ALTER TABLE "requesters" ADD CONSTRAINT "requesters_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "requesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
