/*
  Warnings:

  - Made the column `area_id` on table `processes` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "processes" ALTER COLUMN "area_id" SET NOT NULL;
