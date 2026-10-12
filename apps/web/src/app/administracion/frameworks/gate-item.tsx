'use client';

import * as React from 'react';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { DescriptionList } from '@/components/description-list';
import { DisabledReason } from '@/components/disabled-reason';
import { RequirementsPanel, type RequirementItem } from '@/components/requirements-panel';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { formatCount, formatDateOnly } from '@/lib/format';
import type { GateCheck } from '@/lib/governance';

/** Id del panel de GC4 (el id de siempre); su cabecera lleva `GC4-block-summary`. */
const GC4_BLOCK_ID = 'GC4-block';
const GC4_BLOCK_REASON_ID = 'GC4-block-reason';
/** Respaldo cuando la API no detalla los motivos (el texto de siempre, con tildes). */
const GC4_FALLBACK_REASON = 'Hay validaciones bloqueantes o falta la validación obligatoria.';

const VALIDATION_NOUN = { one: 'validación', other: 'validaciones' };
const BLOCKING_NOUN = { one: 'bloqueante sin resolver', other: 'bloqueantes sin resolver' };

/** Id del encabezado de un control: destino del foco cuando su fila de acciones desaparece (NIT 4). */
export function gateHeadingId(gateCode: string): string {
  return `gate-${gateCode}-title`;
}

export interface GateItemProps {
  gate: GateCheck;
  canReview: boolean;
  busy: boolean;
  /** Nombres de las personas en alcance (GET /coordination/people). */
  peopleById: ReadonlyMap<string, string>;
  onApprove: () => void;
  /** Abre el ReasonDialog «Marcar {code} como no aplica». */
  onWaive: () => void;
  /** Cambia a la pestaña Validaciones y la enfoca. */
  onShowValidations: () => void;
}

/**
 * Un control GC1–GC5 (design §11.18 y §10.2). Las condiciones son solo de
 * presentación: `approvable` y `blockingReasons` los calcula la API con las
 * validaciones y la ruta, sin mirar el estado del control.
 */
export function GateItem({
  gate,
  canReview,
  busy,
  peopleById,
  onApprove,
  onWaive,
  onShowValidations,
}: GateItemProps): React.ReactElement {
  const isGc4 = gate.gateCode === 'GC4';
  const approvableGate = isGc4 || gate.gateCode === 'GC5'; // GC1–GC3 no se aprueban desde gobierno
  const isWaived = gate.status === 'NO_APLICA';
  const summary = gate.validationSummary; // solo GC4 lo trae
  // Panel de bloqueo: para cualquier rol, salvo «No aplica».
  const showGc4Block = isGc4 && summary !== null && !summary.approvable && !isWaived;
  // Fila de acciones: con canReview, solo en GC4/GC5 y fuera de «No aplica».
  const showActions = canReview && approvableGate && !isWaived;
  // La API ya antepone el código al título («GC1 Admisión»): se quita para no
  // leer «GC1 · GC1 Admisión».
  const title = gate.title.startsWith(`${gate.gateCode} `)
    ? gate.title.slice(gate.gateCode.length + 1)
    : gate.title;

  const blockItems: RequirementItem[] = showGc4Block
    ? (summary.blockingReasons.length > 0 ? summary.blockingReasons : [GC4_FALLBACK_REASON]).map(
        (reason, index) => ({
          id: `reason-${index}`,
          label: reason,
          status: 'pending',
          action: { label: 'Ver validaciones', onClick: onShowValidations },
        }),
      )
    : [];

  return (
    <li aria-label={`Control ${gate.gateCode}: ${title}`} className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={gateHeadingId(gate.gateCode)}
          tabIndex={-1}
          className="rounded-sm text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {gate.gateCode} · {title}
        </h2>
        <StatusBadge kind="gate" value={gate.status} />
      </div>

      <DescriptionList
        columns={2}
        items={[
          { term: 'Condición', value: gate.conditionText },
          { term: 'Autoridad', value: gate.authorityText },
        ]}
      />

      {isWaived && gate.waiverReason ? (
        <p className="text-sm text-muted-foreground">No aplica: {gate.waiverReason}</p>
      ) : null}

      {gate.pendingItems.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">Faltantes</h3>
          <ul className="flex flex-col gap-2">
            {gate.pendingItems.map((item) => {
              // Responsable por nombre si está en alcance; nunca el id crudo.
              const ownerName = item.ownerUserId ? peopleById.get(item.ownerUserId) : undefined;
              const ownerText = item.ownerUserId
                ? ownerName
                  ? `Responsable: ${ownerName}`
                  : 'Responsable fuera de tu alcance'
                : null;
              const meta = [
                item.resolved ? 'Resuelto' : 'Pendiente',
                ownerText,
                item.reviewDate ? `Revisión: ${formatDateOnly(item.reviewDate)}` : null,
              ].filter((part): part is string => part !== null);
              return (
                <li key={item.id} className="flex gap-2">
                  {item.resolved ? (
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  )}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm">{item.description}</span>
                    <span className="text-meta text-muted-foreground">{meta.join(' · ')}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {isGc4 && summary ? (
        <p className="text-meta text-muted-foreground">
          {`${formatCount(summary.total, VALIDATION_NOUN)} · ${formatCount(
            summary.blockingUnresolved,
            BLOCKING_NOUN,
          )} · ${
            summary.hasMandatoryApproving
              ? 'Validación obligatoria presente'
              : 'Falta la validación obligatoria'
          }`}
        </p>
      ) : null}

      {showGc4Block ? (
        <div className="rounded-md border border-warning-border bg-card">
          <RequirementsPanel
            id={GC4_BLOCK_ID}
            compact
            headingLevel={3}
            title="Aprobar GC4 no está disponible"
            items={blockItems}
          />
        </div>
      ) : null}

      {showActions ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            {showGc4Block ? (
              <Button
                type="button"
                size="sm"
                unavailable
                aria-describedby={`${GC4_BLOCK_ID}-summary ${GC4_BLOCK_REASON_ID}`}
              >
                Aprobar {gate.gateCode}
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
                Aprobar {gate.gateCode}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onWaive}>
              Marcar como no aplica
            </Button>
          </div>
          {showGc4Block ? (
            <DisabledReason id={GC4_BLOCK_REASON_ID}>
              Resuelve los motivos de la lista para aprobar este control.
            </DisabledReason>
          ) : null}
        </div>
      ) : null}

      {!approvableGate ? (
        <p className="text-meta text-muted-foreground">
          Este control se deriva de fases previas y no se aprueba desde gobierno.
        </p>
      ) : null}
    </li>
  );
}
