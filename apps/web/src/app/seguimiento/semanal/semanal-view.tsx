'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DescriptionList } from '@/components/description-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Field } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Section } from '@/components/section';
import { StatStrip, StatTile } from '@/components/stat-tile';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { Process, WeeklyReport } from '@/lib/api-client';
import { formatDateOnly, formatHours } from '@/lib/format';
import {
  WorklogError,
  createWeeklyReport,
  getWeeklyReport,
  listWeeklyReports,
  submitWeeklyReport,
  updateWeeklyReport,
} from '@/lib/worklog';
import { listProcesses } from '@/lib/team';
import { SemanalFormDialog, type SemanalFormValues } from './semanal-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof WorklogError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
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

/** Secciones de texto del reporte, en el orden de siempre, con sus ids. */
const SECTION_FIELDS: { key: keyof Sections; id: string; label: string; help?: string }[] = [
  { key: 'results', id: 'sem-results', label: 'Resultados' },
  {
    key: 'proposals',
    id: 'sem-proposals',
    label: 'Propuestas',
    help: 'Las propuestas son texto; no cambian prioridades ni crean compromisos.',
  },
  { key: 'blockers', id: 'sem-blockers', label: 'Bloqueos' },
  { key: 'commitmentsText', id: 'sem-commitments', label: 'Compromisos de la próxima semana' },
  { key: 'decisions', id: 'sem-decisions', label: 'Decisiones' },
];

function weekLabel(weekStart: string): string {
  return `Semana del ${formatDateOnly(weekStart)}`;
}

export function SemanalView(): React.ReactElement {
  const [reports, setReports] = React.useState<WeeklyReport[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<WeeklyReport | null>(null);
  const [detailState, setDetailState] = React.useState<LoadState>('loading');
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const latestDetailIdRef = React.useRef<string | null>(null);

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
  const [sendOpen, setSendOpen] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createSubmitting, setCreateSubmitting] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const detailHeadingRef = React.useRef<HTMLHeadingElement>(null);

  const loadData = React.useCallback(() => {
    return Promise.all([
      listWeeklyReports(),
      listProcesses().catch(() => [] as Process[]),
    ])
      .then(([reps, procs]) => {
        setReports(reps);
        setProcesses(procs);
        setLoadError(null);
        setState('success');
        // Mantiene la selección si sigue existiendo; si no, toma el primero.
        setSelectedId((prev) => {
          if (prev && reps.some((r) => r.id === prev)) return prev;
          return reps[0]?.id ?? null;
        });
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof WorklogError ? err.message : null);
        setState('error');
      });
  }, []);
  const load = React.useCallback(async () => {
    setState('loading');
    await loadData();
  }, [loadData]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  /**
   * Carga el detalle. `silent` (tras guardar o enviar) no pasa por el estado de
   * carga: los campos siguen montados y conservan el foco.
   */
  const fetchDetail = React.useCallback((id: string) => {
    latestDetailIdRef.current = id;
    return getWeeklyReport(id)
      .then((d) => {
        if (latestDetailIdRef.current !== id) return;
        setDetail(d);
        setSections(sectionsOf(d));
        setDetailError(null);
        setDetailState('success');
      })
      .catch((err: unknown) => {
        if (latestDetailIdRef.current !== id) return;
        setDetail(null);
        setDetailError(err instanceof WorklogError ? err.message : null);
        setDetailState('error');
      });
  }, []);
  const loadDetail = React.useCallback((id: string, silent = false) => {
    if (!silent) setDetailState('loading');
    return fetchDetail(id);
  }, [fetchDetail]);

  // Al cambiar de reporte: sin selección se vacía el detalle; con selección se
  // vuelve a mostrar la carga.
  useResetOnChange([selectedId], () => {
    if (!selectedId) setDetail(null);
    else setDetailState('loading');
  });
  React.useEffect(() => {
    if (!selectedId) {
      latestDetailIdRef.current = null;
      return;
    }
    void fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );

  // La cabecera del detalle sale del ítem de la lista mientras carga el detalle,
  // para que el encabezado siga montado (y con el foco) al cambiar de reporte.
  const selectedReport = reports.find((r) => r.id === selectedId) ?? null;
  const detailReady = detailState === 'success' && detail !== null && detail.id === selectedId;
  const current = detailReady ? detail : selectedReport;
  const isDraft = detailReady && detail.status === 'BORRADOR';

  async function handleCreate(values: SemanalFormValues) {
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const created = await createWeeklyReport({
        processId: values.processId,
        weekStart: values.weekStart,
      });
      toast.success('Reporte semanal creado.');
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

  async function handleSaveSections(event: React.FormEvent) {
    event.preventDefault();
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
      await loadDetail(detail.id, true);
    } catch (err) {
      // Fallo: conserva lo escrito en las secciones (AC-031).
      toast.error(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitReport() {
    if (!detail) return;
    setSubmitting(true);
    try {
      await submitWeeklyReport(detail.id);
      toast.success('Reporte semanal enviado.');
      await Promise.all([load(), loadDetail(detail.id, true)]);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Tras enviar, «Enviar reporte» desaparece: el foco va al encabezado (NIT 4).
  const returnFocusToHeading = React.useCallback(
    (): HTMLElement | null => detailHeadingRef.current,
    [],
  );

  function renderDetailBody(): React.ReactNode {
    if (detailState === 'error') {
      return (
        <ErrorState
          size="compact"
          title="No fue posible cargar el reporte semanal."
          message={detailError}
          onRetry={() => selectedId && void loadDetail(selectedId)}
        />
      );
    }
    if (!detailReady || !detail) {
      return (
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full max-w-[720px]" />
          <Skeleton className="h-24 w-full max-w-[720px]" />
        </div>
      );
    }
    const consolidation = detail.consolidation;
    return (
      <>
        <Section
          title="Consolidado de bitácoras"
          headingLevel={3}
          description="Solo cuentan los diarios enviados o revisados del proceso en esa semana."
        >
          <div aria-live="polite">
            {consolidation && consolidation.hasBacking ? (
              <StatStrip label="Consolidado de bitácoras">
                <StatTile label="Diarios" value={consolidation.dailyLogCount} />
                <StatTile label="Actividades" value={consolidation.activityCount} />
                <StatTile label="Dedicación" value={formatHours(consolidation.totalHours)} />
                <StatTile label="Extraordinarias" value={consolidation.extraordinaryCount} />
              </StatStrip>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sin bitácoras de respaldo para esta semana: no hay diarios enviados ni revisados
                del proceso.
              </p>
            )}
          </div>
        </Section>

        <Section title="Secciones del reporte" headingLevel={3}>
          {!isDraft ? (
            <InlineNotice tone="neutral">
              El reporte se envió; sus secciones ya no se pueden editar.
            </InlineNotice>
          ) : null}
          {isDraft ? (
            <form noValidate onSubmit={handleSaveSections} className="grid max-w-[720px] gap-4">
              {SECTION_FIELDS.map((field) => (
                <Field key={field.id} id={field.id} label={field.label} help={field.help}>
                  <Textarea
                    value={sections[field.key]}
                    onChange={(e) => setSection(field.key, e.target.value)}
                  />
                </Field>
              ))}
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" loading={saving}>
                  {saving ? 'Guardando…' : 'Guardar secciones'}
                </Button>
              </div>
            </form>
          ) : (
            // Reporte enviado: se lee como texto (un campo deshabilitado y vacío
            // parecía un formulario roto).
            <DescriptionList
              className="max-w-[720px]"
              items={SECTION_FIELDS.map((field) => ({
                term: field.label,
                value: sections[field.key],
              }))}
            />
          )}
        </Section>
      </>
    );
  }

  function renderDetail(): React.ReactNode {
    if (state === 'loading' && !current) {
      return (
        <Card aria-hidden="true" className="flex flex-col gap-4 p-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      );
    }
    if (!current) {
      return (
        <Card>
          <EmptyState
            title="Selecciona un reporte semanal."
            description="O crea uno nuevo para consolidar la semana."
          />
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader className="gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                ref={detailHeadingRef}
                tabIndex={-1}
                className="rounded-sm text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {weekLabel(current.weekStart)}
              </h2>
              <StatusBadge kind="log" value={current.status} />
            </div>
            <p className="text-meta text-muted-foreground">{processName(current.processId)}</p>
          </div>
          {isDraft ? (
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={() => setSendOpen(true)}
                disabled={submitting}
              >
                <Send aria-hidden="true" />
                Enviar reporte
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-4">{renderDetailBody()}</CardContent>
      </Card>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Reporte semanal"
        description="Consolida resultados, bloqueos y decisiones de la semana por proceso."
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Nuevo reporte semanal
          </Button>
        }
      />

      {state === 'error' ? (
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar los reportes semanales."
            message={loadError}
            onRetry={() => void load()}
          />
        </div>
      ) : (
        <MasterDetail
          listTitle="Mis reportes"
          detailHeadingRef={detailHeadingRef}
          list={
            <SelectableList
              label="Mis reportes"
              loading={state === 'loading' && reports.length === 0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              items={reports.map((rep) => ({
                id: rep.id,
                title: weekLabel(rep.weekStart),
                meta: processName(rep.processId),
                badge: <StatusBadge kind="log" value={rep.status} />,
              }))}
              empty={{
                title: 'Aún no hay reportes semanales.',
                description: 'Crea el reporte de la semana para consolidar tus bitácoras.',
                action: (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus aria-hidden="true" />
                    Nuevo reporte semanal
                  </Button>
                ),
              }}
            />
          }
          detail={renderDetail()}
        />
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

      <ConfirmDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        tone="default"
        title="¿Enviar el reporte semanal?"
        description="Después de enviarlo no podrás editar sus secciones."
        confirmLabel="Enviar reporte"
        onConfirm={handleSubmitReport}
        returnFocusTo={returnFocusToHeading}
      />
    </PageLayout>
  );
}
