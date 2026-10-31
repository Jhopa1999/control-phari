-- BL-026: corrige la ortografia (tildes) de las etiquetas de los datos maestros
-- y del nombre del proceso FMAA.
--
-- Es una migracion de DATOS, sin cambios de esquema. Es idempotente y segura
-- ante ediciones manuales: solo actualiza una fila si su etiqueta sigue siendo
-- EXACTAMENTE el valor original sin tilde; si alguien ya la edito desde
-- Maestras o Procesos, no se toca. Los codigos (`code`) no cambian.
--
-- Reversion manual (si hiciera falta): repetir los UPDATE intercambiando
-- old_label y new_label.

UPDATE "catalog_items" AS c
SET "label" = v.new_label,
    "updated_at" = NOW()
FROM (
  VALUES
    ('CRITICALITY', 'CRITICA', 'Critica', 'Crítica'),
    ('DATA_AVAILABILITY', 'SI', 'Si', 'Sí'),
    ('TASK_STATUS', 'EN_REVISION', 'En revision', 'En revisión'),
    ('DEMAND_TYPE', 'EVOLUCION', 'Evolucion', 'Evolución'),
    ('DEMAND_TYPE', 'DEUDA_TECNICA', 'Deuda tecnica', 'Deuda técnica'),
    ('DEMAND_TYPE', 'EXPLORACION', 'Exploracion', 'Exploración'),
    ('ASSET_TYPE', 'INTEGRACION', 'Integracion', 'Integración'),
    ('ACTIVITY_CLASS', 'SOPORTE', 'Operacion/soporte', 'Operación/soporte'),
    ('ACTIVITY_CLASS', 'INTERNA', 'Gestion interna', 'Gestión interna'),
    ('SOURCE', 'APLICACION', 'Aplicacion', 'Aplicación'),
    ('DOC_CATEGORY', 'TECNICA', 'Tecnica', 'Técnica'),
    ('GOVERNANCE_ROUTE', 'EXPLORACION', 'Ruta de exploracion', 'Ruta de exploración'),
    ('VALIDATION_TYPE', 'FUNCIONAL_ACEPTACION', 'Funcional y aceptacion', 'Funcional y aceptación'),
    ('VALIDATION_TYPE', 'COMPONENTE_INTEGRACION', 'Componente e integracion', 'Componente e integración'),
    ('VALIDATION_TYPE', 'REGRESION', 'Regresion', 'Regresión'),
    ('VALIDATION_TYPE', 'INFORMACION', 'Informacion', 'Información'),
    ('PRIORITY_BAND', 'P1', 'P1 · Primera consideracion para compromiso', 'P1 · Primera consideración para compromiso'),
    ('PRIORITY_BAND', 'P2', 'P2 · Programacion en el horizonte cercano', 'P2 · Programación en el horizonte cercano'),
    ('PRIORITY_BAND', 'P3', 'P3 · Planificacion ordinaria segun capacidad', 'P3 · Planificación ordinaria según capacidad'),
    ('PRIORITY_BAND', 'P4', 'P4 · Reserva de demanda, reformulacion o cierre motivado', 'P4 · Reserva de demanda, reformulación o cierre motivado'),
    ('RECURRING_ACTIVITY_TYPE', 'VALIDACION', 'Validacion', 'Validación'),
    ('RECURRING_ACTIVITY_TYPE', 'REVISION', 'Revision', 'Revisión')
) AS v(catalog, code, old_label, new_label)
WHERE c."catalog" = v.catalog
  AND c."code" = v.code
  AND c."label" = v.old_label;

UPDATE "processes"
SET "name" = 'Coordinación multiproceso',
    "updated_at" = NOW()
WHERE "code" = 'FMAA'
  AND "name" = 'Coordinacion multiproceso';
