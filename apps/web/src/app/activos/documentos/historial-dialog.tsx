'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Document,
  DocumentContent,
  DocumentVersion,
  User,
} from '@/lib/api-client';
import {
  DocumentError,
  downloadMarkdown,
  getVersionContent,
  listDocumentVersions,
} from '@/lib/documents';

type LoadState = 'loading' | 'success' | 'error';

interface HistorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Documento cuyo historial se muestra (null cuando esta cerrado). */
  document: Document | null;
  owners: User[];
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es');
}

export function HistorialDialog({
  open,
  onOpenChange,
  document,
  owners,
}: HistorialDialogProps): React.ReactElement {
  const [versions, setVersions] = React.useState<DocumentVersion[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [selected, setSelected] = React.useState<DocumentContent | null>(null);
  const [viewingId, setViewingId] = React.useState<string | null>(null);

  const authorName = React.useCallback(
    (id: string) => owners.find((u) => u.id === id)?.name ?? id,
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
        // Mas reciente primero.
        setVersions([...list].sort((a, b) => b.versionNumber - a.versionNumber));
        setState('success');
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open, document]);

  async function handleView(version: DocumentVersion) {
    if (!document) return;
    setViewingId(version.id);
    try {
      const content = await getVersionContent(document.id, version.id);
      setSelected(content);
    } catch (err) {
      toast.error(
        err instanceof DocumentError
          ? err.message
          : 'No fue posible cargar la version.',
      );
    } finally {
      setViewingId(null);
    }
  }

  function handleDownload() {
    if (!document || !selected) return;
    downloadMarkdown(document, selected);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Historial de versiones{document ? ` — ${document.title}` : ''}
          </DialogTitle>
          <DialogDescription>
            Cada edicion crea una version inmutable. Selecciona una version para
            ver su contenido y descargarlo.
          </DialogDescription>
        </DialogHeader>

        {state === 'loading' ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <p className="text-sm text-muted-foreground">
            No fue posible cargar el historial.
          </p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este documento no tiene versiones.
          </p>
        ) : (
          <Table>
            <caption className="sr-only">Versiones del documento.</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Version</TableHead>
                <TableHead scope="col">Autor</TableHead>
                <TableHead scope="col">Fecha</TableHead>
                <TableHead scope="col" className="text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">
                    v{v.versionNumber}
                    {document?.currentVersion?.id === v.id ? ' (vigente)' : ''}
                  </TableCell>
                  <TableCell>{authorName(v.authorUserId)}</TableCell>
                  <TableCell>{formatDate(v.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={viewingId === v.id}
                        onClick={() => void handleView(v)}
                      >
                        {viewingId === v.id ? '...' : 'Ver contenido'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {selected ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Contenido v{selected.versionNumber}
              </h3>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download aria-hidden="true" />
                Descargar .md
              </Button>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm">
              {selected.content}
            </pre>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
