-- Catalogo de modelos de IA gestionable desde el Admin, con capacidades (BL-032 F0).
-- Aditivo: no toca tablas existentes. Los modelos por defecto los asegura la API
-- al arrancar (ensureDefaults), por lo que no se siembran aqui.
CREATE TABLE "ai_model" (
    "id" UUID NOT NULL,
    "model_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'other',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "supports_temperature" BOOLEAN NOT NULL DEFAULT true,
    "supports_tools" BOOLEAN NOT NULL DEFAULT true,
    "supports_vision" BOOLEAN NOT NULL DEFAULT false,
    "supports_documents" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_model_model_id_key" ON "ai_model"("model_id");

CREATE INDEX "ai_model_enabled_sort_order_idx" ON "ai_model"("enabled", "sort_order");
