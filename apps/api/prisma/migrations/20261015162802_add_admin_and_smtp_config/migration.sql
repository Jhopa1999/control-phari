-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "smtp_config" (
    "id" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "password_ciphertext" TEXT,
    "from_address" TEXT NOT NULL,
    "from_name" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smtp_config_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "smtp_config" ADD CONSTRAINT "smtp_config_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
