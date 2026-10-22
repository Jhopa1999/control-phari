import * as React from 'react';
import { DescriptionList, type DescriptionItem } from '@/components/description-list';
import { InlineNotice } from '@/components/inline-notice';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import type {
  Approval,
  CatalogItem,
  Plan,
  PriorityEvaluation,
  Request,
  Triage,
} from '@/lib/api-client';
import { formatDateOnly, formatDateTime, formatHours, orDash } from '@/lib/format';
import type {
  GateCheck,
  GovernanceBoard,
  ValidationRecord,
} from '@/lib/governance';
import {
  requestStateLabel,
  triageDecisionLabel,
} from '@/lib/request-state';
import { routeLabel } from '@/lib/status-presentation';

/**
 * Paneles de presentación de SOLO LECTURA por etapa, nuevos y server-safe
 * (solo DescriptionList/StatusBadge/PriorityBadge/InlineNotice, sin hooks).
 *
 * Nota de desduplicación (requisito 6 del encargo): en este worktree las vistas
 * existentes (triage-view, priorizacion-view, plan-view) renderizan el
 * FORMULARIO de registro, no un bloque separable de «detalle ya registrado».
 * «Extraerlo» exigiría refactorizar pantallas de formulario en uso, con riesgo
 * de regresión y sin reutilización real hoy. Por eso la ficha crea sus propios
 * componentes de presentación; quedan listos para que, en el futuro, esas
 * vistas los adopten si se decide mostrar allí el detalle registrado.
 */

/** Traducción local de un code de maestra a su etiqueta (mismo patrón que validations-tab). */
function label(items: CatalogItem[], code: string | null): string {
  if (!code) return '—';
  return items.find((item) => item.code === code)?.label ?? code;
}

/** Catálogos de triage cargados por la vista, por familia. */
export interface TriageCatalogs {
  route: CatalogItem[];
  demandType: CatalogItem[];
  criticality: CatalogItem[];
  size: CatalogItem[];
  dataAvailability: CatalogItem[];
}

/** Paso 2 · Detalle del triage registrado. */
export function TriageDetalle({
  triage,
  catalogs,
}: {
  triage: Triage;
  catalogs: TriageCatalogs;
}): React.ReactElement {
  const items: DescriptionItem[] = [
    { term: 'Decisión', value: triageDecisionLabel(triage.decision) },
    { term: 'Ruta', value: label(catalogs.route, triage.routeCode) },
    { term: 'Tipo de demanda', value: label(catalogs.demandType, triage.demandTypeCode) },
    { term: 'Criticidad', value: label(catalogs.criticality, triage.criticalityCode) },
    { term: 'Tamaño', value: label(catalogs.size, triage.sizeCode) },
    {
      term: 'Disponibilidad de datos',
      value: label(catalogs.dataAvailability, triage.dataAvailabilityCode),
    },
    {
      term: 'Esfuerzo estimado',
      value: triage.totalEffortHours !== null ? formatHours(triage.totalEffortHours) : null,
    },
    { term: 'Responsable principal', value: triage.mainResponsibleName },
    { term: 'Fecha', value: formatDateTime(triage.decidedAt) },
    { term: 'Dependencias', value: triage.dependencies, span: 2 },
    { term: 'Observaciones', value: triage.notes, span: 2 },
  ];
  return <DescriptionList items={items} columns={2} />;
}

/** Etiquetas legibles de las 8 valoraciones de prioridad (1–5). */
const PRIORITY_CRITERIA: ReadonlyArray<{ key: keyof PriorityEvaluation; label: string }> = [
  { key: 'impact', label: 'Impacto' },
  { key: 'alignment', label: 'Alineación' },
  { key: 'riskControl', label: 'Control del riesgo' },
  { key: 'urgency', label: 'Urgencia' },
  { key: 'scope', label: 'Alcance' },
  { key: 'dataAvailability', label: 'Disponibilidad de datos' },
  { key: 'feasibility', label: 'Factibilidad' },
  { key: 'reuse', label: 'Reutilización' },
];

/**
 * Paso 3 · Detalle de la priorización vigente (la ÚLTIMA evaluación). El score y
 * la banda salen del backend; la ficha nunca los calcula.
 */
export function PrioridadDetalle({
  evaluation,
  request,
}: {
  evaluation: PriorityEvaluation;
  request: Pick<Request, 'currentScore' | 'priorityLabel'>;
}): React.ReactElement {
  const criterios: DescriptionItem[] = PRIORITY_CRITERIA.map((criterio) => ({
    term: criterio.label,
    value: `${evaluation[criterio.key] as number} / 5`,
  }));
  const items: DescriptionItem[] = [
    { term: 'Fecha', value: formatDateTime(evaluation.evaluatedAt) },
    ...criterios,
    { term: 'Justificación', value: evaluation.justification, span: 2 },
  ];
  return (
    <div className="flex flex-col gap-3">
      <PriorityBadge
        variant="full"
        score={request.currentScore ?? evaluation.score}
        label={request.priorityLabel ?? evaluation.thresholdLabel}
      />
      <DescriptionList items={items} columns={2} />
    </div>
  );
}

/** Decisión de compromiso legible. */
function approvalDecisionLabel(decision: string): string {
  if (decision === 'APROBAR') return 'Aprobar';
  if (decision === 'DEVOLVER') return 'Devolver';
  return decision;
}

/**
 * Paso 4 · Historial de decisiones de aprobación/compromiso, de la más reciente
 * a la más antigua. Muestra la fecha, nunca el id del usuario.
 */
export function AprobacionDetalle({
  approvals,
}: {
  approvals: Approval[];
}): React.ReactElement {
  const ordered = [...approvals].sort(
    (a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime(),
  );
  return (
    <ol className="flex flex-col gap-3">
      {ordered.map((approval) => {
        const items: DescriptionItem[] = [
          { term: 'Decisión', value: approvalDecisionLabel(approval.decision) },
          { term: 'Fecha', value: formatDateTime(approval.decidedAt) },
          {
            term: 'Transición',
            value: (
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusBadge kind="request" value={approval.previousState} />
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
                <StatusBadge kind="request" value={approval.resultingState} />
              </span>
            ),
            span: 2,
          },
        ];
        if (approval.decision === 'DEVOLVER') {
          items.push({ term: 'Motivo de la devolución', value: approval.reason, span: 2 });
        }
        return (
          <li key={approval.id} className="rounded-lg border bg-surface-subtle p-3">
            <DescriptionList items={items} columns={2} />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Paso 5 · Resumen del plan. Los campos de periodo/compromiso/riesgos/
 * mitigaciones solo se listan si tienen valor. Fechas de solo-fecha con
 * `formatDateOnly`; hitos (envío/autorización) con `formatDateTime`.
 */
export function PlanDetalle({ plan }: { plan: Plan }): React.ReactElement {
  const items: DescriptionItem[] = [
    {
      term: 'Estado',
      value: <StatusBadge kind="plan" value={plan.status} />,
    },
    { term: 'Enviado a autorización', value: formatDateTime(plan.submittedAt) },
    { term: 'Autorizado', value: formatDateTime(plan.authorizedAt) },
  ];
  if (plan.status === 'DEVUELTO' && plan.returnReason) {
    items.push({ term: 'Motivo de la devolución', value: plan.returnReason, span: 2 });
  }
  if (plan.periodStart || plan.periodEnd) {
    items.push({
      term: 'Periodo',
      value: `${formatDateOnly(plan.periodStart)} – ${formatDateOnly(plan.periodEnd)}`,
    });
  }
  if (plan.commitmentDate) {
    items.push({ term: 'Fecha de compromiso', value: formatDateOnly(plan.commitmentDate) });
  }
  if (plan.risks) items.push({ term: 'Riesgos', value: plan.risks, span: 2 });
  if (plan.mitigations) items.push({ term: 'Mitigaciones', value: plan.mitigations, span: 2 });
  return <DescriptionList items={items} columns={2} />;
}

function gateTitle(gate: GateCheck): string {
  return gate.title ? `${gate.gateCode} · ${gate.title}` : gate.gateCode;
}

/**
 * Paso 6 · Gobierno (gates GC1–GC5 como bloque transversal) y validación. No se
 * fuerza un gate por paso: se muestran los cinco juntos con su ruta proporcional
 * y el estado de bloqueo, seguido de las validaciones registradas.
 */
export function GobiernoDetalle({
  board,
  validations,
  routeCatalog,
  validationTypeCatalog,
  validationResultCatalog,
}: {
  board: GovernanceBoard | null;
  validations: ValidationRecord[];
  routeCatalog: CatalogItem[];
  validationTypeCatalog: CatalogItem[];
  validationResultCatalog: CatalogItem[];
}): React.ReactElement {
  if (!board) {
    return (
      <p className="text-sm text-muted-foreground">
        No fue posible cargar el tablero de gobierno de esta solicitud.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <DescriptionList
        columns={2}
        items={[
          {
            term: 'Ruta proporcional',
            value: routeLabel(board.governanceRoute, routeCatalog),
          },
          {
            term: 'Bloqueo transversal',
            value: board.blocked ? (
              <StatusBadge kind="blocked" value="true" />
            ) : (
              'Sin bloqueo'
            ),
          },
        ]}
      />
      {board.blocked ? (
        <InlineNotice tone="danger" title="Solicitud bloqueada">
          {board.blockedReason ?? 'Hay un bloqueo transversal vigente.'}
        </InlineNotice>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Controles GC1–GC5</h3>
        <ul className="flex flex-col gap-2">
          {board.gates.map((gate) => (
            <li
              key={gate.gateCode}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-surface-subtle p-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{gateTitle(gate)}</span>
                {gate.conditionText ? (
                  <span className="text-meta text-muted-foreground">{gate.conditionText}</span>
                ) : null}
              </div>
              <StatusBadge kind="gate" value={gate.status} />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Validaciones</h3>
        {validations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay validaciones registradas.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {validations.map((record) => {
              const items: DescriptionItem[] = [
                {
                  term: 'Tipo',
                  value: label(validationTypeCatalog, record.validationTypeCode),
                },
                {
                  term: 'Resultado',
                  value: label(validationResultCatalog, record.resultCode),
                },
                { term: 'Caso de prueba', value: record.testCase, span: 2 },
                { term: 'Versión', value: orDash(record.version) },
                { term: 'Ambiente', value: orDash(record.environment) },
                { term: 'Fecha', value: formatDateTime(record.executedAt) },
                {
                  term: 'Defecto bloqueante',
                  value: record.blocking ? (
                    <StatusBadge
                      kind="blocking"
                      value={record.blockingResolved ? 'RESUELTO' : 'SIN_RESOLVER'}
                    />
                  ) : (
                    'No'
                  ),
                },
              ];
              return (
                <li key={record.id} className="rounded-lg border bg-surface-subtle p-3">
                  <DescriptionList items={items} columns={2} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Mensaje informativo por estado para el paso de estabilización/cierre. */
const STABILIZATION_COPY: Record<string, string> = {
  LISTA_PARA_LIBERAR:
    'La solución cumplió la validación y está lista para liberarse al entorno operativo.',
  EN_ESTABILIZACION:
    'La solución está liberada y en periodo de estabilización bajo observación.',
  OPERATIVA: 'La solución está operativa y en uso.',
  CERRADA: 'La solicitud se cerró formalmente.',
  RETIRADA: 'La solicitud fue retirada del flujo.',
};

/**
 * Paso 7 · Estabilización/Cierre: texto informativo según el estado operativo.
 * Si la solicitud aún no llegó a esta fase, el contenedor muestra «etapa sin
 * registrar»; aquí solo se interpreta el estado cuando ya aplica.
 */
export function EstabilizacionDetalle({
  operationalState,
}: {
  operationalState: string;
}): React.ReactElement {
  const copy = STABILIZATION_COPY[operationalState];
  return (
    <DescriptionList
      columns={1}
      items={[
        {
          term: 'Estado operativo',
          value: <StatusBadge kind="request" value={operationalState} />,
        },
        {
          term: 'Situación',
          value: copy ?? `La solicitud está en estado «${requestStateLabel(operationalState)}».`,
        },
      ]}
    />
  );
}
