import * as React from 'react';
import { DescriptionList, type DescriptionItem } from '@/components/description-list';
import { StatusBadge } from '@/components/status-badge';
import type { Plan } from '@/lib/api-client';
import { formatDateOnly, formatDateTime } from '@/lib/format';
import { planStatusLabel } from '@/lib/plan';

export interface PlanSummaryProps {
  plan: Plan;
}


/**
 * Resumen del plan (solo lectura): estado y los hitos ya registrados del
 * ciclo de vida (enviado a autorización, autorizado, devuelto) con sus fechas.
 * Los campos de ficha (periodo, compromiso, riesgos, mitigaciones) se incluyen
 * solo cuando tienen valor; hoy el plan se crea sin ellos, así que no se pinta
 * un bloque lleno de «—». Deja ver lo registrado cuando la etapa ya avanzó.
 */
export function PlanSummary({ plan: current }: PlanSummaryProps): React.ReactElement {
  // Hitos del ciclo de vida: solo los que ya ocurrieron.
  const milestones: DescriptionItem[] = [];
  if (current.submittedAt) {
    milestones.push({
      term: 'Enviado a autorización',
      value: formatDateTime(current.submittedAt),
    });
    if (current.submittedByName) {
      milestones.push({ term: 'Enviado por', value: current.submittedByName });
    }
  }
  if (current.authorizedAt) {
    milestones.push({ term: 'Autorizado', value: formatDateTime(current.authorizedAt) });
    if (current.authorizedByName) {
      milestones.push({ term: 'Autorizado por', value: current.authorizedByName });
    }
  }

  // Ficha del plan: solo campos con valor.
  const facts: DescriptionItem[] = [];
  if (current.periodStart || current.periodEnd) {
    facts.push({ term: 'Inicio del periodo', value: formatDateOnly(current.periodStart) });
    facts.push({ term: 'Fin del periodo', value: formatDateOnly(current.periodEnd) });
  }
  if (current.commitmentDate) {
    facts.push({ term: 'Fecha de compromiso', value: formatDateOnly(current.commitmentDate) });
  }
  if (current.risks) facts.push({ term: 'Riesgos', value: current.risks, span: 2 });
  if (current.mitigations) {
    facts.push({ term: 'Mitigaciones', value: current.mitigations, span: 2 });
  }

  return (
    <section
      aria-labelledby="plan-summary-title"
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="plan-summary-title" className="text-base font-semibold">
          Resumen del plan
        </h2>
        <StatusBadge kind="plan" value={current.status} />
      </div>
      {milestones.length > 0 ? <DescriptionList items={milestones} columns={2} /> : null}
      {current.status === 'DEVUELTO' && current.returnReason ? (
        <DescriptionList
          items={[{ term: 'Motivo de la devolución', value: current.returnReason, span: 2 }]}
        />
      ) : null}
      {facts.length > 0 ? <DescriptionList items={facts} columns={2} /> : null}
      {milestones.length === 0 && facts.length === 0 && current.status !== 'DEVUELTO' ? (
        <p className="text-meta text-muted-foreground">
          {`El plan está en ${planStatusLabel(current.status).toLowerCase()}. Aún no hay hitos de autorización registrados.`}
        </p>
      ) : null}
    </section>
  );
}
