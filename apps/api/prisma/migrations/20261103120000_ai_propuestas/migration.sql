-- Propuestas de accion del asistente de IA (BL-032 F3). Aditivo.
CREATE TABLE "ai_proposal" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" UUID,
    "user_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "result_text" TEXT,
    "error_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "ai_proposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_proposal_conversation_id_idx" ON "ai_proposal"("conversation_id");
CREATE INDEX "ai_proposal_user_id_status_idx" ON "ai_proposal"("user_id", "status");

ALTER TABLE "ai_proposal" ADD CONSTRAINT "ai_proposal_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_proposal" ADD CONSTRAINT "ai_proposal_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
