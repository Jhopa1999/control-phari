'use client';

import * as React from 'react';
import Link from 'next/link';
import { FolderTree, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { AreaFormDialog, type AreaFormValues } from './area-form-dialog';

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';

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
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Area | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

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
        setLoadError(err instanceof Error ? err.message : null);
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
    setDialogOpen(true);
  }

  function openEdit(area: Area): void {
    setEditing(area);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(values: AreaFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
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
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function rowActions(area: Area): RowAction[] {
    return [{ key: 'edit', label: 'Editar', onSelect: () => openEdit(area), placement: 'inline' }];
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
        <InlineNotice
          tone="neutral"
          title="Esta pantalla no está disponible para tu rol."
          action={
            allowedModules.has('permissions') ? (
              <Link
                href="/gobierno/mis-permisos"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Ir a Mis permisos
              </Link>
            ) : undefined
          }
        >
          <p className="text-muted-foreground">
            Gestionar áreas corresponde a los roles de administrador y líder de área.
          </p>
        </InlineNotice>
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
          message={loadError}
          onRetry={() => void load()}
        />
      </div>
    );
  } else {
    content = (
      <Section title="Áreas" count={areas.length}>
        <div className="overflow-hidden rounded-lg border bg-card">
          {areas.length === 0 ? (
            <EmptyState
              icon={FolderTree}
              title="No hay áreas todavía."
              description="Crea la primera área organizativa (por ejemplo, Analítica)."
              action={newButton}
            />
          ) : (
            <Table scrollLabel="Tabla de áreas">
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Orden</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="whitespace-nowrap font-medium">{area.code}</TableCell>
                    <TableCell className="min-w-40">{area.name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusBadge kind="active" value={String(area.active)} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{area.sortOrder}</TableCell>
                    <RowActionsCell>
                      <RowActions rowLabel={area.name} actions={rowActions(area)} />
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
          }
        }}
        editing={editing}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </PageLayout>
  );
}
