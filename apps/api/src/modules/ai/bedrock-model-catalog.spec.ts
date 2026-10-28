import { BadRequestException } from '@nestjs/common';
import {
  assertModelAllowed,
  BEDROCK_MODEL_CATALOG,
  DEFAULT_TRIAGE_MODEL,
} from './bedrock-model-catalog';

/**
 * El catalogo de modelos es una lista CERRADA: assertModelAllowed solo acepta
 * IDs del catalogo y rechaza cualquier otro con 400 (regla de negocio del Admin:
 * no se puede guardar un modelo arbitrario).
 */
describe('bedrock-model-catalog · assertModelAllowed', () => {
  it('acepta un modelo del catalogo sin lanzar', () => {
    for (const model of BEDROCK_MODEL_CATALOG) {
      expect(() => assertModelAllowed(model)).not.toThrow();
    }
  });

  it('el modelo default del triage pertenece al catalogo', () => {
    expect(() => assertModelAllowed(DEFAULT_TRIAGE_MODEL)).not.toThrow();
    expect(BEDROCK_MODEL_CATALOG).toContain(DEFAULT_TRIAGE_MODEL);
  });

  it('rechaza un modelo fuera del catalogo con BadRequestException (400)', () => {
    expect(() => assertModelAllowed('anthropic.claude-inventado')).toThrow(
      BadRequestException,
    );
  });

  it('rechaza cadena vacia con 400', () => {
    expect(() => assertModelAllowed('')).toThrow(BadRequestException);
  });
});
