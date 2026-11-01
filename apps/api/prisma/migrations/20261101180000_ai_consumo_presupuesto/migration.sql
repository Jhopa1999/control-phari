-- Registro de consumo de IA y presupuesto mensual (BL-032 F0). Aditivo.

-- Presupuesto en la configuracion global (tope mensual en USD y % de alerta).
ALTER TABLE "ai_global_config"
    ADD COLUMN "monthly_budget_usd" DOUBLE PRECISION DEFAULT 100,
    ADD COLUMN "budget_alert_pct" INTEGER NOT NULL DEFAULT 80;

-- Precio por millon de tokens en el catalogo de modelos.
ALTER TABLE "ai_model"
    ADD COLUMN "input_usd_per_mtok" DOUBLE PRECISION,
    ADD COLUMN "output_usd_per_mtok" DOUBLE PRECISION;

-- Precios de los modelos por defecto si la fila ya existe y no tiene precio.
UPDATE "ai_model" SET "input_usd_per_mtok" = 1, "output_usd_per_mtok" = 5
 WHERE "model_id" = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
   AND "input_usd_per_mtok" IS NULL;
UPDATE "ai_model" SET "input_usd_per_mtok" = 3, "output_usd_per_mtok" = 15
 WHERE "model_id" = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
   AND "input_usd_per_mtok" IS NULL;

-- Una fila por llamada al modelo (solo metricas, nunca contenido).
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "agent_code" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cache_read_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION,
    "duration_ms" INTEGER NOT NULL,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");
CREATE INDEX "ai_usage_user_id_created_at_idx" ON "ai_usage"("user_id", "created_at");
CREATE INDEX "ai_usage_agent_code_created_at_idx" ON "ai_usage"("agent_code", "created_at");

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
