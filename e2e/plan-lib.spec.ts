import { expect, test } from '@playwright/test';
import { formatPercent } from '../apps/web/src/lib/format';
import { dueLabel, taskDueInfo } from '../apps/web/src/lib/task-due';
import {
  dayHeading,
  describeTaskChange,
  localDayKey,
  summarizeEvent,
} from '../apps/web/src/lib/task-history';

// Pruebas puras (sin navegador) de los helpers de la Planificación: vencimiento
// de tareas y lectura de la traza de cambios.

test.describe('taskDueInfo / dueLabel', () => {
  const today = '2026-11-10';

  test('una tarea terminada nunca está vencida', () => {
    expect(taskDueInfo({ endDate: '2026-11-01', status: 'TERMINADA' }, today).kind).toBe('none');
  });

  test('vencida, hoy, pronto y a tiempo', () => {
    expect(taskDueInfo({ endDate: '2026-11-07T00:00:00.000Z', status: 'EN_CURSO' }, today)).toEqual({
      kind: 'overdue',
      days: 3,
    });
    expect(taskDueInfo({ endDate: '2026-11-10', status: 'EN_CURSO' }, today).kind).toBe('today');
    expect(taskDueInfo({ endDate: '2026-11-12', status: 'POR_HACER' }, today)).toEqual({
      kind: 'soon',
      days: 2,
    });
    expect(taskDueInfo({ endDate: '2026-11-30', status: 'POR_HACER' }, today).kind).toBe('ok');
    expect(taskDueInfo({ endDate: null, status: 'POR_HACER' }, today).kind).toBe('none');
  });

  test('los textos usan singular y plural', () => {
    expect(dueLabel({ kind: 'overdue', days: 1 })).toBe('Vencida hace 1 día');
    expect(dueLabel({ kind: 'overdue', days: 3 })).toBe('Vencida hace 3 días');
    expect(dueLabel({ kind: 'today', days: 0 })).toBe('Vence hoy');
    expect(dueLabel({ kind: 'soon', days: 2 })).toBe('Vence en 2 días');
    expect(dueLabel({ kind: 'ok', days: 20 })).toBeNull();
  });
});

test.describe('traza de cambios de la tarea', () => {
  test('traduce campos y valores a texto legible', () => {
    expect(describeTaskChange({ field: 'status', from: 'POR_HACER', to: 'EN_CURSO' })).toMatchObject({
      label: 'Estado',
      from: 'Por hacer',
      to: 'En curso',
    });
    expect(describeTaskChange({ field: 'progress', from: '0', to: '40' })).toMatchObject({
      label: 'Avance',
      from: formatPercent(0),
      to: formatPercent(40),
    });
    expect(describeTaskChange({ field: 'accepted', from: 'false', to: 'true' })).toMatchObject({
      from: 'Sin aceptar',
      to: 'Aceptada',
    });
    expect(describeTaskChange({ field: 'endDate', from: null, to: '2026-02-01T00:00:00.000Z' })).toMatchObject({
      from: null,
    });
  });

  test('un campo desconocido se muestra tal cual y los textos largos se marcan', () => {
    expect(describeTaskChange({ field: 'nuevoCampo', from: 'a', to: 'b' })).toMatchObject({
      label: 'nuevoCampo',
      long: false,
    });
    expect(describeTaskChange({ field: 'description', from: 'a', to: 'b' }).long).toBe(true);
  });

  test('resume el evento en una línea', () => {
    expect(summarizeEvent('CREATE', [])).toBe('creó la tarea');
    expect(summarizeEvent('UPDATE', [{ field: 'status', from: 'a', to: 'b' }])).toBe('cambió el estado');
    expect(
      summarizeEvent('UPDATE', [
        { field: 'status', from: 'a', to: 'b' },
        { field: 'progress', from: '1', to: '2' },
      ]),
    ).toBe('hizo 2 cambios');
  });

  test('agrupa por día local con encabezados Hoy y Ayer', () => {
    const now = new Date(2026, 10, 10, 15, 0, 0);
    expect(dayHeading(localDayKey(new Date(2026, 10, 10, 9, 0).toISOString()), now)).toBe('Hoy');
    expect(dayHeading(localDayKey(new Date(2026, 10, 9, 9, 0).toISOString()), now)).toBe('Ayer');
    expect(dayHeading('2026-10-28', now)).toMatch(/28 de octubre/);
  });
});
