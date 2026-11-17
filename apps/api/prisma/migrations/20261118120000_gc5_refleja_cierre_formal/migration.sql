-- Oleada 2 (D10): GC5 pasa a reflejar el cierre formal del proyecto.
-- Regulariza los proyectos que ya se cerraron por el cierre formal (solicitud del
-- líder y aprobación del jefe) y cuyo control GC5 quedó PENDIENTE, porque antes
-- el cierre formal no lo tocaba. Solo actualiza filas existentes en PENDIENTE de
-- solicitudes CERRADA con un cierre APROBADO; no crea filas (las que no existen
-- se materializan como CUMPLIDO al consultarlas), no toca los controles
-- «No aplica» ni los proyectos cerrados por la aprobación manual de GC5 (ya
-- CUMPLIDO). Idempotente: una segunda ejecución no encuentra filas PENDIENTE.
UPDATE "gate_checks" AS g
SET "status" = 'CUMPLIDO',
    "decided_by_user_id" = c."decided_by_user_id",
    "decided_at" = c."decided_at",
    "updated_at" = NOW()
FROM (
  SELECT DISTINCT ON ("request_id") "request_id", "decided_by_user_id", "decided_at"
  FROM "project_closures"
  WHERE "status" = 'APROBADO'
  ORDER BY "request_id", "decided_at" DESC NULLS LAST
) AS c
JOIN "requests" r ON r."id" = c."request_id"
WHERE g."request_id" = c."request_id"
  AND g."gate_code" = 'GC5'
  AND g."status" = 'PENDIENTE'
  AND r."operational_state" = 'CERRADA'
  AND r."deleted_at" IS NULL;
