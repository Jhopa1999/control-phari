'use client';

import * as React from 'react';
import { AlertTriangle, FolderKanban, Plus } from 'lucide-react';
import { toast } from 'sonner';
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
import type { Area, CreateProcess, Process, UpdateProcess } from '@/lib/api-client';
import { listAreas } from '@/lib/areas';
import { ApiError, createProcess, listProcesses, updateProcess } from '@/lib/procesos';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DialogBody } from '@/components/ui/dialog';
import { splitServerCodeErrors } from '@/lib/code-format';
import {
  impactFromError,
  impactLines,
  type DeactivationImpact,
} from './deactivation-impact';
import { ProcesoFormDialog, type ProcessFormValues } from './proceso-form-dialog';

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';

/** Procesos agrupados por area, con el nombre del area ya resuelto. */
interface AreaGroup {
  areaId: string;
  areaLabel: string;
  processes: Process[];
}

/** Texto del 409 al crear: el único campo único del alta es el código. */
const DUPLICATE_PROCESS_CODE = 'Ya existe un proceso con ese código.';

interface PendingDeactivation {
  process: Process;
  body: UpdateProcess;
  impact: DeactivationImpact;
  /** Venía del diálogo de edición (su error va en su FormError). */
  fromDialog: boolean;
}

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Procesos (ADMIN y JEFE_AREA): lista procesos agrupados por area (nombres
 * cruzados con GET /areas), crea procesos con un selector de area OBLIGATORIO
 * de areas activas y edita procesos sin moverlos de area. Gating cosmetico via
 * allowedModules.has('processesAdmin'); el backend es la autoridad. Solo
 * consume el cliente tipado del contrato OpenAPI (no toca Prisma ni la BD).
 */
export function ProcesosView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();
  const permissionsLoaded = permissions !== null;
  const processesAllowed = allowedModules.has('processesAdmin');

  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [areas, setAreas] = React.useState<Area[]>([]);
  const [activeAreas, setActiveAreas] = React.useState<Area[]>([]);
  const [loadedState, setState] = React.useState<LoadState>('loading');
  const state: LoadState = permissionsLoaded && !processesAllowed ? 'forbidden' : loadedState;
  const [loadError, setLoadError] = React.useState<unknown>(null);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Process | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [codeServerError, setCodeServerError] = React.useState<string | null>(null);
  /** Desactivación pendiente de confirmar, con los recuentos que dio la API. */
  const [pending, setPending] = React.useState<PendingDeactivation | null>(null);

  const loadData = React.useCallback(() => {
    // Procesos del alcance + areas (todas, para resolver nombres) + areas
    // activas (para el selector obligatorio al crear).
    return Promise.all([
      listProcesses(),
      listAreas(),
      listAreas({ active: true }),
    ])
      .then(([p, all, active]) => {
        setProcesses(p);
        setAreas(all);
        setActiveAreas(active);
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
    if (!processesAllowed) return;
    void loadData();
  }, [permissionsLoaded, processesAllowed, loadData]);

  const areaLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const area of areas) {
      map.set(area.id, `${area.name} (${area.code})`);
    }
    return map;
  }, [areas]);

  // Agrupa los procesos por area en cliente; los grupos se ordenan por la
  // etiqueta del area y los procesos por sortOrder y luego por nombre.
  const groups = React.useMemo<AreaGroup[]>(() => {
    const byArea = new Map<string, Process[]>();
    for (const process of processes) {
      const list = byArea.get(process.areaId);
      if (list) list.push(process);
      else byArea.set(process.areaId, [process]);
    }
    const result: AreaGroup[] = [];
    for (const [areaId, list] of byArea) {
      result.push({
        areaId,
        areaLabel: areaLabelById.get(areaId) ?? 'Área fuera de tu alcance',
        processes: [...list].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        ),
      });
    }
    return result.sort((a, b) => a.areaLabel.localeCompare(b.areaLabel));
  }, [processes, areaLabelById]);

  function openCreate(): void {
    setEditing(null);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(process: Process): void {
    setEditing(process);
    setFormError(null);
    setDialogOpen(true);
  }

  /** Desactivación desde la fila: se envía sin confirmar; el 409 abre el diálogo. */
  async function handleRowDeactivate(process: Process): Promise<void> {
    try {
      await updateProcess(process.id, { active: false });
      toast.success('Proceso desactivado.');
      await load(true);
    } catch (err) {
      const impact = impactFromError(err);
      if (impact) {
        setPending({ process, body: { active: false }, impact, fromDialog: false });
        return;
      }
      toast.error(messageOf(err));
    }
  }

  /** «Desactivar proceso» en el diálogo de confirmación: reenvía con confirmación. */
  async function confirmDeactivation(): Promise<void> {
    if (!pending) return;
    const { process, body, fromDialog } = pending;
    try {
      await updateProcess(process.id, { ...body, confirmDeactivation: true });
      toast.success('Proceso desactivado.');
      if (fromDialog) {
        setDialogOpen(false);
        setEditing(null);
      }
      await load(true);
    } catch (err) {
      const message = messageOf(err);
      if (fromDialog) setFormError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  async function handleSubmit(values: ProcessFormValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    setCodeServerError(null);
    try {
      if (editing) {
        // El code, el kind y el area son estables: al editar solo se envian
        // nombre, marco (si lo hay), activo y orden. Un marco vacio no se envia
        // (el backend rechaza cadenas vacias).
        const body: UpdateProcess = {
          name: values.name,
          active: values.active,
          sortOrder: values.sortOrder,
        };
        if (values.framework !== '') body.framework = values.framework;
        try {
          await updateProcess(editing.id, body);
        } catch (err) {
          const impact = impactFromError(err);
          if (impact) {
            // Trabajo en curso: se pide confirmación sin cerrar el formulario.
            setPending({ process: editing, body, impact, fromDialog: true });
            return;
          }
          throw err;
        }
        toast.success('Proceso actualizado.');
      } else {
        const body: CreateProcess = {
          code: values.code,
          name: values.name,
          areaId: values.areaId,
          // Esta pantalla crea procesos de negocio; la coordinacion (FMAA) no se
          // gestiona aqui. El contrato exige `kind`, asi que se fija a PROCESS.
          kind: 'PROCESS',
          sortOrder: values.sortOrder,
        };
        if (values.framework !== '') body.framework = values.framework;
        await createProcess(body);
        toast.success('Proceso creado.');
      }
      setDialogOpen(false);
      setEditing(null);
      await load(true);
    } catch (err) {
      const message = messageOf(err);
      if (!editing && err instanceof ApiError && err.status === 409) {
        // Alta: el único campo único es el código.
        setCodeServerError(DUPLICATE_PROCESS_CODE);
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

  function rowActions(process: Process): RowAction[] {
    const actions: RowAction[] = [
      { key: 'edit', label: 'Editar', onSelect: () => openEdit(process), placement: 'inline' },
    ];
    if (process.active) {
      actions.push({
        key: 'deactivate',
        label: 'Desactivar',
        onSelect: () => void handleRowDeactivate(process),
        placement: 'inline',
      });
    }
    return actions;
  }

  // Crear requiere al menos un area activa donde ubicar el proceso.
  const canCreate = activeAreas.length > 0;

  const newButton = canCreate ? (
    <Button type="button" onClick={openCreate}>
      <Plus aria-hidden="true" />
      Nuevo proceso
    </Button>
  ) : null;

  if (state === 'forbidden') {
    return (
      <PageLayout>
        <PageHeader
          title="Procesos"
          description="Procesos de cada área (por ejemplo, BI, Integraciones, IA)."
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
          title="No fue posible cargar los procesos."
          error={loadError}
          onRetry={() => void load()}
        />
      </div>
    );
  } else if (processes.length === 0) {
    content = (
      <div className="overflow-hidden rounded-lg border bg-card">
        <EmptyState
          icon={FolderKanban}
          title="No hay procesos todavía."
          description={
            canCreate
              ? 'Crea el primer proceso dentro de un área (por ejemplo, BI).'
              : 'Primero crea un área activa; los procesos se ubican dentro de un área.'
          }
          action={newButton}
        />
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col gap-6">
        {!canCreate ? (
          <InlineNotice tone="info" title="No hay áreas activas para ubicar nuevos procesos.">
            <p className="text-muted-foreground">
              Activa o crea un área para poder registrar más procesos.
            </p>
          </InlineNotice>
        ) : null}
        {groups.map((group) => (
          <Section key={group.areaId} title={group.areaLabel} count={group.processes.length}>
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table scrollLabel={`Tabla de procesos de ${group.areaLabel}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Marco</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Orden</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.processes.map((process) => (
                    <TableRow key={process.id}>
                      <TableCell className="whitespace-nowrap font-medium">{process.code}</TableCell>
                      <TableCell className="min-w-40">{process.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {process.framework ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge kind="active" value={String(process.active)} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{process.sortOrder}</TableCell>
                      <RowActionsCell>
                        <RowActions rowLabel={process.name} actions={rowActions(process)} />
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

  return (
    <PageLayout>
      <PageHeader
        title="Procesos"
        description="Procesos de cada área (por ejemplo, BI, Integraciones, IA)."
        actions={state === 'success' && processes.length > 0 ? newButton : undefined}
      />
      {content}

      <ProcesoFormDialog
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
        activeAreas={activeAreas}
        submitting={submitting}
        errorMessage={formError}
        codeServerError={codeServerError}
        onCodeEdited={() => setCodeServerError(null)}
        onSubmit={(values) => void handleSubmit(values)}
      />

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        tone="danger"
        title={`¿Desactivar el proceso «${pending?.process.name ?? ''}»?`}
        description="Este proceso todavía tiene trabajo en curso. Revisa el impacto antes de continuar."
        confirmLabel="Desactivar proceso"
        onConfirm={confirmDeactivation}
      >
        {pending ? (
          <DialogBody>
            <div className="flex gap-2 rounded-lg border border-warning-border bg-warning-subtle p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <ul className="grid gap-1 text-sm text-foreground">
                {impactLines(pending.impact).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </DialogBody>
        ) : null}
      </ConfirmDialog>
    </PageLayout>
  );
}
