'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { IdChip } from '@/components/id-chip';
import { InlineNotice } from '@/components/inline-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Plan, PlanGuide, Task } from '@/lib/api-client';
import { formatDateOnly } from '@/lib/format';
import { PlanError, updatePlan } from '@/lib/plan';
import { useResetOnChange } from '@/lib/use-reset-on-change';

/** Fecha ISO -> valor de <input type="date"> (yyyy-mm-dd), en UTC como el resto del plan. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** yyyy-mm-dd -> ISO date-time (o undefined si está vacío). */
function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export interface PlanDataCardProps {
  requestId: string;
  plan: Plan;
  guide: PlanGuide | null;
  tasks: Task[];
  /** Hay otra operación en curso en la pantalla. */
  busy: boolean;
  /** Tras guardar: la vista recarga el plan y la guía. */
  onSaved: () => void | Promise<void>;
}

/**
 * Tarjeta «Datos del plan» (D6): periodo, compromiso, riesgos y mitigaciones. El
 * compromiso es obligatorio para enviar el plan; llega precargado con la fecha
 * fin de la última tarea (la calcula la API en la guía) como valor editable que
 * no se guarda hasta pulsar «Guardar». La regla vive en la API; aquí solo se
 * presenta, se precarga y se valida lo evidente antes de llamar.
 */
export function PlanDataCard({
  requestId,
  plan,
  guide,
  tasks,
  busy,
  onSaved,
}: PlanDataCardProps): React.ReactElement {
  const suggested = toDateInput(guide?.suggestedCommitmentDate ?? null);
  const savedCommitment = toDateInput(plan.commitmentDate);

  const [commitment, setCommitment] = React.useState('');
  const [periodStart, setPeriodStart] = React.useState('');
  const [periodEnd, setPeriodEnd] = React.useState('');
  const [risks, setRisks] = React.useState('');
  const [mitigations, setMitigations] = React.useState('');
  const [periodError, setPeriodError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const commitmentRef = React.useRef<HTMLInputElement>(null);

  // Prellenar con lo guardado; sin compromiso guardado, con la sugerida.
  useResetOnChange(
    [plan.id, plan.commitmentDate, plan.periodStart, plan.periodEnd, plan.risks, plan.mitigations, suggested],
    () => {
      setCommitment(savedCommitment || suggested);
      setPeriodStart(toDateInput(plan.periodStart));
      setPeriodEnd(toDateInput(plan.periodEnd));
      setRisks(plan.risks ?? '');
      setMitigations(plan.mitigations ?? '');
      setPeriodError(null);
      setFormError(null);
    },
  );

  const lastTask = suggested
    ? tasks.find((t) => toDateInput(t.endDate) === suggested)
    : undefined;
  const showingSuggestion = !savedCommitment && suggested !== '' && commitment === suggested;
  const showUseSuggested = suggested !== '' && commitment !== suggested;
  const lateTasks = savedCommitment !== '' && suggested !== '' && savedCommitment < suggested;

  async function handleSave(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (saving || busy) return;
    setFormError(null);
    if (periodStart && periodEnd && periodEnd < periodStart) {
      setPeriodError('La fecha de fin del periodo no puede ser anterior al inicio.');
      return;
    }
    setPeriodError(null);
    setSaving(true);
    try {
      await updatePlan(requestId, {
        commitmentDate: toIso(commitment),
        periodStart: toIso(periodStart),
        periodEnd: toIso(periodEnd),
        risks: risks.trim(),
        mitigations: mitigations.trim(),
      });
      toast.success('Datos del plan guardados.');
      await onSaved();
    } catch (err) {
      const message = err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
      // Lo escrito se conserva. Un 400 de periodo se muestra junto al campo.
      if (err instanceof PlanError && err.status === 400 && /periodo/i.test(message)) {
        setPeriodError(message);
      } else {
        setFormError(message);
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const commitmentHelp = suggested ? (
    <>
      Sugerida: fin de la última tarea (
      {lastTask ? <IdChip code={lastTask.code} variant="short" /> : null}
      {lastTask ? ' · ' : null}
      {formatDateOnly(guide?.suggestedCommitmentDate ?? null)}). Puedes cambiarla.
    </>
  ) : (
    'Aún no hay tareas con vencimiento. Escribe la fecha a la que te comprometes.'
  );

  return (
    <section
      aria-labelledby="plan-data-title"
      className="flex min-w-0 flex-col gap-4 rounded-xl bg-card p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="plan-data-title" className="text-base font-semibold">
          Datos del plan
        </h2>
        <p className="text-meta text-muted-foreground">
          Define el periodo y el compromiso antes de enviar el plan a autorización.
        </p>
      </div>
      <form id="plan-data-form" noValidate onSubmit={(event) => void handleSave(event)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {showingSuggestion ? <Badge variant="outline">Sugerida, sin guardar</Badge> : null}
            </div>
            <Field id="plan-commitment" label="Fecha de compromiso" required help={commitmentHelp}>
              <Input
                ref={commitmentRef}
                type="date"
                className="w-full sm:w-44"
                value={commitment}
                disabled={saving}
                onChange={(event) => setCommitment(event.target.value)}
              />
            </Field>
            {showUseSuggested ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start sm:w-fit"
                disabled={saving}
                onClick={() => {
                  setCommitment(suggested);
                  commitmentRef.current?.focus();
                }}
              >
                Usar la sugerida
              </Button>
            ) : null}
            {lateTasks ? (
              <InlineNotice tone="info">
                {`Hay tareas que terminan después del compromiso. La última termina el ${formatDateOnly(guide?.suggestedCommitmentDate ?? null)}.`}
              </InlineNotice>
            ) : null}
          </div>
          <div className="grid content-start gap-4">
            <Field id="plan-period-start" label="Inicio del periodo">
              <Input
                type="date"
                className="w-full sm:w-44"
                value={periodStart}
                disabled={saving}
                onChange={(event) => {
                  setPeriodStart(event.target.value);
                  setPeriodError(null);
                }}
              />
            </Field>
            <Field id="plan-period-end" label="Fin del periodo" error={periodError}>
              <Input
                type="date"
                className="w-full sm:w-44"
                min={periodStart || undefined}
                value={periodEnd}
                disabled={saving}
                onChange={(event) => {
                  setPeriodEnd(event.target.value);
                  setPeriodError(null);
                }}
              />
            </Field>
          </div>
          <Field id="plan-risks" label="Riesgos" className="sm:col-span-2">
            <Textarea
              rows={3}
              maxLength={4000}
              value={risks}
              disabled={saving}
              onChange={(event) => setRisks(event.target.value)}
            />
          </Field>
          <Field id="plan-mitigations" label="Mitigaciones" className="sm:col-span-2">
            <Textarea
              rows={3}
              maxLength={4000}
              value={mitigations}
              disabled={saving}
              onChange={(event) => setMitigations(event.target.value)}
            />
          </Field>
        </div>
        <FormError id="plan-data-form" message={formError} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="submit" loading={saving} disabled={busy} className="w-full sm:w-auto">
            {saving ? 'Guardando…' : 'Guardar datos del plan'}
          </Button>
        </div>
      </form>
    </section>
  );
}
