'use client';

import * as React from 'react';
import {
  CircleAlert,
  CircleCheck,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Pencil,
  RotateCw,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fileKindLabel,
  fileKindOf,
  formatFileSize,
  statusLabel,
  type AttachmentFileKind,
} from '@/lib/assistant-attachments';
import { cn } from '@/lib/utils';
import type { AttachmentItem } from './assistant-provider';

const KIND_ICONS: Record<AttachmentFileKind, LucideIcon> = {
  imagen: ImageIcon,
  pdf: FileText,
  word: FileText,
  hoja: FileSpreadsheet,
  texto: FileText,
};

/** Segundos tras los que se avisa que la lectura puede tardar. */
const SLOW_AFTER_MS = 6000;

/** `true` cuando `active` lleva más de `ms` encendido (aviso de espera larga). */
function useSlow(active: boolean, ms: number): boolean {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setSlow(true), ms);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [active, ms]);
  return active && slow;
}

interface AttachmentChipProps {
  item: AttachmentItem;
  onOpen: (item: AttachmentItem) => void;
  onRemove: (item: AttachmentItem) => void;
  onRetry: (item: AttachmentItem) => void;
}

/**
 * Chip de un adjunto del compositor con sus estados: subiendo, leyendo el
 * contenido, listo (abre el texto extraído para revisarlo o editarlo) y error.
 * El estado siempre lleva icono y etiqueta, nunca solo color.
 */
export function AttachmentChip({
  item,
  onOpen,
  onRemove,
  onRetry,
}: AttachmentChipProps): React.ReactElement {
  const KindIcon = KIND_ICONS[fileKindOf(item.name)];
  const busy = item.status === 'subiendo' || item.status === 'extrayendo';
  const slow = useSlow(item.status === 'extrayendo', SLOW_AFTER_MS);
  const label = statusLabel(item.status, item.progress, item.edited);
  const size = formatFileSize(item.size);
  const accessibleName = `${item.name}, ${fileKindLabel(item.name)}, ${size}, ${label}`;

  const StatusIcon =
    item.status === 'listo' ? CircleCheck : item.status === 'error' ? CircleAlert : LoaderCircle;

  const body = (
    <>
      <KindIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex min-w-0 flex-col text-left">
        <span className="max-w-[16ch] truncate font-medium sm:max-w-[24ch]" title={item.name}>
          {item.name}
        </span>
        <span className="flex items-center gap-1 text-meta tabular-nums text-muted-foreground">
          {size} ·{' '}
          <StatusIcon
            className={cn(
              'size-3.5 shrink-0',
              item.status === 'listo' && 'text-success',
              item.status === 'error' && 'text-danger',
              item.status === 'extrayendo' && 'text-info',
              busy && 'animate-spin motion-reduce:animate-none',
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              item.status === 'error' && 'text-danger',
              item.status === 'extrayendo' && 'text-info',
            )}
          >
            {item.status === 'error' ? (item.retryable ? 'No se pudo leer' : 'No se puede usar') : label}
          </span>
        </span>
      </span>
    </>
  );

  return (
    <li className="flex w-full flex-col gap-1 sm:w-auto">
      <div
        className={cn(
          'inline-flex min-h-11 max-w-full items-center gap-1 rounded-lg border py-1 pl-2.5 pr-1 text-sm text-foreground md:min-h-9',
          item.status === 'error'
            ? 'border-danger-border bg-danger-subtle'
            : item.status === 'extrayendo'
              ? 'border-border-strong bg-info-subtle'
              : 'border-border-strong bg-card',
        )}
      >
        {item.status === 'listo' ? (
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`${accessibleName}. Ver y editar el texto extraído`}
            aria-haspopup="dialog"
            onClick={() => onOpen(item)}
          >
            {body}
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-2 py-1" role="group" aria-label={accessibleName}>
            {body}
          </div>
        )}
        <span className="flex shrink-0 items-center">
          {item.status === 'listo' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="pointer-coarse:size-11"
              aria-label={`Ver y editar texto de ${item.name}`}
              onClick={() => onOpen(item)}
            >
              <Pencil aria-hidden="true" />
            </Button>
          ) : null}
          {item.status === 'error' && item.retryable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="pointer-coarse:size-11"
              aria-label={`Reintentar ${item.name}`}
              onClick={() => onRetry(item)}
            >
              <RotateCw aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-11"
            aria-label={`Quitar ${item.name}`}
            onClick={() => onRemove(item)}
          >
            <X aria-hidden="true" />
          </Button>
        </span>
      </div>

      {item.status === 'subiendo' ? (
        <div
          role="progressbar"
          aria-label={`Subida de ${item.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.progress ?? undefined}
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${item.progress ?? 0}%` }}
          />
        </div>
      ) : null}
      {item.status === 'extrayendo' ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-info motion-reduce:w-full motion-reduce:animate-none" />
        </div>
      ) : null}
      {slow ? (
        <p className="text-meta text-muted-foreground">Puede tardar unos segundos.</p>
      ) : null}
      {item.status === 'error' && item.error ? (
        <p className="text-meta text-danger">{item.error}</p>
      ) : null}
    </li>
  );
}
