-- BL-036 (Mi trabajo, Entrega 3): momento en que una tarea pasó a «En revisión».
-- Columna nullable y aditiva; sin relleno retroactivo (las tareas ya en revisión
-- quedan en NULL y la API usa updated_at como respaldo aproximado).
ALTER TABLE "tasks" ADD COLUMN "review_requested_at" TIMESTAMP(3);
