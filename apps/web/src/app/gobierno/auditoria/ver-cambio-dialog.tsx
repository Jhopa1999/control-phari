'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AuditEvent } from '@/lib/api-client';

interface VerCambioDialogProps {
  event: AuditEvent | null;
  onOpenChange: (open: boolean) => void;
}

function render(value: AuditEvent['before']): string {
  if (value === null || value === undefined) return 'Sin datos';
  return JSON.stringify(value, null, 2);
}

export function VerCambioDialog({
  event,
  onOpenChange,
}: VerCambioDialogProps): React.ReactElement {
  return (
    <Dialog open={event !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ver cambio</DialogTitle>
          <DialogDescription>
            Estado antes y despues de la mutacion.
          </DialogDescription>
        </DialogHeader>
        {event ? (
          <div className="grid gap-4">
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">Antes</h3>
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-3 text-xs">
                {render(event.before)}
              </pre>
            </div>
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">Despues</h3>
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-3 text-xs">
                {render(event.after)}
              </pre>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
