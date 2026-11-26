'use client';

import * as React from 'react';
import { FolderTree, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DataCardList } from '@/components/data-card-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
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
import type { Area } from '@/lib/api-client';
import { ApiError, createArea, listAreas, updateArea } from '@/lib/areas';
import { splitServerCodeErrors } from '@/lib/code-format';
import { areaDeactivationBlockReason } from './area-blocking';
import { AreaFormDialog, type AreaFormValues } from './area-form-dialog';

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';

/** «1 proceso activo», «3 procesos activos», «0 solicitantes». */
function countLabel(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Áreas organizativas (ADMIN y JEFE_AREA): lista, crea y edita areas como Analitica,
 * que agrupan procesos. Gating cosmetico via allowedModules.has('areas'); el
 * control real lo aplica el backend (@Roles(ADMIN, JEFE_AREA)). Solo consume el cliente
 * tipado del contrato OpenAPI (no toca Prisma ni la BD).
 */
export function AreasView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();
  const permissionsLoaded = permissions !== null;
  const areasAllowed = allowedModules.has('areas');

  const [areas, setAreas] = React.useState<Area[]>([]);
  const [loadedState, setState] = React.useState<LoadState>('loading');
  const state: LoadState = permissionsLoaded && !areasAllowed ? 'forbidden' : loadedState;
  const [loadError, setLoadError] = React.useState<unknown>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Area | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [codeServerError, setCodeServerError] = React.useState<string | null>(null);
  /** 409 al desactivar desde la fila (el recuento cambió tras cargar la lista). */
  const [rowNotice, setRowNotice] = React.useState<string | null>(null);

  const loadData = React.useCallback(() => {
    return listAreas()
      .then((data) => {
        setAreas(data);
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
    if (!areasAllowed) return;
    void loadData();
  }, [permissionsLoaded, areasAllowed, loadData]);

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    setCodeServerError(null);
    setDialogOpen(true);
  }

  function openEdit(area: Area): void {
    setEditing(area);
    setFormError(null);
    setCodeServerError(null);
    setDialogOpen(true);
  }

  async function handleDeactivate(area: Area): Promise<void> {
    setRowNotice(null);
    try {
      await updateArea(area.id, { active: false });
      toast.success('Área desactivada.');
      await load(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRowNotice(err.message);
      } else {
        toast.error(messageOf(err));
      }
    }
  }

  async function handleSubmit(values: AreaFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    setCodeServerError(null);
    try {
      if (editing) {
        // El code es estable: al editar solo se envian nombre, activo y orden.
        await updateArea(editing.id, {
          name: values.name,
          active: values.active,
          sortOrder: values.sortOrder,
        });
        toast.success('Área actualizada.');
      } else {
        await createArea({
          code: values.code,
          name: values.name,
          sortOrder: values.sortOrder,
        });
        toast.success('Área creada.');
      }
      setDialogOpen(false);
      setEditing(null);
      await load(true);
    } catch (err) {
      const message = messageOf(err);
      if (!editing && err instanceof ApiError && err.status === 409) {
        // Alta: el único campo único es el código; el texto es el del servidor.
        setCodeServerError(message);
      } else if (!editing && err instanceof ApiError && err.status === 400 && err.messages) {
        // Mensajes de formato que coinciden con una constante marcan el campo;
        // el resto va al aviso del diálogo.
        const split = splitServerCodeErrors(err.messages);
        setCodeServerError(split.code);
        const rest = split.catalog ? [...split.rest, split.catalog] : split.rest;
        setFormError(rest.length > 0 ? rest.join(' ') : null);
        if (!split.code && rest.length > 0) toast.error(message);
      } else {
        setFormError(message);
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function rowActions(area: Area): RowAction[] {
    const actions: RowAction[] = [
      { key: 'edit', label: 'Editar', onSelect: () => openEdit(area), placement: 'inline' },
    ];
    if (area.active) {
      const reason = areaDeactivationBlockReason(area);
      actions.push({
        key: 'deactivate',
        label: 'Desactivar',
        onSelect: () => void handleDeactivate(area),
        placement: 'inline',
        ...(reason ? { disabled: true, disabledReason: reason } : {}),
      });
    }
    return actions;
  }

  const newButton = (
    <Button type="button" onClick={openCreate}>
      <Plus aria-hidden="true" />
      Nueva área
    </Button>
  );

  if (state === 'forbidden') {
    return (
      <PageLayout>
        <PageHeader
          title="Áreas"
          description="Áreas organizativas que agrupan procesos."
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
          title="No fue posible cargar las áreas."
          error={loadError}
          onRetry={() => void load()}
        />
      </div>
    );
  } else {
    content = (
      <Section title="Áreas" count={areas.length}>
        {rowNotice ? (
          <InlineNotice
            tone="warning"
            role="alert"
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRowNotice(null);
                  void load(true);
                }}
              >
                Actualizar
              </Button>
            }
          >
            {rowNotice}
          </InlineNotice>
        ) : null}
        <div className="overflow-hidden rounded-lg border bg-card">
          {areas.length === 0 ? (
            <EmptyState
              icon={FolderTree}
              title="No hay áreas todavía."
              description="Crea la primera área organizativa (por ejemplo, Analítica)."
              action={newButton}
            />
          ) : (
            <>
            <div className="hidden md:block">
            <Table density="compact" scrollLabel="Tabla de áreas">
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden text-right @4xl:table-cell">Procesos activos</TableHead>
                  <TableHead className="hidden text-right @4xl:table-cell">Solicitantes</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden text-right @[1100px]:table-cell">Orden</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="whitespace-nowrap font-medium">{area.code}</TableCell>
                    <TableCell className="min-w-40">{area.name}</TableCell>
                    <TableCell className="hidden text-right tabular-nums @4xl:table-cell">{area.processCount}</TableCell>
                    <TableCell className="hidden text-right tabular-nums @4xl:table-cell">{area.requesterCount}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusBadge kind="active" value={String(area.active)} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums @[1100px]:table-cell">{area.sortOrder}</TableCell>
                    <RowActionsCell>
                      <RowActions rowLabel={area.name} actions={rowActions(area)} />
                    </RowActionsCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            <DataCardList
              label="Áreas"
              rows={areas}
              getKey={(area) => area.id}
              card={(area) => ({
                title: <span className="font-medium">{area.name}</span>,
                subtitle: <span className="font-mono break-all">{area.code}</span>,
                badges: [<StatusBadge key="estado" kind="active" value={String(area.active)} />],
                note: (
                  <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                    <span>{countLabel(area.processCount, 'proceso activo', 'procesos activos')}</span>
                    <span aria-hidden="true">·</span>
                    <span>{countLabel(area.requesterCount, 'solicitante', 'solicitantes')}</span>
                  </p>
                ),
                meta: [{ label: 'Orden', value: area.sortOrder }],
                actions: <RowActions rowLabel={area.name} actions={rowActions(area)} menuOnly />,
              })}
            />
            </>
          )}
        </div>
      </Section>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Áreas"
        description="Áreas organizativas que agrupan procesos."
        actions={state === 'success' ? newButton : undefined}
      />
      {content}

      <AreaFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setFormError(null);
            setCodeServerError(null);
          }
        }}
        editing={editing}
        submitting={submitting}
        errorMessage={formError}
        codeServerError={codeServerError}
        onCodeEdited={() => setCodeServerError(null)}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </PageLayout>
  );
}
