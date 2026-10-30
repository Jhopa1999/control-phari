'use client';

import * as React from 'react';
import { Download, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { TaskEvidence } from '@/lib/api-client';
import { PlanError } from '@/lib/plan';
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_MB,
  deleteTaskEvidence,
  formatFileSize,
  listTaskEvidence,
  openTaskEvidence,
  uploadTaskEvidence,
} from '@/lib/task-evidence';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Archivos de evidencia de una tarea: lista, subida, descarga y borrado. Los
 * archivos viven en el bucket maestro del app; el backend autoriza cada acción.
 */
export function TaskEvidenceFiles({ taskId }: { taskId: string }): React.ReactElement {
  const [files, setFiles] = React.useState<TaskEvidence[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toDelete, setToDelete] = React.useState<TaskEvidence | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();

  const loadData = React.useCallback(() => {
    return listTaskEvidence(taskId)
      .then((list) => {
        setFiles(list);
        setState('success');
      })
      .catch(() => {
        setState('error');
      });
  }, [taskId]);
  const load = React.useCallback(async () => {
    setState('loading');
    await loadData();
  }, [loadData]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > EVIDENCE_MAX_MB * 1024 * 1024) {
      setError(`El archivo supera el tamaño máximo (${EVIDENCE_MAX_MB} MB).`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const created = await uploadTaskEvidence(taskId, file);
      setFiles((prev) => [created, ...prev]);
      toast.success('Evidencia adjuntada.');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleOpen(file: TaskEvidence) {
    try {
      await openTaskEvidence(taskId, file.id);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await deleteTaskEvidence(taskId, toDelete.id);
      setFiles((prev) => prev.filter((f) => f.id !== toDelete.id));
      toast.success('Evidencia eliminada.');
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setToDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

      {state === 'loading' ? (
        <div aria-busy="true">
          <Skeleton className="h-10 rounded-md" />
        </div>
      ) : state === 'error' ? (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p className="text-muted-foreground">No fue posible cargar los archivos.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay archivos adjuntos.</p>
      ) : (
        <ul aria-label="Archivos de evidencia" className="divide-y rounded-md border">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 px-3 py-2">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={file.fileName}>
                  {file.fileName}
                </p>
                <p className="text-meta text-muted-foreground">
                  {formatFileSize(file.sizeBytes)} · {file.uploadedByName}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void handleOpen(file)}
              >
                <Download aria-hidden="true" />
                <span className="sr-only">{`Descargar ${file.fileName}`}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setToDelete(file);
                  setConfirmOpen(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                <span className="sr-only">{`Quitar ${file.fileName}`}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col items-start gap-1">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={EVIDENCE_ACCEPT}
          className="sr-only"
          onChange={(e) => void handleSelected(e)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload aria-hidden="true" />
          {uploading ? 'Subiendo…' : 'Adjuntar archivo'}
        </Button>
        <p className="text-meta text-muted-foreground">
          PDF, imágenes, texto, Office o ZIP. Máximo {EVIDENCE_MAX_MB} MB.
        </p>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`¿Quitar «${toDelete?.fileName ?? ''}»?`}
        description="El archivo se elimina del almacenamiento y no se puede recuperar."
        confirmLabel="Quitar"
        tone="danger"
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
