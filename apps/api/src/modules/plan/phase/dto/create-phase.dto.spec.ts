import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePhaseDto } from './create-phase.dto';
import { UpdatePhaseDto } from './update-phase.dto';

function messages<T extends object>(cls: new () => T, body: Record<string, unknown>): string[] {
  const dto = plainToInstance(cls, body);
  return validateSync(dto).flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('nombre de la fase (validación en la API)', () => {
  it('nombre vacío -> 400 con mensaje en español', () => {
    expect(messages(CreatePhaseDto, { name: '' })).toContain('El nombre de la fase es obligatorio.');
  });

  it('nombre solo con espacios (tras trim) -> 400', () => {
    expect(messages(CreatePhaseDto, { name: '   ' })).toContain('El nombre de la fase es obligatorio.');
  });

  it('nombre válido pasa', () => {
    expect(messages(CreatePhaseDto, { name: ' Análisis ' })).toEqual([]);
  });

  it('al editar, un nombre vacío también se rechaza; omitirlo es válido', () => {
    expect(messages(UpdatePhaseDto, { name: '  ' })).toContain('El nombre de la fase es obligatorio.');
    expect(messages(UpdatePhaseDto, {})).toEqual([]);
  });
});
