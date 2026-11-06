-- BL-036 (Mi trabajo, Entrega 2): motivo vigente del bloqueo de una tarea.
-- Columna nullable y aditiva; no requiere relleno de datos.
ALTER TABLE "tasks" ADD COLUMN "blocked_reason" TEXT;
