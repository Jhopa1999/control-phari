'use client';

import * as React from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TYPES_HELP, acceptAttribute, type AttachmentLimitsView } from '@/lib/assistant-attachments';

interface AttachmentButtonProps {
  limits: AttachmentLimitsView;
  /** Ya se alcanzó el máximo de archivos o el asistente no está disponible. */
  unavailable: boolean;
  /** Id del texto que explica los límites (aria-describedby). */
  describedBy: string;
  onFiles: (files: File[]) => void;
}

/** Clip del compositor: abre el selector de archivos (alternativa al arrastre). */
export function AttachmentButton({
  limits,
  unavailable,
  describedBy,
  onFiles,
}: AttachmentButtonProps): React.ReactElement {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 md:size-10"
        aria-label="Adjuntar archivos"
        aria-describedby={describedBy}
        title={`Adjuntar archivos. ${TYPES_HELP}`}
        unavailable={unavailable}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip aria-hidden="true" />
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        accept={acceptAttribute(limits)}
        data-testid="assistant-file-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Permite elegir el mismo archivo otra vez después de quitarlo.
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}
