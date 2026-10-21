-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "asset_id" UUID;

-- CreateIndex
CREATE INDEX "requests_asset_id_idx" ON "requests"("asset_id");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
