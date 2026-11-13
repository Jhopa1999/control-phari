import { registerDecorator, ValidationOptions } from 'class-validator';

/** `value` es multiplo exacto de `step` (tolerante al error de coma flotante). */
export function isMultipleOf(value: unknown, step: number): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

/**
 * Valida que un numero sea multiplo de `step` (p. ej. 0,25 h o 15 min). Un valor
 * `null`/`undefined` no se valida aqui: lo gestiona `@IsOptional`.
 */
export function IsMultipleOf(step: number, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isMultipleOf',
      target: object.constructor,
      propertyName,
      constraints: [step],
      options: validationOptions,
      validator: {
        validate: (value: unknown): boolean => isMultipleOf(value, step),
      },
    });
  };
}
