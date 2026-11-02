/** Formatos compartidos de las piezas de consumo, presupuesto y catálogo de IA. */

/** «US$ 12,40». Los costos pequeños admiten más decimales para no verse como 0. */
export function formatUsd(value: number, maxDigits = 2): string {
  const digits = value !== 0 && Math.abs(value) < 0.01 ? Math.max(maxDigits, 4) : maxDigits;
  return `US$ ${value.toLocaleString('es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`;
}

/** 1 234 567 → «1,2 M»; los menores de mil se muestran completos. */
export function formatCompact(value: number): string {
  return value.toLocaleString('es', { notation: 'compact', maximumFractionDigits: 1 });
}

/** Porcentaje con hasta un decimal: «80,5 %». */
export function formatPct(value: number): string {
  return `${value.toLocaleString('es', { maximumFractionDigits: 1 })} %`;
}

/** Mes `YYYY-MM` en texto: «noviembre de 2026». */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('es', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Mes actual (UTC) en formato `YYYY-MM`. */
export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** Los últimos `count` meses (UTC), el actual primero. */
export function recentMonths(count = 12, now: Date = new Date()): string[] {
  const months: string[] = [];
  for (let i = 0; i < count; i += 1) {
    months.push(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
        .toISOString()
        .slice(0, 7),
    );
  }
  return months;
}

/** Estado visual del presupuesto: agotado > en alerta > dentro del tope. */
export type BudgetState = 'ok' | 'alert' | 'exceeded';

export function budgetState(budget: { alert: boolean; exceeded: boolean }): BudgetState {
  if (budget.exceeded) return 'exceeded';
  return budget.alert ? 'alert' : 'ok';
}
