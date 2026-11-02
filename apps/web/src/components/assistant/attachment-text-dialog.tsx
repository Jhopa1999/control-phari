'use client';

import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog, useDialogReturnFocus } from '@/components/confirm-dialog';
import { InlineNotice } from '@/components/inline-notice';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const NUMBER = new Intl.NumberFormat('es-CO');

interface AttachmentTextDialogProps {
  /** Edición (adjunto sin enviar) o solo lectura (mensaje ya enviado). */
  mode: 'edit' | 'readonly';
  fileName: string;
  text: string;
  /** El texto se recortó por superar el máximo al leer el archivo. */
  truncated: boolean;
  maxChars: number;
  /** Imagen original para mostrar una miniatura (solo mientras se edita). */
  imageFile?: File | null;
  /** Guarda el texto corregido; si falla, lanza un Error con el motivo. */
  onSave?: (text: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Texto que el asistente extrajo de un archivo («Esto entendí del adjunto:»).
 * Antes de enviar se puede revisar y corregir; en un mensaje ya enviado se
 * muestra tal como lo recibió el asistente, en solo lectura.
 */
export function AttachmentTextDialog({
  mode,
  fileName,
  text,
  truncated,
  maxChars,
  imageFile,
  onSave,
  onClose,
}: AttachmentTextDialogProps): React.ReactElement {
  const editable = mode === 'edit';
  const [value, setValue] = React.useState(text);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const labelId = React.useId();
  const counterId = React.useId();
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  const dirty = editable && value !== text;
  const over = value.length > maxChars;
  const empty = value.trim() === '';

  // Miniatura de la imagen original (se libera al cerrar).
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!imageFile) return;
    let cancelled = false;
    // Data URL en memoria: no deja un blob que liberar y no depende del montaje doble.
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled && typeof reader.result === 'string') setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(imageFile);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [imageFile]);

  function requestClose(): void {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  async function handleSave(): Promise<void> {
    if (!onSave || over || empty) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
      toast.success('Texto guardado.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el texto. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Texto copiado.');
    } catch {
      toast.error('No se pudo copiar el texto.');
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => (!open ? requestClose() : undefined)}>
        <DialogContent
          size="lg"
          className="max-sm:h-[calc(100dvh-1rem)]"
          onOpenAutoFocus={() => captureTrigger()}
          onCloseAutoFocus={handleCloseAutoFocus}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="truncate" title={fileName}>
              {fileName}
            </DialogTitle>
            <DialogDescription id={labelId} className="font-medium text-foreground">
              {editable ? 'Esto entendí del adjunto:' : 'Texto que leyó el asistente:'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
              <img
                src={previewUrl}
                alt={`Vista previa de ${fileName}`}
                className="max-h-32 w-auto self-start rounded-lg border"
              />
            ) : null}
            <Textarea
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              readOnly={!editable}
              aria-labelledby={labelId}
              aria-describedby={counterId}
              aria-invalid={over || undefined}
              className={cn(
                'min-h-48 max-h-[50dvh] font-mono text-base md:text-sm',
                !editable && 'bg-muted/40',
              )}
            />
            <p
              id={counterId}
              className={cn(
                'flex items-center gap-1 text-meta tabular-nums',
                over ? 'text-danger' : 'text-muted-foreground',
              )}
            >
              {over ? <CircleAlert className="size-3.5" aria-hidden="true" /> : null}
              {NUMBER.format(value.length)} / {NUMBER.format(maxChars)} caracteres
              {over ? ' · Supera el límite; acórtalo para guardar.' : ''}
            </p>
            {truncated ? (
              <InlineNotice tone="warning" role="status" title="Texto recortado">
                El archivo era más largo de lo que puede leer el asistente. Solo se usará esta parte.
              </InlineNotice>
            ) : null}
            <InlineNotice tone="info">
              {editable
                ? 'Este texto se enviará al asistente junto con tu mensaje. Revisa que no incluya datos que no quieras compartir.'
                : 'Este fue el texto que se envió al asistente.'}
            </InlineNotice>
            {error ? (
              <InlineNotice tone="danger" role="alert">
                {error}
              </InlineNotice>
            ) : null}
          </DialogBody>
          <DialogFooter>
            {editable ? (
              <>
                <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
                  {dirty ? 'Descartar cambios' : 'Cerrar'}
                </Button>
                <Button
                  type="button"
                  loading={saving}
                  disabled={!dirty || over || empty}
                  onClick={() => void handleSave()}
                >
                  Guardar
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => void handleCopy()}>
                  Copiar texto
                </Button>
                <Button type="button" onClick={onClose}>
                  Cerrar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="¿Descartar los cambios?"
        description="Perderás las correcciones que hiciste al texto de este adjunto."
        confirmLabel="Descartar cambios"
        onConfirm={onClose}
      />
    </>
  );
}
