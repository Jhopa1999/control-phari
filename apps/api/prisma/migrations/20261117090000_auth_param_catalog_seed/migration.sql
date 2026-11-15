-- Parámetros del límite de intentos de login y de «olvidé mi contraseña» (decisión D1
-- de la oleada 1). seed.ts no corre en producción, por eso van en migración.
-- El valor numérico vive en "label"; los editan los administradores desde Maestras.
-- Idempotente: no pisa lo que se haya editado desde Maestras.
INSERT INTO "catalog_items" ("id", "catalog", "code", "label", "description", "active", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'AUTH_PARAM', 'LOGIN_MAX_ATTEMPTS', '5', 'Intentos fallidos de inicio de sesión permitidos por identificador dentro de la ventana; al superarlos responde 429.', true, 1, now(), now()),
  (gen_random_uuid(), 'AUTH_PARAM', 'LOGIN_WINDOW_MINUTES', '15', 'Ventana, en minutos, del límite de intentos de inicio de sesión.', true, 2, now(), now()),
  (gen_random_uuid(), 'AUTH_PARAM', 'LOGIN_MAX_PER_IP', '30', 'Intentos fallidos de inicio de sesión permitidos por IP dentro de la ventana.', true, 3, now(), now()),
  (gen_random_uuid(), 'AUTH_PARAM', 'FORGOT_MAX_ATTEMPTS', '3', 'Solicitudes de «olvidé mi contraseña» permitidas por identificador dentro de la ventana; las demás se ignoran sin avisar.', true, 4, now(), now()),
  (gen_random_uuid(), 'AUTH_PARAM', 'FORGOT_WINDOW_MINUTES', '60', 'Ventana, en minutos, del límite de «olvidé mi contraseña».', true, 5, now(), now())
ON CONFLICT ("catalog", "code") DO NOTHING;
