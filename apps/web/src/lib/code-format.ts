/**
 * Formato de los códigos de altas (áreas, procesos, maestras). Es solo ayuda
 * de formato en el cliente: la API es la autoridad y los textos son los mismos
 * que ella devuelve (la web reconoce el error del servidor por texto exacto,
 * sin interpretar texto libre).
 */
export const CODE_MAX_LENGTH = 40;
export const CODE_PATTERN = /^[A-Z0-9_]+$/;

export const CODE_HELP = 'Letras mayúsculas, números y guion bajo. Máximo 40 caracteres.';

export const CODE_ERRORS = {
  required: 'El código es obligatorio.',
  format: 'El código solo admite letras mayúsculas, números y guion bajo.',
  maxLength: `El código admite como máximo ${CODE_MAX_LENGTH} caracteres.`,
} as const;

export const CATALOG_ERRORS = {
  required: 'El catálogo es obligatorio.',
  format: 'El catálogo solo admite letras mayúsculas, números y guion bajo.',
  maxLength: `El catálogo admite como máximo ${CODE_MAX_LENGTH} caracteres.`,
} as const;

/** Recorta y pasa a mayúsculas, igual que la API antes de validar. */
export function normalizeCodeInput(value: string): string {
  return value.trim().toUpperCase();
}

function validateWith(
  value: string,
  messages: { required: string; format: string; maxLength: string },
): string | null {
  const normalized = normalizeCodeInput(value);
  if (normalized === '') return messages.required;
  if (normalized.length > CODE_MAX_LENGTH) return messages.maxLength;
  if (!CODE_PATTERN.test(normalized)) return messages.format;
  return null;
}

/** Error de un código (área, proceso o elemento de maestra) o `null` si es válido. */
export function validateCode(value: string): string | null {
  return validateWith(value, CODE_ERRORS);
}

/** Error del nombre de catálogo de una maestra o `null` si es válido. */
export function validateCatalogName(value: string): string | null {
  return validateWith(value, CATALOG_ERRORS);
}

export interface ServerCodeErrors {
  /** Error para el campo «Código». */
  code: string | null;
  /** Error para el campo «Catálogo». */
  catalog: string | null;
  /** Mensajes que no corresponden a un campo de código: van al `FormError`. */
  rest: string[];
}

const CODE_TEXTS: ReadonlySet<string> = new Set([
  CODE_ERRORS.required,
  CODE_ERRORS.format,
  CODE_ERRORS.maxLength,
]);

const CATALOG_TEXTS: ReadonlySet<string> = new Set([
  CATALOG_ERRORS.required,
  CATALOG_ERRORS.format,
  CATALOG_ERRORS.maxLength,
]);

/**
 * Reparte los mensajes de un 400 de validación: los que coinciden EXACTAMENTE
 * con un texto de código o de catálogo marcan su campo; el resto queda en
 * `rest`.
 */
export function splitServerCodeErrors(messages: readonly string[]): ServerCodeErrors {
  const result: ServerCodeErrors = { code: null, catalog: null, rest: [] };
  for (const message of messages) {
    if (CODE_TEXTS.has(message)) result.code ??= message;
    else if (CATALOG_TEXTS.has(message)) result.catalog ??= message;
    else result.rest.push(message);
  }
  return result;
}
