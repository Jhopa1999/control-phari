import { expect, test } from '@playwright/test';
import {
  budgetState,
  currentMonth,
  formatCompact,
  formatMonth,
  formatPct,
  formatUsd,
  recentMonths,
} from '../apps/web/src/app/administracion/ia/ia-format';
import {
  hasModelErrors,
  validateBudget,
  validateModel,
} from '../apps/web/src/app/administracion/ia/ia-validation';

/**
 * Utilidades puras de Administración > IA (consumo, presupuesto y catálogo de
 * modelos), cargadas en Node como el resto de las pruebas de lib.
 */
test.describe('ia-format', () => {
  test('mes actual y últimos meses en UTC, el actual primero', () => {
    const now = new Date(Date.UTC(2026, 10, 15));
    expect(currentMonth(now)).toBe('2026-11');
    const months = recentMonths(12, now);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2026-11');
    expect(months[1]).toBe('2026-10');
    expect(months[11]).toBe('2025-12');
  });

  test('cruza el cambio de año hacia atrás', () => {
    const months = recentMonths(3, new Date(Date.UTC(2027, 0, 5)));
    expect(months).toEqual(['2027-01', '2026-12', '2026-11']);
  });

  test('formatMonth escribe el mes en español', () => {
    expect(formatMonth('2026-11')).toBe('noviembre de 2026');
  });

  test('formatUsd usa US$ y más decimales para costos muy pequeños', () => {
    expect(formatUsd(12.4)).toMatch(/^US\$ 12,40$/);
    expect(formatUsd(0)).toBe('US$ 0,00');
    expect(formatUsd(0.0004)).toBe('US$ 0,0004');
  });

  test('formatCompact y formatPct', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(1_200_000)).toMatch(/1,2/);
    expect(formatPct(80.5)).toBe('80,5 %');
    expect(formatPct(80)).toBe('80 %');
  });

  test('budgetState: agotado manda sobre alerta', () => {
    expect(budgetState({ alert: false, exceeded: false })).toBe('ok');
    expect(budgetState({ alert: true, exceeded: false })).toBe('alert');
    expect(budgetState({ alert: true, exceeded: true })).toBe('exceeded');
  });
});

test.describe('ia-validation', () => {
  test('presupuesto: tope vacío (sin tope) y umbral válidos', () => {
    expect(validateBudget({ budget: '', alertPct: '80' })).toEqual({});
    expect(validateBudget({ budget: '100,50', alertPct: '1' })).toEqual({});
    expect(validateBudget({ budget: '0', alertPct: '100' })).toEqual({});
  });

  test('presupuesto: rechaza tope negativo o no numérico y umbral fuera de 1..100', () => {
    expect(validateBudget({ budget: '-1', alertPct: '80' }).budget).toBeDefined();
    expect(validateBudget({ budget: 'abc', alertPct: '80' }).budget).toBeDefined();
    for (const pct of ['', '0', '101', '80.5', 'x']) {
      expect(validateBudget({ budget: '', alertPct: pct }).alertPct).toBeDefined();
    }
  });

  const base = { modelId: 'us.anthropic.claude-x:0', label: 'Modelo X', inputPrice: '', outputPrice: '', sortOrder: '100' };

  test('modelo: alta válida con precios vacíos (sin precio)', () => {
    const errors = validateModel(base, true);
    expect(hasModelErrors(errors)).toBe(false);
  });

  test('modelo: el id solo se valida al crear y solo admite letras, números y . _ : -', () => {
    expect(validateModel({ ...base, modelId: 'a b' }, true).modelId).toBeDefined();
    expect(validateModel({ ...base, modelId: 'ab' }, true).modelId).toBeDefined();
    expect(validateModel({ ...base, modelId: '' }, false).modelId).toBeUndefined();
  });

  test('modelo: el orden es un entero igual o mayor que 0', () => {
    for (const order of ['', '-1', '1.5', 'x']) {
      expect(validateModel({ ...base, sortOrder: order }, true).sortOrder).toBeDefined();
    }
    expect(validateModel({ ...base, sortOrder: '0' }, true).sortOrder).toBeUndefined();
  });

  test('modelo: nombre obligatorio y precios no negativos', () => {
    expect(validateModel({ ...base, label: '  ' }, true).label).toBeDefined();
    expect(validateModel({ ...base, inputPrice: '-0.1' }, true).inputPrice).toBeDefined();
    expect(validateModel({ ...base, outputPrice: 'x' }, true).outputPrice).toBeDefined();
    expect(hasModelErrors(validateModel({ ...base, inputPrice: '3', outputPrice: '15,5' }, true))).toBe(false);
  });
});
