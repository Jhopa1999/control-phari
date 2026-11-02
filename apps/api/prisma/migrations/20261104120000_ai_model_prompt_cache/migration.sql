-- Capacidad de cache de prompt por modelo (BL-032): las definiciones de tools y el
-- prompt de sistema del asistente se reutilizan entre llamadas. Aditivo: columna
-- con valor por defecto false; solo se activa en los modelos Claude 4.5 sembrados
-- (el Admin la gestiona desde el catalogo de modelos).
ALTER TABLE "ai_model" ADD COLUMN "supports_prompt_cache" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ai_model"
SET "supports_prompt_cache" = true
WHERE "model_id" IN (
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
);