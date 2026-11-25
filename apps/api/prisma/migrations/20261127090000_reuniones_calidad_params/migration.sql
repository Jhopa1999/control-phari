-- Reuniones y compromisos (PR-4). Parámetros y plantillas gestionables desde Maestras.
-- seed.ts no corre en producción, por eso van en migración.
-- COMMITMENT_PARAM: años hacia atrás y adelante que admite el vencimiento de un
-- compromiso (el número va en "label"; el código lleva 1 y 5 por defecto si faltan).
-- MEETING_AGENDA_TEMPLATE: plantillas de agenda del acta; "label" es el nombre y
-- "description" el texto que se inserta en la agenda.
-- Idempotente y aditiva: no pisa lo que se haya editado.
INSERT INTO "catalog_items" ("id", "catalog", "code", "label", "description", "active", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'COMMITMENT_PARAM', 'DUE_YEARS_BACK', '1', 'Años hacia atrás, desde hoy, que admite el vencimiento de un compromiso al crearlo o al cambiar su fecha (0 a 50).', true, 1, now(), now()),
  (gen_random_uuid(), 'COMMITMENT_PARAM', 'DUE_YEARS_AHEAD', '5', 'Años hacia adelante, desde hoy, que admite el vencimiento de un compromiso al crearlo o al cambiar su fecha (0 a 50).', true, 2, now(), now()),
  (gen_random_uuid(), 'MEETING_AGENDA_TEMPLATE', 'ACTA_SIMPLE', 'Acta simple', E'1. Revisión de compromisos anteriores\n2. Temas a tratar\n3. Acuerdos y responsables\n4. Próximos pasos y fecha de la siguiente reunión', true, 3, now(), now()),
  (gen_random_uuid(), 'MEETING_AGENDA_TEMPLATE', 'SEGUIMIENTO', 'Reunión de seguimiento', E'1. Avances desde la última reunión\n2. Bloqueos y riesgos\n3. Decisiones que se necesitan\n4. Compromisos nuevos: quién, qué y para cuándo', true, 4, now(), now())
ON CONFLICT ("catalog", "code") DO NOTHING;
