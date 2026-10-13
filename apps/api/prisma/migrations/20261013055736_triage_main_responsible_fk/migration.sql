/*
  Warnings:

  - You are about to drop the column `main_responsible` on the `triages` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "triages" DROP COLUMN "main_responsible",
ADD COLUMN     "main_responsible_user_id" UUID;

-- CreateIndex
CREATE INDEX "triages_main_responsible_user_id_idx" ON "triages"("main_responsible_user_id");

-- AddForeignKey
ALTER TABLE "triages" ADD CONSTRAINT "triages_main_responsible_user_id_fkey" FOREIGN KEY ("main_responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
