'use client';

import * as React from 'react';

function hasFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Arrastrar y soltar archivos, y pegar imágenes del portapapeles, sobre el
 * compositor. Solo gestiona el evento del navegador: validar y subir lo hace el
 * proveedor. El arrastre nunca es la única vía (existe el botón de adjuntar).
 */
export function useAttachmentDropzone(
  onFiles: (files: File[]) => void,
  enabled: boolean,
): {
  dragging: boolean;
  dropProps: {
    onDragEnter: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDragLeave: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
  };
  onPaste: (event: React.ClipboardEvent) => void;
} {
  const [dragging, setDragging] = React.useState(false);
  // Los hijos disparan dragenter/dragleave: se cuenta la profundidad.
  const depth = React.useRef(0);

  const reset = (): void => {
    depth.current = 0;
    setDragging(false);
  };

  return {
    dragging: enabled && dragging,
    dropProps: {
      onDragEnter: (event) => {
        if (!enabled || !hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      },
      onDragOver: (event) => {
        if (!enabled || !hasFiles(event)) return;
        // Necesario para que el navegador permita soltar.
        event.preventDefault();
      },
      onDragLeave: (event) => {
        if (!enabled || !hasFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDrop: (event) => {
        if (!enabled || !hasFiles(event)) return;
        event.preventDefault();
        const files = Array.from(event.dataTransfer.files);
        reset();
        if (files.length > 0) onFiles(files);
      },
    },
    onPaste: (event) => {
      if (!enabled) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (files.length === 0) return;
      // Una captura pegada no trae texto útil: se adjunta sin tocar el campo.
      event.preventDefault();
      onFiles(files);
    },
  };
}
