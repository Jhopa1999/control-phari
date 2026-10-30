'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { MarkdownView } from '@/components/markdown-view';
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
import type { Document, DocumentContent } from '@/lib/api-client';
import { DocumentError, downloadMarkdown, getCurrentContent } from '@/lib/documents';

type LoadState = 'loading' | 'success' | 'error';

interface VerDocumentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Documento a mostrar (null cuando está cerrado). */
  document: Document | null;
}

function messageOf(err: unknown): string {
  return err instanceof DocumentError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/**
 * Diálogo de solo lectura (design §11.17), diálogo xl: muestra el contenido de
 * la versión vigente renderizado como Markdown y permite descargarlo como .md.
 * No añade lógica de negocio: reutiliza `getCurrentContent`/`downloadMarkdown`.
 */
export function VerDocumentoDialog({
  open,
  onOpenChange,
  document,
}: VerDocumentoDialogProps): React.ReactElement {
  const [content, setContent] = React.useState<DocumentContent | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  // Sin DialogTrigger, el foco vuelve al botón «Ver» de la fila (NIT 4).
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  // Al abrir (o cambiar de documento o recargar) se vuelve a mostrar la carga.
  useResetOnChange([open, document, reloadKey], () => {
    if (!open || !document) return;
    setState('loading');
    setContent(null);
    setErrorMessage(null);
  });
  React.useEffect(() => {
    if (!open || !document) return;
    let cancelled = false;
    getCurrentContent(document.id)
      .then((data) => {
        if (cancelled) return;
        setContent(data);
        setState('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof DocumentError ? err.message : null);
        setState('error');
        toast.error(messageOf(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, document, reloadKey]);

  function handleDownload(): void {
    if (!document || !content) return;
    downloadMarkdown(document, content);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="wrap-break-word">
            {`Ver documento${document ? ` — ${document.title}` : ''}`}
          </DialogTitle>
          <DialogDescription>
            Contenido de la versión vigente en solo lectura.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          {state === 'loading' ? (
            <p className="text-sm text-muted-foreground">Cargando contenido…</p>
          ) : null}

          {state === 'error' ? (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                {errorMessage ?? 'No fue posible cargar el contenido del documento.'}
              </p>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  Reintentar
                </Button>
              </div>
            </div>
          ) : null}

          {state === 'success' && content ? (
            <section aria-labelledby="ver-documento-contenido" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="ver-documento-contenido" className="text-sm font-semibold">
                  {`Contenido v${content.versionNumber}`}
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
                  <Download aria-hidden="true" />
                  Descargar .md
                </Button>
              </div>
              <div className="max-h-[60dvh] overflow-auto rounded-md border p-4">
                <MarkdownView content={content.content} />
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
