-- A1: columna aditiva para el creador de la solicitud (UUID sin relacion,
-- patron de deleted_by_user_id/closed_by_user_id). Permite que el creador
-- identifique sus solicitudes aunque aun no tengan proceso principal.
ALTER TABLE "requests" ADD COLUMN "created_by_user_id" UUID;
