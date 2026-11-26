'use client';

import * as React from 'react';
import { Plus, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { DataTablePagination } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { NoAccessNotice, NO_ACCESS_COPY } from '@/components/no-access-notice';
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
import { useActor } from '@/lib/actor-context';
import { compareText, type Comparator } from '@/lib/table-sort';
import { useClientTable } from '@/lib/use-client-table';
import type { Area, Requester } from '@/lib/api-client';
import { listAreas } from '@/lib/areas';
import {
  ApiError,
  createRequester,
  listRequesters,
  updateRequester,
} from '@/lib/requesters';
import {
  RequesterFormDialog,
  isDuplicateRequesterMessage,
  type RequesterFormValues,
} from './requester-form-dialog';

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';

const NOUN = { one: 'solicitante', other: 'solicitantes' };
// Sin orden elegido: se conserva el de la API; el comparador habilita la paginación.
const COMPARATORS: Record<'name', Comparator<Requester>> = {
  name: (a, b, d) => compareText(a.name, b.name, d),
};

/** Tabla de solicitantes de una línea por fila, con paginación en cliente. */
function RequestersTable({
  requesters,
  rowActions,
}: {
  requesters: readonly Requester[];
  rowActions: (requester: Requester) => RowAction[];
}): React.ReactElement {
  const table = useClientTable({
    rows: requesters,
    comparators: COMPARATORS,
    defaultSort: null,
    pageSize: 25,
  });
  return (
    <>
      <Table density="compact" scrollLabel="Tabla de solicitantes">
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead className="hidden @4xl:table-cell">Área</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.pageRows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="min-w-40 font-medium">{r.name}</TableCell>
              <TableCell className="hidden @4xl:table-cell min-w-40">{r.areaName}</TableCell>
              <TableCell className="whitespace-nowrap">
                <StatusBadge kind="active" value={String(r.active)} />
              </TableCell>
              <RowActionsCell>
                <RowActions rowLabel={r.name} actions={rowActions(r)} />
              </RowActionsCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <DataTablePagination
        id="sq-paginacion"
        page={table.page}
        pageCount={table.pageCount}
        from={table.from}
        to={table.to}
        filtered={table.filtered}
        pageSize={table.pageSize ?? 25}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        noun={NOUN}
      />
    </>
  );
}

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Maestro de solicitantes (Administración): lista, crea, edita y activa o
 * inactiva solicitantes, cada uno asociado a un área del maestro de áreas.
 * Gating cosmético por allowedModules.has('requesters'); el backend es la
 * autoridad.
 */
export function RequestersView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();
  const permissionsLoaded = permissions !== null;
  const allowed = allowedModules.has('requesters');

  const [requesters, setRequesters] = React.useState<Requester[]>([]);
  const [areas, setAreas] = React.useState<Area[]>([]);
  const [loadedState, setState] = React.useState<LoadState>('loading');
  const state: LoadState = permissionsLoaded && !allowed ? 'forbidden' : loadedState;
  const [loadError, setLoadError] = React.useState<unknown>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Requester | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const loadData = React.useCallback(() => {
    return Promise.all([
      listRequesters(),
      listAreas({ active: true }),
    ])
      .then(([list, activeAreas]) => {
        setRequesters(list);
        setAreas(activeAreas);
        setState('success');
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden');
          return;
        }
        setLoadError(err);
        setState('error');
      });
  }, []);
  const load = React.useCallback(async (silent = false) => {
    if (!silent) setState('loading');
    await loadData();
  }, [loadData]);

  React.useEffect(() => {
    if (!permissionsLoaded) return;
    if (!allowed) return;
    void loadData();
  }, [permissionsLoaded, allowed, loadData]);

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(requester: Requester): void {
    setEditing(requester);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(values: RequesterFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateRequester(editing.id, { name: values.name, areaId: values.areaId });
        toast.success('Solicitante actualizado.');
      } else {
        await createRequester({ name: values.name, areaId: values.areaId });
        toast.success('Solicitante creado.');
      }
      setDialogOpen(false);
      setEditing(null);
      await load(true);
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      // El duplicado se muestra junto al campo Nombre; el toast sobraría.
      if (!isDuplicateRequesterMessage(message)) toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(requester: Requester): Promise<void> {
    try {
      await updateRequester(requester.id, { active: !requester.active });
      toast.success(requester.active ? 'Solicitante inactivado.' : 'Solicitante activado.');
      await load(true);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  function rowActions(requester: Requester): RowAction[] {
    return [
      { key: 'edit', label: 'Editar', onSelect: () => openEdit(requester), placement: 'inline' },
      {
        key: 'toggle',
        label: requester.active ? 'Inactivar' : 'Activar',
        onSelect: () => void toggleActive(requester),
      },
    ];
  }

  const newButton = (
    <Button type="button" onClick={openCreate}>
      <Plus aria-hidden="true" />
      Nuevo solicitante
    </Button>
  );

  if (state === 'forbidden') {
    return (
      <PageLayout>
        <PageHeader
          title="Solicitantes"
          description="Personas que registran solicitudes, asociadas a su área."
        />
        <NoAccessNotice {...NO_ACCESS_COPY.adminOrBoss} />
      </PageLayout>
    );
  }

  let content: React.ReactNode;
  if (state === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  } else if (state === 'error') {
    content = (
      <div className="rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar los solicitantes."
          error={loadError}
          onRetry={() => void load()}
        />
      </div>
    );
  } else {
    content = (
      <Section title="Solicitantes" count={requesters.length}>
        <div className="overflow-hidden rounded-lg border bg-card">
          {requesters.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="No hay solicitantes todavía."
              description="Crea el primer solicitante y asócialo a un área."
              action={newButton}
            />
          ) : (
            <RequestersTable requesters={requesters} rowActions={rowActions} />
          )}
        </div>
      </Section>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Solicitantes"
        description="Personas que registran solicitudes, asociadas a su área."
        actions={state === 'success' ? newButton : undefined}
      />
      {content}

      <RequesterFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setFormError(null);
          }
        }}
        editing={editing}
        areas={areas}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </PageLayout>
  );
}
