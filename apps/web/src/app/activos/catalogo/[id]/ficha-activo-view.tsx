'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Database, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { IdChip } from '@/components/id-chip';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VerAuditoriaLink } from '@/components/ver-auditoria-link';
import { useActor } from '@/lib/actor-context';
import type { Asset, CoordinationPerson, Process, Request } from '@/lib/api-client';
import { AssetError, changeAssetStatus, getAsset, updateAsset } from '@/lib/assets';
import { formatDate } from '@/lib/format';
import { getStatus } from '@/lib/status-presentation';
import { listRequests } from '@/lib/requests';
import { listProcesses } from '@/lib/team';
import { listCoordinationPeople } from '@/lib/worklog';
import {
  ActivoFormDialog,
  type ActivoFormValues,
} from '../activo-form-dialog';
import { retireDescription, trimOrUndefined, transitionOf } from '../activos-view';
import { DocumentosTab } from './documentos-tab';
import { SolicitudesTab } from './solicitudes-tab';

type LoadState = 'loading' | 'success' | 'error' | 'not-found';
type TabValue = 'resumen' | 'solicitudes' | 'documentos';

const DEFAULT_TAB: TabValue = 'resumen';
const LINK_CLASS =
  'rounded-sm text-link underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function messageOf(err: unknown): string {
  return err instanceof AssetError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function isHttpUrl(value: string): boolean {
  return /^https:\/\/\S+$/i.test(value.trim());
}

/** Una fila del resumen: etiqueta y valor, «—» si falta. */
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}): React.ReactElement {
  const empty = children === null || children === undefined || children === false || children === '';
  return (
    <div className={`flex flex-col gap-1${wide ? ' sm:col-span-2' : ''}`}>
      <dt className="text-meta font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground wrap-break-word">
        {empty ? <span className="text-muted-foreground">—</span> : children}
      </dd>
    </div>
  );
}

export interface FichaActivoViewProps {
  assetId: string;
}

/**
 * Ficha del activo (`/activos/catalogo/[id]`): un solo lugar para entender un
 * activo y llegar a lo que lo toca. Resumen con GET /assets/:id; Solicitudes y
 * Documentos se piden al abrir su pestaña. Editar y cambiar estado reutilizan
 * el diálogo y las mismas llamadas del catálogo: las reglas (D8 incluida) las
 * aplica el servidor. Especificación: docs/design/oleada4-b-activo-auditoria.md.
 */
export function FichaActivoView({ assetId }: FichaActivoViewProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { permissions, allowedModules } = useActor();
  const isJefe = React.useMemo(
    () => (permissions?.grants ?? []).some((g) => g.roleCode === 'JEFE_AREA'),
    [permissions],
  );
  const canSeeDocs = allowedModules.has('docs');

  const [asset, setAsset] = React.useState<Asset | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<unknown>(null);
  const [announcement, setAnnouncement] = React.useState('');

  // Pestaña: ?tab=solicitudes|documentos; otro valor (o «documentos» sin el módulo) cae en Resumen.
  const requestedTab = searchParams.get('tab');
  const tab: TabValue =
    requestedTab === 'solicitudes' || (requestedTab === 'documentos' && canSeeDocs)
      ? requestedTab
      : DEFAULT_TAB;
  // Cada pestaña se monta la primera vez que se abre y conserva sus datos al volver.
  const [visited, setVisited] = React.useState<Set<TabValue>>(() => new Set([tab]));
  if (!visited.has(tab)) {
    setVisited(new Set(visited).add(tab));
  }

  function changeTab(next: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_TAB) params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const loadAsset = React.useCallback(() => {
    return getAsset(assetId)
      .then((data) => {
        setAsset(data);
        setState('success');
      })
      .catch((err: unknown) => {
        if (err instanceof AssetError && err.status === 404) {
          setState('not-found');
        } else {
          setLoadError(err);
          setState('error');
        }
      });
  }, [assetId]);

  React.useEffect(() => {
    void loadAsset();
  }, [loadAsset]);

  // Datos del diálogo de edición: solo los pide quien puede editar.
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [owners, setOwners] = React.useState<CoordinationPerson[]>([]);
  React.useEffect(() => {
    if (!isJefe) return;
    void listProcesses().then(setProcesses, () => setProcesses([]));
    void listRequests().then(setRequests, () => setRequests([]));
    void listCoordinationPeople().then(setOwners, () => setOwners([]));
  }, [isJefe]);

  // Edición.
  const [editOpen, setEditOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const editButtonRef = React.useRef<HTMLButtonElement>(null);
  const statusButtonRef = React.useRef<HTMLButtonElement>(null);

  async function handleSubmit(values: ActivoFormValues): Promise<void> {
    if (!asset) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await updateAsset(asset.id, {
        name: values.name.trim(),
        requestId: trimOrUndefined(values.requestId) ?? null,
        ownerUserId: trimOrUndefined(values.ownerUserId) ?? null,
        documentationRef: trimOrUndefined(values.documentationRef),
        generalDescription: trimOrUndefined(values.generalDescription),
        dependencies: trimOrUndefined(values.dependencies),
        visibleProcessIds: values.visibleProcessIds,
      });
      toast.success('Activo actualizado.');
      setAnnouncement('Activo actualizado.');
      setEditOpen(false);
      await loadAsset();
      window.setTimeout(() => editButtonRef.current?.focus(), 0);
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Cambio de estado: Retirar confirma siempre (la ficha conoce los recuentos).
  const [statusBusy, setStatusBusy] = React.useState(false);
  const [retiring, setRetiring] = React.useState(false);

  async function applyStatus(target: 'ACTIVO' | 'RETIRADO' | 'BORRADOR'): Promise<void> {
    if (!asset) return;
    setStatusBusy(true);
    try {
      await changeAssetStatus(asset.id, { targetStatus: target });
      toast.success(`Activo movido a ${getStatus('asset', target).label}.`);
      setAnnouncement('Estado del activo actualizado.');
      await loadAsset();
      window.setTimeout(() => statusButtonRef.current?.focus(), 0);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setStatusBusy(false);
    }
  }

  const backLink = (
    <Link href="/activos/catalogo" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      Volver al catálogo
    </Link>
  );

  if (state === 'loading') {
    return (
      <PageLayout>
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </PageLayout>
    );
  }
  if (state === 'not-found') {
    return (
      <PageLayout>
        <h1 className="sr-only">Activo no encontrado</h1>
        <div className="rounded-xl bg-card shadow-card">
          <EmptyState
            icon={Database}
            title="No encontramos este activo."
            description="Puede que no exista o que no esté dentro de tu alcance."
            action={backLink}
          />
        </div>
      </PageLayout>
    );
  }
  if (state === 'error' || !asset) {
    return (
      <PageLayout>
        <h1 className="sr-only">Activo</h1>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-card shadow-card">
            <ErrorState
              title="No fue posible cargar el activo."
              error={loadError}
              onRetry={() => {
                setState('loading');
                void loadAsset();
              }}
            />
          </div>
          <div>{backLink}</div>
        </div>
      </PageLayout>
    );
  }

  const transition = isJefe ? transitionOf(asset.status) : null;
  const docRef = asset.documentationRef?.trim() ?? '';
  const requestsLabel = typeof asset.requestsCount === 'number' ? ` (${asset.requestsCount})` : '';
  const documentsLabel =
    typeof asset.documentsCount === 'number' ? ` (${asset.documentsCount})` : '';

  return (
    <PageLayout>
      <PageHeader
        breadcrumbs={[
          { label: 'Activos', href: '/activos/catalogo' },
          { label: 'Catálogo', href: '/activos/catalogo' },
        ]}
        title={asset.name}
        description={asset.processName ? `${asset.processName} (${asset.processCode})` : 'Proceso fuera de tu alcance'}
        meta={
          <>
            <IdChip code={asset.code} />
            <StatusBadge kind="asset" value={asset.status} />
            <span className="text-meta text-muted-foreground">
              Propietario: {asset.ownerName ?? 'Sin propietario asignado'}
            </span>
          </>
        }
        actions={
          <>
            {isJefe ? (
              <Button
                ref={editButtonRef}
                type="button"
                variant="outline"
                size="sm"
                className="max-md:min-h-11"
                onClick={() => {
                  setFormError(null);
                  setEditOpen(true);
                }}
              >
                <Pencil aria-hidden="true" />
                Editar
              </Button>
            ) : null}
            {transition ? (
              <Button
                ref={statusButtonRef}
                type="button"
                variant="outline"
                size="sm"
                className="max-md:min-h-11"
                disabled={statusBusy}
                onClick={() => {
                  if (transition.target === 'RETIRADO') setRetiring(true);
                  else void applyStatus(transition.target);
                }}
              >
                <RefreshCw aria-hidden="true" />
                {transition.label}
              </Button>
            ) : null}
            <VerAuditoriaLink code={asset.code} />
          </>
        }
      />
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <Tabs value={tab} onValueChange={changeTab} className="flex min-w-0 flex-col gap-4">
        <TabsList aria-label="Secciones del activo" className="overflow-x-auto">
          <TabsTrigger value="resumen" className="max-md:min-h-11">
            Resumen
          </TabsTrigger>
          <TabsTrigger value="solicitudes" className="max-md:min-h-11">
            Solicitudes{requestsLabel}
          </TabsTrigger>
          {canSeeDocs ? (
            <TabsTrigger value="documentos" className="max-md:min-h-11">
              Documentos{documentsLabel}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="resumen">
          <section aria-labelledby="ficha-resumen" className="rounded-xl bg-card p-5 shadow-card">
            <h2 id="ficha-resumen" className="sr-only">
              Resumen del activo
            </h2>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Field label="Propietario">{asset.ownerName}</Field>
              <Field label="Proceso">
                {asset.processName ? `${asset.processName} (${asset.processCode})` : null}
              </Field>
              <Field label="Estado">
                <StatusBadge kind="asset" value={asset.status} />
              </Field>
              <Field label="Solicitud de origen">
                {asset.requestId ? (
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    <IdChip code={asset.requestCode} />
                    <Link href={`/demanda/solicitudes/${asset.requestId}`} className={LINK_CLASS}>
                      {asset.requestTitle ?? 'Ver solicitud'}
                    </Link>
                  </span>
                ) : null}
              </Field>
              <Field label="Referencia de documentación">
                {docRef === '' ? null : isHttpUrl(docRef) ? (
                  <a href={docRef} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                    {docRef}
                    <span className="sr-only"> (se abre en una pestaña nueva)</span>
                  </a>
                ) : (
                  docRef
                )}
              </Field>
              <Field label="Descripción" wide>
                {asset.generalDescription ? (
                  <span className="block max-w-prose whitespace-pre-line">
                    {asset.generalDescription}
                  </span>
                ) : null}
              </Field>
              <Field label="Dependencias" wide>
                {asset.dependencies ? (
                  <span className="block max-w-prose whitespace-pre-line">{asset.dependencies}</span>
                ) : (
                  <span className="text-muted-foreground">Sin dependencias registradas.</span>
                )}
              </Field>
            </dl>
            <p className="mt-4 text-meta text-muted-foreground">
              Registrado el {formatDate(asset.createdAt)}
            </p>
          </section>
        </TabsContent>
        <TabsContent value="solicitudes">
          {visited.has('solicitudes') ? <SolicitudesTab assetId={asset.id} /> : null}
        </TabsContent>
        {canSeeDocs ? (
          <TabsContent value="documentos">
            {visited.has('documentos') ? <DocumentosTab assetId={asset.id} /> : null}
          </TabsContent>
        ) : null}
      </Tabs>
      <ConfirmDialog
        open={retiring}
        onOpenChange={setRetiring}
        title={`¿Retirar ${asset.code || asset.name}?`}
        description={retireDescription(asset)}
        confirmLabel="Retirar activo"
        tone="default"
        onConfirm={() => applyStatus('RETIRADO')}
        returnFocusTo={() => statusButtonRef.current}
      />
      <ActivoFormDialog
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next);
          if (!next) setFormError(null);
        }}
        editing={asset}
        processes={processes}
        requests={requests}
        owners={owners}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />
    </PageLayout>
  );
}
