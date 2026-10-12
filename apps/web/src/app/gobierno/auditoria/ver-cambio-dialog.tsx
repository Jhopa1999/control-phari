'use client';

import * as React from 'react';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { DescriptionList } from '@/components/description-list';
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
import type { AuditEvent } from '@/lib/api-client';
import { auditActionLabel, auditObjectLabel } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';

/** Datos legibles que resuelve la vista con sus listas en alcance. */
export interface AuditEventDetails {
  /** Nombre del actor si está en alcance; null si no lo está o si fue el sistema. */
  actorName: string | null;
  /** «{nombre} ({código})», «—» o «Proceso fuera de tu alcance». */
  process: string;
}

interface VerCambioDialogProps {
  event: AuditEvent | null;
  details: AuditEventDetails | null;
  onOpenChange: (open: boolean) => void;
}

function render(value: AuditEvent['before']): string {
  if (value === null || value === undefined) return 'Sin datos';
  return JSON.stringify(value, null, 2);
}

function ChangeBlock({ title, value }: { title: string; value: AuditEvent['before'] }): React.ReactElement {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className="grid min-w-0 content-start gap-1.5">
      <h3 id={headingId} className="text-sm font-semibold">
        {title}
      </h3>
      <pre
        tabIndex={0}
        aria-labelledby={headingId}
        className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {render(value)}
      </pre>
    </section>
  );
}

/**
 * Detalle de un evento de auditoría (design §11.19, NIT 9), diálogo xl:
 * cabecera con fecha, actor (nombre e id completo), proceso, acción y objeto y,
 * debajo, el estado antes y después.
 */
export function VerCambioDialog({ event, details, onOpenChange }: VerCambioDialogProps): React.ReactElement {
  // Conserva el último evento mientras el diálogo se cierra, para que el
  // contenido no desaparezca durante la animación.
  const [shown, setShown] = React.useState<{ event: AuditEvent; details: AuditEventDetails } | null>(
    null,
  );
  if (event && details && shown?.event !== event) {
    setShown({ event, details });
  }
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  const current = shown?.event ?? null;
  const actor: React.ReactNode =
    current === null || current.actorUserId === null ? (
      'Sistema'
    ) : (
      <span className="flex flex-col">
        <span>{shown?.details.actorName ?? 'Persona fuera de tu alcance'}</span>
        <span className="font-mono text-meta break-all text-muted-foreground">{current.actorUserId}</span>
      </span>
    );

  return (
    <Dialog open={event !== null} onOpenChange={onOpenChange}>
      <DialogContent size="xl" onOpenAutoFocus={captureTrigger} onCloseAutoFocus={handleCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Ver cambio</DialogTitle>
          <DialogDescription>Estado del objeto antes y después del cambio.</DialogDescription>
        </DialogHeader>
        {current && shown ? (
          <DialogBody className="grid gap-5">
            <DescriptionList
              columns={2}
              items={[
                { term: 'Fecha', value: formatDateTime(current.createdAt) },
                { term: 'Actor', value: actor },
                { term: 'Proceso', value: shown.details.process },
                { term: 'Acción', value: auditActionLabel(current.action) },
                { term: 'Objeto', value: auditObjectLabel(current.objectType) },
              ]}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <ChangeBlock title="Antes" value={current.before} />
              <ChangeBlock title="Después" value={current.after} />
            </div>
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
