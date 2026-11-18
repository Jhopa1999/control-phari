-- Cambio de contraseña obligatorio. Aditiva e idempotente: no marca a nadie.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
