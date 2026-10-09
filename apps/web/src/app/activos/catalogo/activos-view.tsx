'use client';

import * as React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  Asset,
  AssetStatus,
  CatalogItem,
  CoordinationPerson,
  Process,
  Request,
} from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import {
  AssetError,
  changeAssetStatus,
  createAsset,
  listAssets,
  updateAsset,
} from '@/lib/assets';
import { listCatalogItems } from '@/lib/catalog';
import { listProcesses } from '@/lib/team';
import { listCoordinationPeople } from '@/lib/worklog';
import { listRequests } from '@/lib/requests';
import { ActivoFormDialog, type ActivoFormValues } from './activo-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

/** Valor del Select de filtro que representa "todos". */
const ALL = '__all__';

function messageOf(err: unknown): string {
  return err instanceof AssetError ? err.message : 'Ocurrio un error inesperado.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Variante visual del badge de estado. */
function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ACTIVO':
      return 'default';
    case 'RETIRADO':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function ActivosView(): React.ReactElement {
  const { permissions } = useActor();

  // Gating cosmetico (el control real es server-side): puede cambiar estado
  // el jefe de area o el lider del proceso del activo (design §6).
  const isJefe = React.useMemo(
    () => (permissions?.grants ?? []).some((g) => g.roleCode === 'JEFE_AREA'),
    [permissions],
  );
  const leaderProcessIds = React.useMemo(
    () =>
      new Set(
        (permissions?.grants ?? [])
          .filter((g) => g.roleCode === 'LIDER_PROCESO')
          .map((g) => g.processId),
      ),
    [permissions],
  );
  const canChangeStatus = React.useCallback(
    (asset: Asset) => isJefe || leaderProcessIds.has(asset.processId),
    [isJefe, leaderProcessIds],
  );

  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [owners, setOwners] = React.useState<CoordinationPerson[]>([]);
  const [typeOptions, setTypeOptions] = React.useState<CatalogItem[]>([]);
  const [technologyOptions, setTechnologyOptions] = React.useState<
    CatalogItem[]
  >([]);
  const [sourceOptions, setSourceOptions] = React.useState<CatalogItem[]>([]);
  const [frequencyOptions, setFrequencyOptions] = React.useState<
    CatalogItem[]
  >([]);
  const [state, setState] = React.useState<LoadState>('loading');

  // Filtros (client-side; el contrato no expone query params).
  const [processFilter, setProcessFilter] = React.useState<string>(ALL);
  const [requestFilter, setRequestFilter] = React.useState<string>(ALL);
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);

  // Dialogo de alta/edicion.
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Asset | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [list, procs, reqs, usrs, types, techs, sources, freqs] =
        await Promise.all([
          listAssets(),
          listProcesses().catch(() => [] as Process[]),
          listRequests().catch(() => [] as Request[]),
          listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
          listCatalogItems({ catalog: 'ASSET_TYPE', active: true }).catch(
            () => [] as CatalogItem[],
          ),
          listCatalogItems({ catalog: 'TECHNOLOGY', active: true }).catch(
            () => [] as CatalogItem[],
          ),
          listCatalogItems({ catalog: 'SOURCE', active: true }).catch(
            () => [] as CatalogItem[],
          ),
          listCatalogItems({ catalog: 'FREQUENCY', active: true }).catch(
            () => [] as CatalogItem[],
          ),
        ]);
      setAssets(list);
      setProcesses(procs);
      setRequests(reqs);
      setOwners(usrs);
      setTypeOptions(types);
      setTechnologyOptions(techs);
      setSourceOptions(sources);
      setFrequencyOptions(freqs);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );
  const requestTitle = React.useCallback(
    (id: string | null) =>
      id ? (requests.find((r) => r.id === id)?.title ?? id) : '—',
    [requests],
  );
  const ownerName = React.useCallback(
    (id: string | null) =>
      id ? (owners.find((u) => u.id === id)?.name ?? id) : '—',
    [owners],
  );
  const typeLabel = React.useCallback(
    (code: string | null) =>
      code ? (typeOptions.find((o) => o.code === code)?.label ?? code) : '—',
    [typeOptions],
  );

  const filtered = React.useMemo(
    () =>
      assets.filter((a) => {
        if (processFilter !== ALL && a.processId !== processFilter) return false;
        if (requestFilter !== ALL && a.requestId !== requestFilter) return false;
        if (statusFilter !== ALL && a.status !== statusFilter) return false;
        return true;
      }),
    [assets, processFilter, requestFilter, statusFilter],
  );

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setOpen(true);
  }
  function openEdit(asset: Asset) {
    setEditing(asset);
    setFormError(null);
    setOpen(true);
  }

  async function handleSubmit(values: ActivoFormValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateAsset(editing.id, {
          name: values.name.trim(),
          // Vacio en los Selects opcionales = desligar (null); undefined omite.
          requestId: trimOrUndefined(values.requestId) ?? null,
          ownerUserId: trimOrUndefined(values.ownerUserId) ?? null,
          typeCode: trimOrUndefined(values.typeCode),
          technologyCode: trimOrUndefined(values.technologyCode),
          sourceCode: trimOrUndefined(values.sourceCode),
          frequencyCode: trimOrUndefined(values.frequencyCode),
          documentationRef: trimOrUndefined(values.documentationRef),
          functionalDescription: trimOrUndefined(values.functionalDescription),
          dependencies: trimOrUndefined(values.dependencies),
        });
        toast.success('Activo actualizado.');
      } else {
        await createAsset({
          processId: values.processId,
          name: values.name.trim(),
          requestId: trimOrUndefined(values.requestId),
          ownerUserId: trimOrUndefined(values.ownerUserId),
          typeCode: trimOrUndefined(values.typeCode),
          technologyCode: trimOrUndefined(values.technologyCode),
          sourceCode: trimOrUndefined(values.sourceCode),
          frequencyCode: trimOrUndefined(values.frequencyCode),
          documentationRef: trimOrUndefined(values.documentationRef),
          functionalDescription: trimOrUndefined(values.functionalDescription),
          dependencies: trimOrUndefined(values.dependencies),
        });
        toast.success('Activo creado.');
      }
      // Reset solo en el camino de exito (AC-031).
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      // Fallo: conserva el dialog abierto y los valores (AC-031).
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatus(asset: Asset, targetStatus: AssetStatus) {
    setStatusBusyId(asset.id);
    try {
      await changeAssetStatus(asset.id, { targetStatus });
      toast.success(`Activo movido a ${targetStatus}.`);
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setStatusBusyId(null);
    }
  }

  /** Botones de transicion disponibles segun el estado actual (§4.1). */
  function statusActions(asset: Asset): React.ReactElement | null {
    if (!canChangeStatus(asset)) return null;
    const busy = statusBusyId === asset.id;
    const actions: { label: string; target: AssetStatus }[] = [];
    if (asset.status === 'BORRADOR') {
      actions.push({ label: 'Activar', target: 'ACTIVO' });
    } else if (asset.status === 'ACTIVO') {
      actions.push({ label: 'Retirar', target: 'RETIRADO' });
    } else if (asset.status === 'RETIRADO') {
      actions.push({ label: 'Recuperar', target: 'ACTIVO' });
    }
    if (actions.length === 0) return null;
    return (
      <>
        {actions.map((a) => (
          <Button
            key={a.target}
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void handleStatus(asset, a.target)}
          >
            {busy ? '...' : a.label}
          </Button>
        ))}
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Activos</h1>
          <p className="text-sm text-muted-foreground">
            Inventario de activos analiticos del area. Cada activo pertenece a un
            proceso, nace en BORRADOR y cambia de estado sin borrado fisico.
          </p>
        </div>
        <Button onClick={openCreate} disabled={state === 'loading'}>
          <Plus aria-hidden="true" />
          Nuevo activo
        </Button>
      </header>

      {/* Filtros */}
      <section
        aria-label="Filtros de activos"
        className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-3"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="filtro-proceso">Proceso</Label>
          <Select value={processFilter} onValueChange={setProcessFilter}>
            <SelectTrigger id="filtro-proceso">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {processes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filtro-solicitud">Solicitud</Label>
          <Select value={requestFilter} onValueChange={setRequestFilter}>
            <SelectTrigger id="filtro-solicitud">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {requests.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filtro-estado">Estado</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="filtro-estado">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              <SelectItem value="BORRADOR">Borrador</SelectItem>
              <SelectItem value="ACTIVO">Activo</SelectItem>
              <SelectItem value="RETIRADO">Retirado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <div aria-live="polite" className="rounded-lg border bg-card">
        {state === 'loading' ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible cargar los activos.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">Aun no hay activos registrados.</p>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus aria-hidden="true" />
              Nuevo activo
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">
              Ningun activo coincide con los filtros.
            </p>
          </div>
        ) : (
          <Table>
            <caption className="sr-only">Inventario de activos.</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Nombre</TableHead>
                <TableHead scope="col">Proceso</TableHead>
                <TableHead scope="col">Solicitud</TableHead>
                <TableHead scope="col">Responsable</TableHead>
                <TableHead scope="col">Tipo</TableHead>
                <TableHead scope="col">Estado</TableHead>
                <TableHead scope="col" className="text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell>{processName(asset.processId)}</TableCell>
                  <TableCell>{requestTitle(asset.requestId)}</TableCell>
                  <TableCell>{ownerName(asset.ownerUserId)}</TableCell>
                  <TableCell>{typeLabel(asset.typeCode)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(asset.status)}>
                      {asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(asset)}
                      >
                        Editar
                      </Button>
                      {statusActions(asset)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ActivoFormDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setEditing(null);
            setFormError(null);
          }
        }}
        editing={editing}
        processes={processes}
        requests={requests}
        owners={owners}
        typeOptions={typeOptions}
        technologyOptions={technologyOptions}
        sourceOptions={sourceOptions}
        frequencyOptions={frequencyOptions}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
