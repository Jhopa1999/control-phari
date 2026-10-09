'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Asset, CatalogItem, Document } from '@/lib/api-client';

/** Tope de contenido Markdown (design §2.4, AC-032). */
export const CONTENT_LIMIT = 200_000;

export interface DocumentoEditorValues {
  assetId: string;
  title: string;
  categoryCode: string;
  content: string;
}

/** Valor "sin seleccion" para el Select de categoria. */
const NONE = '__none__';

interface DocumentoEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Documento en edicion; si se pasa, guardar crea una nueva version. */
  editing?: Document | null;
  /** Contenido inicial del editor (version vigente al editar). */
  initialContent: string;
  /** True mientras se resuelve el contenido vigente del documento. */
  contentLoading: boolean;
  assets: Asset[];
  categoryOptions: CatalogItem[];
  submitting: boolean;
  /** Mensaje de error en linea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: DocumentoEditorValues) => void;
}

export function DocumentoEditorDialog({
  open,
  onOpenChange,
  editing,
  initialContent,
  contentLoading,
  assets,
  categoryOptions,
  submitting,
  errorMessage,
  onSubmit,
}: DocumentoEditorDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [assetId, setAssetId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [categoryCode, setCategoryCode] = React.useState('');
  const [content, setContent] = React.useState('');
  const [mode, setMode] = React.useState<'editor' | 'preview'>('editor');
  const [clientError, setClientError] = React.useState<string | null>(null);

  // Inicializa metadatos al abrir. El reset solo ocurre aqui (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    setMode('editor');
    if (editing) {
      setAssetId(editing.assetId);
      setTitle(editing.title);
      setCategoryCode(editing.categoryCode ?? '');
    } else {
      setAssetId('');
      setTitle('');
      setCategoryCode('');
      setContent('');
    }
  }, [open, editing]);

  // Al editar, el contenido vigente llega async: lo cargamos cuando resuelve.
  React.useEffect(() => {
    if (!open || !editing) return;
    setContent(initialContent);
  }, [open, editing, initialContent]);

  const count = content.length;
  const overLimit = count > CONTENT_LIMIT;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isEdit && !assetId) {
      setClientError('Selecciona el activo del documento.');
      return;
    }
    if (title.trim() === '') {
      setClientError('El titulo es obligatorio.');
      return;
    }
    if (content.trim() === '') {
      setClientError('El contenido no puede estar vacio.');
      return;
    }
    if (overLimit) {
      setClientError(
        `El contenido supera el limite de ${CONTENT_LIMIT.toLocaleString('es')} caracteres.`,
      );
      return;
    }
    setClientError(null);
    onSubmit({ assetId, title: title.trim(), categoryCode, content });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    // Atajo Ctrl+S / Cmd+S para guardar (design §6).
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!submitting && !overLimit) handleSubmit(event as React.FormEvent);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar documento' : 'Nuevo documento'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Guardar crea una nueva version. Las versiones anteriores se conservan en el historial.'
              : 'Al guardar se crea el documento con su primera version de contenido.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="doc-asset">Activo *</Label>
            {isEdit ? (
              <Input
                id="doc-asset"
                readOnly
                disabled
                value={
                  assets.find((a) => a.id === assetId)?.name ?? assetId
                }
              />
            ) : (
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger id="doc-asset">
                  <SelectValue placeholder="Selecciona un activo" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isEdit ? (
              <p className="text-xs text-muted-foreground">
                El activo de un documento no se puede cambiar.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="doc-title">Titulo *</Label>
              <Input
                id="doc-title"
                value={title}
                placeholder="Manual tecnico"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-category">Categoria</Label>
              <Select
                value={categoryCode === '' ? NONE : categoryCode}
                onValueChange={(v) => setCategoryCode(v === NONE ? '' : v)}
              >
                <SelectTrigger id="doc-category">
                  <SelectValue placeholder="Sin categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin categoria</SelectItem>
                  {categoryOptions.map((o) => (
                    <SelectItem key={o.id} value={o.code}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="doc-content">Contenido (Markdown) *</Label>
              <div className="flex items-center gap-2">
                <div
                  role="tablist"
                  aria-label="Modo de edicion"
                  className="flex rounded-md border"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'editor'}
                    className={`rounded-l-md px-3 py-1 text-sm ${mode === 'editor' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                    onClick={() => setMode('editor')}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'preview'}
                    className={`rounded-r-md px-3 py-1 text-sm ${mode === 'preview' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                    onClick={() => setMode('preview')}
                  >
                    Vista previa
                  </button>
                </div>
              </div>
            </div>

            {mode === 'editor' ? (
              <Textarea
                id="doc-content"
                value={content}
                disabled={contentLoading}
                className="min-h-[320px] font-mono text-sm"
                placeholder={
                  contentLoading
                    ? 'Cargando contenido...'
                    : '# Titulo\n\nEscribe el contenido en Markdown.'
                }
                onChange={(e) => setContent(e.target.value)}
              />
            ) : (
              <pre className="min-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm">
                {content || 'Nada que previsualizar todavia.'}
              </pre>
            )}

            <p
              className={`text-right text-xs ${overLimit ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
              aria-live="polite"
            >
              {count.toLocaleString('es')}/{CONTENT_LIMIT.toLocaleString('es')}
              {overLimit ? ' — supera el limite' : ''}
            </p>
          </div>

          {clientError || errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {clientError ?? errorMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || overLimit || contentLoading}>
              {submitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
