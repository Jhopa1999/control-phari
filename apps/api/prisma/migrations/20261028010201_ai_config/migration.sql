-- CreateTable
CREATE TABLE "ai_global_config" (
    "id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "credential_mode" TEXT NOT NULL DEFAULT 'iam-role',
    "aws_access_key_id" TEXT,
    "aws_secret_access_key_ciphertext" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_global_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_config" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "region" TEXT NOT NULL DEFAULT 'us-east-2',
    "model" TEXT NOT NULL,
    "base_prompt" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "max_tokens" INTEGER NOT NULL DEFAULT 1024,
    "timeout_ms" INTEGER NOT NULL DEFAULT 20000,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_config_code_key" ON "ai_agent_config"("code");

-- CreateIndex
CREATE INDEX "ai_agent_config_code_idx" ON "ai_agent_config"("code");

-- AddForeignKey
ALTER TABLE "ai_global_config" ADD CONSTRAINT "ai_global_config_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_config" ADD CONSTRAINT "ai_agent_config_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
