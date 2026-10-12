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
import type {
  CoordinationPerson,
  Issue,
  IssueType,
  Process,
} from '@/lib/api-client';
import { localDateInputValue } from '@/lib/format';

export interface NovedadFormValues {
  processId: string;
  date: string;
  typeCode: IssueType;
  title: string;
  detail: string;
  impact: string;
  resolverUserId: string;
  targetDate: string;
  resolution: string;
}

interface NovedadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Novedad en edicion; un registro por incidente (PATCH, AC-019). */
  editing?: Issue | null;
  processes: Process[];
  people: CoordinationPerson[];
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (values: NovedadFormValues) => void;
}

type IssueTypeValue = NonNullable<IssueType>;

const TYPES: { value: IssueTypeValue; label: string }[] = [
  { value: 'BLOQUEO', label: 'Bloqueo' },
  { value: 'INCIDENTE', label: 'Incidente' },
  { value: 'CALIDAD_DATOS', label: 'Calidad de datos' },
  { value: 'SOLICITUD_APOYO', label: 'Solicitud de apoyo' },
];

const SIN_VALOR = '__none__';

export function NovedadFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  people,
  submitting,
  errorMessage,
  onSubmit,
}: NovedadFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [processId, setProcessId] = React.useState('');
  const [date, setDate] = React.useState('');
  const [typeCode, setTypeCode] = React.useState<IssueTypeValue>('BLOQUEO');
  const [title, setTitle] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const [impact, setImpact] = React.useState('');
  const [resolverUserId, setResolverUserId] = React.useState('');
  const [targetDate, setTargetDate] = React.useState('');
  const [resolution, setResolution] = React.useState('');
  const [clientError, setClientError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    if (editing) {
      setProcessId(editing.processId);
      setDate(editing.date);
      setTypeCode((editing.typeCode as IssueTypeValue) ?? 'BLOQUEO');
      setTitle(editing.title);
      setDetail(editing.detail ?? '');
      setImpact(editing.impact ?? '');
      setResolverUserId(editing.resolverUserId ?? '');
      setTargetDate(editing.targetDate ?? '');
      setResolution(editing.resolution ?? '');
    } else {
      setProcessId('');
      // Hoy en el calendario local del usuario (design §7.9, regla 2).
      setDate(localDateInputValue());
      setTypeCode('BLOQUEO');
      setTitle('');
      setDetail('');
      setImpact('');
      setResolverUserId('');
      setTargetDate('');
      setResolution('');
    }
  }, [open, editing]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isEdit && !processId) {
      setClientError('Selecciona un proceso.');
      return;
    }
    if (!isEdit && !date) {
      setClientError('La fecha es obligatoria.');
      return;
    }
    if (!title.trim()) {
      setClientError('El titulo es obligatorio.');
      return;
    }
    setClientError(null);
    onSubmit({
      processId,
      date,
      typeCode,
      title,
      detail,
      impact,
      resolverUserId,
      targetDate,
      resolution,
    });
  }

  const processName = (id: string) =>
    processes.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar novedad' : 'Nueva novedad'}</DialogTitle>
          <DialogDescription>
            Cada incidente es un solo registro que se actualiza hasta
            resolverlo. El tipo por defecto es Bloqueo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nov-process">Proceso *</Label>
            {isEdit ? (
              <Input
                id="nov-process"
                readOnly
                disabled
                value={processName(processId)}
              />
            ) : (
              <Select value={processId} onValueChange={setProcessId}>
                <SelectTrigger id="nov-process">
                  <SelectValue placeholder="Selecciona un proceso" />
                </SelectTrigger>
                <SelectContent>
                  {processes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="nov-date">Fecha *</Label>
              <Input
                id="nov-date"
                type="date"
                value={date}
                readOnly={isEdit}
                disabled={isEdit}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nov-type">Tipo</Label>
              <Select
                value={typeCode}
                onValueChange={(v) => setTypeCode(v as IssueTypeValue)}
              >
                <SelectTrigger id="nov-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nov-title">Titulo *</Label>
            <Input
              id="nov-title"
              value={title}
              placeholder="Resumen del incidente"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nov-detail">Detalle</Label>
            <Textarea
              id="nov-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nov-impact">Impacto</Label>
            <Textarea
              id="nov-impact"
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="nov-resolver">Responsable</Label>
              <Select
                value={resolverUserId || SIN_VALOR}
                onValueChange={(v) =>
                  setResolverUserId(v === SIN_VALOR ? '' : v)
                }
              >
                <SelectTrigger id="nov-resolver">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Sin asignar</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nov-target">Fecha objetivo</Label>
              <Input
                id="nov-target"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nov-resolution">Resolucion</Label>
            <Textarea
              id="nov-resolution"
              value={resolution}
              placeholder="Como se resolvio (al cerrar)"
              onChange={(e) => setResolution(e.target.value)}
            />
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
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Guardando...'
                : isEdit
                  ? 'Guardar cambios'
                  : 'Crear novedad'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
