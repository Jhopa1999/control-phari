'use client';

import * as React from 'react';
import { ChevronRight, FileSpreadsheet, FileText, Image as ImageIcon, type LucideIcon } from 'lucide-react';
import {
  fileKindLabel,
  fileKindOf,
  formatFileSize,
  type AttachmentFileKind,
} from '@/lib/assistant-attachments';
import type { Attachment } from '@/lib/assistant';
import { FALLBACK_LIMITS } from '@/lib/assistant-attachments';
import { AttachmentTextDialog } from './attachment-text-dialog';

const KIND_ICONS: Record<AttachmentFileKind, LucideIcon> = {
  imagen: ImageIcon,
  pdf: FileText,
  word: FileText,
  hoja: FileSpreadsheet,
  texto: FileText,
};

/**
 * Archivos que acompañaron a un mensaje ya enviado. Cada chip abre el texto
 * que leyó el asistente, en solo lectura.
 */
export function MessageAttachments({
  attachments,
}: {
  attachments: ReadonlyArray<Attachment>;
}): React.ReactElement | null {
  const [open, setOpen] = React.useState<Attachment | null>(null);
  if (attachments.length === 0) return null;
  return (
    <>
      <ul
        aria-label="Archivos adjuntos del mensaje"
        className="mt-2 flex flex-col items-stretch gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end"
      >
        {attachments.map((attachment) => {
          const Icon = KIND_ICONS[fileKindOf(attachment.fileName)];
          return (
            <li key={attachment.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`Ver texto extraído de ${attachment.fileName}, ${fileKindLabel(attachment.fileName)}, ${formatFileSize(attachment.sizeBytes)}`}
                onClick={() => setOpen(attachment)}
                className="inline-flex min-h-11 w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:min-h-8 sm:w-auto"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="max-w-[18ch] truncate" title={attachment.fileName}>
                  {attachment.fileName}
                </span>
                <span className="text-meta tabular-nums text-muted-foreground">
                  · {formatFileSize(attachment.sizeBytes)}
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {open ? (
        <AttachmentTextDialog
          mode="readonly"
          fileName={open.fileName}
          text={open.extractedText}
          truncated={open.truncated}
          maxChars={FALLBACK_LIMITS.maxTextChars}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
