-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "review_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_user_id" UUID,
ADD COLUMN     "submitted_at" TIMESTAMP(3),
ADD COLUMN     "submitted_by_user_id" UUID;

-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_by_user_id" UUID;

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "request_id" UUID,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_closures" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "project_closures_request_id_status_idx" ON "project_closures"("request_id", "status");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_closures" ADD CONSTRAINT "project_closures_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Datos: categoria de documento "Cierre" (documentacion de cierre de proyectos) y
-- estados del flujo de aprobacion documental en la maestra DOC_STATUS. Idempotente.
INSERT INTO "catalog_items" ("id", "catalog", "code", "label", "active", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), v.catalog, v.code, v.label, true, v.sort_order, NOW(), NOW()
FROM (VALUES
  ('DOC_CATEGORY', 'CIERRE', 'Cierre de proyecto', 5),
  ('DOC_STATUS', 'PENDIENTE_APROBACION', 'Pendiente de aprobación', 4),
  ('DOC_STATUS', 'RECHAZADO', 'Rechazado', 5)
) AS v(catalog, code, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "catalog_items" c WHERE c."catalog" = v.catalog AND c."code" = v.code
);
