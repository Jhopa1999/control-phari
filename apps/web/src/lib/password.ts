import type { components } from '@plantilla-portales/api-client';
import { api } from './api-client';
import { parseRetryAfter } from './api-error';
import {
  describeChangePasswordFailure,
  type ChangePasswordFailure,
} from './password-messages';

export type ChangePasswordInput = components['schemas']['ChangePasswordDto'];

/** Fallo del cambio de contraseña, ya traducido a texto de negocio y campo. */
export class ChangePasswordError extends Error {
  constructor(
    readonly failure: ChangePasswordFailure,
    readonly status?: number,
  ) {
    super(failure.message);
    this.name = 'ChangePasswordError';
  }
}

/**
 * Cambia la contraseña de la sesión actual (POST /auth/change-password, 204).
 * Con el cambio obligatorio pendiente es la única escritura que la API permite.
 */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  try {
    const { error, response } = await api.POST('/auth/change-password', { body: input });
    if (error || !response.ok) {
      throw new ChangePasswordError(
        describeChangePasswordFailure(
          response.status,
          error,
          response.status === 429
            ? parseRetryAfter(response.headers.get('Retry-After'))
            : undefined,
        ),
        response.status,
      );
    }
  } catch (err) {
    if (err instanceof ChangePasswordError) throw err;
    throw new ChangePasswordError(describeChangePasswordFailure(undefined, undefined));
  }
}
