-- CreateIndex
CREATE INDEX "audit_events_object_type_created_at_idx" ON "audit_events"("object_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_scope_process_id_created_at_idx" ON "audit_events"("scope_process_id", "created_at" DESC);
