import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'allowPasswordChangePending';

/**
 * Permite la ruta a quien tiene pendiente el cambio de contraseña obligatorio.
 * Lista cerrada: solo `GET /me/permissions` y `POST /auth/change-password`
 * (la fija `allow-password-change-pending.spec.ts`). Va en el método.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);
