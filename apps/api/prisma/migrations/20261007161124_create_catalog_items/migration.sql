-- CreateTable
CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL,
    "catalog" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_items_catalog_idx" ON "catalog_items"("catalog");

-- CreateIndex
CREATE INDEX "catalog_items_active_idx" ON "catalog_items"("active");

-- CreateIndex
CREATE INDEX "catalog_items_sort_order_idx" ON "catalog_items"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_catalog_code_key" ON "catalog_items"("catalog", "code");
