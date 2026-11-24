'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Eye, FileText, History, Pencil, Plus, RotateCcwClock } from 'lucide-react';
import { toast } from 'sonner';
import {
  CellTitle,
  DataTablePagination,
  ResultCount,
  SortableTableHead,
} from '@/components/data-table';
import { DataCardList } from '@/components/data-card-list';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataView, type DataViewState } from '@/components/data-view';
import { IdChip } from '@/components/id-chip';
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
  getDocument,
  listDocumentsPage,
  updateDocument,
} from '@/lib/documents';
import { getStatus } from '@/lib/status-presentation';
import type { SortState } from '@/lib/table-sort';
import { listProcesses } from '@/lib/team';
import { useDebouncedValue, useServerTable } from '@/lib/use-server-table';
import { ServerListBody } from '@/components/server-list';
import { ProcessRefCell, RefMissing, RequestRefCell } from '@/components/reference-cell';
import { listCoordinationPeople } from '@/lib/worklog';
import { listRequests } from '@/lib/requests';
import {
  DocumentoEditorDialog,
  type DocumentoEditorValues,
} from './documento-editor-dialog';
import { HistorialDialog } from './historial-dialog';
import { VerDocumentoDialog } from './ver-documento-dialog';

/** Columnas ordenables en el servidor (lista blanca); Activo y Versión ya no ordenan. */
type SortKey = 'title' | 'status';

/** Ranura o celda de código: el chip, o «—» con «Sin código» para lectores si falta. */
function CodeCell({ code }: { code: string | null | undefined }): React.ReactElement {
  if (!code) {
    return (
      <>
        <span className="text-muted-foreground" aria-hidden="true">
          —
        </span>
        <span className="sr-only">Sin código</span>
      </>
    );
  }
  return <IdChip code={code} />;
}

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
    // D9: publicar directo es solo del jefe; el líder envía a aprobación.
    if (!isClosure && isJefe) list.push({ kind: 'status', label: 'Publicar', target: 'VIGENTE' });
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
  return legacyTransitionsOf(status)
    .filter((t) => isJefe || t.target !== 'VIGENTE')
    .map((t) => ({ kind: 'status' as const, ...t }));
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

  // Gating cosmético: archivar o enviar a aprobación lo hace el jefe o el líder
  // del proceso del activo; publicar directo y reactivar, solo el jefe (D9). El
  // control real es del servidor.
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

  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [owners, setOwners] = React.useState<CoordinationPerson[]>([]);
  const [categoryOptions, setCategoryOptions] = React.useState<CatalogItem[]>([]);

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
  // Aprobación: confirma antes de publicar (criterio común, oleada 3 PR-D).
  const [approving, setApproving] = React.useState<Document | null>(null);
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

  // Maestras (filtros, formulario y gating de estado); si fallan, se degradan a vacío.
  const [lookupsReady, setLookupsReady] = React.useState(false);
  React.useEffect(() => {
    void Promise.all([
      listAssets().catch(() => [] as Asset[]),
      listProcesses().catch(() => [] as Process[]),
      listRequests().catch(() => [] as Request[]),
      listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
      listCatalogItems({ catalog: 'DOC_CATEGORY', active: true }).catch(
        () => [] as CatalogItem[],
      ),
    ]).then(([assetList, procs, reqs, usrs, cats]) => {
      setAssets(assetList);
      setProcesses(procs);
      setRequests(reqs);
      setOwners(usrs);
      setCategoryOptions(cats);
      setLookupsReady(true);
    });
  }, []);

  // Enlace directo (?documentId=, p. ej. desde una notificación): abre el
  // documento aunque no esté en la página visible, o avisa si no está en el
  // alcance (404). Solo una vez.
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('documentId');
    if (!id) return;
    let cancelled = false;
    getDocument(id)
      .then((doc) => {
        if (cancelled) return;
        setViewDoc(doc);
        setViewOpen(true);
      })
      .catch(() => {
        if (!cancelled) toast.error('El documento no existe o está fuera de tu alcance.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Código del activo del documento: el que trae el documento o el de la lista de activos. */
  const assetCodeOf = React.useCallback(
    (doc: Document) => doc.assetCode ?? assetById.get(doc.assetId)?.code ?? null,
    [assetById],
  );
  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? null,
    [processes],
  );

  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const hasFilters =
    debouncedSearch !== '' ||
    processFilter !== ALL ||
    requestFilter !== ALL ||
    assetFilter !== ALL ||
    statusFilter !== ALL;
  const showClear = hasFilters || search.trim() !== '';
  const fetchPage = React.useCallback(
    ({ page, pageSize, sort, signal }: { page: number; pageSize: number; sort: SortState<SortKey> | null; signal: AbortSignal }) =>
      listDocumentsPage(
        {
          q: debouncedSearch,
          processId: processFilter === ALL ? undefined : processFilter,
          // Documentos del proyecto: vinculados a la solicitud o del activo de origen.
          requestId: requestFilter === ALL ? undefined : requestFilter,
          assetId: assetFilter === ALL ? undefined : assetFilter,
          status: statusFilter === ALL ? undefined : statusFilter,
          sort: sort?.key,
          dir: sort?.direction,
          page,
          pageSize,
        },
        signal,
      ),
    [debouncedSearch, processFilter, requestFilter, assetFilter, statusFilter],
  );
  const table = useServerTable<Document, SortKey>({
    fetchPage,
    filtersKey: JSON.stringify([debouncedSearch, processFilter, requestFilter, assetFilter, statusFilter]),
    defaultSort: DEFAULT_SORT,
  });
  const listRef = React.useRef<HTMLDivElement>(null);
  const load = table.reload;
  /** Nombre del activo para el editor: del DTO o de la maestra. */
  const assetName = React.useCallback(
    (id: string) => assetById.get(id)?.name ?? table.rows.find((d) => d.assetId === id)?.assetName ?? '',
    [assetById, table.rows],
  );

  // Activos candidatos para crear un documento: solo los no retirados.
  const creatableAssets = React.useMemo(
    () => assets.filter((a) => a.status !== 'RETIRADO'),
    [assets],
  );
  const noCreatableAssets = lookupsReady && creatableAssets.length === 0;

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
        toast.success(
          editing.status === 'VIGENTE'
            ? 'Nueva versión guardada. El documento volvió a Borrador y necesita aprobación.'
            : 'Nueva versión guardada.',
        );
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
    // Enlace a la Auditoría ya filtrada por el código (solo con acceso al módulo).
    if (allowedModules.has('audit') && doc.code) {
      actions.push({
        key: 'audit',
        label: 'Ver auditoría',
        icon: History,
        href: `/gobierno/auditoria?objectCode=${encodeURIComponent(doc.code)}`,
        placement: 'menu',
      });
    }
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
            else if (transition.kind === 'approve') setApproving(doc);
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
  // Una recarga con filas visibles sigue en 'ready': la tabla no parpadea a vacío.
  if (table.status === 'loading') viewState = 'loading';
  else if (table.status === 'error') viewState = 'error';
  else if (table.total === 0 && table.status === 'ready') viewState = hasFilters ? 'no-results' : 'empty';
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
    <Button type="button" onClick={openCreate} disabled={table.status === 'loading'}>
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
        collapseOnMobile
        end={
          <>
            {table.status !== 'error' ? (
              <ResultCount
                loading={table.busy}
                spinner
                total={table.total}
                filtered={table.total}
                noun={NOUN}
              />
            ) : null}
            {showClear ? (
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
          aria-label="Buscar por título o código"
          placeholder="Título o código del documento"
          maxLength={100}
          autoComplete="off"
          enterKeyHint="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && search !== '') setSearch('');
          }}
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
                  {r.code} · {r.title}
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
                <SelectItem key={a.id} value={a.id} textValue={`${a.code ?? ''} ${a.name}`.trim()}>
                  {a.code ? (
                    <span className="font-mono text-xs tabular-nums">{a.code}</span>
                  ) : null}
                  <span>
                    {a.code ? ' · ' : ''}
                    {a.name}
                  </span>
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
        loading={{ rows: 6, columns: 7 }}
        mobileCards
        error={{
          title: 'No fue posible cargar los documentos.',
          message: messageOf(table.error),
          onRetry: () => void load(),
        }}
        noResults={{
          title: 'Sin resultados',
          description: 'Ningún documento coincide con la búsqueda o los filtros.',
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
        <ServerListBody
          containerRef={listRef}
          reloading={table.status === 'reloading'}
          reloadFailed={table.status === 'reload-error'}
          onRetry={table.reload}
          truncated={table.truncated}
        >
        <div className="hidden md:block">
        <Table scrollLabel="Tabla de documentos">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Código</TableHead>
              <SortableTableHead
                label="Título"
                sortKey="title"
                sort={table.sort}
                onSort={table.toggleSort}
              />
              <TableHead>Activo</TableHead>
              <TableHead>Proceso</TableHead>
              <TableHead>Solicitud</TableHead>
              <TableHead className="text-right">Versión</TableHead>
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
            {table.rows.map((doc) => {
              const asset = assetById.get(doc.assetId);
              return (
                <TableRow key={doc.id}>
                  <TableCell className="whitespace-nowrap">
                    <CodeCell code={doc.code} />
                  </TableCell>
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
                  <TableCell className="min-w-40 max-w-[18rem]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <CodeCell code={assetCodeOf(doc)} />
                      <span className="line-clamp-1" title={doc.assetName}>
                        {doc.assetName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-32 max-w-[18rem]">
                    <ProcessRefCell
                      name={asset ? processName(asset.processId) : null}
                      code={null}
                      missingLabel="Proceso no disponible"
                    />
                  </TableCell>
                  <TableCell className="min-w-40 max-w-[18rem]">
                    <RequestRefCell
                      code={doc.requestCode}
                      title={doc.requestTitle}
                      unavailable={doc.requestId !== null}
                      missingLabel="Sin solicitud"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {doc.currentVersion ? (
                      `v${doc.currentVersion.versionNumber}`
                    ) : (
                      <RefMissing label="Sin versión" />
                    )}
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
        </div>
        <DataCardList
          label="Documentos"
          rows={table.rows}
          getKey={(doc) => doc.id}
          sort={{
            value: table.sort,
            onChange: table.setSort,
            options: [
              { key: 'title', label: 'Título' },
              { key: 'status', label: 'Estado' },
            ],
          }}
          card={(doc) => {
            const asset = assetById.get(doc.assetId);
            return {
              code: <CodeCell code={doc.code} />,
              title: (
                <CellTitle
                  touch
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
              ),
              subtitle: doc.assetName,
              badges: [<StatusBadge key="status" kind="document" value={doc.status} />],
              meta: [
                { label: 'Código del activo', value: <CodeCell code={assetCodeOf(doc)} /> },
                ...(asset && processName(asset.processId)
                  ? [{ label: 'Proceso', value: processName(asset.processId) }]
                  : []),
                {
                  label: 'Solicitud',
                  wide: true,
                  value: (
                    <RequestRefCell
                      code={doc.requestCode}
                      title={doc.requestTitle}
                      unavailable={doc.requestId !== null}
                      missingLabel="Sin solicitud"
                    />
                  ),
                },
                {
                  label: 'Versión',
                  value: doc.currentVersion ? `v${doc.currentVersion.versionNumber}` : '—',
                },
              ],
              actions: <RowActions menuOnly rowLabel={doc.title} actions={rowActions(doc)} />,
            };
          }}
        />
        <DataTablePagination
          id="doc-paginacion"
          page={table.page}
          pageCount={table.pageCount}
          from={table.from}
          to={table.to}
          filtered={table.total}
          pageSize={table.pageSize}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          noun={NOUN}
          showingPrefix
          busy={table.busy}
          fallbackFocusRef={listRef}
        />
        </ServerListBody>
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

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(next) => {
          if (!next) setApproving(null);
        }}
        title={`¿Aprobar «${approving?.title ?? ''}»?`}
        description={`El documento pasará a ${getStatus('document', 'VIGENTE').label}. Si hay que corregir algo, usa Rechazar.`}
        confirmLabel="Aprobar documento"
        tone="default"
        onConfirm={() => (approving ? handleApprove(approving) : undefined)}
      >
        {approving ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-muted/40 p-3 text-sm dark:ring-1 dark:ring-inset dark:ring-border">
            <dt className="text-muted-foreground">Documento</dt>
            <dd className="flex flex-wrap items-center gap-2 text-foreground wrap-break-word">
              <IdChip code={approving.code} copyable={false} />
              <span>{approving.title}</span>
            </dd>
            <dt className="text-muted-foreground">Activo</dt>
            <dd className="flex flex-wrap items-center gap-2 text-foreground wrap-break-word">
              <IdChip code={assetCodeOf(approving)} copyable={false} />
              <span>{assetName(approving.assetId)}</span>
            </dd>
          </dl>
        ) : null}
      </ConfirmDialog>

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
