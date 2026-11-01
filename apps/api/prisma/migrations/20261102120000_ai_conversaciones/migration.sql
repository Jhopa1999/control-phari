-- Conversaciones del asistente de IA (BL-032 F2). Aditivo.
CREATE TABLE "ai_conversation" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_message" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tools" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_conversation_user_id_updated_at_idx" ON "ai_conversation"("user_id", "updated_at");
CREATE INDEX "ai_message_conversation_id_created_at_idx" ON "ai_message"("conversation_id", "created_at");

ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
