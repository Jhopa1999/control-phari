'use client';

import * as React from 'react';
import { Download, History, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  CatalogItem,
  Document,
  DocumentStatus,
  Process,
  Request,
  User,
} from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { listAssets } from '@/lib/assets';
import { listCatalogItems } from '@/lib/catalog';
import {
  DocumentError,
  changeDocumentStatus,
  createDocument,
  createDocumentVersion,
  downloadMarkdown,
  getCurrentContent,
  listDocuments,
  updateDocument,
} from '@/lib/documents';
import { listProcesses, listUsers } from '@/lib/team';
import { listRequests } from '@/lib/requests';
import {
  DocumentoEditorDialog,
  type DocumentoEditorValues,
} from './documento-editor-dialog';
import { HistorialDialog } from './historial-dialog';

type LoadState = 'loading' | 'success' | 'error';

/** Valor del Select de filtro que representa "todos". */
const ALL = '__all__';

function messageOf(err: unknown): string {
  return err instanceof DocumentError
    ? err.message
    : 'Ocurrio un error inesperado.';
}

/** Variante visual del badge de estado. */
function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'VIGENTE':
      return 'default';
    case 'ARCHIVADA':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function DocumentosView(): React.ReactElement {
  const { permissions } = useActor();

  // Gating cosmetico: publicar/archivar lo hace jefe o lider del proceso del
  // activo del documento (el control real es server-side; design §6).
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
  const [owners, setOwners] = React.useState<User[]>([]);
  const [categoryOptions, setCategoryOptions] = React.useState<CatalogItem[]>(
    [],
  );
  const [state, setState] = React.useState<LoadState>('loading');

  // Filtros client-side (el contrato no expone query params).
  const [processFilter, setProcessFilter] = React.useState<string>(ALL);
  const [requestFilter, setRequestFilter] = React.useState<string>(ALL);
  const [assetFilter, setAssetFilter] = React.useState<string>(ALL);
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  const [search, setSearch] = React.useState('');

  // Editor (crear/nueva version).
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Document | null>(null);
  const [initialContent, setInitialContent] = React.useState('');
  const [contentLoading, setContentLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Historial.
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyDoc, setHistoryDoc] = React.useState<Document | null>(null);

  const [statusBusyId, setStatusBusyId] = React.useState<string | null>(null);
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

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [docs, assetList, procs, reqs, usrs, cats] = await Promise.all([
        listDocuments(),
        listAssets().catch(() => [] as Asset[]),
        listProcesses().catch(() => [] as Process[]),
        listRequests().catch(() => [] as Request[]),
        listUsers().catch(() => [] as User[]),
        listCatalogItems({ catalog: 'DOC_CATEGORY', active: true }).catch(
          () => [] as CatalogItem[],
        ),
      ]);
      setDocuments(docs);
      setAssets(assetList);
      setProcesses(procs);
      setRequests(reqs);
      setOwners(usrs);
      setCategoryOptions(cats);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const assetName = React.useCallback(
    (id: string) => assetById.get(id)?.name ?? id,
    [assetById],
  );
  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents.filter((doc) => {
      const asset = assetById.get(doc.assetId);
      if (processFilter !== ALL && asset?.processId !== processFilter) {
        return false;
      }
      if (requestFilter !== ALL && asset?.requestId !== requestFilter) {
        return false;
      }
      if (assetFilter !== ALL && doc.assetId !== assetFilter) return false;
      if (statusFilter !== ALL && doc.status !== statusFilter) return false;
      if (term && !doc.title.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [
    documents,
    assetById,
    processFilter,
    requestFilter,
    assetFilter,
    statusFilter,
    search,
  ]);

  // Activos candidatos para crear documento: solo los no retirados.
  const creatableAssets = React.useMemo(
    () => assets.filter((a) => a.status !== 'RETIRADO'),
    [assets],
  );

  async function openCreate() {
    setEditing(null);
    setInitialContent('');
    setFormError(null);
    setEditorOpen(true);
  }

  async function openEdit(doc: Document) {
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

  async function handleSubmit(values: DocumentoEditorValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        // Metadatos (titulo/categoria) van por PATCH; el contenido crea una
        // nueva version. Si cambiaron los metadatos, se actualizan primero.
        const nextCategory = values.categoryCode || null;
        if (
          values.title !== editing.title ||
          nextCategory !== (editing.categoryCode ?? null)
        ) {
          await updateDocument(editing.id, {
            title: values.title,
            categoryCode: nextCategory,
          });
        }
        await createDocumentVersion(editing.id, { content: values.content });
        toast.success('Nueva version guardada.');
      } else {
        await createDocument({
          assetId: values.assetId,
          title: values.title,
          categoryCode: values.categoryCode || undefined,
          content: values.content,
        });
        toast.success('Documento creado.');
      }
      setEditorOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatus(doc: Document, targetStatus: DocumentStatus) {
    setStatusBusyId(doc.id);
    try {
      await changeDocumentStatus(doc.id, { targetStatus });
      toast.success(`Documento movido a ${targetStatus}.`);
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleDownload(doc: Document) {
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

  function openHistory(doc: Document) {
    setHistoryDoc(doc);
    setHistoryOpen(true);
  }

  /** Botones de transicion de estado disponibles (§4, BORRADOR↔VIGENTE↔ARCHIVADA). */
  function statusActions(doc: Document): React.ReactElement | null {
    if (!canChangeStatus(doc)) return null;
    const busy = statusBusyId === doc.id;
    const actions: { label: string; target: DocumentStatus }[] = [];
    if (doc.status === 'BORRADOR') {
      actions.push({ label: 'Publicar', target: 'VIGENTE' });
    } else if (doc.status === 'VIGENTE') {
      actions.push({ label: 'Archivar', target: 'ARCHIVADA' });
      actions.push({ label: 'Pasar a borrador', target: 'BORRADOR' });
    } else if (doc.status === 'ARCHIVADA') {
      actions.push({ label: 'Reactivar', target: 'VIGENTE' });
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
            onClick={() => void handleStatus(doc, a.target)}
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
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-muted-foreground">
            Documentacion Markdown versionada, ligada a un activo. Cada edicion
            crea una nueva version; las anteriores se conservan.
          </p>
        </div>
        <Button
          onClick={() => void openCreate()}
          disabled={state === 'loading' || creatableAssets.length === 0}
        >
          <Plus aria-hidden="true" />
          Nuevo documento
        </Button>
      </header>

      {/* Filtros */}
      <section
        aria-label="Filtros de documentos"
        className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="doc-filtro-proceso">Proceso</Label>
          <Select value={processFilter} onValueChange={setProcessFilter}>
            <SelectTrigger id="doc-filtro-proceso">
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
          <Label htmlFor="doc-filtro-solicitud">Solicitud</Label>
          <Select value={requestFilter} onValueChange={setRequestFilter}>
            <SelectTrigger id="doc-filtro-solicitud">
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
          <Label htmlFor="doc-filtro-activo">Activo</Label>
          <Select value={assetFilter} onValueChange={setAssetFilter}>
            <SelectTrigger id="doc-filtro-activo">
              <SelectValue placeholder="Todos" />
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="doc-filtro-estado">Estado</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="doc-filtro-estado">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              <SelectItem value="BORRADOR">Borrador</SelectItem>
              <SelectItem value="VIGENTE">Vigente</SelectItem>
              <SelectItem value="ARCHIVADA">Archivada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="doc-filtro-busqueda">Buscar</Label>
          <Input
            id="doc-filtro-busqueda"
            value={search}
            placeholder="Titulo..."
            onChange={(e) => setSearch(e.target.value)}
          />
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
              No fue posible cargar los documentos.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">Aun no hay documentos.</p>
            {creatableAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Primero crea un activo (no retirado) para asociarle documentos.
              </p>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void openCreate()}>
                <Plus aria-hidden="true" />
                Nuevo documento
              </Button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">
              Ningun documento coincide con los filtros.
            </p>
          </div>
        ) : (
          <Table>
            <caption className="sr-only">Documentos del area.</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Titulo</TableHead>
                <TableHead scope="col">Activo</TableHead>
                <TableHead scope="col">Proceso</TableHead>
                <TableHead scope="col">Version</TableHead>
                <TableHead scope="col">Estado</TableHead>
                <TableHead scope="col" className="text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => {
                const asset = assetById.get(doc.assetId);
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>{assetName(doc.assetId)}</TableCell>
                    <TableCell>
                      {asset ? processName(asset.processId) : '—'}
                    </TableCell>
                    <TableCell>
                      {doc.currentVersion
                        ? `v${doc.currentVersion.versionNumber}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(doc.status)}>
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void openEdit(doc)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openHistory(doc)}
                        >
                          <History aria-hidden="true" />
                          Historial
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            downloadingId === doc.id || !doc.currentVersion
                          }
                          onClick={() => void handleDownload(doc)}
                        >
                          <Download aria-hidden="true" />
                          {downloadingId === doc.id ? '...' : '.md'}
                        </Button>
                        {statusActions(doc)}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

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
        initialContent={initialContent}
        contentLoading={contentLoading}
        assets={creatableAssets}
        categoryOptions={categoryOptions}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={handleSubmit}
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
    </div>
  );
}
