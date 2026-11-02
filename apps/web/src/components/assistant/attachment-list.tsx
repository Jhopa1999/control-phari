'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import { AttachmentChip } from './attachment-chip';
import { AttachmentTextDialog } from './attachment-text-dialog';
import {
  useAssistant,
  type AttachmentItem,
  type AttachmentNotice,
} from './assistant-provider';

function Notice({
  notice,
  onDismiss,
}: {
  notice: AttachmentNotice;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <InlineNotice
      tone={notice.tone}
      role={notice.tone === 'danger' ? 'alert' : 'status'}
      title={notice.title}
      action={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Descartar aviso"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </Button>
      }
    >
      <p className="text-muted-foreground">{notice.message}</p>
      {notice.items ? (
        <ul className="mt-1 list-disc pl-4 text-meta text-muted-foreground">
          {notice.items.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </InlineNotice>
  );
}

/**
 * Avisos de límites y chips de los adjuntos del compositor. El visor del texto
 * extraído es un diálogo: el chip «listo» lo abre y al cerrarlo devuelve el foco.
 */
export function AttachmentList(): React.ReactElement | null {
  const a = useAssistant();
  const [open, setOpen] = React.useState<AttachmentItem | null>(null);

  if (a.attachments.length === 0 && a.attachmentNotices.length === 0) return null;

  // Siempre el estado más reciente del adjunto abierto (puede cambiar al guardar).
  const current = open ? a.attachments.find((i) => i.localId === open.localId) ?? null : null;

  return (
    <div className="flex flex-col gap-2">
      {a.attachmentNotices.map((notice) => (
        <Notice key={notice.id} notice={notice} onDismiss={a.dismissAttachmentNotices} />
      ))}
      {a.attachments.length > 0 ? (
        <ul
          aria-label="Archivos adjuntos"
          className="flex max-h-36 flex-wrap gap-2 overflow-y-auto md:max-h-44"
        >
          {a.attachments.map((item) => (
            <AttachmentChip
              key={item.localId}
              item={item}
              onOpen={setOpen}
              onRemove={(i) => a.removeAttachment(i.localId)}
              onRetry={(i) => a.retryAttachment(i.localId)}
            />
          ))}
        </ul>
      ) : null}
      {current?.attachment ? (
        <AttachmentTextDialog
          key={current.localId}
          mode="edit"
          fileName={current.name}
          text={current.attachment.extractedText}
          truncated={current.attachment.truncated}
          maxChars={a.attachmentLimits.maxTextChars}
          imageFile={current.attachment.kind === 'imagen' ? current.file : null}
          onSave={(text) => a.saveAttachmentText(current.localId, text)}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
