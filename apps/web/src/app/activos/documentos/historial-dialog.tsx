'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { MarkdownView } from '@/components/markdown-view';
import { DataView, type DataViewState } from '@/components/data-view';
import { RowActionsCell } from '@/components/row-actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  CoordinationPerson,
  Document,
  DocumentContent,
  DocumentVersion,
} from '@/lib/api-client';
import {
  DocumentError,
  downloadMarkdown,
  getVersionContent,
  listDocumentVersions,
} from '@/lib/documents';
import { formatDateTime } from '@/lib/format';

type LoadState = 'loading' | 'success' | 'error';

interface HistorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Documento cuyo historial se muestra (null cuando está cerrado). */
  document: Document | null;
  owners: CoordinationPerson[];
}

/**
 * Historial de versiones de un documento (design §11.17), diálogo xl: tabla de
 * versiones y panel con el contenido de la versión elegida, que se puede
 * descargar como .md.
 */
export function HistorialDialog({
  open,
  onOpenChange,
  document,
  owners,
}: HistorialDialogProps): React.ReactElement {
  const [versions, setVersions] = React.useState<DocumentVersion[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<DocumentContent | null>(null);
  const [viewingId, setViewingId] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  // Sin DialogTrigger, el foco vuelve al botón «Historial» de la fila (NIT 4).
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  const authorName = React.useCallback(
    // Autor fuera de las personas del alcance: nunca un UUID visible (§13.1).
    (id: string) => owners.find((u) => u.id === id)?.name ?? 'Persona fuera de tu alcance',
    [owners],
  );

  React.useEffect(() => {
    if (!open || !document) return;
    let cancelled = false;
    setState('loading');
    setSelected(null);
    listDocumentVersions(document.id)
      .then((list) => {
        if (cancelled) return;
        // Más reciente primero.
        setVersions([...list].sort((a, b) => b.versionNumber - a.versionNumber));
        setState('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof DocumentError ? err.message : null);
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, document, reloadKey]);

  async function handleView(version: DocumentVersion): Promise<void> {
    if (!document) return;
    setViewingId(version.id);
    try {
      const content = await getVersionContent(document.id, version.id);
      setSelected(content);
    } catch (err) {
      toast.error(err instanceof DocumentError ? err.message : 'No fue posible cargar la versión.');
    } finally {
      setViewingId(null);
    }
  }

  function handleDownload(): void {
    if (!document || !selected) return;
    downloadMarkdown(document, selected);
  }

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (versions.length === 0) viewState = 'empty';
  else viewState = 'ready';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="wrap-break-word">
            {`Historial de versiones${document ? ` — ${document.title}` : ''}`}
          </DialogTitle>
          <DialogDescription>
            Cada edición crea una versión que no cambia. Elige una para ver su contenido y
            descargarlo.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          <DataView
            state={viewState}
            loading={{ rows: 3, columns: 4 }}
            error={{
              title: 'No fue posible cargar el historial.',
              message: errorMessage,
              onRetry: () => setReloadKey((k) => k + 1),
              size: 'compact',
            }}
            empty={{ title: 'Este documento no tiene versiones.', size: 'compact' }}
          >
            <Table scrollLabel="Tabla de versiones">
              <TableHeader>
                <TableRow>
                  <TableHead>Versión</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v) => {
                  const current = document?.currentVersion?.id === v.id;
                  return (
                    <TableRow key={v.id} data-state={selected?.versionId === v.id ? 'selected' : undefined}>
                      <TableCell className="whitespace-nowrap font-medium tabular-nums">
                        {`v${v.versionNumber}${current ? ' (vigente)' : ''}`}
                      </TableCell>
                      <TableCell className="min-w-32 text-muted-foreground">
                        {authorName(v.authorUserId)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatDateTime(v.createdAt)}
                      </TableCell>
                      <RowActionsCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          loading={viewingId === v.id}
                          onClick={() => void handleView(v)}
                        >
                          Ver contenido
                        </Button>
                      </RowActionsCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </DataView>

          {selected ? (
            <section aria-labelledby="historial-contenido" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="historial-contenido" className="text-sm font-semibold">
                  {`Contenido v${selected.versionNumber}`}
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
                  <Download aria-hidden="true" />
                  Descargar .md
                </Button>
              </div>
              <div className="max-h-72 overflow-auto rounded-md border p-4">
                <MarkdownView content={selected.content} />
              </div>
            </section>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
