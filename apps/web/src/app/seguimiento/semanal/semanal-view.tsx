'use client';

import * as React from 'react';
import { Plus, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { Process, WeeklyReport } from '@/lib/api-client';
import {
  WorklogError,
  createWeeklyReport,
  getWeeklyReport,
  listWeeklyReports,
  submitWeeklyReport,
  updateWeeklyReport,
} from '@/lib/worklog';
import { listProcesses } from '@/lib/team';
import {
  SemanalFormDialog,
  type SemanalFormValues,
} from './semanal-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof WorklogError
    ? err.message
    : 'Ocurrio un error inesperado.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

interface Sections {
  results: string;
  proposals: string;
  blockers: string;
  commitmentsText: string;
  decisions: string;
}

function sectionsOf(report: WeeklyReport): Sections {
  return {
    results: report.results ?? '',
    proposals: report.proposals ?? '',
    blockers: report.blockers ?? '',
    commitmentsText: report.commitmentsText ?? '',
    decisions: report.decisions ?? '',
  };
}

export function SemanalView(): React.ReactElement {
  const [reports, setReports] = React.useState<WeeklyReport[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<WeeklyReport | null>(null);
  const [detailState, setDetailState] = React.useState<LoadState>('loading');

  // Secciones editables (se conservan ante error; se resetean al cargar detalle).
  const [sections, setSections] = React.useState<Sections>({
    results: '',
    proposals: '',
    blockers: '',
    commitmentsText: '',
    decisions: '',
  });
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createSubmitting, setCreateSubmitting] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [reps, procs] = await Promise.all([
        listWeeklyReports(),
        listProcesses().catch(() => [] as Process[]),
      ]);
      setReports(reps);
      setProcesses(procs);
      setState('success');
      setSelectedId((prev) => {
        if (prev && reps.some((r) => r.id === prev)) return prev;
        return reps[0]?.id ?? null;
      });
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = React.useCallback(async (id: string) => {
    setDetailState('loading');
    try {
      const d = await getWeeklyReport(id);
      setDetail(d);
      setSections(sectionsOf(d));
      setDetailState('success');
    } catch {
      setDetail(null);
      setDetailState('error');
    }
  }, []);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );

  const isDraft = detail?.status === 'BORRADOR';

  async function handleCreate(values: SemanalFormValues) {
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const created = await createWeeklyReport({
        processId: values.processId,
        weekStart: values.weekStart,
      });
      toast.success('Registro semanal creado.');
      setCreateOpen(false);
      setSelectedId(created.id);
      await load();
    } catch (err) {
      const message = messageOf(err);
      setCreateError(message);
      toast.error(message);
    } finally {
      setCreateSubmitting(false);
    }
  }

  function setSection<K extends keyof Sections>(key: K, value: string) {
    setSections((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveSections() {
    if (!detail) return;
    setSaving(true);
    try {
      await updateWeeklyReport(detail.id, {
        results: trimOrUndefined(sections.results),
        proposals: trimOrUndefined(sections.proposals),
        blockers: trimOrUndefined(sections.blockers),
        commitmentsText: trimOrUndefined(sections.commitmentsText),
        decisions: trimOrUndefined(sections.decisions),
      });
      toast.success('Secciones guardadas.');
      await loadDetail(detail.id);
    } catch (err) {
      // Fallo: conserva lo tecleado en las secciones (AC-031).
      toast.error(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForReview() {
    if (!detail) return;
    setSubmitting(true);
    try {
      await submitWeeklyReport(detail.id);
      toast.success('Registro semanal enviado.');
      await Promise.all([load(), loadDetail(detail.id)]);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  const consolidation = detail?.consolidation ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Semanal</h1>
          <p className="text-sm text-muted-foreground">
            Consolidado semanal por proceso. Los conteos resumen solo las
            bitacoras enviadas o revisadas de la semana.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={state === 'loading'}>
          <Plus aria-hidden="true" />
          Nuevo semanal
        </Button>
      </header>

      {state === 'error' ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No fue posible cargar los registros semanales.
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section aria-labelledby="semanales-heading" className="flex flex-col gap-3">
            <h2
              id="semanales-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Mis semanales
            </h2>
            <div className="rounded-lg border bg-card">
              {state === 'loading' ? (
                <div className="flex flex-col gap-3 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : reports.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <p className="text-sm font-medium">Aun no hay semanales.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus aria-hidden="true" />
                    Nuevo semanal
                  </Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {reports.map((rep) => (
                    <li key={rep.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(rep.id)}
                        aria-current={rep.id === selectedId}
                        className={`flex w-full flex-col gap-1 p-3 text-left transition-colors hover:bg-muted/50 ${
                          rep.id === selectedId ? 'bg-muted' : ''
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">Semana {rep.weekStart}</span>
                          <Badge
                            variant={
                              rep.status === 'BORRADOR' ? 'outline' : 'secondary'
                            }
                          >
                            {rep.status === 'BORRADOR' ? 'Borrador' : 'Enviado'}
                          </Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {processName(rep.processId)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-label="Detalle del semanal" className="flex flex-col gap-3">
            {!selectedId ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-10 text-center">
                <p className="text-sm font-medium">
                  Selecciona un registro semanal.
                </p>
                <p className="text-sm text-muted-foreground">
                  O crea uno nuevo para consolidar la semana.
                </p>
              </div>
            ) : detailState === 'loading' ? (
              <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : detailState === 'error' || !detail ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No fue posible cargar el registro semanal.
                </p>
                <Button
                  variant="outline"
                  onClick={() => selectedId && void loadDetail(selectedId)}
                >
                  <RefreshCw aria-hidden="true" />
                  Reintentar
                </Button>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="flex items-center gap-2">
                        Semana {detail.weekStart}
                        <Badge variant={isDraft ? 'outline' : 'secondary'}>
                          {isDraft ? 'Borrador' : 'Enviado'}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {processName(detail.processId)}
                      </p>
                    </div>
                    {isDraft ? (
                      <Button
                        size="sm"
                        onClick={() => void handleSubmitForReview()}
                        disabled={submitting}
                      >
                        <Send aria-hidden="true" />
                        Enviar
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {/* Consolidacion: solo diarios enviados/revisados. */}
                  <div
                    className="rounded-md border bg-muted/40 p-4"
                    aria-live="polite"
                  >
                    <h3 className="mb-2 text-sm font-semibold">
                      Consolidado (bitacoras de respaldo)
                    </h3>
                    {consolidation && consolidation.hasBacking ? (
                      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                        <div>
                          <dt className="text-muted-foreground">Diarios</dt>
                          <dd className="font-medium">
                            {consolidation.dailyLogCount}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Actividades</dt>
                          <dd className="font-medium">
                            {consolidation.activityCount}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Dedicacion (h)
                          </dt>
                          <dd className="font-medium">
                            {consolidation.totalHours}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Extraordinarias
                          </dt>
                          <dd className="font-medium">
                            {consolidation.extraordinaryCount}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sin bitacoras de respaldo para esta semana (no hay
                        diarios enviados ni revisados del proceso).
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Secciones de texto. */}
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="sem-results">Resultados</Label>
                      <Textarea
                        id="sem-results"
                        value={sections.results}
                        disabled={!isDraft}
                        onChange={(e) => setSection('results', e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="sem-proposals">Propuestas</Label>
                      <Textarea
                        id="sem-proposals"
                        value={sections.proposals}
                        disabled={!isDraft}
                        onChange={(e) => setSection('proposals', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Las propuestas son texto; no cambian prioridades ni
                        crean compromisos.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="sem-blockers">Bloqueos</Label>
                      <Textarea
                        id="sem-blockers"
                        value={sections.blockers}
                        disabled={!isDraft}
                        onChange={(e) => setSection('blockers', e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="sem-commitments">
                        Compromisos proxima semana
                      </Label>
                      <Textarea
                        id="sem-commitments"
                        value={sections.commitmentsText}
                        disabled={!isDraft}
                        onChange={(e) =>
                          setSection('commitmentsText', e.target.value)
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="sem-decisions">Decisiones</Label>
                      <Textarea
                        id="sem-decisions"
                        value={sections.decisions}
                        disabled={!isDraft}
                        onChange={(e) => setSection('decisions', e.target.value)}
                      />
                    </div>
                  </div>

                  {isDraft ? (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        onClick={() => void handleSaveSections()}
                        disabled={saving}
                      >
                        {saving ? 'Guardando...' : 'Guardar secciones'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      El semanal fue enviado; las secciones ya no se editan.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      )}

      <SemanalFormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
        processes={processes}
        submitting={createSubmitting}
        errorMessage={createError}
        onSubmit={handleCreate}
      />
    </div>
  );
}
