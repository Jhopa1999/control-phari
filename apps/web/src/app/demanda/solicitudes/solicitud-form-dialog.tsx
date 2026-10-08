'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import type { Process, Request, RequestParticipant } from '@/lib/api-client';
import { requestStateLabel } from '@/lib/request-state';

export interface SolicitudFormValues {
  title: string;
  mainProcessId: string;
  participantProcessIds: string[];
  requesterArea: string;
  requesterName: string;
  functionalOwner: string;
  expectedResult: string;
  targetDate: string;
  referenceUrl: string;
  changeJustification: string;
}

interface SolicitudFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si se pasa, el dialog esta en modo edicion. */
  editing?: Request | null;
  processes: Process[];
  submitting: boolean;
  /** Mensaje de error en linea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: SolicitudFormValues) => void;
}

/** Fases del flujo, para explicar las precondiciones (UI-04). */
const PHASES = [
  { key: 'solicitud', label: 'Solicitud' },
  { key: 'triage', label: 'Triage' },
  { key: 'priorizacion', label: 'Priorizacion' },
  { key: 'aprobacion', label: 'Aprobacion' },
] as const;

function emptyValues(): SolicitudFormValues {
  return {
    title: '',
    mainProcessId: '',
    participantProcessIds: [],
    requesterArea: '',
    requesterName: '',
    functionalOwner: '',
    expectedResult: '',
    targetDate: '',
    referenceUrl: '',
    changeJustification: '',
  };
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);
}

export function SolicitudFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  submitting,
  errorMessage,
  onSubmit,
}: SolicitudFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<SolicitudFormValues>(
    emptyValues(),
  );
  const [clientError, setClientError] = React.useState<string | null>(null);

  // Inicializa el formulario al abrir (crear o editar). El reset solo ocurre
  // aqui; ante fallo del POST/PATCH el padre mantiene el dialog abierto con los
  // valores intactos (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    if (editing) {
      setValues({
        title: editing.title,
        mainProcessId: editing.mainProcessId,
        participantProcessIds: editing.participants
          .map((p: RequestParticipant) => p.processId)
          .filter((id: string) => id !== editing.mainProcessId),
        requesterArea: editing.requesterArea ?? '',
        requesterName: editing.requesterName ?? '',
        functionalOwner: editing.functionalOwner ?? '',
        expectedResult: editing.expectedResult ?? '',
        targetDate: toDateInput(editing.targetDate),
        referenceUrl: editing.referenceUrl ?? '',
        changeJustification: '',
      });
    } else {
      setValues(emptyValues());
    }
  }, [open, editing]);

  const activeProcesses = React.useMemo(
    () => processes.filter((p) => p.active),
    [processes],
  );

  // Participantes seleccionables: todos los procesos del alcance menos el
  // principal (BR-001: el principal participa siempre y no es removible).
  const participantOptions = React.useMemo(
    () => activeProcesses.filter((p) => p.id !== values.mainProcessId),
    [activeProcesses, values.mainProcessId],
  );

  function toggleParticipant(processId: string) {
    setValues((v) => {
      const has = v.participantProcessIds.includes(processId);
      return {
        ...v,
        participantProcessIds: has
          ? v.participantProcessIds.filter((id) => id !== processId)
          : [...v.participantProcessIds, processId],
      };
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const title = values.title.trim();
    if (!title) {
      setClientError('El titulo es obligatorio.');
      return;
    }
    if (!values.mainProcessId) {
      setClientError('El proceso principal es obligatorio.');
      return;
    }
    setClientError(null);
    onSubmit({
      ...values,
      title,
      // Nunca incluir el principal entre los participantes adicionales.
      participantProcessIds: values.participantProcessIds.filter(
        (id) => id !== values.mainProcessId,
      ),
    });
  }

  const mainProcessName = (id: string) =>
    processes.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar solicitud' : 'Nueva solicitud'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Edita la ficha. Las fechas iniciales no se modifican (BR-017).'
              : 'Registra una solicitud de la demanda. El proceso principal participa siempre (BR-001).'}
          </DialogDescription>
        </DialogHeader>

        {/* Pestañas por fase: solo informativas. Las fases posteriores se
            resuelven en sus propios modulos (Triage/Priorizacion/Revision) y
            aparecen bloqueadas con su precondicion (UI-04). */}
        <nav aria-label="Fases del flujo" className="flex flex-wrap gap-2">
          {PHASES.map((phase, index) => {
            const isSolicitud = phase.key === 'solicitud';
            return (
              <span
                key={phase.key}
                aria-current={isSolicitud ? 'step' : undefined}
                className={
                  isSolicitud
                    ? 'inline-flex items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium'
                    : 'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground'
                }
              >
                {!isSolicitud ? <Lock aria-hidden="true" className="size-3" /> : null}
                {index + 1}. {phase.label}
              </span>
            );
          })}
        </nav>

        <p className="text-xs text-muted-foreground">
          {isEdit
            ? 'Triage disponible tras registrar; Priorizacion solo si el triage es Continuar; Aprobacion tras priorizar. Cada fase se resuelve en su modulo.'
            : 'Al registrar quedara en estado Registrada y habilitara el Triage.'}
        </p>

        <Separator />

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sol-title">Titulo *</Label>
            <Input
              id="sol-title"
              value={values.title}
              autoFocus
              placeholder="Automatizar reporte mensual de BI"
              onChange={(e) =>
                setValues((v) => ({ ...v, title: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sol-registered">Fecha de registro</Label>
              <Input
                id="sol-registered"
                readOnly
                disabled
                value={
                  isEdit
                    ? formatDate(editing?.registeredAt)
                    : formatDate(new Date().toISOString())
                }
              />
              <p className="text-xs text-muted-foreground">
                Informativa. Se asigna automaticamente.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sol-state">Estado operativo</Label>
              <div id="sol-state" className="flex h-9 items-center">
                <Badge variant="secondary">
                  {isEdit
                    ? requestStateLabel(editing?.operationalState ?? '')
                    : 'Registrada'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Solo lectura (BR-022). Cambia por las acciones del flujo.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sol-main-process">Proceso principal *</Label>
            {isEdit ? (
              <Input
                id="sol-main-process"
                readOnly
                disabled
                value={mainProcessName(values.mainProcessId)}
              />
            ) : (
              <Select
                value={values.mainProcessId}
                onValueChange={(value) =>
                  setValues((v) => ({
                    ...v,
                    mainProcessId: value,
                    participantProcessIds: v.participantProcessIds.filter(
                      (id) => id !== value,
                    ),
                  }))
                }
              >
                <SelectTrigger id="sol-main-process">
                  <SelectValue placeholder="Selecciona un proceso" />
                </SelectTrigger>
                <SelectContent>
                  {activeProcesses.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Participantes</legend>
            <p className="text-xs text-muted-foreground">
              El proceso principal participa siempre y no se puede quitar
              (BR-001).
            </p>
            <div className="flex flex-col gap-2 rounded-md border p-3">
              {values.mainProcessId ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    aria-label={`${mainProcessName(values.mainProcessId)} (principal, no removible)`}
                  />
                  <span className="font-medium">
                    {mainProcessName(values.mainProcessId)}
                  </span>
                  <Badge variant="outline">Principal</Badge>
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Selecciona primero el proceso principal.
                </p>
              )}
              {participantOptions.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`sol-participant-${p.id}`}
                >
                  <input
                    id={`sol-participant-${p.id}`}
                    type="checkbox"
                    checked={values.participantProcessIds.includes(p.id)}
                    onChange={() => toggleParticipant(p.id)}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sol-area">Area solicitante</Label>
              <Input
                id="sol-area"
                value={values.requesterArea}
                onChange={(e) =>
                  setValues((v) => ({ ...v, requesterArea: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sol-requester">Solicitante</Label>
              <Input
                id="sol-requester"
                value={values.requesterName}
                onChange={(e) =>
                  setValues((v) => ({ ...v, requesterName: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sol-owner">Dueno funcional</Label>
              <Input
                id="sol-owner"
                value={values.functionalOwner}
                onChange={(e) =>
                  setValues((v) => ({ ...v, functionalOwner: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sol-target">Fecha objetivo</Label>
              <Input
                id="sol-target"
                type="date"
                value={values.targetDate}
                onChange={(e) =>
                  setValues((v) => ({ ...v, targetDate: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sol-url">Ficha / enlace de referencia</Label>
            <Input
              id="sol-url"
              type="url"
              placeholder="https://..."
              value={values.referenceUrl}
              onChange={(e) =>
                setValues((v) => ({ ...v, referenceUrl: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sol-result">Resultado esperado</Label>
            <Textarea
              id="sol-result"
              value={values.expectedResult}
              onChange={(e) =>
                setValues((v) => ({ ...v, expectedResult: e.target.value }))
              }
            />
          </div>

          {isEdit ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="sol-initial-commitment">
                    Compromiso inicial
                  </Label>
                  <Input
                    id="sol-initial-commitment"
                    readOnly
                    disabled
                    value={formatDate(editing?.initialCommitmentDate)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Solo lectura, se conserva en edicion (BR-017).
                  </p>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sol-justification">
                  Justificacion del cambio
                </Label>
                <Textarea
                  id="sol-justification"
                  value={values.changeJustification}
                  placeholder="Describe el motivo del cambio (BR-017)."
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      changeJustification: e.target.value,
                    }))
                  }
                />
              </div>
            </>
          ) : null}

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
                  : 'Registrar solicitud'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
