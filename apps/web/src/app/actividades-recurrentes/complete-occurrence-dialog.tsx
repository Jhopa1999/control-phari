'use client';

import * as React from 'react';
import { CircleCheck, FileText, Loader2, Paperclip, TriangleAlert, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog, useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError, RequiredHint } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { RecurringOccurrence } from '@/lib/api-client';
import { formatDateOnly, formatHours } from '@/lib/format';
import {
  completeOccurrence,
  deleteEvidence,
  listEvidence,
  uploadEvidence,
} from '@/lib/recurring-activities';
import { EVIDENCE_ACCEPT, EVIDENCE_MAX_MB, formatFileSize } from '@/lib/task-evidence';
import { cn } from '@/lib/utils';
import { messageOf } from './occurrence-shared';

const COMMENT_MAX = 2000;
const FORM_ID = 'complete-occurrence-form';
const ACCEPTED_EXTENSIONS = EVIDENCE_ACCEPT.split(',');

type FileState = 'queued' | 'uploading' | 'done' | 'error';

interface FileEntry {
  key: string;
  name: string;
  size: number;
  state: FileState;
  /** Archivo local, mientras no se haya subido. */
  file?: File;
  /** Id del adjunto en el servidor, una vez subido. */
  evidenceId?: string;
  error?: string;
}

/** Validación de tipo y tamaño con las constantes mostradas al usuario. */
function validateFile(file: File): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return `“${file.name}”: tipo no permitido.`;
  if (file.size > EVIDENCE_MAX_MB * 1024 * 1024) {
    return `“${file.name}” supera los ${EVIDENCE_MAX_MB} MB.`;
  }
  return null;
}

export interface CompleteOccurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: RecurringOccurrence | null;
  /** Se llama tras completar con éxito (la vista recarga sus datos). */
  onCompleted: () => void | Promise<void>;
}

/**
 * Completar una actividad recurrente: qué se realizó*, horas* y adjuntos
 * (múltiples, subida previa por archivo). Autónomo y reutilizable (también lo
 * usa «Mi trabajo»). La ventana, la transición y la evidencia exigida las
 * valida la API; sus mensajes 409 se muestran tal cual.
 */
export function CompleteOccurrenceDialog({
  open,
  onOpenChange,
  occurrence,
  onCompleted,
}: CompleteOccurrenceDialogProps): React.ReactElement {
  const [comment, setComment] = React.useState('');
  const [hours, setHours] = React.useState('');
  const [errors, setErrors] = React.useState<{
    comment: string | null;
    hours: string | null;
    files: string | null;
  }>({ comment: null, hours: null, files: null });
  const [files, setFiles] = React.useState<FileEntry[]>([]);
  const [fileNotes, setFileNotes] = React.useState<string[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [summary, setSummary] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const commentRef = React.useRef<HTMLTextAreaElement>(null);
  const hoursRef = React.useRef<HTMLInputElement>(null);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  const occurrenceId = occurrence?.id ?? null;
  const prefillHours = occurrence ? String(occurrence.estimatedHours) : '';
  const existingCount = occurrence?.evidenceCount ?? 0;

  React.useEffect(() => {
    if (!open || !occurrenceId || existingCount === 0) return;
    let cancelled = false;
    listEvidence(occurrenceId)
      .then((list) => {
        if (cancelled) return;
        setFiles((current) => [
          ...list
            .filter((item) => !current.some((entry) => entry.evidenceId === item.id))
            .map<FileEntry>((item) => ({
              key: item.id,
              name: item.fileName,
              size: item.sizeBytes,
              state: 'done',
              evidenceId: item.id,
            })),
          ...current,
        ]);
      })
      .catch(() => {
        // Sin la lista previa se puede seguir; la API valida la evidencia exigida.
      });
    return () => {
      cancelled = true;
    };
  }, [open, occurrenceId, existingCount]);

  const [seenKey, setSeenKey] = React.useState<string | null>(null);
  const resetKey = open ? (occurrenceId ?? '') : null;
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    if (open) {
      setComment('');
      setHours(prefillHours);
      setErrors({ comment: null, hours: null, files: null });
      setFiles([]);
      setFileNotes([]);
      setFormError(null);
      setSubmitting(false);
      setConfirmClose(false);
      setSummary('');
    }
  }

  const uploading = files.some((f) => f.state === 'uploading' || f.state === 'queued');
  const uploadedCount = files.filter((f) => f.state === 'done').length;
  const late = occurrence?.displayStatus === 'VENCIDA';

  function patchFile(key: string, patch: Partial<FileEntry>): void {
    setFiles((current) => current.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  async function uploadOne(entry: FileEntry): Promise<void> {
    if (!occurrenceId || !entry.file) return;
    patchFile(entry.key, { state: 'uploading', error: undefined });
    try {
      const created = await uploadEvidence(occurrenceId, entry.file);
      patchFile(entry.key, { state: 'done', evidenceId: created.id, file: undefined });
      setErrors((p) => (p.files ? { ...p, files: null } : p));
    } catch (err) {
      patchFile(entry.key, { state: 'error', error: messageOf(err) });
    }
  }

  async function addFiles(list: FileList | File[]): Promise<void> {
    const notes: string[] = [];
    const entries: FileEntry[] = [];
    for (const file of Array.from(list)) {
      const problem = validateFile(file);
      if (problem) {
        notes.push(problem);
        continue;
      }
      entries.push({
        key: `${file.name}-${file.size}-${Date.now()}-${entries.length}`,
        name: file.name,
        size: file.size,
        state: 'queued',
        file,
      });
    }
    setFileNotes(notes);
    if (entries.length === 0) return;
    setFiles((current) => [...current, ...entries]);
    // Un archivo por petición, en orden.
    for (const entry of entries) {
      await uploadOne(entry);
    }
  }

  async function removeFile(entry: FileEntry): Promise<void> {
    if (entry.state === 'done' && entry.evidenceId && occurrenceId) {
      try {
        await deleteEvidence(occurrenceId, entry.evidenceId);
      } catch (err) {
        setFormError(messageOf(err));
        return;
      }
    }
    setFiles((current) => current.filter((f) => f.key !== entry.key));
  }

  function requestClose(next: boolean): void {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (submitting) return;
    if (files.length > 0) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!occurrence || submitting) return;
    const text = comment.trim();
    const actualHours = Number.parseFloat(hours.replace(',', '.'));
    const next = {
      comment: text === '' ? 'Cuéntanos qué se realizó para poder completarla.' : null,
      hours:
        Number.isFinite(actualHours) && actualHours > 0 && actualHours <= 999.99
          ? null
          : 'Indica las horas dedicadas (mayor que 0).',
      files:
        occurrence.requiresEvidence && uploadedCount === 0
          ? 'Esta actividad exige al menos un adjunto como evidencia.'
          : null,
    };
    setErrors(next);
    const count = [next.comment, next.hours, next.files].filter(Boolean).length;
    if (count > 0) {
      setSummary(`Hay ${count} ${count === 1 ? 'campo' : 'campos'} por corregir.`);
      if (next.comment) commentRef.current?.focus();
      else if (next.hours) hoursRef.current?.focus();
      else inputRef.current?.focus();
      return;
    }
    setSummary('');
    setSubmitting(true);
    setFormError(null);
    try {
      await completeOccurrence(occurrence.id, { comment: text, actualHours });
      toast.success('Actividad completada.');
      setFiles([]);
      onOpenChange(false);
      await onCompleted();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const evidenceLabel = occurrence?.requiresEvidence ? 'Adjuntos' : 'Adjuntos (reportes, evidencias)';

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          size="md"
          onOpenAutoFocus={(event) => {
            captureTrigger();
            event.preventDefault();
            commentRef.current?.focus();
          }}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>Completar actividad</DialogTitle>
            <DialogDescription>
              {occurrence ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>
                    «{occurrence.activityTitle}» · fecha objetivo {formatDateOnly(occurrence.targetDate)}
                  </span>
                  <StatusBadge kind="occurrence" value={occurrence.displayStatus} />
                </span>
              ) : (
                'Marcar la actividad como completada.'
              )}
            </DialogDescription>
          </DialogHeader>

          <form
            id={FORM_ID}
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <DialogBody className="grid gap-4">
              <RequiredHint />
              <p className="sr-only" role="status" aria-live="polite">
                {summary}
              </p>

              {late && occurrence ? (
                <InlineNotice tone="warning">
                  Esta actividad venció el {formatDateOnly(occurrence.targetDate)}. Se registrará como completada
                  tarde.
                </InlineNotice>
              ) : null}

              <Field
                id="complete-comment"
                label="Qué se realizó"
                required
                help="Describe el resultado: qué hiciste y qué entregaste."
                error={errors.comment}
              >
                <Textarea
                  ref={commentRef}
                  value={comment}
                  rows={4}
                  maxLength={COMMENT_MAX}
                  onChange={(e) => {
                    setComment(e.target.value);
                    setErrors((p) => (p.comment ? { ...p, comment: null } : p));
                  }}
                />
              </Field>
              <p className="-mt-3 text-right text-meta tabular-nums text-muted-foreground">
                {comment.length}/{COMMENT_MAX}
              </p>

              <Field
                id="complete-hours"
                label="Horas dedicadas"
                required
                help={
                  occurrence
                    ? `Estimado: ${formatHours(occurrence.estimatedHours)}. Ajusta si dedicaste más o menos tiempo.`
                    : undefined
                }
                error={errors.hours}
              >
                <Input
                  ref={hoursRef}
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  step={0.25}
                  className="w-32"
                  value={hours}
                  onChange={(e) => {
                    setHours(e.target.value);
                    setErrors((p) => (p.hours ? { ...p, hours: null } : p));
                  }}
                />
              </Field>

              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span id="complete-files-label" className="text-sm font-medium">
                    {evidenceLabel}
                    {occurrence?.requiresEvidence ? (
                      <span aria-hidden="true" className="text-danger">
                        {' '}
                        *
                      </span>
                    ) : null}
                  </span>
                  {occurrence?.requiresEvidence ? (
                    <Badge variant="warning">
                      <Paperclip aria-hidden="true" />
                      Evidencia requerida
                    </Badge>
                  ) : null}
                </div>
                <p id="complete-files-help" className="text-meta text-muted-foreground">
                  Formatos permitidos: {ACCEPTED_EXTENSIONS.map((e) => e.slice(1)).join(', ')}. Máximo{' '}
                  {EVIDENCE_MAX_MB} MB por archivo.
                </p>
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    void addFiles(event.dataTransfer.files);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-card p-4 text-center',
                    dragging && 'border-primary bg-primary-subtle',
                  )}
                >
                  <Upload aria-hidden="true" className="size-5 text-muted-foreground" />
                  <p className="text-sm">Arrastra archivos aquí o</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                    Elegir archivos
                  </Button>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={EVIDENCE_ACCEPT}
                    className="sr-only"
                    tabIndex={-1}
                    aria-labelledby="complete-files-label"
                    aria-describedby="complete-files-help"
                    onChange={(event) => {
                      if (event.target.files) void addFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </div>

                {fileNotes.length > 0 ? (
                  <ul className="flex flex-col gap-1" role="alert">
                    {fileNotes.map((note) => (
                      <li key={note} className="flex gap-1 text-meta text-danger">
                        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {files.length > 0 ? (
                  <ul aria-label="Archivos adjuntos" className="flex flex-col gap-2">
                    {files.map((entry) => (
                      <li key={entry.key} className="flex flex-col gap-1 rounded-lg bg-surface-subtle px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm" title={entry.name}>
                            {entry.name}
                          </span>
                          <span className="text-meta tabular-nums text-muted-foreground">
                            {formatFileSize(entry.size)}
                          </span>
                          {entry.state === 'queued' ? (
                            <span className="text-meta text-muted-foreground">En cola</span>
                          ) : null}
                          {entry.state === 'uploading' ? (
                            <span
                              role="progressbar"
                              aria-label={`Subiendo ${entry.name}`}
                              aria-valuetext="Subiendo"
                              className="inline-flex items-center gap-1 text-meta text-muted-foreground"
                            >
                              <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                              Subiendo
                            </span>
                          ) : null}
                          {entry.state === 'done' ? (
                            <span className="inline-flex items-center gap-1 text-meta text-success">
                              <CircleCheck aria-hidden="true" className="size-4" />
                              Subido
                            </span>
                          ) : null}
                          {entry.state === 'error' ? (
                            <TriangleAlert aria-hidden="true" className="size-4 text-danger" />
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Quitar ${entry.name}`}
                            disabled={entry.state === 'uploading'}
                            onClick={() => void removeFile(entry)}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </div>
                        {entry.state === 'error' ? (
                          <div className="flex flex-wrap items-center gap-2 text-meta text-danger">
                            <span>No se pudo subir: {entry.error}</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => void uploadOne(entry)}>
                              Reintentar
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {errors.files ? (
                  <p className="flex gap-1 text-meta text-danger" role="alert">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    {errors.files}
                  </p>
                ) : null}
              </div>

              <FormError id={FORM_ID} message={formError} />
            </DialogBody>

            <DialogFooter className="max-sm:flex-col-reverse">
              {uploading ? (
                <p id="complete-wait" className="mr-auto text-meta text-muted-foreground">
                  Espera a que terminen de subirse los archivos.
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => requestClose(false)}
                disabled={submitting}
                className="max-sm:w-full"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={submitting}
                disabled={uploading}
                aria-describedby={uploading ? 'complete-wait' : undefined}
                className="max-sm:w-full"
              >
                {submitting ? 'Guardando…' : 'Completar actividad'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="¿Cerrar sin completar?"
        description="Se perderán los archivos seleccionados que aún no se subieron. Los ya subidos quedan adjuntos a la actividad."
        confirmLabel="Cerrar"
        cancelLabel="Volver"
        tone="default"
        onConfirm={() => {
          setFiles([]);
          onOpenChange(false);
        }}
      />
    </>
  );
}
