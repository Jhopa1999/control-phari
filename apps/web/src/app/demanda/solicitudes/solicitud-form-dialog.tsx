'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { Lock } from 'lucide-react';
import { Field, FieldSet, FormError, RequiredHint } from '@/components/field';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  Approval,
  Process,
  Request,
  RequestParticipant,
  Requester,
} from '@/lib/api-client';
import { listApprovals } from '@/lib/approval';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface SolicitudFormValues {
  title: string;
  mainProcessId: string;
  participantProcessIds: string[];
  /** Solicitante del maestro (el área se asocia automáticamente). */
  requesterId: string;
  functionalOwner: string;
  expectedResult: string;
  targetDate: string;
  changeJustification: string;
}

interface SolicitudFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si se pasa, el diálogo está en modo edición. */
  editing?: Request | null;
  processes: Process[];
  /** Maestro de solicitantes (SOL-03). */
  requesters: Requester[];
  submitting: boolean;
  /** Error del backend en línea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: SolicitudFormValues) => void;
}

/** Id del formulario: el FormError lleva `sol-form-error`. */
const FORM_ID = 'sol-form';

type FieldKey = 'title' | 'mainProcessId';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Fases del flujo, para explicar las precondiciones (UI-04). */
const PHASES = [
  { key: 'solicitud', label: 'Solicitud' },
  { key: 'triage', label: 'Triage' },
  { key: 'priorizacion', label: 'Priorización' },
  { key: 'aprobacion', label: 'Aprobación' },
] as const;

function emptyValues(): SolicitudFormValues {
  return {
    title: '',
    mainProcessId: '',
    participantProcessIds: [],
    requesterId: '',
    functionalOwner: '',
    expectedResult: '',
    targetDate: '',
    changeJustification: '',
  };
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Reglas del cliente (las de siempre), evaluadas todas a la vez (design §9). */
function validate(values: SolicitudFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.title.trim()) errors.title = 'El título es obligatorio.';
  if (!values.mainProcessId) errors.mainProcessId = 'El proceso principal es obligatorio.';
  return errors;
}

function GroupHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}

/** Presentación legible de la decisión de aprobación (no inventa estados nuevos). */
function approvalDecision(decision: string): { label: string; variant: 'success' | 'warning' | 'neutral' } {
  if (decision === 'APROBAR') return { label: 'Aprobada', variant: 'success' };
  if (decision === 'DEVOLVER') return { label: 'Devuelta', variant: 'warning' };
  return { label: decision, variant: 'neutral' };
}

/**
 * Historial de aprobación de la solicitud (solo lectura), de la más reciente a
 * la más antigua. Deja ver lo registrado en la etapa de aprobación: la
 * decisión, el motivo cuando fue devuelta y la fecha. Una solicitud puede tener
 * varias filas (devuelta y luego aprobada tras re-priorizar).
 */
function ApprovalHistory({ approvals }: { approvals: Approval[] }): React.ReactElement {
  const ordered = [...approvals].sort(
    (a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime(),
  );
  return (
    <div className="grid gap-4">
      <GroupHeading>Aprobación</GroupHeading>
      <ul className="flex flex-col gap-3">
        {ordered.map((approval) => {
          const decision = approvalDecision(approval.decision);
          return (
            <li key={approval.id} className="flex flex-col gap-1.5 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant={decision.variant}>{decision.label}</Badge>
                <span className="text-meta text-muted-foreground">
                  {formatDateTime(approval.decidedAt)}
                </span>
                {approval.decidedByName ? (
                  <span className="text-meta text-muted-foreground">
                    Decidido por {approval.decidedByName}
                  </span>
                ) : null}
              </div>
              <p className="flex flex-wrap items-center gap-1.5 text-meta text-muted-foreground">
                <StatusBadge kind="request" value={approval.previousState} />
                <span aria-hidden="true">→</span>
                <StatusBadge kind="request" value={approval.resultingState} />
              </p>
              {approval.reason ? (
                <p className="text-sm whitespace-pre-wrap wrap-break-word">
                  <span className="text-muted-foreground">Motivo: </span>
                  {approval.reason}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Ficha de una solicitud (design §11.5), en un diálogo lg con los campos por
 * grupos. Crear envía mainProcessId; editar envía changeJustification y no
 * mainProcessId. Ante un fallo el diálogo queda abierto con los valores.
 */
export function SolicitudFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  requesters,
  submitting,
  errorMessage,
  onSubmit,
}: SolicitudFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<SolicitudFormValues>(emptyValues());
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  // Historial de decisiones de aprobación de la solicitud en edición (0 o más).
  // Solo lectura: deja ver lo registrado en la etapa de aprobación.
  const [approvals, setApprovals] = React.useState<Approval[]>([]);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const processRef = React.useRef<HTMLButtonElement>(null);

  // Inicializa el formulario al abrir (crear o editar). El reset solo ocurre
  // aquí; ante fallo del POST/PATCH el padre mantiene el diálogo abierto con los
  // valores intactos (AC-031).
  React.useEffect(() => {
    if (!open || !editing) return;
    // Carga el historial de aprobación (tolerante a fallo); race-safe por id.
    const editingId = editing.id;
    void listApprovals(editingId)
      .then((list) => setApprovals((prev) => (editingId === editing.id ? list : prev)))
      .catch(() => {
        /* Sin historial visible si falla; la ficha sigue usable. */
      });
  }, [open, editing]);
  useResetOnChange([open, editing], () => {
    if (!open) return;
    setFieldErrors({});
    setApprovals([]);
    if (editing) {
      setValues({
        title: editing.title,
        mainProcessId: editing.mainProcessId,
        participantProcessIds: editing.participants
          .map((p: RequestParticipant) => p.processId)
          .filter((id: string) => id !== editing.mainProcessId),
        requesterId: editing.requesterId ?? '',
        functionalOwner: editing.functionalOwner ?? '',
        expectedResult: editing.expectedResult ?? '',
        targetDate: toDateInput(editing.targetDate),
        changeJustification: '',
      });
    } else {
      setValues(emptyValues());
    }
  });

  const activeProcesses = React.useMemo(() => processes.filter((p) => p.active), [processes]);

  // Participantes seleccionables: los procesos activos menos el principal, que
  // participa siempre y no se puede quitar.
  const participantOptions = React.useMemo(
    () => activeProcesses.filter((p) => p.id !== values.mainProcessId),
    [activeProcesses, values.mainProcessId],
  );

  function update<K extends keyof SolicitudFormValues>(key: K, value: SolicitudFormValues[K]): void {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((prev) => (key in prev ? { ...prev, [key]: undefined } : prev));
  }

  function changeMainProcess(processId: string): void {
    // Al cambiar el principal se quita de los participantes adicionales.
    setValues((v) => ({
      ...v,
      mainProcessId: processId,
      participantProcessIds: v.participantProcessIds.filter((id) => id !== processId),
    }));
    setFieldErrors((prev) => ({ ...prev, mainProcessId: undefined }));
  }

  function toggleParticipant(processId: string): void {
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const errors = validate(values);
    setFieldErrors(errors);
    if (errors.title || errors.mainProcessId) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.title) titleRef.current?.focus();
      else processRef.current?.focus();
      return;
    }
    onSubmit({
      ...values,
      title: values.title.trim(),
      // Nunca incluir el principal entre los participantes adicionales.
      participantProcessIds: values.participantProcessIds.filter(
        (id) => id !== values.mainProcessId,
      ),
    });
  }

  // SOL-03: solo activos (más el solicitante ya asignado, aunque se haya inactivado).
  const requesterOptions = React.useMemo(
    () => requesters.filter((r) => r.active || r.id === editing?.requesterId),
    [requesters, editing],
  );
  const selectedRequester = requesters.find((r) => r.id === values.requesterId);
  let requesterHelp = 'El área se asigna automáticamente según el solicitante.';
  if (selectedRequester) {
    requesterHelp = `Área: ${selectedRequester.areaName}`;
  } else if (editing && !editing.requesterId && editing.requesterName) {
    const area = editing.requesterArea ? ` (${editing.requesterArea})` : '';
    requesterHelp = `Solicitante histórico: ${editing.requesterName}${area}. Selecciona uno del maestro para actualizarlo.`;
  }

  const mainProcessName = (id: string) => processes.find((p) => p.id === id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar solicitud' : 'Nueva solicitud'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualiza la ficha. Las fechas iniciales no se modifican.'
              : 'Registra la solicitud. Quedará en estado Registrada y lista para triage.'}
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-5">
            <div className="grid gap-3">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-muted-foreground">
                <span>
                  Registro: {formatDate(isEdit ? editing?.registeredAt : new Date().toISOString())}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5">
                  Estado:
                  <StatusBadge
                    kind="request"
                    value={isEdit ? (editing?.operationalState ?? null) : 'REGISTRADA'}
                  />
                </span>
              </p>

              {/* Fases del flujo: solo informativas. Las fases siguientes se
                  resuelven en sus propios módulos (Triage, Priorización y
                  Aprobaciones) y se muestran con candado (UI-04). */}
              <nav aria-label="Fases del flujo" className="flex flex-col gap-1.5">
                {/* Título visible: sin él, las fases se leían como pestañas. */}
                <p aria-hidden="true" className="text-meta font-medium text-muted-foreground">
                  Fases del flujo
                </p>
                <ol className="flex flex-wrap gap-2">
                  {PHASES.map((phase, index) => {
                    const current = phase.key === 'solicitud';
                    return (
                      <li
                        key={phase.key}
                        aria-current={current ? 'step' : undefined}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-meta',
                          current
                            ? 'border-primary bg-primary-subtle font-medium text-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {!current ? <Lock aria-hidden="true" className="size-3" /> : null}
                        {`${index + 1}. ${phase.label}`}
                        {!current ? <span className="sr-only">, se resuelve en su módulo</span> : null}
                      </li>
                    );
                  })}
                </ol>
              </nav>
              <p className="text-meta text-muted-foreground">
                {isEdit
                  ? 'Las fases con candado se resuelven en su propio módulo: la priorización, solo si el triage es Continuar; la aprobación, tras priorizar.'
                  : 'Al registrarla quedará en estado Registrada y habilitará el triage.'}
              </p>
            </div>

            <RequiredHint />

            <div className="grid gap-4">
              <GroupHeading>Datos principales</GroupHeading>
              <Field id="sol-title" label="Título" required error={fieldErrors.title}>
                <Input
                  ref={titleRef}
                  value={values.title}
                  autoFocus
                  placeholder="Automatizar reporte mensual de BI"
                  onChange={(e) => update('title', e.target.value)}
                />
              </Field>

              <Field
                id="sol-main-process"
                label="Proceso principal"
                required={!isEdit}
                error={fieldErrors.mainProcessId}
                help={isEdit ? 'El proceso principal no se cambia al editar.' : undefined}
              >
                {(control) =>
                  isEdit ? (
                    <Input {...control} readOnly disabled value={mainProcessName(values.mainProcessId)} />
                  ) : (
                    <Select value={values.mainProcessId} onValueChange={changeMainProcess}>
                      <SelectTrigger ref={processRef} {...control}>
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
                  )
                }
              </Field>

              <FieldSet
                id="sol-participants"
                kind="checkbox"
                legend="Participantes"
                help="El proceso principal participa siempre y no se puede quitar."
              >
                <div className="flex flex-col gap-1 rounded-md border p-3">
                  {values.mainProcessId ? (
                    <label className="flex min-h-8 items-center gap-2 text-sm">
                      <Checkbox
                        id={`sol-participant-${values.mainProcessId}`}
                        checked
                        disabled
                        readOnly
                      />
                      <span className="font-medium">{mainProcessName(values.mainProcessId)}</span>
                      <Badge variant="outline">Principal</Badge>
                    </label>
                  ) : (
                    <p className="text-meta text-muted-foreground">
                      Selecciona primero el proceso principal.
                    </p>
                  )}
                  {participantOptions.map((p) => (
                    <label key={p.id} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        id={`sol-participant-${p.id}`}
                        checked={values.participantProcessIds.includes(p.id)}
                        onChange={() => toggleParticipant(p.id)}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </FieldSet>
            </div>

            <div className="grid gap-4">
              <GroupHeading>Solicitante</GroupHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="sol-requester" label="Solicitante" help={requesterHelp}>
                  {(control) => (
                    <Select value={values.requesterId} onValueChange={(v) => update('requesterId', v)}>
                      <SelectTrigger {...control}>
                        <SelectValue placeholder="Selecciona un solicitante" />
                      </SelectTrigger>
                      <SelectContent>
                        {requesterOptions.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
                <Field id="sol-owner" label="Dueño funcional">
                  <Input
                    value={values.functionalOwner}
                    onChange={(e) => update('functionalOwner', e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="grid gap-4">
              <GroupHeading>Alcance</GroupHeading>
              <Field id="sol-target" label="Fecha objetivo">
                <Input
                  type="date"
                  className="sm:w-48"
                  value={values.targetDate}
                  onChange={(e) => update('targetDate', e.target.value)}
                />
              </Field>
              <Field id="sol-result" label="Resultado esperado">
                <Textarea
                  value={values.expectedResult}
                  onChange={(e) => update('expectedResult', e.target.value)}
                />
              </Field>
            </div>

            {isEdit ? (
              <div className="grid gap-4">
                <GroupHeading>Cambio</GroupHeading>
                <Field
                  id="sol-initial-commitment"
                  label="Compromiso inicial"
                  help="Solo lectura: se conserva al editar."
                >
                  <Input
                    readOnly
                    disabled
                    className="sm:w-48"
                    value={formatDate(editing?.initialCommitmentDate)}
                  />
                </Field>
                <Field id="sol-justification" label="Justificación del cambio">
                  <Textarea
                    value={values.changeJustification}
                    placeholder="Describe el motivo del cambio."
                    onChange={(e) => update('changeJustification', e.target.value)}
                  />
                </Field>
              </div>
            ) : null}

            {/* Detalle de lo registrado en la etapa de aprobación (solo lectura),
                visible cuando la solicitud ya tiene al menos una decisión. */}
            {isEdit && approvals.length > 0 ? <ApprovalHistory approvals={approvals} /> : null}

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
            <Button type="submit" loading={submitting}>
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar solicitud'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
