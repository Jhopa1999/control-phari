-- Ejemplo de SQL para -SeedSql de deploy.ps1: parametro nuevo del seed que NO
-- llega solo a produccion (el seed no corre alli). Debe ser idempotente.
-- Caso real: dias de gracia de la Bitacora tras cerrar un proyecto.
INSERT INTO catalog_items (id, catalog, code, label, description, active, sort_order, created_at, updated_at)
VALUES (gen_random_uuid(), 'WORKLOG_PARAM', 'CLOSED_PROJECT_GRACE_DAYS', '7',
 'Días tras el cierre de un proyecto en los que aún se pueden imputar actividades en la Bitácora. Escribe un número entero en la etiqueta (0 = sin gracia). Si la maestra se desactiva o el valor no es válido, se usan 7 días.',
 true, 1, now(), now())
ON CONFLICT (catalog, code) DO NOTHING;
SELECT 'param=' || code || ' label=' || label || ' activo=' || active FROM catalog_items WHERE catalog = 'WORKLOG_PARAM';
