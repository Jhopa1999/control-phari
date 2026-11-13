import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { assertQuarterHours, isValidQuarterHours, roundToQuarter } from './quarter-hours';
import { meetingKey, occurrenceKey, parseSuggestionKey, taskKey } from './suggestion-key';
import {
  meetingHours,
  mergeTaskReasons,
  occurrenceHours,
  taskWorkReasons,
} from './suggestion-sources';
import { CreateActivityDto } from './dto/create-activity.dto';
import { meetingEndTimeOf } from '../meeting/minutes';
import { dueStatusOf } from '../commitment/commitment-due';
import { CreateMeetingDto } from '../meeting/dto/create-meeting.dto';

const UUID = '3f2a8c1e-5b7d-4e9a-8c2f-1a2b3c4d5e6f';

describe('horas en pasos de 0,25', () => {
  it('acepta 0,25..24 en pasos de 0,25 y rechaza el resto', () => {
    expect(isValidQuarterHours(0.25)).toBe(true);
    expect(isValidQuarterHours(7.75)).toBe(true);
    expect(isValidQuarterHours(24)).toBe(true);
    expect(isValidQuarterHours(0)).toBe(false);
    expect(isValidQuarterHours(0.3)).toBe(false);
    expect(isValidQuarterHours(25)).toBe(false);
    expect(() => assertQuarterHours(0.3)).toThrow(BadRequestException);
  });

  it('redondea al 0,25 más cercano dentro de 0,25..24', () => {
    expect(roundToQuarter(1.1)).toBe(1);
    expect(roundToQuarter(1.13)).toBe(1.25);
    expect(roundToQuarter(0.05)).toBe(0.25);
    expect(roundToQuarter(30)).toBe(24);
  });

  it('el DTO de actividad valida decimales de 0,25 (0,3 y 25 inválidos)', async () => {
    const errorsFor = async (hours: number) =>
      validate(plainToInstance(CreateActivityDto, { classificationCode: 'INTERNA', hours }));
    expect(await errorsFor(1.5)).toHaveLength(0);
    expect(await errorsFor(0.25)).toHaveLength(0);
    expect((await errorsFor(0.3)).length).toBeGreaterThan(0);
    expect((await errorsFor(25)).length).toBeGreaterThan(0);
    expect((await errorsFor(0)).length).toBeGreaterThan(0);
  });
});

describe('claves de sugerencia', () => {
  it('construye y descompone las tres claves', () => {
    expect(parseSuggestionKey(meetingKey(UUID))).toEqual({ kind: 'MEETING', id: UUID });
    expect(parseSuggestionKey(occurrenceKey(UUID))).toEqual({ kind: 'OCCURRENCE', id: UUID });
    expect(parseSuggestionKey(taskKey(UUID, '2025-03-10'))).toEqual({
      kind: 'TASK',
      id: UUID,
      date: '2025-03-10',
    });
  });

  it('rechaza claves con formato libre', () => {
    expect(parseSuggestionKey('MEETING:x')).toBeNull();
    expect(parseSuggestionKey(`TASK:${UUID}`)).toBeNull();
    expect(parseSuggestionKey(`OTRO:${UUID}`)).toBeNull();
  });
});

describe('fuentes de sugerencia', () => {
  it('horas de reunión: minutos/60 o null sin duración', () => {
    expect(meetingHours(90)).toBe(1.5);
    expect(meetingHours(15)).toBe(0.25);
    expect(meetingHours(null)).toBeNull();
  });

  it('horas de ocurrencia: redondeo informado', () => {
    expect(occurrenceHours(2)).toEqual({ hours: 2, adjusted: false });
    expect(occurrenceHours(1.1)).toEqual({ hours: 1, adjusted: true });
  });

  it('tarea trabajada: solo cuentan avance y estado', () => {
    expect(taskWorkReasons({ progress: 10, title: 'a' }, { progress: 40, title: 'a' })).toEqual([
      { field: 'progress', from: '10', to: '40' },
    ]);
    expect(taskWorkReasons({ title: 'a', progress: 10 }, { title: 'b', progress: 10 })).toEqual([]);
    expect(
      mergeTaskReasons([
        [{ field: 'progress', from: '10', to: '40' }],
        [{ field: 'progress', from: '40', to: '60' }],
        [{ field: 'status', from: 'A', to: 'B' }],
        [{ field: 'status', from: 'B', to: 'A' }],
      ]),
    ).toEqual([{ field: 'progress', from: '10', to: '60' }]);
  });
});

describe('reuniones', () => {
  it('hora de fin = hora + duración; null si falta algo o cruza medianoche', () => {
    expect(meetingEndTimeOf('10:00', 60)).toBe('11:00');
    expect(meetingEndTimeOf('09:45', 30)).toBe('10:15');
    expect(meetingEndTimeOf(null, 60)).toBeNull();
    expect(meetingEndTimeOf('10:00', null)).toBeNull();
    expect(meetingEndTimeOf('23:30', 60)).toBeNull();
  });

  it('la duración del DTO va de 15 a 1440 en múltiplos de 15', async () => {
    const base = { processId: UUID, title: 'Comité', meetingDate: '2025-03-10' };
    const errorsFor = async (durationMinutes: number) =>
      validate(plainToInstance(CreateMeetingDto, { ...base, durationMinutes }));
    expect(await errorsFor(60)).toHaveLength(0);
    expect((await errorsFor(20)).length).toBeGreaterThan(0);
    expect((await errorsFor(0)).length).toBeGreaterThan(0);
    expect((await errorsFor(1455)).length).toBeGreaterThan(0);
  });
});

describe('semáforo de vencimiento de compromisos', () => {
  const today = new Date(Date.UTC(2025, 2, 10));
  const day = (d: number) => new Date(Date.UTC(2025, 2, d));
  it('vencido, vence hoy, próximo (1-7 días) y a tiempo', () => {
    expect(dueStatusOf(day(9), 'EN_CURSO', today)).toEqual({ status: 'VENCIDO', daysToDue: -1 });
    expect(dueStatusOf(day(10), 'BLOQUEADO', today)).toEqual({ status: 'VENCE_HOY', daysToDue: 0 });
    expect(dueStatusOf(day(17), 'EN_CURSO', today).status).toBe('PROXIMO');
    expect(dueStatusOf(day(18), 'EN_CURSO', today).status).toBe('A_TIEMPO');
  });
  it('un compromiso terminado no tiene semáforo', () => {
    expect(dueStatusOf(day(1), 'COMPLETADO', today)).toEqual({ status: null, daysToDue: null });
    expect(dueStatusOf(day(1), 'ARCHIVADO', today).status).toBeNull();
  });
});
