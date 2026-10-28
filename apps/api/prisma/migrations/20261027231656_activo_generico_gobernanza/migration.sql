/*
  Warnings (edicion manual, flujo --create-only):

  - Se ELIMINAN de `assets` los atributos por-solicitud: `type_code`,
    `technology_code`, `source_code`, `frequency_code`. Los datos de esas
    columnas se pierden (datos de prueba, descartables, confirmado por el
    usuario).
  - `functional_description` se RENOMBRA a `general_description` mediante
    `RENAME COLUMN` (NO drop+add) para PRESERVAR el texto existente: una
    descripcion funcional sigue siendo valida como descripcion general.
  - Se crea la tabla puente N:M `asset_process_visibilities` (visibilidad
    Activo<->Proceso).

*/
-- DropIndex
DROP INDEX "assets_type_code_idx";

-- AlterTable: retirar atributos por-solicitud
ALTER TABLE "assets" DROP COLUMN "frequency_code",
DROP COLUMN "source_code",
DROP COLUMN "technology_code",
DROP COLUMN "type_code";

-- AlterTable: repurposar la descripcion conservando los datos
ALTER TABLE "assets" RENAME COLUMN "functional_description" TO "general_description";

-- CreateTable
CREATE TABLE "asset_process_visibilities" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "process_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_process_visibilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_process_visibilities_process_id_idx" ON "asset_process_visibilities"("process_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_process_visibilities_asset_id_process_id_key" ON "asset_process_visibilities"("asset_id", "process_id");

-- AddForeignKey
ALTER TABLE "asset_process_visibilities" ADD CONSTRAINT "asset_process_visibilities_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_process_visibilities" ADD CONSTRAINT "asset_process_visibilities_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
