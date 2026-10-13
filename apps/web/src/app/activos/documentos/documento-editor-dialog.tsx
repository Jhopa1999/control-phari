'use client';

import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError, RequiredHint } from '@/components/field';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { Asset, CatalogItem, Document } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/** Tope de contenido Markdown (design §2.4, AC-032). */
export const CONTENT_LIMIT = 200_000;
const LIMIT_TEXT = CONTENT_LIMIT.toLocaleString('es');
const NUMBER_FORMAT = new Intl.NumberFormat('es');

export interface DocumentoEditorValues {
  assetId: string;
  title: string;
  categoryCode: string;
  content: string;
}

/** Valor «sin selección» para el Select de categoría. */
const NONE = '__none__';
/** Id del formulario: el FormError lleva `doc-form-error`. */
const FORM_ID = 'doc-form';

type FieldKey = 'assetId' | 'title' | 'content';
type FieldErrors = Partial<Record<FieldKey, string>>;

interface DocumentoEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Documento en edición; si se pasa, guardar crea una versión nueva. */
  editing?: Document | null;
  /** Nombre del activo del documento en edición (puede estar retirado). */
  editingAssetName?: string;
  /** Contenido inicial del editor (versión vigente al editar). */
  initialContent: string;
  /** True mientras se resuelve el contenido vigente del documento. */
  contentLoading: boolean;
  /** Activos no retirados, candidatos al crear. */
  assets: Asset[];
  categoryOptions: CatalogItem[];
  submitting: boolean;
  /** Error del backend en línea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: DocumentoEditorValues) => void;
}

/** Reglas del cliente (las de siempre), evaluadas todas a la vez (design §9). */
function validate(
  values: { assetId: string; title: string; content: string },
  isEdit: boolean,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!isEdit && !values.assetId) errors.assetId = 'Selecciona el activo del documento.';
  if (values.title.trim() === '') errors.title = 'El título es obligatorio.';
  if (values.content.trim() === '') errors.content = 'El contenido no puede estar vacío.';
  else if (values.content.length > CONTENT_LIMIT) {
    errors.content = `El contenido supera el límite de ${LIMIT_TEXT} caracteres.`;
  }
  return errors;
}

/**
 * Editor de un documento (design §11.17), diálogo xl. Pestañas «Editor» y
 * «Vista previa»; contador de 200.000 caracteres; Ctrl/Cmd+S guarda. Al
 * editar, el padre guarda los metadatos si cambian y crea una versión nueva.
 */
export function DocumentoEditorDialog({
  open,
  onOpenChange,
  editing,
  editingAssetName,
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
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const assetRef = React.useRef<HTMLButtonElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const contentRef = React.useRef<HTMLTextAreaElement>(null);
  // Sin DialogTrigger, el foco vuelve al botón que abrió el editor (NIT 4).
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  // Inicializa los metadatos al abrir. El reset solo ocurre aquí (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setFieldErrors({});
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

  // Al editar, el contenido vigente llega después: se carga cuando resuelve.
  React.useEffect(() => {
    if (!open || !editing) return;
    setContent(initialContent);
  }, [open, editing, initialContent]);

  const count = content.length;
  const overLimit = count > CONTENT_LIMIT;

  function clearError(key: FieldKey): void {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function submit(): void {
    const errors = validate({ assetId, title, content }, isEdit);
    setFieldErrors(errors);
    if (errors.assetId || errors.title || errors.content) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.assetId) assetRef.current?.focus();
      else if (errors.title) titleRef.current?.focus();
      else {
        setMode('editor');
        requestAnimationFrame(() => contentRef.current?.focus());
      }
      return;
    }
    onSubmit({ assetId, title: title.trim(), categoryCode, content });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    // Atajo Ctrl+S / Cmd+S para guardar.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!submitting && !overLimit && !contentLoading) submit();
    }
  }

  const contentDescribedBy = [
    'doc-content-count',
    overLimit ? 'doc-content-limit' : null,
    fieldErrors.content && !overLimit ? 'doc-content-error' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        onKeyDown={handleKeyDown}
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar documento' : 'Nuevo documento'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Guardar crea una versión nueva. Las versiones anteriores se conservan en el historial.'
              : 'Al guardar se crea el documento con su primera versión de contenido.'}{' '}
            Atajo: Ctrl+S o Cmd+S.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />

            <Field
              id="doc-asset"
              label="Activo"
              required={!isEdit}
              error={fieldErrors.assetId}
              help={isEdit ? 'El activo de un documento no se puede cambiar.' : undefined}
            >
              {(control) =>
                isEdit ? (
                  <Input
                    {...control}
                    readOnly
                    disabled
                    value={
                      editingAssetName ??
                      assets.find((a) => a.id === assetId)?.name ??
                      'Activo fuera de tu alcance'
                    }
                  />
                ) : (
                  <Select
                    value={assetId}
                    onValueChange={(v) => {
                      setAssetId(v);
                      clearError('assetId');
                    }}
                  >
                    <SelectTrigger ref={assetRef} {...control}>
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
                )
              }
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="doc-title" label="Título" required error={fieldErrors.title}>
                <Input
                  ref={titleRef}
                  value={title}
                  placeholder="Manual técnico"
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearError('title');
                  }}
                />
              </Field>
              <Field id="doc-category" label="Categoría">
                {(control) => (
                  <Select
                    value={categoryCode === '' ? NONE : categoryCode}
                    onValueChange={(v) => setCategoryCode(v === NONE ? '' : v)}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin categoría</SelectItem>
                      {categoryOptions.map((o) => (
                        <SelectItem key={o.id} value={o.code}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="doc-content">
                Contenido (Markdown)
                <span aria-hidden="true"> *</span>
              </Label>
              <Tabs value={mode} onValueChange={(v) => setMode(v === 'preview' ? 'preview' : 'editor')}>
                <TabsList aria-label="Modo de edición">
                  <TabsTrigger value="editor">Editor</TabsTrigger>
                  <TabsTrigger value="preview">Vista previa</TabsTrigger>
                </TabsList>
                {/* forceMount: el Textarea sigue en el DOM en «Vista previa», para que
                    la etiqueta y el foco al primer error funcionen siempre. */}
                <TabsContent value="editor" forceMount className="pt-3 data-[state=inactive]:hidden">
                  <Textarea
                    ref={contentRef}
                    id="doc-content"
                    value={content}
                    disabled={contentLoading}
                    aria-required
                    aria-invalid={fieldErrors.content || overLimit ? true : undefined}
                    aria-describedby={contentDescribedBy}
                    className="min-h-80 max-h-[60dvh] resize-y font-mono field-sizing-fixed"
                    placeholder={
                      contentLoading
                        ? 'Cargando contenido…'
                        : '# Título\n\nEscribe el contenido en Markdown.'
                    }
                    onChange={(e) => {
                      setContent(e.target.value);
                      clearError('content');
                    }}
                  />
                </TabsContent>
                <TabsContent value="preview" className="pt-3">
                  <div className="min-h-80 max-h-[60dvh] overflow-auto rounded-md border p-4">
                    {content ? (
                      <MarkdownView content={content} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nada que previsualizar todavía.
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="grid gap-1">
                  {overLimit ? (
                    <p id="doc-content-limit" role="alert" className="flex gap-1 text-meta text-danger">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>{`Supera el límite de ${LIMIT_TEXT} caracteres.`}</span>
                    </p>
                  ) : null}
                  {fieldErrors.content && !overLimit ? (
                    <p id="doc-content-error" className="flex gap-1 text-meta text-danger">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>{fieldErrors.content}</span>
                    </p>
                  ) : null}
                </div>
                <p
                  id="doc-content-count"
                  className={cn(
                    'ml-auto text-meta tabular-nums',
                    overLimit ? 'font-medium text-danger' : 'text-muted-foreground',
                  )}
                >
                  {`${NUMBER_FORMAT.format(count)}/${LIMIT_TEXT}`}
                </p>
              </div>
            </div>

            <FormError id={FORM_ID} message={errorMessage} />
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={submitting} disabled={overLimit || contentLoading}>
              {submitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
