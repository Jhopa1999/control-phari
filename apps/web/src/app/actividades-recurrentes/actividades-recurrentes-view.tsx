'use client';

import * as React from 'react';
import { CalendarClock, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
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
  RecurringOccurrence,
  User,
} from '@/lib/api-client';
import { listAreas } from '@/lib/areas';
import { listCatalogItems } from '@/lib/catalog';
import { formatDateOnly, orDash } from '@/lib/format';
import {
  ApiError,
  completeOccurrence,
  createActivity,
  listActivities,
  listOccurrences,
  pauseActivity,
  startOccurrence,
  updateActivity,
} from '@/lib/recurring-activities';
import { recurrenceLabel, responsibleKindLabel } from '@/lib/status-labels';
import { listUsers } from '@/lib/team';
import { CompleteOccurrenceDialog } from './complete-occurrence-dialog';
import { DefinitionFormDialog } from './definition-form-dialog';
import { OccurrenceDetailDialog } from './occurrence-detail-dialog';

type LoadState = 'loading' | 'success' | 'error';

const ACTIVITY_TYPE_CATALOG = 'RECURRING_ACTIVITY_TYPE';

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
}

/** Agrupa ocurrencias por su etiqueta de periodo (periodLabel), conservando el orden. */
function groupByPeriod(
  rows: RecurringOccurrence[],
): Array<{ period: string; items: RecurringOccurrence[] }> {
  const groups: Array<{ period: string; items: RecurringOccurrence[] }> = [];
  const index = new Map<string, number>();
  for (const row of rows) {
    const key = row.periodLabel ?? 'Sin periodo';
    let pos = index.get(key);
    if (pos === undefined) {
      pos = groups.length;
      index.set(key, pos);
      groups.push({ period: key, items: [] });
    }
    groups[pos].items.push(row);
  }
  return groups;
}

/**
 * Sección de Actividades recurrentes (FEAT-002). Dos vistas en pestañas:
 * «Qué me toca» (ocurrencias del actor, scope=mine) y «Gestión» (definiciones,
 * solo para jefe de área o admin; el backend es la autoridad del alcance). Solo
 * consume el cliente tipado del contrato OpenAPI: no toca Prisma ni la BD y no
 * duplica reglas de negocio.
 */
export function ActividadesRecurrentesView(): React.ReactElement {
  const { actorId, permissions } = useActor();
  const roleCodes = React.useMemo(
    () => new Set(permissions?.roleCodes ?? []),
    [permissions],
  );
  const canManage = roleCodes.has('JEFE_AREA') || roleCodes.has('ADMIN');

  // --- Qué me toca ---
  const [occurrences, setOccurrences] = React.useState<RecurringOccurrence[]>([]);
  const [occState, setOccState] = React.useState<LoadState>('loading');
  const [occError, setOccError] = React.useState<string | null>(null);

  // --- Gestión ---
  const [activities, setActivities] = React.useState<RecurringActivity[]>([]);
  const [defState, setDefState] = React.useState<LoadState>('loading');
  const [defError, setDefError] = React.useState<string | null>(null);

  // --- Catálogos para el formulario y para resolver nombres ---
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
  const [completeSubmitting, setCompleteSubmitting] = React.useState(false);
  const [completeError, setCompleteError] = React.useState<string | null>(null);

  const [detailTarget, setDetailTarget] = React.useState<RecurringOccurrence | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const [defDialogOpen, setDefDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RecurringActivity | null>(null);
  const [defSubmitting, setDefSubmitting] = React.useState(false);
  const [defFormError, setDefFormError] = React.useState<string | null>(null);

  const loadOccurrences = React.useCallback(async () => {
    setOccState('loading');
    try {
      const page = await listOccurrences({ scope: 'mine', pageSize: 100 });
      setOccurrences(page.data);
      setOccState('success');
    } catch (err) {
      setOccError(messageOf(err));
      setOccState('error');
    }
  }, []);

  const loadActivities = React.useCallback(async () => {
    setDefState('loading');
    try {
      const data = await listActivities();
      setActivities(data);
      setDefState('success');
    } catch (err) {
      setDefError(messageOf(err));
      setDefState('error');
    }
  }, []);

  const loadReferences = React.useCallback(async () => {
    try {
      const [types, userList, areaList] = await Promise.all([
        listCatalogItems({ catalog: ACTIVITY_TYPE_CATALOG, active: true }),
        listUsers(),
        listAreas({ active: true }),
      ]);
      setActivityTypes(types);
      setUsers(userList);
      setAreas(areaList);
    } catch {
      // Las referencias son auxiliares; su fallo no rompe la vista principal.
    }
  }, []);

  React.useEffect(() => {
    void loadOccurrences();
    void loadReferences();
  }, [loadOccurrences, loadReferences, actorId]);

  React.useEffect(() => {
    if (canManage) void loadActivities();
  }, [canManage, loadActivities, actorId]);

  // --- Acciones de ocurrencias ---
  function openComplete(occurrence: RecurringOccurrence): void {
    setCompleteTarget(occurrence);
    setCompleteError(null);
    setCompleteOpen(true);
  }

  function openDetail(occurrence: RecurringOccurrence): void {
    setDetailTarget(occurrence);
    setDetailOpen(true);
  }

  async function handleComplete(comment: string): Promise<void> {
    if (!completeTarget) return;
    setCompleteSubmitting(true);
    setCompleteError(null);
    try {
      await completeOccurrence(completeTarget.id, comment !== '' ? { comment } : {});
      toast.success('Actividad completada.');
      setCompleteOpen(false);
      setCompleteTarget(null);
      await loadOccurrences();
    } catch (err) {
      const message = messageOf(err);
      setCompleteError(message);
      toast.error(message);
    } finally {
      setCompleteSubmitting(false);
    }
  }

  async function handleStart(occurrence: RecurringOccurrence): Promise<void> {
    try {
      await startOccurrence(occurrence.id);
      toast.success('Actividad tomada.');
      await loadOccurrences();
    } catch (err) {
      toast.error(messageOf(err));
    }
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

  async function handleDefSubmit(values: CreateRecurringActivity): Promise<void> {
    setDefSubmitting(true);
    setDefFormError(null);
    try {
      if (editing) {
        await updateActivity(editing.id, values);
        toast.success('Actividad actualizada.');
      } else {
        await createActivity(values);
        toast.success('Actividad creada.');
      }
      setDefDialogOpen(false);
      setEditing(null);
      await Promise.all([loadActivities(), loadOccurrences()]);
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
      await loadActivities();
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  function occurrenceActions(occurrence: RecurringOccurrence): RowAction[] {
    if (occurrence.status === 'COMPLETADA') {
      return [
        { key: 'detail', label: 'Ver detalle', onSelect: () => openDetail(occurrence), placement: 'inline' },
      ];
    }
    const actions: RowAction[] = [
      { key: 'complete', label: 'Completar', onSelect: () => openComplete(occurrence), placement: 'inline' },
    ];
    if (occurrence.status === 'PENDIENTE') {
      actions.push({ key: 'start', label: 'Tomar', onSelect: () => void handleStart(occurrence) });
    }
    return actions;
  }

  function definitionActions(activity: RecurringActivity): RowAction[] {
    const actions: RowAction[] = [
      { key: 'edit', label: 'Editar', onSelect: () => openEdit(activity), placement: 'inline' },
    ];
    if (activity.active) {
      actions.push({ key: 'pause', label: 'Pausar', onSelect: () => void handlePause(activity) });
    }
    return actions;
  }

  // --- Render de «Qué me toca» ---
  let misActividades: React.ReactNode;
  if (occState === 'loading') {
    misActividades = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  } else if (occState === 'error') {
    misActividades = (
      <div className="rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar tus actividades."
          message={occError}
          onRetry={() => void loadOccurrences()}
        />
      </div>
    );
  } else if (occurrences.length === 0) {
    misActividades = (
      <div className="overflow-hidden rounded-lg border bg-card">
        <EmptyState
          icon={CalendarClock}
          title="No tienes actividades recurrentes pendientes."
          description="Cuando se te asigne una actividad recurrente, aparecerá aquí agrupada por periodo."
        />
      </div>
    );
  } else {
    misActividades = (
      <div className="flex flex-col gap-6">
        {groupByPeriod(occurrences).map((group) => (
          <Section key={group.period} title={group.period} count={group.items.length}>
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table scrollLabel={`Actividades del periodo ${group.period}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Actividad</TableHead>
                    <TableHead>Cadencia</TableHead>
                    <TableHead>Fecha objetivo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((occurrence) => (
                    <TableRow key={occurrence.id}>
                      <TableCell className="min-w-48 font-medium">{occurrence.activityTitle}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {recurrenceLabel(occurrence.cadence)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatDateOnly(occurrence.targetDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge kind="occurrence" value={occurrence.status} />
                      </TableCell>
                      <RowActionsCell>
                        <RowActions
                          rowLabel={occurrence.activityTitle}
                          actions={occurrenceActions(occurrence)}
                        />
                      </RowActionsCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        ))}
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
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  } else if (defState === 'error') {
    gestion = (
      <div className="rounded-lg border bg-card">
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
        <div className="overflow-hidden rounded-lg border bg-card">
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
                  <TableHead>Cadencia</TableHead>
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
                      {activity.activityType}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {recurrenceLabel(activity.cadence)}
                      {activity.intervalCount > 1 ? ` ×${activity.intervalCount}` : ''}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {responsibleKindLabel(activity.responsibleKind)}
                      {': '}
                      {activity.responsibleKind === 'USER'
                        ? orDash(
                            activity.responsibleUserId
                              ? userNameById.get(activity.responsibleUserId)
                              : null,
                          )
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
                      <StatusBadge kind="active" value={String(activity.active)} />
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

  return (
    <PageLayout>
      <PageHeader
        title="Actividades recurrentes"
        description="Tareas que se repiten (reportes, validaciones, revisiones). Revisa qué te toca y márcalas como completadas."
        actions={
          <Button type="button" variant="outline" onClick={() => void loadOccurrences()}>
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
        }
      />

      {canManage ? (
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine">Qué me toca</TabsTrigger>
            <TabsTrigger value="manage">Gestión</TabsTrigger>
          </TabsList>
          <TabsContent value="mine">{misActividades}</TabsContent>
          <TabsContent value="manage">{gestion}</TabsContent>
        </Tabs>
      ) : (
        misActividades
      )}

      <CompleteOccurrenceDialog
        open={completeOpen}
        onOpenChange={(open) => {
          setCompleteOpen(open);
          if (!open) {
            setCompleteTarget(null);
            setCompleteError(null);
          }
        }}
        occurrence={completeTarget}
        submitting={completeSubmitting}
        errorMessage={completeError}
        onSubmit={(comment) => void handleComplete(comment)}
      />

      <OccurrenceDetailDialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailTarget(null);
        }}
        occurrence={detailTarget}
        userNameById={userNameById}
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
          onSubmit={(values) => void handleDefSubmit(values)}
        />
      ) : null}
    </PageLayout>
  );
}
