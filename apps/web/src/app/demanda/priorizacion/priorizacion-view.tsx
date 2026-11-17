'use client';

import { ModuleGate } from '@/components/module-gate';
import { NO_ACCESS_COPY } from '@/components/no-access-notice';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChartColumn, CircleAlert, CircleDashed } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Field, FormError } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RequestInbox } from '@/components/request-inbox';
import {
  RequestContextBar,
  RequestFacts,
  type RequestPickerGroup,
} from '@/components/request-context-bar';
import { RequirementsPanel, type RequirementItem } from '@/components/requirements-panel';
import { DescriptionList, type DescriptionItem } from '@/components/description-list';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { PriorityEvaluation, Process, Request } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { formatCount, formatDateTime } from '@/lib/format';
import {
  PriorityError,
  createPriorityEvaluation,
  listPriorityEvaluations,
} from '@/lib/priority';
import { listRequests } from '@/lib/requests';
import { isPrioritizable, isTriageable } from '@/lib/request-state';
import { parseBand, PRIORITY_BAND_COPY } from '@/lib/status-presentation';
import { listProcesses } from '@/lib/team';
import { cn } from '@/lib/utils';
import { useRequestIdParam } from '@/lib/use-request-param';

type LoadState = 'loading' | 'success' | 'error';

type CriterionKey =
  | 'impact'
  | 'alignment'
  | 'riskControl'
  | 'urgency'
  | 'scope'
  | 'dataAvailability'
  | 'feasibility'
  | 'reuse';

interface Criterion {
  key: CriterionKey;
  label: string;
  weight: number;
}

/** Pesos visibles (design 1.4), suman 100. */
const CRITERIA: Criterion[] = [
  { key: 'impact', label: 'Impacto', weight: 25 },
  { key: 'alignment', label: 'Alineación', weight: 15 },
  { key: 'riskControl', label: 'Control del riesgo', weight: 15 },
  { key: 'urgency', label: 'Urgencia', weight: 10 },
  { key: 'scope', label: 'Alcance', weight: 10 },
  { key: 'dataAvailability', label: 'Disponibilidad de datos', weight: 10 },
  { key: 'feasibility', label: 'Factibilidad', weight: 10 },
  { key: 'reuse', label: 'Reutilización', weight: 5 },
];

const RATING_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
const NOT_AVAILABLE = 'La solicitud indicada no está disponible aquí.';
const FORM_ID = 'priority-form';
const READY_NOUN = { one: 'lista para priorizar', other: 'listas para priorizar' };
const GROUPS: RequestPickerGroup[] = [{ label: 'Listas para priorizar', match: isPrioritizable }];
const NBSP = '\u00a0';

/** Un criterio sin valorar es null: no hay valores por defecto. */
type Scores = Record<CriterionKey, number | null>;
type CriterionErrors = Partial<Record<CriterionKey, string>>;

const CRITERION_REQUIRED = 'Elige una valoración de 1 a 5.';

function emptyScores(): Scores {
  return {
    impact: null,
    alignment: null,
    riskControl: null,
    urgency: null,
    scope: null,
    dataAvailability: null,
    feasibility: null,
    reuse: null,
  };
}
/** «score 84 (P1 · Primera consideración para compromiso)», o el label de la API tal cual. */
function savedMessage(score: number, thresholdLabel: string): string {
  const band = parseBand(thresholdLabel);
  const detail = band ? `${band} · ${PRIORITY_BAND_COPY[band]}` : thresholdLabel;
  return `Evaluación guardada: score ${score} (${detail}).`;
}

/**
 * Priorización (design §11.7 y §10.2, patrón C): ocho criterios de 1 a 5 con
 * su peso; el score y la banda los calcula el backend al guardar. Si la
 * solicitud no admite priorización, el panel de requisitos explica qué falta.
 * La selección se refleja en ?requestId= (§7.9.1).
 */
function PriorizacionViewContent(): React.ReactElement {
  const router = useRouter();
  const { allowedModules } = useActor();
  const { requestId: urlId, setRequestId } = useRequestIdParam();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<unknown>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState('');
  const selectedRef = React.useRef(selectedId);
  // Ultimo valor para los callbacks asincronos (se actualiza tras el render, no durante).
  React.useEffect(() => {
    selectedRef.current = selectedId;
  });
  const [scores, setScores] = React.useState<Scores>(emptyScores());
  const [criterionErrors, setCriterionErrors] = React.useState<CriterionErrors>({});
  const [justification, setJustification] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  // Última evaluación registrada de la solicitud elegida (la vigente), para
  // mostrar el detalle de lo que se registró cuando la etapa ya está hecha.
  const [currentEvaluation, setCurrentEvaluation] =
    React.useState<PriorityEvaluation | null>(null);

  // Carga la evaluación vigente (la última del histórico) de una solicitud.
  // Tolerante a fallo: si falla, el detalle simplemente no se muestra.
  const loadCurrentEvaluation = React.useCallback((id: string) => {
    void listPriorityEvaluations(id)
      .then((list) => {
        // Evita condiciones de carrera si la selección cambió mientras cargaba.
        if (selectedRef.current !== id) return;
        setCurrentEvaluation(list.length > 0 ? list[list.length - 1] : null);
      })
      .catch(() => {
        if (selectedRef.current === id) setCurrentEvaluation(null);
      });
  }, []);

  // Fija la selección, reinicia el formulario y carga la evaluación vigente.
  const selectRequest = React.useCallback(
    (id: string) => {
      setSelectedId(id);
      setScores(emptyScores());
    setCriterionErrors({});
      setJustification('');
      setFormError(null);
      setCurrentEvaluation(null);
      if (id) loadCurrentEvaluation(id);
    },
    [loadCurrentEvaluation],
  );

  const loadData = React.useCallback(() => {
    return Promise.all([
      listRequests(),
      listProcesses().catch(() => [] as Process[]),
    ])
      .then(([reqs, procs]) => {
        setRequests(reqs);
        setProcesses(procs);
        setState('success');
        // Regla 3 de §7.9.1: si la solicitud elegida ya no está, se limpia.
        if (selectedRef.current && !reqs.some((r) => r.id === selectedRef.current)) {
          selectRequest('');
          setRequestId(null);
        }
      })
      .catch((err: unknown) => {
        setLoadError(err);
        setState('error');
      });
  }, [selectRequest, setRequestId]);
  const load = React.useCallback(async () => {
    setState('loading');
    await loadData();
  }, [loadData]);

  // `load` es estable: carga al montar, como hoy (no recarga al cambiar de actor).
  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  // Regla 1 de §7.9.1: adoptar ?requestId= al terminar la carga y cuando cambia.
  React.useEffect(() => {
    if (state !== 'success' || !urlId || urlId === selectedRef.current) return;
    if (requests.some((r) => r.id === urlId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza la selección con ?requestId= de la URL (sistema externo, vía router) una vez cargada la lista.
      setNotice(null);
      selectRequest(urlId);
    } else {
      setNotice(NOT_AVAILABLE);
      setRequestId(null);
    }
  }, [state, requests, urlId, selectRequest, setRequestId]);

  // Regla 2: primero el estado, después la URL.
  function handlePick(id: string): void {
    setNotice(null);
    selectRequest(id);
    setRequestId(id);
  }

  const selected = React.useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );
  const readyCount = React.useMemo(() => requests.filter(isPrioritizable).length, [requests]);
  const processName = selected
    ? (processes.find((p) => p.id === selected.mainProcessId)?.name ?? null)
    : null;
  const reviewAllowed = allowedModules.has('review');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected || submitting) return;
    // Los ocho criterios se evalúan a mano: sin valores por defecto, la API
    // rechaza si falta alguno y aquí se avisa antes, todos a la vez.
    const missing = CRITERIA.filter((c) => scores[c.key] === null);
    if (missing.length > 0) {
      setCriterionErrors(
        Object.fromEntries(missing.map((c) => [c.key, CRITERION_REQUIRED])) as CriterionErrors,
      );
      setFormError(
        `Faltan ${missing.length} ${missing.length === 1 ? 'criterio' : 'criterios'} por evaluar: ${missing.map((c) => c.label).join(', ')}.`,
      );
      document.getElementById(`priority-${missing[0].key}-1`)?.focus();
      return;
    }
    setCriterionErrors({});
    setSubmitting(true);
    setFormError(null);
    try {
      // El score lo calcula el backend; el cliente no lo envía.
      const saved = await createPriorityEvaluation(selected.id, {
        impact: scores.impact as number,
        alignment: scores.alignment as number,
        riskControl: scores.riskControl as number,
        urgency: scores.urgency as number,
        scope: scores.scope as number,
        dataAvailability: scores.dataAvailability as number,
        feasibility: scores.feasibility as number,
        reuse: scores.reuse as number,
        justification: justification.trim() ? justification.trim() : undefined,
      });
      toast.success(
        savedMessage(saved.score, saved.thresholdLabel),
        reviewAllowed
          ? {
              action: {
                label: 'Ir a aprobaciones',
                onClick: () => router.push('/administracion/revision'),
              },
            }
          : undefined,
      );
      // Reset solo en éxito (AC-031). Recarga para reflejar score y estado.
      setJustification('');
      // La respuesta del POST ya es la evaluación recién registrada (la vigente).
      setCurrentEvaluation(saved);
      await load();
    } catch (err) {
      const message = err instanceof PriorityError ? err.message : 'Ocurrió un error inesperado.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function renderBlock(request: Request): React.ReactElement {
    const triageOk = request.currentTriageDecision === 'CONTINUAR';
    const stateOk =
      request.operationalState === 'EN_TRIAGE' || request.operationalState === 'BACKLOG_PRIORIZADO';
    const items: RequirementItem[] = [
      {
        id: 'triage',
        label: 'Triage vigente con decisión Continuar',
        status: triageOk ? 'met' : 'pending',
        detail: request.currentTriageDecision ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Triage actual: <StatusBadge kind="triage" value={request.currentTriageDecision} />
          </span>
        ) : (
          'Sin triage'
        ),
        // Solo si el triage todavía se puede registrar (estado Registrada).
        action:
          isTriageable(request) && allowedModules.has('triage')
            ? {
                label: 'Ir a triage',
                href: `/demanda/triage?requestId=${encodeURIComponent(request.id)}`,
              }
            : undefined,
      },
      {
        id: 'state',
        label: 'Estado En triage o Backlog priorizado',
        status: stateOk ? 'met' : 'pending',
        detail: (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Estado actual: <StatusBadge kind="request" value={request.operationalState} />
          </span>
        ),
      },
    ];
    return (
      <RequirementsPanel
        id="priority-block"
        title="La priorización no está disponible para esta solicitud"
        description="Se prioriza una solicitud con triage Continuar que está En triage o en Backlog priorizado. Elige una del grupo «Listas para priorizar»."
        items={items}
      />
    );
  }

  /**
   * Detalle de la priorización vigente (solo lectura): score y banda, las ocho
   * valoraciones tal como se guardaron y la justificación. Aparece cuando la
   * solicitud ya tiene una evaluación registrada, bajo el formulario o el panel
   * de requisitos.
   */
  function renderEvaluationDetail(evaluation: PriorityEvaluation): React.ReactElement {
    const criterionItems: DescriptionItem[] = CRITERIA.map((c) => ({
      term: `${c.label} (peso ${c.weight}${NBSP}%)`,
      value: `${evaluation[c.key]} / 5`,
    }));
    return (
      <section
        aria-labelledby="priority-detail-title"
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="priority-detail-title" className="text-base font-semibold">
            Detalle de la priorización registrada
          </h2>
          <PriorityBadge
            variant="full"
            score={evaluation.score}
            label={evaluation.thresholdLabel}
          />
        </div>
        <DescriptionList items={criterionItems} columns={2} />
        <DescriptionList
          items={[
            { term: 'Justificación', value: evaluation.justification, span: 2 },
            { term: 'Fecha de evaluación', value: formatDateTime(evaluation.evaluatedAt) },
            { term: 'Evaluado por', value: evaluation.evaluatedByName },
          ]}
          columns={2}
        />
      </section>
    );
  }

  function renderForm(): React.ReactElement {
    const evaluatedCount = CRITERIA.filter((c) => scores[c.key] !== null).length;
    return (
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        aria-labelledby="priority-form-title"
        className="flex flex-col gap-5 rounded-lg border bg-card p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="priority-form-title" className="text-base font-semibold">
            Evaluación de prioridad
          </h2>
          <p
            role="status"
            aria-live="polite"
            data-testid="priority-progress"
            className="text-meta text-muted-foreground tabular-nums"
          >
            {evaluatedCount === CRITERIA.length
              ? `Los ${CRITERIA.length} criterios están evaluados.`
              : `${evaluatedCount} de ${CRITERIA.length} criterios evaluados`}
          </p>
        </div>
        <p className="-mt-3 text-meta text-muted-foreground">1 = más bajo · 5 = más alto</p>

        <div className="overflow-hidden rounded-lg border">
          {/* Encabezados visuales desde sm; cada grupo ya tiene su etiqueta. */}
          <div
            aria-hidden="true"
            className="hidden border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <span>Criterio</span>
            <span>Valoración</span>
          </div>
          <div className="divide-y">
            {CRITERIA.map((c) => {
              const error = criterionErrors[c.key];
              const unset = scores[c.key] === null;
              return (
                <div
                  key={c.key}
                  className={cn(
                    'grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
                    error && 'border-l-2 border-danger bg-danger-subtle/40',
                  )}
                >
                  <span id={`priority-${c.key}-label`} className="flex flex-col">
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className="text-meta text-muted-foreground">{`Peso ${c.weight}${NBSP}%`}</span>
                  </span>
                  {/* El contenedor evita que la celda de la rejilla estire el control al apilarse. */}
                  <div className="flex flex-col gap-1 justify-self-start sm:items-end sm:justify-self-end">
                    <SegmentedRadio
                      id={`priority-${c.key}`}
                      name={`priority-${c.key}`}
                      labelledBy={`priority-${c.key}-label`}
                      describedBy={
                        [unset ? `priority-${c.key}-state` : null, error ? `priority-${c.key}-error` : null]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      invalid={Boolean(error)}
                      options={RATING_OPTIONS}
                      value={scores[c.key] === null ? '' : String(scores[c.key])}
                      onValueChange={(value) => {
                        setScores((s) => ({ ...s, [c.key]: Number.parseInt(value, 10) }));
                        setCriterionErrors((prev) =>
                          c.key in prev ? { ...prev, [c.key]: undefined } : prev,
                        );
                      }}
                    />
                    {unset ? (
                      <span
                        id={`priority-${c.key}-state`}
                        className="inline-flex items-center gap-1 text-meta text-muted-foreground"
                      >
                        <CircleDashed className="size-3.5" aria-hidden="true" />
                        Sin evaluar
                      </span>
                    ) : null}
                    {error ? (
                      <span
                        id={`priority-${c.key}-error`}
                        className="inline-flex items-center gap-1 text-meta text-danger"
                      >
                        <CircleAlert className="size-3.5" aria-hidden="true" />
                        {error}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Field id="priority-justification" label="Justificación">
          <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} />
        </Field>

        <InlineNotice
          tone="info"
          action={
            reviewAllowed ? (
              <Link
                href="/administracion/revision"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Ir a Aprobaciones
              </Link>
            ) : undefined
          }
        >
          Guardar la evaluación no aprueba el compromiso. La aprobación se decide en Aprobaciones.
        </InlineNotice>

        <FormError id={FORM_ID} message={formError} />

        <div className="flex justify-end border-t pt-4">
          <Button type="submit" loading={submitting}>
            {submitting ? 'Guardando…' : 'Guardar evaluación'}
          </Button>
        </div>
      </form>
    );
  }

  let content: React.ReactNode;
  if (state === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  } else if (state === 'error') {
    content = (
      <div className="rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar las solicitudes."
          error={loadError}
          onRetry={() => void load()}
        />
      </div>
    );
  } else if (requests.length === 0) {
    content = (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={ChartColumn}
          title="No hay solicitudes en tu alcance."
          description="Las solicitudes con triage Continuar aparecerán aquí para evaluarlas."
        />
      </div>
    );
  } else {
    content = (
      <>
        <RequestContextBar
          id="priority-request"
          requests={requests}
          value={selectedId}
          onValueChange={handlePick}
          groups={GROUPS}
          helper={formatCount(readyCount, READY_NOUN)}
          summary={
            selected ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge kind="request" value={selected.operationalState} />
                {selected.currentScore !== null ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5 text-meta text-muted-foreground">
                    Score vigente:
                    <PriorityBadge
                      variant="full"
                      score={selected.currentScore}
                      label={selected.priorityLabel}
                    />
                  </span>
                ) : null}
              </div>
            ) : null
          }
          actions={
            selected && allowedModules.has('requests') ? (
              <Link
                href={`/demanda/solicitudes/${encodeURIComponent(selected.id)}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Ver ficha completa
              </Link>
            ) : null
          }
        />
        {notice ? <InlineNotice tone="info">{notice}</InlineNotice> : null}
        {selected ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,45rem)_minmax(18rem,1fr)] xl:items-start">
            <div className="flex min-w-0 flex-col gap-6">
              {isPrioritizable(selected) ? renderForm() : renderBlock(selected)}
              {/* El detalle solo aparece cuando ya se cargó la evaluación vigente
                  de esta solicitud. */}
              {currentEvaluation && currentEvaluation.requestId === selected.id
                ? renderEvaluationDetail(currentEvaluation)
                : null}
            </div>
            <section
              aria-labelledby="priority-facts-title"
              className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4"
            >
              <h2 id="priority-facts-title" className="text-base font-semibold">
                Ficha de la solicitud
              </h2>
              <RequestFacts request={selected} processName={processName} />
            </section>
          </div>
        ) : (
          <RequestInbox
            requests={requests}
            groups={GROUPS}
            show={['state', 'triage', 'registered']}
            onPick={handlePick}
          />
        )}
      </>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Priorización"
        description="Evalúa ocho criterios de 1 a 5; el sistema calcula el score y la banda al guardar."
      />
      {content}
    </PageLayout>
  );
}

export function PriorizacionView(): React.ReactElement {
  return (
    <ModuleGate
      moduleKey="priority"
      title="Priorización"
      description="Evalúa ocho criterios de 1 a 5; el sistema calcula el score y la banda al guardar."
      copy={NO_ACCESS_COPY.priority}
    >
      <PriorizacionViewContent />
    </ModuleGate>
  );
}
