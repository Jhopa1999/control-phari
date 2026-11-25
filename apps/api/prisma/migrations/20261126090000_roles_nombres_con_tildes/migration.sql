-- Oleada 5 (plan de mejora 5.5-1): nombres de rol con tildes.
-- Solo datos, idempotente: el filtro por nombre anterior evita pisar un nombre
-- que ya se haya cambiado a mano. No toca los códigos de rol.
UPDATE "roles" SET "name" = 'Jefe de área'     WHERE "code" = 'JEFE_AREA'     AND "name" = 'Jefe de area';
UPDATE "roles" SET "name" = 'Líder de proceso' WHERE "code" = 'LIDER_PROCESO' AND "name" = 'Lider de proceso';
