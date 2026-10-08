'use client';

import * as React from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { Request } from '@/lib/api-client';
import { PriorityError, createPriorityEvaluation } from '@/lib/priority';
import { listRequests } from '@/lib/requests';
import { requestStateLabel } from '@/lib/request-state';

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
  { key: 'alignment', label: 'Alineacion', weight: 15 },
  { key: 'riskControl', label: 'Control del riesgo', weight: 15 },
  { key: 'urgency', label: 'Urgencia', weight: 10 },
  { key: 'scope', label: 'Alcance', weight: 10 },
  { key: 'dataAvailability', label: 'Disponibilidad de datos', weight: 10 },
  { key: 'feasibility', label: 'Factibilidad', weight: 10 },
  { key: 'reuse', label: 'Reutilizacion', weight: 5 },
];

type Scores = Record<CriterionKey, number>;

function emptyScores(): Scores {
  return {
    impact: 3,
    alignment: 3,
    riskControl: 3,
    urgency: 3,
    scope: 3,
    dataAvailability: 3,
    feasibility: 3,
    reuse: 3,
  };
}

export function PriorizacionView(): React.ReactElement {
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  const [selectedId, setSelectedId] = React.useState<string>('');
  const [scores, setScores] = React.useState<Scores>(emptyScores());
  const [justification, setJustification] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const reqs = await listRequests();
      setRequests(reqs);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selected = React.useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );

  // Precondicion (gate server-side §2.3): triage vigente = Continuar y estado
  // en EN_TRIAGE o BACKLOG_PRIORIZADO. La UI refleja el candado (UI-04).
  const canEvaluate =
    selected?.currentTriageDecision === 'CONTINUAR' &&
    (selected?.operationalState === 'EN_TRIAGE' ||
      selected?.operationalState === 'BACKLOG_PRIORIZADO');

  function selectRequest(id: string) {
    setSelectedId(id);
    setScores(emptyScores());
    setJustification('');
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setFormError(null);
    try {
      // El score lo calcula el backend; el cliente no lo envia.
      const saved = await createPriorityEvaluation(selected.id, {
        impact: scores.impact,
        alignment: scores.alignment,
        riskControl: scores.riskControl,
        urgency: scores.urgency,
        scope: scores.scope,
        dataAvailability: scores.dataAvailability,
        feasibility: scores.feasibility,
        reuse: scores.reuse,
        justification: justification.trim() ? justification.trim() : undefined,
      });
      toast.success(
        `Evaluacion guardada. Score ${saved.score} (${saved.thresholdLabel}).`,
      );
      // Reset solo en exito (AC-031). Recarga para reflejar score/estado.
      setJustification('');
      await load();
    } catch (err) {
      const message =
        err instanceof PriorityError
          ? err.message
          : 'Ocurrio un error inesperado.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Priorizacion</h1>
        <p className="text-sm text-muted-foreground">
          Evalua ocho criterios (1-5) con sus pesos. El score lo calcula el
          backend.
        </p>
      </header>

      <section aria-live="polite" className="flex flex-col gap-6">
        {state === 'loading' ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible comunicarse con el servidor.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
            <p className="text-sm font-medium">
              No hay solicitudes en tu alcance.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-2 rounded-lg border bg-card p-4">
              <Label htmlFor="priority-request">Solicitud</Label>
              <Select value={selectedId} onValueChange={selectRequest}>
                <SelectTrigger id="priority-request">
                  <SelectValue placeholder="Selecciona una solicitud" />
                </SelectTrigger>
                <SelectContent>
                  {requests.map((req) => (
                    <SelectItem key={req.id} value={req.id}>
                      {req.title} - {requestStateLabel(req.operationalState)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && selected.currentScore !== null ? (
                <p className="text-sm text-muted-foreground">
                  Score vigente: {selected.currentScore}
                  {selected.priorityLabel
                    ? ` (${selected.priorityLabel})`
                    : ''}
                </p>
              ) : null}
            </div>

            {selected ? (
              canEvaluate ? (
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-4 rounded-lg border bg-card p-4"
                >
                  <div className="flex flex-col gap-4">
                    {CRITERIA.map((c) => (
                      <div
                        key={c.key}
                        className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center"
                      >
                        <Label htmlFor={`priority-${c.key}`}>
                          {c.label}{' '}
                          <span className="text-muted-foreground">
                            (peso {c.weight})
                          </span>
                        </Label>
                        <Select
                          value={String(scores[c.key])}
                          onValueChange={(v) =>
                            setScores((s) => ({
                              ...s,
                              [c.key]: Number.parseInt(v, 10),
                            }))
                          }
                        >
                          <SelectTrigger
                            id={`priority-${c.key}`}
                            className="sm:w-24"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="priority-justification">
                      Justificacion
                    </Label>
                    <Textarea
                      id="priority-justification"
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                    />
                  </div>

                  <Separator />

                  <p className="rounded-md bg-muted p-3 text-sm">
                    Guardar la evaluacion no aprueba el compromiso (BR-006). La
                    aprobacion se decide por separado en Revision.
                  </p>

                  {formError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {formError}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Guardando...' : 'Guardar evaluacion'}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed bg-card p-6">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Lock aria-hidden="true" className="size-4" />
                    Priorizacion no disponible
                  </div>
                  <p className="text-sm text-muted-foreground">
                    La priorizacion solo esta disponible si el triage vigente es
                    Continuar y la solicitud esta en triage o backlog. Estado
                    actual:{' '}
                    <Badge variant="secondary">
                      {requestStateLabel(selected.operationalState)}
                    </Badge>
                    {selected.currentTriageDecision
                      ? ` · triage ${selected.currentTriageDecision}`
                      : ' · sin triage'}
                    .
                  </p>
                </div>
              )
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
