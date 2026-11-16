import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateAssignmentDto } from './create-assignment.dto';
import { CreateAvailabilityDto } from './create-availability.dto';
import { UpdateAssignmentDto } from './update-assignment.dto';
import { UpdateAvailabilityDto } from './update-availability.dto';

const UUID = '2f6f6a6e-5d2c-4a39-9a3a-1c0f6f2d7a11';

function messages<T extends object>(cls: new () => T, body: Record<string, unknown>): string[] {
  const dto = plainToInstance(cls, body);
  return validateSync(dto).flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('topes de horas de capacidad (validación en la API)', () => {
  const availability = { userId: UUID, month: '2026-11' };
  const assignment = { userId: UUID, month: '2026-11', processId: UUID };

  it('disponibilidad de 99999 h -> 400 en español (alta y edición)', () => {
    const expected = 'La disponibilidad no puede superar 744 horas al mes.';
    expect(messages(CreateAvailabilityDto, { ...availability, availableHours: 99999 })).toContain(expected);
    expect(messages(UpdateAvailabilityDto, { availableHours: 745 })).toContain(expected);
  });

  it('disponibilidad entre 0 y 744 h pasa (0 y 744 incluidos)', () => {
    expect(messages(CreateAvailabilityDto, { ...availability, availableHours: 0 })).toEqual([]);
    expect(messages(UpdateAvailabilityDto, { availableHours: 744 })).toEqual([]);
  });

  it('asignación de 0 h -> 400 en español (alta y edición)', () => {
    const expected = 'La asignación debe ser de al menos 1 hora.';
    expect(messages(CreateAssignmentDto, { ...assignment, committedHours: 0 })).toContain(expected);
    expect(messages(UpdateAssignmentDto, { committedHours: 0 })).toContain(expected);
  });

  it('asignación de 1 h o más pasa; omitirla al editar es válido', () => {
    expect(messages(CreateAssignmentDto, { ...assignment, committedHours: 1 })).toEqual([]);
    expect(messages(UpdateAssignmentDto, {})).toEqual([]);
  });
});
