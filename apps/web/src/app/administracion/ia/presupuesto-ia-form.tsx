'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { FormActionBar } from '@/components/form-sections';
import { InlineNotice } from '@/components/inline-notice';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AiGlobalConfig } from '@/lib/api-client';
import { ApiError, updateAiConfig } from '@/lib/ai';
import { validateBudget, type BudgetErrors } from './ia-validation';

interface PresupuestoIaFormProps {
  global: AiGlobalConfig;
  /** Se llama con la configuración global guardada (para recargar el consumo). */
  onSaved: (saved: AiGlobalConfig) => void;
}

/**
 * Tope mensual de IA y umbral de alerta (PATCH /admin/ai/config). Un tope vacío
 * guarda `null` (sin tope). Explica qué ocurre al llegar al umbral y al agotarse.
 */
export function PresupuestoIaForm({
  global,
  onSaved,
}: PresupuestoIaFormProps): React.ReactElement {
  const [budget, setBudget] = React.useState(
    global.monthlyBudgetUsd === null ? '' : String(global.monthlyBudgetUsd),
  );
  const [alertPct, setAlertPct] = React.useState(String(global.budgetAlertPct));
  const [errors, setErrors] = React.useState<BudgetErrors>({});
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const validation = validateBudget({ budget, alertPct });
    if (validation.budget || validation.alertPct) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSaving(true);
    const budgetText = budget.trim().replace(',', '.');
    try {
      const saved = await updateAiConfig({
        monthlyBudgetUsd: budgetText === '' ? null : Number(budgetText),
        budgetAlertPct: Number(alertPct),
      });
      onSaved(saved);
      toast.success('Presupuesto guardado.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const savedBudget = global.monthlyBudgetUsd === null ? '' : String(global.monthlyBudgetUsd);
  const dirty = budget !== savedBudget || alertPct !== String(global.budgetAlertPct);

  return (
    <Section
      title="Presupuesto"
      description="Tope mensual de gasto de IA y porcentaje a partir del cual se avisa."
    >
      <form
        className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card"
        onSubmit={handleSubmit}
        noValidate
      >
        <FormError id="ai-budget-form" message={errors.form ?? null} />
        <Field
          id="ai-budget-usd"
          label="Tope mensual (USD)"
          help="Déjalo vacío para no poner tope."
          error={errors.budget}
        >
          {(control) => (
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
            >
              US$
            </span>
            <Input
              {...control}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className="pl-11"
              value={budget}
              onChange={(e) => {
                setBudget(e.target.value);
                setErrors((p) => ({ ...p, budget: undefined }));
              }}
            />
          </div>
          )}
        </Field>
        <Field
          id="ai-budget-alert"
          label="Umbral de aviso (% del tope)"
          help="Número entero de 1 a 100. Se avisa a los administradores cuando el gasto alcance este porcentaje del tope."
          error={errors.alertPct}
        >
          {(control) => (
          <div className="relative">
            <Input
              {...control}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              className="pr-9"
              value={alertPct}
              onChange={(e) => {
                setAlertPct(e.target.value);
                setErrors((p) => ({ ...p, alertPct: undefined }));
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
            >
              %
            </span>
          </div>
          )}
        </Field>
        <InlineNotice tone="info" title="Qué pasa con el tope">
          <p className="text-muted-foreground">
            Al agotar el tope, las llamadas de IA se rechazan hasta el mes siguiente o hasta que
            subas el tope. Se avisa a los administradores en el centro de notificaciones al llegar
            al umbral y al agotarse.
          </p>
        </InlineNotice>
        <FormActionBar dirty={dirty}>
          {dirty ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBudget(savedBudget);
                setAlertPct(String(global.budgetAlertPct));
                setErrors({});
              }}
            >
              Cancelar
            </Button>
          ) : null}
          <Button type="submit" loading={saving}>
            Guardar presupuesto
          </Button>
        </FormActionBar>
      </form>
    </Section>
  );
}
