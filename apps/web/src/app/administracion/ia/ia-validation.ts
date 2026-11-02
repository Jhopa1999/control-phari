/** Validaciones de cliente de las piezas de presupuesto y catálogo de IA (el backend vuelve a validar). */

export interface BudgetErrors {
  budget?: string;
  alertPct?: string;
  form?: string | null;
}

/** Valida el tope (vacío = sin tope) y el umbral de alerta. */
export function validateBudget(values: { budget: string; alertPct: string }): BudgetErrors {
  const errors: BudgetErrors = {};
  const budgetText = values.budget.trim().replace(',', '.');
  if (budgetText !== '') {
    const budget = Number(budgetText);
    if (!Number.isFinite(budget) || budget < 0) {
      errors.budget = 'Escribe un número igual o mayor que 0.';
    }
  }
  const pctText = values.alertPct.trim();
  const pct = Number(pctText);
  if (pctText === '' || !Number.isInteger(pct) || pct < 1 || pct > 100) {
    errors.alertPct = 'Escribe un entero entre 1 y 100.';
  }
  return errors;
}

export interface ModelErrors {
  modelId?: string;
  label?: string;
  inputPrice?: string;
  outputPrice?: string;
  sortOrder?: string;
  form?: string | null;
}

const MODEL_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

/** Precio vacío = sin precio; si hay valor debe ser un número ≥ 0. */
function priceError(text: string): string | undefined {
  const value = text.trim().replace(',', '.');
  if (value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0
    ? undefined
    : 'Escribe un número igual o mayor que 0 o déjalo vacío.';
}

/** Reglas del formulario de modelo; el id solo se valida al crear (es inmutable). */
export function validateModel(
  values: {
    modelId: string;
    label: string;
    inputPrice: string;
    outputPrice: string;
    sortOrder: string;
  },
  creating: boolean,
): ModelErrors {
  const errors: ModelErrors = {};
  if (creating) {
    const id = values.modelId.trim();
    if (id.length < 3 || !MODEL_ID_PATTERN.test(id)) {
      errors.modelId = 'Usa solo letras, números y . _ : - (mínimo 3 caracteres).';
    }
  }
  if (values.label.trim() === '') errors.label = 'Escribe el nombre del modelo.';
  const inputPrice = priceError(values.inputPrice);
  if (inputPrice) errors.inputPrice = inputPrice;
  const outputPrice = priceError(values.outputPrice);
  if (outputPrice) errors.outputPrice = outputPrice;
  const order = Number(values.sortOrder.trim());
  if (values.sortOrder.trim() === '' || !Number.isInteger(order) || order < 0) {
    errors.sortOrder = 'Escribe un entero igual o mayor que 0.';
  }
  return errors;
}

export function hasModelErrors(errors: ModelErrors): boolean {
  return Boolean(
    errors.modelId || errors.label || errors.inputPrice || errors.outputPrice || errors.sortOrder,
  );
}
