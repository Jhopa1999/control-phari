-- Adjuntos del chat del asistente (BL-032 F4a): imagenes y documentos que la
-- persona sube; el original va a S3 y aqui queda el texto extraido (editable).
-- Aditivo: tabla nueva, no toca tablas existentes.
CREATE TABLE "ai_attachment" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID,
    "message_id" UUID,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "extracted_text" TEXT NOT NULL DEFAULT '',
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_attachment_user_id_message_id_idx" ON "ai_attachment"("user_id", "message_id");
CREATE INDEX "ai_attachment_message_id_idx" ON "ai_attachment"("message_id");
CREATE INDEX "ai_attachment_conversation_id_idx" ON "ai_attachment"("conversation_id");

ALTER TABLE "ai_attachment" ADD CONSTRAINT "ai_attachment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_attachment" ADD CONSTRAINT "ai_attachment_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_attachment" ADD CONSTRAINT "ai_attachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
