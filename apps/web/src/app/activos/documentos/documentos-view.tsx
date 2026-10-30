'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Eye, FileText, Pencil, Plus, RotateCcwClock } from 'lucide-react';
import { toast } from 'sonner';
import {
  CellTitle,
  DataTablePagination,
  ResultCount,
  SortableTableHead,
} from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { DisabledReason } from '@/components/disabled-reason';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { ReasonDialog } from '@/components/reason-dialog';
import { StatusBadge } from '@/components/status-badge';
import { SearchInput, Toolbar } from '@/components/toolbar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  CatalogItem,
  CoordinationPerson,
  Document,
  DocumentStatus,
  Process,
  Request,
} from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { listAssets } from '@/lib/assets';
import { listCatalogItems } from '@/lib/catalog';
import {
  DocumentError,
  changeDocumentStatus,
  reviewDocument,
  createDocument,
  createDocumentVersion,
  downloadMarkdown,
  getCurrentContent,
  listDocuments,
  updateDocument,
} from '@/lib/documents';
import { getStatus } from '@/lib/status-presentation';
import {
  compareByOrder,
  compareNumber,
  compareText,
  matchesSearch,
  type Comparator,
  type SortState,
} from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useClientTable } from '@/lib/use-client-table';
import { listCoordinationPeople } from '@/lib/worklog';
import { listRequests } from '@/lib/requests';
import {
  DocumentoEditorDialog,
  type DocumentoEditorValues,
} from './documento-editor-dialog';
import { HistorialDialog } from './historial-dialog';
import { VerDocumentoDialog } from './ver-documento-dialog';

type LoadState = 'loading' | 'success' | 'error';
type SortKey = 'title' | 'asset' | 'version' | 'status';

/** Centinela de «Todos» / «Todas» en los filtros. */
const ALL = '__all__';
const NOUN = { one: 'documento', other: 'documentos' };
/** Estados en el orden del ciclo de vida. */
const DOCUMENT_STATES = [
  'BORRADOR',
  'PENDIENTE_APROBACION',
  'RECHAZADO',
  'VIGENTE',
  'ARCHIVADA',
] as const;
/** Categoría de la documentación de cierre de proyectos. */
const CLOSURE_CATEGORY = 'CIERRE';
const compareStatus = compareByOrder(DOCUMENT_STATES);
/** Orden por defecto: Título ascendente (design §11.17). */
const DEFAULT_SORT: SortState<SortKey> = { key: 'title', direction: 'asc' };
/** Id del motivo de «Nuevo documento» no disponible. */
const CREATE_REASON_ID = 'doc-nuevo-motivo';

function messageOf(err: unknown): string {
  return err instanceof DocumentError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

type Transition =
  | { kind: 'status'; label: string; target: DocumentStatus }
  | { kind: 'approve' | 'reject'; label: string };

/**
 * Acciones de estado disponibles (gating cosmético; el backend valida). La
 * documentación de cierre no se publica directamente: pasa por aprobación.
 * Aprobar y rechazar es del jefe de área.
 */
function transitionsOf(doc: Document, isJefe: boolean): Transition[] {
  const status = doc.status;
  const isClosure = doc.categoryCode === CLOSURE_CATEGORY;
  if (status === 'BORRADOR') {
    const list: Transition[] = [
      { kind: 'status', label: 'Enviar a aprobación', target: 'PENDIENTE_APROBACION' },
    ];
    if (!isClosure) list.push({ kind: 'status', label: 'Publicar', target: 'VIGENTE' });
    return list;
  }
  if (status === 'PENDIENTE_APROBACION') {
    const list: Transition[] = [];
    if (isJefe) {
      list.push({ kind: 'approve', label: 'Aprobar' }, { kind: 'reject', label: 'Rechazar' });
    }
    list.push({ kind: 'status', label: 'Retirar envío', target: 'BORRADOR' });
    return list;
  }
  if (status === 'RECHAZADO') {
    return [
      { kind: 'status', label: 'Reenviar a aprobación', target: 'PENDIENTE_APROBACION' },
      { kind: 'status', label: 'Pasar a borrador', target: 'BORRADOR' },
    ];
  }
  return legacyTransitionsOf(status).map((t) => ({ kind: 'status' as const, ...t }));
}

/** Transiciones de publicación previas (VIGENTE ↔ ARCHIVADA ↔ BORRADOR). */
function legacyTransitionsOf(status: string): { label: string; target: DocumentStatus }[] {
  if (status === 'VIGENTE') {
    return [
      { label: 'Archivar', target: 'ARCHIVADA' },
      { label: 'Pasar a borrador', target: 'BORRADOR' },
    ];
  }
  if (status === 'ARCHIVADA') return [{ label: 'Reactivar', target: 'VIGENTE' }];
  return [];
}

/**
 * Documentos (design §11.17, patrón A): documentación Markdown versionada,
 * ligada a un activo, con búsqueda, filtros, orden y paginación en cliente.
 * En línea «Editar» e «Historial»; en el menú, «Descargar .md» y las
 * transiciones permitidas por los roles asignados.
 */
export function DocumentosView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();

  // Gating cosmético: publicar o archivar lo hace el jefe o el líder del proceso
  // del activo del documento (el control real es del servidor).
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

  const [documents, setDocuments] = React.useState<Document[]>([]);
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [owners, setOwners] = React.useState<CoordinationPerson[]>([]);
  const [categoryOptions, setCategoryOptions] = React.useState<CatalogItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Búsqueda y filtros en cliente (el contrato no expone parámetros de consulta).
  const [processFilter, setProcessFilter] = React.useState<string>(ALL);
  const [requestFilter, setRequestFilter] = React.useState<string>(ALL);
  const [assetFilter, setAssetFilter] = React.useState<string>(ALL);
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  const [search, setSearch] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Editor (crear o nueva versión).
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Document | null>(null);
  const [initialContent, setInitialContent] = React.useState('');
  const [contentLoading, setContentLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Historial.
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyDoc, setHistoryDoc] = React.useState<Document | null>(null);

  // Ver documento (solo lectura).
  const [viewOpen, setViewOpen] = React.useState(false);
  const [viewDoc, setViewDoc] = React.useState<Document | null>(null);

  const [statusBusyId, setStatusBusyId] = React.useState<string | null>(null);
  // Rechazo con motivo (aprobación documental).
  const [rejecting, setRejecting] = React.useState<Document | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  const assetById = React.useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of assets) map.set(a.id, a);
    return map;
  }, [assets]);

  const canChangeStatus = React.useCallback(
    (doc: Document) => {
      const asset = assetById.get(doc.assetId);
      if (!asset) return isJefe;
      return isJefe || leaderProcessIds.has(asset.processId);
    },
    [assetById, isJefe, leaderProcessIds],
  );

  const loadData = React.useCallback(() => {
    return Promise.all([
      listDocuments(),
      listAssets().catch(() => [] as Asset[]),
      listProcesses().catch(() => [] as Process[]),
      listRequests().catch(() => [] as Request[]),
      listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
      listCatalogItems({ catalog: 'DOC_CATEGORY', active: true }).catch(
        () => [] as CatalogItem[],
      ),
    ])
      .then(([docs, assetList, procs, reqs, usrs, cats]) => {
        setDocuments(docs);
        setAssets(assetList);
        setProcesses(procs);
        setRequests(reqs);
        setOwners(usrs);
        setCategoryOptions(cats);
        setState('success');
      })
      .catch((err: unknown) => {
        setErrorMessage(messageOf(err));
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

  // Enlace directo (notificaciones/aprobaciones): ?documentId=… abre el documento.
  const deepLinkDone = React.useRef(false);
  React.useEffect(() => {
    if (state !== 'success' || deepLinkDone.current) return;
    deepLinkDone.current = true;
    const id = new URLSearchParams(window.location.search).get('documentId');
    const doc = id ? documents.find((d) => d.id === id) : undefined;
    if (doc) {
      setViewDoc(doc);
      setViewOpen(true);
    } else if (id) {
      toast.error('El documento no existe o está fuera de tu alcance.');
    }
  }, [state, documents]);

  const assetName = React.useCallback(
    // Ids que no vienen en las listas del alcance: nunca un UUID visible (§13.1).
    (id: string) => assetById.get(id)?.name ?? 'Activo fuera de tu alcance',
    [assetById],
  );
  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? 'Proceso fuera de tu alcance',
    [processes],
  );

  const comparators = React.useMemo<Record<SortKey, Comparator<Document>>>(
    () => ({
      title: (a, b, direction) => compareText(a.title, b.title, direction),
      asset: (a, b, direction) => compareText(assetName(a.assetId), assetName(b.assetId), direction),
      version: (a, b, direction) =>
        compareNumber(
          a.currentVersion?.versionNumber ?? null,
          b.currentVersion?.versionNumber ?? null,
          direction,
        ),
      status: (a, b, direction) => compareStatus(a.status, b.status, direction),
    }),
    [assetName],
  );

  const hasFilters =
    search.trim() !== '' ||
    processFilter !== ALL ||
    requestFilter !== ALL ||
    assetFilter !== ALL ||
    statusFilter !== ALL;
  const filter = React.useCallback(
    (doc: Document) => {
      const asset = assetById.get(doc.assetId);
      return (
        matchesSearch(doc.title, search) &&
        (processFilter === ALL || asset?.processId === processFilter) &&
        (requestFilter === ALL || asset?.requestId === requestFilter) &&
        (assetFilter === ALL || doc.assetId === assetFilter) &&
        (statusFilter === ALL || doc.status === statusFilter)
      );
    },
    [assetById, search, processFilter, requestFilter, assetFilter, statusFilter],
  );
  const table = useClientTable({
    rows: documents,
    filter,
    comparators,
    defaultSort: DEFAULT_SORT,
    resetKey: JSON.stringify([search, processFilter, requestFilter, assetFilter, statusFilter]),
    pageSize: 25,
  });

  // Activos candidatos para crear un documento: solo los no retirados.
  const creatableAssets = React.useMemo(
    () => assets.filter((a) => a.status !== 'RETIRADO'),
    [assets],
  );
  const noCreatableAssets = state === 'success' && creatableAssets.length === 0;

  function clearFilters(): void {
    setSearch('');
    setProcessFilter(ALL);
    setRequestFilter(ALL);
    setAssetFilter(ALL);
    setStatusFilter(ALL);
    // «Limpiar filtros» desaparece: el foco pasa a la búsqueda (NIT 4, plan D9).
    searchRef.current?.focus();
  }

  function openCreate(): void {
    setEditing(null);
    setInitialContent('');
    setFormError(null);
    setEditorOpen(true);
  }

  async function openEdit(doc: Document): Promise<void> {
    setEditing(doc);
    setFormError(null);
    setInitialContent('');
    setEditorOpen(true);
    if (!doc.currentVersion) return;
    setContentLoading(true);
    try {
      const content = await getCurrentContent(doc.id);
      setInitialContent(content.content);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setContentLoading(false);
    }
  }

  async function handleSubmit(values: DocumentoEditorValues): Promise<void> {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        // Los metadatos (título y categoría) van por PATCH; el contenido crea una
        // versión nueva. Si cambiaron los metadatos, se actualizan primero.
        const nextCategory = values.categoryCode || null;
        if (values.title !== editing.title || nextCategory !== (editing.categoryCode ?? null)) {
          await updateDocument(editing.id, {
            title: values.title,
            categoryCode: nextCategory,
          });
        }
        await createDocumentVersion(editing.id, { content: values.content });
        toast.success('Nueva versión guardada.');
      } else {
        await createDocument({
          assetId: values.assetId,
          title: values.title,
          categoryCode: values.categoryCode || undefined,
          content: values.content,
        });
        toast.success('Documento creado.');
      }
      // Reset solo en el camino de éxito (AC-031).
      setEditorOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      // Fallo: conserva el diálogo abierto y los valores (AC-031).
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatus(doc: Document, targetStatus: DocumentStatus): Promise<void> {
    setStatusBusyId(doc.id);
    try {
      await changeDocumentStatus(doc.id, { targetStatus });
      toast.success(`Documento movido a ${getStatus('document', targetStatus).label}.`);
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleApprove(doc: Document): Promise<void> {
    setStatusBusyId(doc.id);
    try {
      await reviewDocument(doc.id, { decision: 'APROBAR' });
      toast.success('Documento aprobado.');
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleReject(reason: string): Promise<void> {
    if (!rejecting) return;
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      await reviewDocument(rejecting.id, { decision: 'RECHAZAR', reason });
      toast.success('Documento rechazado. Se notificó a quien lo envió.');
      setRejecting(null);
      await load();
    } catch (err) {
      setRejectError(messageOf(err));
    } finally {
      setRejectSubmitting(false);
    }
  }

  async function handleDownload(doc: Document): Promise<void> {
    if (!doc.currentVersion) {
      toast.error('El documento no tiene contenido para descargar.');
      return;
    }
    setDownloadingId(doc.id);
    try {
      const content = await getCurrentContent(doc.id);
      downloadMarkdown(doc, content);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDownloadingId(null);
    }
  }

  function openHistory(doc: Document): void {
    setHistoryDoc(doc);
    setHistoryOpen(true);
  }

  function openView(doc: Document): void {
    setViewDoc(doc);
    setViewOpen(true);
  }

  function rowActions(doc: Document): RowAction[] {
    const actions: RowAction[] = [
      {
        key: 'view',
        label: 'Ver',
        icon: Eye,
        iconOnly: true,
        placement: 'inline',
        onSelect: () => openView(doc),
        disabled: !doc.currentVersion,
        disabledReason: doc.currentVersion ? undefined : 'Aún no tiene versiones.',
      },
      {
        key: 'edit',
        label: 'Editar',
        icon: Pencil,
        iconOnly: true,
        placement: 'inline',
        onSelect: () => void openEdit(doc),
      },
      {
        key: 'history',
        label: 'Historial',
        icon: RotateCcwClock,
        onSelect: () => openHistory(doc),
        placement: 'menu',
      },
      {
        key: 'download',
        label: 'Descargar .md',
        icon: Download,
        placement: 'menu',
        onSelect: () => void handleDownload(doc),
        disabled: !doc.currentVersion,
        disabledReason: doc.currentVersion ? undefined : 'Aún no tiene versiones.',
        busy: downloadingId === doc.id,
        busyLabel: 'Descargando…',
      },
    ];
    if (canChangeStatus(doc)) {
      const busy = statusBusyId === doc.id;
      for (const transition of transitionsOf(doc, isJefe)) {
        actions.push({
          key: transition.kind === 'status' ? `status-${transition.target}` : transition.kind,
          label: transition.label,
          placement: 'menu',
          // Mientras cambia el estado, el disparador del menú muestra el spinner.
          busy,
          onSelect: () => {
            if (transition.kind === 'status') void handleStatus(doc, transition.target);
            else if (transition.kind === 'approve') void handleApprove(doc);
            else {
              setRejectError(null);
              setRejecting(doc);
            }
          },
        });
      }
    }
    return actions;
  }

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (table.total === 0) viewState = 'empty';
  else if (table.filtered === 0) viewState = 'no-results';
  else viewState = 'ready';

  const goToAssets = allowedModules.has('asset') ? (
    <Link href="/activos/catalogo" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      Ir a Activos
    </Link>
  ) : null;

  const headerAction = noCreatableAssets ? (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <Button type="button" unavailable aria-describedby={CREATE_REASON_ID}>
        <Plus aria-hidden="true" />
        Nuevo documento
      </Button>
      <DisabledReason id={CREATE_REASON_ID} className="max-w-xs md:text-right">
        Para crear documentos necesitas un activo que no esté retirado.
      </DisabledReason>
      {goToAssets}
    </div>
  ) : (
    <Button type="button" onClick={openCreate} disabled={state === 'loading'}>
      <Plus aria-hidden="true" />
      Nuevo documento
    </Button>
  );

  return (
    <PageLayout>
      <PageHeader
        title="Documentos"
        description="Documentación en Markdown versionada y ligada a un activo. Cada edición crea una versión nueva."
        actions={headerAction}
      />

      <Toolbar
        label="Filtros de documentos"
        end={
          <>
            {state !== 'error' ? (
              <ResultCount
                loading={state === 'loading'}
                total={table.total}
                filtered={table.filtered}
                noun={NOUN}
              />
            ) : null}
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : null}
          </>
        }
      >
        <SearchInput
          ref={searchRef}
          id="doc-filtro-busqueda"
          placeholder="Título del documento"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="doc-filtro-proceso">Proceso</Label>
          <Select value={processFilter} onValueChange={setProcessFilter}>
            <SelectTrigger id="doc-filtro-proceso" className="w-full sm:w-40">
              <SelectValue />
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
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="doc-filtro-solicitud">Solicitud</Label>
          <Select value={requestFilter} onValueChange={setRequestFilter}>
            <SelectTrigger id="doc-filtro-solicitud" className="w-full sm:w-48">
              <SelectValue />
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
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="doc-filtro-activo">Activo</Label>
          <Select value={assetFilter} onValueChange={setAssetFilter}>
            <SelectTrigger id="doc-filtro-activo" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {assets.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="doc-filtro-estado">Estado</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="doc-filtro-estado" className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {DOCUMENT_STATES.map((value) => (
                <SelectItem key={value} value={value}>
                  {getStatus('document', value).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      <DataView
        state={viewState}
        loading={{ rows: 6, columns: 6 }}
        error={{
          title: 'No fue posible cargar los documentos.',
          message: errorMessage,
          onRetry: () => void load(),
        }}
        empty={
          creatableAssets.length === 0
            ? {
                icon: FileText,
                title: 'Aún no hay documentos.',
                description: 'Primero crea un activo (no retirado) para asociarle documentos.',
                action: goToAssets,
              }
            : {
                icon: FileText,
                title: 'Aún no hay documentos.',
                description: 'Crea el primer documento de un activo; cada edición guarda una versión nueva.',
                action: (
                  <Button type="button" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    Nuevo documento
                  </Button>
                ),
              }
        }
      >
        <Table scrollLabel="Tabla de documentos">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Título"
                sortKey="title"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <SortableTableHead
                label="Activo"
                sortKey="asset"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Proceso</TableHead>
              <SortableTableHead
                label="Versión"
                sortKey="version"
                sort={table.sort}
                onSort={table.toggleSort}
                align="right"
              />
              <SortableTableHead
                label="Estado"
                sortKey="status"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.pageRows.map((doc) => {
              const asset = assetById.get(doc.assetId);
              return (
                <TableRow key={doc.id}>
                  <TableCell className="min-w-56 max-w-[28rem]">
                    <CellTitle
                      meta={
                        doc.status === 'RECHAZADO' && doc.reviewReason
                          ? `Motivo del rechazo: ${doc.reviewReason}`
                          : doc.categoryCode === CLOSURE_CATEGORY
                            ? 'Documentación de cierre'
                            : undefined
                      }
                    >
                      {doc.title}
                    </CellTitle>
                  </TableCell>
                  <TableCell className="min-w-40 max-w-64">
                    <span className="line-clamp-2 wrap-break-word text-muted-foreground">
                      {assetName(doc.assetId)}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-28 text-muted-foreground">
                    {asset ? processName(asset.processId) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {doc.currentVersion ? `v${doc.currentVersion.versionNumber}` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <StatusBadge kind="document" value={doc.status} />
                  </TableCell>
                  <RowActionsCell>
                    <RowActions rowLabel={doc.title} actions={rowActions(doc)} />
                  </RowActionsCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <DataTablePagination
          id="doc-paginacion"
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
      </DataView>

      <DocumentoEditorDialog
        open={editorOpen}
        onOpenChange={(next) => {
          setEditorOpen(next);
          if (!next) {
            setEditing(null);
            setFormError(null);
          }
        }}
        editing={editing}
        editingAssetName={editing ? assetName(editing.assetId) : undefined}
        initialContent={initialContent}
        contentLoading={contentLoading}
        assets={creatableAssets}
        categoryOptions={categoryOptions}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleSubmit(values)}
      />

      <HistorialDialog
        open={historyOpen}
        onOpenChange={(next) => {
          setHistoryOpen(next);
          if (!next) setHistoryDoc(null);
        }}
        document={historyDoc}
        owners={owners}
      />

      <VerDocumentoDialog
        open={viewOpen}
        onOpenChange={(next) => {
          setViewOpen(next);
          if (!next) setViewDoc(null);
        }}
        document={viewDoc}
      />

      <ReasonDialog
        open={rejecting !== null}
        onOpenChange={(next) => {
          if (!next) {
            setRejecting(null);
            setRejectError(null);
          }
        }}
        title={`¿Rechazar «${rejecting?.title ?? ''}»?`}
        description="Indica qué debe corregirse. El documento queda como Rechazado y se notifica a quien lo envió."
        fieldId="doc-rechazo-motivo"
        fieldLabel="Motivo del rechazo"
        confirmLabel="Rechazar documento"
        busyLabel="Rechazando…"
        tone="danger"
        submitting={rejectSubmitting}
        errorMessage={rejectError}
        onConfirm={(reason) => void handleReject(reason)}
        requiredMessage="Indica el motivo del rechazo."
      />
    </PageLayout>
  );
}
