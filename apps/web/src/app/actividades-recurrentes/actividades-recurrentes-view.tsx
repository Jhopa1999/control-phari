'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { CalendarCheck, CalendarClock, CircleCheck, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActor } from '@/lib/actor-context';
import type {
  Area,
  CatalogItem,
  CreateRecurringActivity,
  RecurringActivity,
  RecurringBoard,
  RecurringOccurrence,
  User,
} from '@/lib/api-client';
import { listAreas } from '@/lib/areas';
import { listCatalogItems } from '@/lib/catalog';
import { formatDateOnly, formatHours, localDateInputValue, orDash } from '@/lib/format';
import {
  createActivity,
  listActivities,
  listBoard,
  pauseActivity,
  resumeActivity,
  updateActivity,
} from '@/lib/recurring-activities';
import { activityTypeLabel, cadenceText, responsibleKindLabel } from '@/lib/status-labels';
import { listUsers } from '@/lib/team';
import { CalendarTab } from './calendar-tab';
import { CompleteOccurrenceDialog } from './complete-occurrence-dialog';
import { CompliancePanel } from './compliance-panel';
import { DefinitionFormDialog } from './definition-form-dialog';
import { OccurrenceDetailDialog } from './occurrence-detail-dialog';
import { OccurrenceGroups } from './occurrence-groups';
import { messageOf, takeOccurrence } from './occurrence-shared';
import { WeekHeader } from './week-header';

type LoadState = 'loading' | 'success' | 'error';

const ACTIVITY_TYPE_CATALOG = 'RECURRING_ACTIVITY_TYPE';

/**
 * Sección de Actividades recurrentes. Pestañas: «Qué me toca» (tablero de la
 * semana), «Calendario» (mensual) y, solo con permiso, «Gestión» y
 * «Cumplimiento». El backend es la autoridad del alcance y de los estados
 * (displayStatus, canStart, canComplete): el web solo presenta. Usa el cliente
 * tipado del contrato OpenAPI.
 */
export function ActividadesRecurrentesView(): React.ReactElement {
  const { actorId, permissions } = useActor();
  const roleCodes = React.useMemo(() => new Set(permissions?.roleCodes ?? []), [permissions]);
  const canManage = roleCodes.has('JEFE_AREA') || roleCodes.has('ADMIN');

  // --- Qué me toca ---
  const [board, setBoard] = React.useState<RecurringBoard | null>(null);
  const [boardState, setBoardState] = React.useState<LoadState>('loading');
  const [boardError, setBoardError] = React.useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = React.useState(false);
  const [completedWeeks, setCompletedWeeks] = React.useState(4);
  const [announce, setAnnounce] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);

  // --- Gestión ---
  const [activities, setActivities] = React.useState<RecurringActivity[]>([]);
  const [defState, setDefState] = React.useState<LoadState>('loading');
  const [defError, setDefError] = React.useState<string | null>(null);

  // --- Catálogos ---
  const [activityTypes, setActivityTypes] = React.useState<CatalogItem[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [areas, setAreas] = React.useState<Area[]>([]);

  const userNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) map.set(user.id, user.name);
    return map;
  }, [users]);

  // --- Diálogos ---
  const [completeTarget, setCompleteTarget] = React.useState<RecurringOccurrence | null>(null);
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [detailTarget, setDetailTarget] = React.useState<RecurringOccurrence | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [defDialogOpen, setDefDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RecurringActivity | null>(null);
  const [defSubmitting, setDefSubmitting] = React.useState(false);
  const [defFormError, setDefFormError] = React.useState<string | null>(null);
  const [pauseTarget, setPauseTarget] = React.useState<RecurringActivity | null>(null);

  const fetchBoard = React.useCallback(
    (weeks: number) => {
      return listBoard({ completedWeeks: weeks as 0 | 4 | 12 })
        .then((data) => {
          setBoard(data);
          setBoardState('success');
          setRefreshFailed(false);
          setAnnounce(
            `Cargadas ${data.overdue.length + data.thisWeek.length + data.upcoming.length} actividades: ` +
              `${data.counts.overdue} vencidas, ${data.counts.thisWeek} esta semana.`,
          );
        })
        .catch((err: unknown) => {
          setBoardError(messageOf(err));
          // Con datos ya cargados se conserva la última carga y se avisa.
          setBoardState((current) => (current === 'success' ? 'success' : 'error'));
          setRefreshFailed(true);
        });
    },
    [],
  );
  const loadBoard = React.useCallback(
    (weeks: number = completedWeeks) => {
      setReloadKey((n) => n + 1);
      return fetchBoard(weeks);
    },
    [fetchBoard, completedWeeks],
  );

  const fetchActivities = React.useCallback(() => {
    return listActivities()
      .then((data) => {
        setActivities(data);
        setDefState('success');
      })
      .catch((err: unknown) => {
        setDefError(messageOf(err));
        setDefState('error');
      });
  }, []);
  const loadActivities = React.useCallback(() => {
    setDefState('loading');
    return fetchActivities();
  }, [fetchActivities]);

  const loadReferences = React.useCallback(() => {
    return Promise.all([
      listCatalogItems({ catalog: ACTIVITY_TYPE_CATALOG, active: true }),
      listUsers(),
      listAreas({ active: true }),
    ])
      .then(([types, userList, areaList]) => {
        setActivityTypes(types);
        setUsers(userList);
        setAreas(areaList);
      })
      .catch(() => {
        // Las referencias son auxiliares; su fallo no rompe la vista principal.
      });
  }, []);

  useResetOnChange([actorId], () => setBoardState('loading'));
  React.useEffect(() => {
    void fetchBoard(4);
    void loadReferences();
  }, [fetchBoard, loadReferences, actorId]);

  useResetOnChange([canManage, actorId], () => {
    if (canManage) setDefState('loading');
  });
  React.useEffect(() => {
    if (canManage) void fetchActivities();
  }, [canManage, fetchActivities, actorId]);

  // --- Acciones de ocurrencias ---
  function openComplete(occurrence: RecurringOccurrence): void {
    setDetailOpen(false);
    setCompleteTarget(occurrence);
    setCompleteOpen(true);
  }

  function openDetail(occurrence: RecurringOccurrence): void {
    setDetailTarget(occurrence);
    setDetailOpen(true);
  }

  async function handleStart(occurrence: RecurringOccurrence): Promise<void> {
    setDetailOpen(false);
    if (await takeOccurrence(occurrence)) await loadBoard();
  }

  function changeCompletedWeeks(weeks: number): void {
    setCompletedWeeks(weeks);
    void fetchBoard(weeks);
  }

  function jumpTo(group: 'overdue' | 'thisWeek'): void {
    const target = document.getElementById(`grupo-${group}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }

  // --- Acciones de definiciones ---
  function openCreate(): void {
    setEditing(null);
    setDefFormError(null);
    setDefDialogOpen(true);
  }

  function openEdit(activity: RecurringActivity): void {
    setEditing(activity);
    setDefFormError(null);
    setDefDialogOpen(true);
  }

  async function handleDefSubmit(values: CreateRecurringActivity, regenerates: boolean): Promise<void> {
    setDefSubmitting(true);
    setDefFormError(null);
    try {
      if (editing) {
        await updateActivity(editing.id, values);
        toast.success(
          regenerates
            ? 'Actividad actualizada. Se regeneraron las próximas fechas.'
            : 'Actividad actualizada.',
        );
      } else {
        await createActivity(values);
        toast.success('Actividad creada.');
      }
      setDefDialogOpen(false);
      setEditing(null);
      await Promise.all([loadActivities(), loadBoard()]);
    } catch (err) {
      const message = messageOf(err);
      setDefFormError(message);
      toast.error(message);
    } finally {
      setDefSubmitting(false);
    }
  }

  async function handlePause(activity: RecurringActivity): Promise<void> {
    try {
      await pauseActivity(activity.id);
      toast.success('Actividad pausada.');
      await Promise.all([loadActivities(), loadBoard()]);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  async function handleResume(activity: RecurringActivity): Promise<void> {
    try {
      await resumeActivity(activity.id);
      toast.success('Actividad reanudada. Se programaron las próximas fechas.');
      await Promise.all([loadActivities(), loadBoard()]);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  function definitionActions(activity: RecurringActivity): RowAction[] {
    const actions: RowAction[] = [
      { key: 'edit', label: 'Editar', onSelect: () => openEdit(activity), placement: 'inline' },
    ];
    if (activity.active) {
      actions.push({ key: 'pause', label: 'Pausar', onSelect: () => setPauseTarget(activity) });
    } else {
      actions.push({
        key: 'resume',
        label: 'Reanudar',
        onSelect: () => void handleResume(activity),
        placement: 'inline',
      });
    }
    return actions;
  }

  // --- Render de «Qué me toca» ---
  const handlers = {
    onStart: (occurrence: RecurringOccurrence) => void handleStart(occurrence),
    onComplete: openComplete,
    onDetail: openDetail,
  };

  let misActividades: React.ReactNode;
  if (boardState === 'loading') {
    misActividades = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  } else if (boardState === 'error' || board === null) {
    misActividades = (
      <div className="rounded-xl bg-card shadow-card">
        <ErrorState
          title="No fue posible cargar tus actividades."
          message={boardError}
          onRetry={() => {
            setBoardState('loading');
            void loadBoard();
          }}
        />
      </div>
    );
  } else {
    const total = board.overdue.length + board.thisWeek.length + board.upcoming.length + board.completed.length;
    const nothingToDo = board.overdue.length === 0 && board.thisWeek.length === 0;
    misActividades = (
      <div className="flex flex-col gap-6">
        {refreshFailed ? (
          <InlineNotice
            tone="warning"
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => void loadBoard()}>
                Reintentar
              </Button>
            }
          >
            No se pudo actualizar. Mostrando la última carga.
          </InlineNotice>
        ) : null}
        <WeekHeader board={board} onJump={jumpTo} />
        {total === 0 ? (
          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <EmptyState
              icon={CalendarCheck}
              title="No tienes actividades recurrentes por ahora."
              description="Cuando se te asigne una, aparecerá aquí y se habilitará unos días antes de su fecha."
            />
          </div>
        ) : (
          <>
            {nothingToDo ? (
              <div className="rounded-xl bg-card shadow-card">
                <EmptyState icon={CircleCheck} size="compact" title="Estás al día esta semana." />
              </div>
            ) : null}
            <OccurrenceGroups
              board={board}
              activityTypes={activityTypes}
              completedWeeks={completedWeeks}
              onCompletedWeeksChange={changeCompletedWeeks}
              {...handlers}
            />
          </>
        )}
      </div>
    );
  }

  // --- Render de «Gestión» ---
  const newButton = (
    <Button type="button" onClick={openCreate}>
      <Plus aria-hidden="true" />
      Nueva actividad
    </Button>
  );

  let gestion: React.ReactNode;
  if (defState === 'loading') {
    gestion = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  } else if (defState === 'error') {
    gestion = (
      <div className="rounded-xl bg-card shadow-card">
        <ErrorState
          title="No fue posible cargar las definiciones."
          message={defError}
          onRetry={() => void loadActivities()}
        />
      </div>
    );
  } else {
    gestion = (
      <Section title="Definiciones" count={activities.length} actions={newButton}>
        <div className="overflow-hidden rounded-xl bg-card shadow-card">
          {activities.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No hay actividades recurrentes todavía."
              description="Crea la primera definición (por ejemplo, un reporte semanal a presidencia)."
              action={newButton}
            />
          ) : (
            <Table scrollLabel="Tabla de definiciones de actividades recurrentes">
              <TableHeader>
                <TableRow>
                  <TableHead>Actividad</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Se repite</TableHead>
                  <TableHead>Esfuerzo</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="min-w-48 font-medium">{activity.title}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {activityTypeLabel(activity.activityType, activityTypes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {cadenceText(activity.cadence, activity.intervalCount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatHours(activity.estimatedHours)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {responsibleKindLabel(activity.responsibleKind)}
                      {': '}
                      {activity.responsibleKind === 'USER'
                        ? orDash(activity.responsibleUserId ? userNameById.get(activity.responsibleUserId) : null)
                        : orDash(
                            activity.responsibleAreaId
                              ? areas.find((a) => a.id === activity.responsibleAreaId)?.name
                              : null,
                          )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDateOnly(activity.startDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusBadge kind="recurringDefinition" value={String(activity.active)} />
                    </TableCell>
                    <RowActionsCell>
                      <RowActions rowLabel={activity.title} actions={definitionActions(activity)} />
                    </RowActionsCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Section>
    );
  }

  const calendar = (
    <CalendarTab
      canManage={canManage}
      users={users}
      areas={areas}
      today={board?.today ?? localDateInputValue()}
      onOpenDetail={openDetail}
      reloadKey={reloadKey}
    />
  );

  return (
    <PageLayout>
      <PageHeader
        title="Actividades recurrentes"
        description="Lo que te toca hacer y cuándo. Las actividades programadas se habilitan unos días antes de su fecha."
        actions={
          <Button type="button" variant="outline" onClick={() => void loadBoard()}>
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
        }
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">Qué me toca</TabsTrigger>
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
          {canManage ? <TabsTrigger value="manage">Gestión</TabsTrigger> : null}
          {canManage ? <TabsTrigger value="compliance">Cumplimiento</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="mine">{misActividades}</TabsContent>
        <TabsContent value="calendar">{calendar}</TabsContent>
        {canManage ? <TabsContent value="manage">{gestion}</TabsContent> : null}
        {canManage ? (
          <TabsContent value="compliance">
            <CompliancePanel users={users} areas={areas} />
          </TabsContent>
        ) : null}
      </Tabs>

      <CompleteOccurrenceDialog
        open={completeOpen}
        onOpenChange={(open) => {
          setCompleteOpen(open);
          if (!open) setCompleteTarget(null);
        }}
        occurrence={completeTarget}
        onCompleted={() => loadBoard()}
      />

      <OccurrenceDetailDialog
        key={detailTarget?.id ?? 'none'}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailTarget(null);
        }}
        occurrence={detailTarget}
        activityTypes={activityTypes}
        onStart={handlers.onStart}
        onComplete={openComplete}
      />

      {canManage ? (
        <DefinitionFormDialog
          open={defDialogOpen}
          onOpenChange={(open) => {
            setDefDialogOpen(open);
            if (!open) {
              setEditing(null);
              setDefFormError(null);
            }
          }}
          editing={editing}
          submitting={defSubmitting}
          errorMessage={defFormError}
          activityTypes={activityTypes}
          users={users}
          areas={areas}
          onSubmit={(values, regenerates) => void handleDefSubmit(values, regenerates)}
        />
      ) : null}

      <ConfirmDialog
        open={pauseTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPauseTarget(null);
        }}
        title={pauseTarget ? `¿Pausar «${pauseTarget.title}»?` : '¿Pausar la actividad?'}
        description="No se programan nuevas fechas y se cancelan las pendientes que aún no empiezan. Podrás reanudarla cuando quieras."
        confirmLabel="Pausar actividad"
        tone="default"
        onConfirm={() => (pauseTarget ? handlePause(pauseTarget) : undefined)}
      />
    </PageLayout>
  );
}
