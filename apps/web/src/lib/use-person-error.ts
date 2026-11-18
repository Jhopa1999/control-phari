import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';

/**
 * Texto que devuelve la API (400) cuando el asignado o el responsable no
 * existe o no pertenece al proceso (4.3). Se reconoce por texto exacto: no se
 * interpreta texto libre.
 */
export const PERSON_NOT_IN_PROCESS_MESSAGE =
  'La persona indicada no existe o no pertenece al proceso.';

export interface PersonErrorState {
  /** Error para el selector de persona (nulo si no aplica o ya se editó). */
  personError: string | null;
  /** Aviso del diálogo sin el error de persona (ese va junto al selector). */
  formMessage: string | null;
  /** El usuario cambió un selector: se quita el error hasta el próximo envío. */
  dismiss: () => void;
}

/**
 * Separa el error de «persona fuera de alcance» del resto de errores del
 * servidor: el primero va en el `Field` del selector; el resto, en `FormError`.
 */
export function usePersonError(errorMessage: string | null): PersonErrorState {
  const [dismissed, setDismissed] = React.useState(false);
  // Un error nuevo (otro envío) vuelve a mostrarse.
  useResetOnChange([errorMessage], () => setDismissed(false));
  const isPersonError = errorMessage === PERSON_NOT_IN_PROCESS_MESSAGE;
  return {
    personError: isPersonError && !dismissed ? errorMessage : null,
    formMessage: isPersonError ? null : errorMessage,
    dismiss: () => setDismissed(true),
  };
}
