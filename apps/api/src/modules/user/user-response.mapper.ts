import type { UserResponseDto } from './dto/user-response.dto';

/** Campos de User permitidos en una respuesta HTTP (lista blanca explícita). */
type UserLike = {
  id: string;
  identifier: string;
  name: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Proyecta un User de Prisma al contrato HTTP. Copia campo por campo: un
 * campo nuevo del modelo (por ejemplo una credencial) NO sale hasta que se
 * agregue aquí a propósito.
 */
export function toUserResponse(user: UserLike): UserResponseDto {
  return {
    id: user.id,
    identifier: user.identifier,
    name: user.name,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
