import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Formato de los códigos de altas (áreas, procesos, maestras): letras
 * mayúsculas, números y guion bajo, hasta 40 caracteres. Se valida solo al
 * crear: los registros existentes no se revalidan (los DTO de edición no
 * reciben `code`).
 */
export const CODE_MAX_LENGTH = 40;
export const CODE_PATTERN = /^[A-Z0-9_]+$/;

/** Textos únicos; la web los reconoce por texto exacto para marcar el campo. */
export const CODE_MESSAGES = {
  code: {
    required: 'El código es obligatorio.',
    format: 'El código solo admite letras mayúsculas, números y guion bajo.',
    maxLength: `El código admite como máximo ${CODE_MAX_LENGTH} caracteres.`,
  },
  catalog: {
    required: 'El catálogo es obligatorio.',
    format: 'El catálogo solo admite letras mayúsculas, números y guion bajo.',
    maxLength: `El catálogo admite como máximo ${CODE_MAX_LENGTH} caracteres.`,
  },
} as const;

/** Recorta y pasa a mayúsculas antes de validar («analitica» -> «ANALITICA»). */
export const normalizeCode = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/**
 * Valida un código o un nombre de catálogo en altas: normaliza y exige el
 * formato y el máximo, con mensajes en español.
 */
export function CodeFormat(kind: keyof typeof CODE_MESSAGES): PropertyDecorator {
  const messages = CODE_MESSAGES[kind];
  return applyDecorators(
    Transform(normalizeCode),
    IsString({ message: messages.format }),
    IsNotEmpty({ message: messages.required }),
    MaxLength(CODE_MAX_LENGTH, { message: messages.maxLength }),
    // El vacío lo informa IsNotEmpty; aquí solo se evalúan los caracteres.
    Matches(/^[A-Z0-9_]*$/, { message: messages.format }),
  );
}
