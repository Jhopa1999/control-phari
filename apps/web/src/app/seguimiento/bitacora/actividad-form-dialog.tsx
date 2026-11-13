'use client';

import * as React from 'react';
import { Info, Lock } from 'lucide-react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { Field, FormError, RequiredHint, type FieldControlProps } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import {
  SearchableSelect,
  isComboboxExpanded,
  type SearchableOption,
} from '@/components/searchable-select';
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
import { SegmentedRadio } from '@/components/ui/segmented-radio';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  ActivityClass,
  DailyLogActivity,
  WorklogOptions,
  WorklogProjectOption,
  WorklogTaskOption,
} from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { CLASSIFICATION_META, classificationLabel } from './clasificaciones';
import {
  HOURS_RANGE_MESSAGE,
  HoursInput,
  isValidHoursText,
} from './hours-input';
import { getWorklogOptions, WorklogError } from '@/lib/worklog';

export interface ActividadFormValues {
  classificationCode: ActivityClass;
  hours: string;
  projectRequestId: string;
  taskId: string;
  assetRef: string;
  requesterRef: string;
  justification: string;
  description: string;
  result: string;
  evidenceUrl: string;
}

interface ActividadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Actividad en edición; si se pasa, el diálogo edita (PATCH). */
  editing?: DailyLogActivity | null;
  /** Proceso del diario: el proyecto debe pertenecer a él. */
  processId: string;
  /** Fecha del diario (AAAA-MM-DD): referencia de la ventana de gracia. */
  date: string;
  /** Jefe de área: puede alternar «Mis proyectos / Todos del área». */
  isJefe: boolean;
  /** Cierra el diálogo y abre el panel «Revisar sugerencias del día». */
  onGoToSuggestions?: () => void;
  submitting: boolean;
  /** Error del backend; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: ActividadFormValues) => void;
}

export const CLASSIFICATIONS: { value: ActivityClass; label: string; hint: string }[] = [
  {
    value: 'PLANIFICADA',
    label: 'Planificada',
    hint: 'Trabajo sobre un proyecto o una tarea del plan.',
  },
  {
    value: 'SOPORTE',
    label: 'Soporte',
    hint: 'Atención sobre un activo o servicio.',
  },
  {
    value: 'INTERNA',
    label: 'Interna',
    hint: 'Trabajo interno del área (sin referencia obligatoria).',
  },
  {
    value: 'EXTRAORDINARIA',
    label: 'Extraordinaria',
    hint: 'Requiere solicitante y justificación.',
  },
];

/** Id del formulario: el FormError lleva `act-form-error`. */
const FORM_ID = 'act-form';
const FORM_ERROR_ID = `${FORM_ID}-error`;

const TASK_DEFAULT_HELP = 'Indica un proyecto o una tarea (al menos uno).';
const HELP_CLOSED =
  'Este proyecto está cerrado y ya no admite nuevas actividades. Puedes dejarlo como está; si lo cambias, no podrás volver a elegirlo.';
const HELP_PROJECT_UNAVAILABLE =
  'Este proyecto ya no está disponible para imputar. Puedes dejarlo como está; si lo cambias, no podrás volver a elegirlo.';
const HELP_TASK_UNAVAILABLE =
  'Esta tarea ya no está disponible para imputar. Puedes dejarla como está; si la cambias, no podrás volver a elegirla.';

const CURRENT_GROUP = { groupKey: 'current', groupLabel: 'Valor actual' } as const;

/** Proyecto elegido (objeto completo, no depende de que siga en las opciones). */
type ProjectOpt = SearchableOption & { state: string | null };
/** Tarea elegida; guarda su proyecto para rellenarlo y filtrar. */
type TaskOpt = SearchableOption & {
  requestId: string | null;
  requestCode: string | null;
  requestTitle: string | null;
};

type FieldKey = 'hours' | 'assetRef';

interface Validation {
  fieldErrors: Partial<Record<FieldKey, string>>;
  /** Regla que combina campos (planificada; extraordinaria). */
  formError: string | null;
  /** Campos implicados en la regla combinada que la incumplen (NIT 6b). */
  combined: Partial<Record<'projectRequestId' | 'taskId' | 'requesterRef' | 'justification', true>>;
}

function emptyValues(): ActividadFormValues {
  return {
    classificationCode: 'PLANIFICADA',
    hours: '',
    projectRequestId: '',
    taskId: '',
    assetRef: '',
    requesterRef: '',
    justification: '',
    description: '',
    result: '',
    evidenceUrl: '',
  };
}

const NO_ERRORS: Validation = { fieldErrors: {}, formError: null, combined: {} };

/**
 * Reglas del cliente, las mismas de siempre, evaluadas todas a la vez (design
 * §9). Solo UX: la autoridad es el 400 del backend.
 */
function validate(values: ActividadFormValues): Validation {
  const result: Validation = { fieldErrors: {}, formError: null, combined: {} };
  const cls = values.classificationCode;
  if (cls === 'PLANIFICADA' && !values.projectRequestId && !values.taskId) {
    result.formError = 'Una actividad planificada requiere un proyecto o una tarea.';
    result.combined = { projectRequestId: true, taskId: true };
  }
  if (cls === 'SOPORTE' && !values.assetRef.trim()) {
    result.fieldErrors.assetRef = 'Una actividad de soporte requiere indicar el activo.';
  }
  if (cls === 'EXTRAORDINARIA') {
    const noRequester = !values.requesterRef.trim();
    const noJustification = !values.justification.trim();
    if (noRequester || noJustification) {
      result.formError = 'Una actividad extraordinaria requiere solicitante y justificación.';
      if (noRequester) result.combined.requesterRef = true;
      if (noJustification) result.combined.justification = true;
    }
  }
  // Solo formato: la regla (0,25 a 24 en pasos de 0,25) es de la API.
  if (values.hours.trim() !== '' && !isValidHoursText(values.hours)) {
    result.fieldErrors.hours = HOURS_RANGE_MESSAGE;
  }
  return result;
}

/** Marca un campo implicado en la regla combinada que la incumple (NIT 6b). */
function withCombined(control: FieldControlProps, invalid: boolean | undefined): FieldControlProps {
  if (!invalid) return control;
  const describedBy = [control['aria-describedby'], FORM_ERROR_ID].filter(Boolean).join(' ');
  return { ...control, 'aria-invalid': true, 'aria-describedby': describedBy };
}

function projectOptionFrom(project: WorklogProjectOption): ProjectOpt {
  const closed = project.state === 'CERRADA';
  return {
    value: project.id,
    code: project.code,
    label: project.title,
    state: project.state,
    summary: project.title,
    meta: (
      <>
        <StatusBadge kind="request" value={project.state} />
        {closed ? <Badge variant="neutral">Cerrado</Badge> : null}
      </>
    ),
    secondary:
      closed && project.closedAt ? `Cerrado el ${formatDate(project.closedAt)}` : undefined,
  };
}

function taskOptionFrom(task: WorklogTaskOption): TaskOpt {
  return {
    value: task.id,
    code: task.code,
    label: task.title,
    requestId: task.requestId,
    requestCode: task.requestCode,
    requestTitle: task.requestTitle,
    searchText: `${task.requestCode} ${task.requestTitle} ${task.phaseName}`,
    summary: `${task.phaseName} · ${task.requestCode} ${task.requestTitle}`,
    meta: <StatusBadge kind="task" value={task.status} />,
  };
}

/** Objeto de proyecto a partir de lo guardado en la actividad (edición). */
function persistedProject(act: DailyLogActivity): ProjectOpt | null {
  if (!act.projectRequestId) return null;
  const title = act.projectRequestTitle ?? 'Proyecto';
  return {
    value: act.projectRequestId,
    code: act.projectRequestCode,
    label: title,
    state: act.projectRequestState,
    summary: title,
  };
}

function persistedTask(act: DailyLogActivity): TaskOpt | null {
  if (!act.taskId) return null;
  const title = act.taskTitle ?? 'Tarea';
  return {
    value: act.taskId,
    code: act.taskCode,
    label: title,
    requestId: act.projectRequestId,
    requestCode: act.projectRequestCode,
    requestTitle: act.projectRequestTitle,
    summary: title,
  };
}

interface OptionsResult {
  key: string;
  data: WorklogOptions;
}

export function ActividadFormDialog({
  open,
  onOpenChange,
  editing,
  processId,
  date,
  isJefe,
  onGoToSuggestions,
  submitting,
  errorMessage,
  onSubmit,
}: ActividadFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<ActividadFormValues>(emptyValues);
  const [validation, setValidation] = React.useState<Validation>(NO_ERRORS);
  const [projectSel, setProjectSel] = React.useState<ProjectOpt | null>(null);
  const [taskSel, setTaskSel] = React.useState<TaskOpt | null>(null);
  const [notes, setNotes] = React.useState<{ project: string | null; task: string | null }>({
    project: null,
    task: null,
  });
  // Opciones de imputación (GET /worklog/options).
  const [includeTerminated, setIncludeTerminated] = React.useState(false);
  const [scope, setScope] = React.useState<'mine' | 'all'>('mine');
  const [serverQ, setServerQ] = React.useState('');
  const [retry, setRetry] = React.useState(0);
  const [result, setResult] = React.useState<OptionsResult | null>(null);
  const [failure, setFailure] = React.useState<{ key: string; message: string } | null>(null);
  // Ids de la primera respuesta tras abrir: deciden, una sola vez, si el valor
  // guardado ya no es elegible (grupo «Valor actual»).
  const [firstIds, setFirstIds] = React.useState<{
    projects: ReadonlySet<string>;
    tasks: ReadonlySet<string>;
  } | null>(null);

  const projectInputRef = React.useRef<HTMLInputElement>(null);
  const assetRef = React.useRef<HTMLInputElement>(null);
  const requesterRef = React.useRef<HTMLInputElement>(null);
  const justificationRef = React.useRef<HTMLTextAreaElement>(null);
  const hoursRef = React.useRef<HTMLInputElement>(null);

  // Inicializa al abrir. El reset solo ocurre aquí; ante fallo del POST/PATCH el
  // padre mantiene el diálogo abierto con los valores (AC-031).
  useResetOnChange([open, editing], () => {
    if (!open) return;
    setValidation(NO_ERRORS);
    setNotes({ project: null, task: null });
    setIncludeTerminated(false);
    setScope('mine');
    setServerQ('');
    setResult(null);
    setFailure(null);
    setFirstIds(null);
    if (editing) {
      setValues({
        classificationCode: (editing.classificationCode as ActivityClass) ?? 'PLANIFICADA',
        // Las horas históricas en 0 se muestran como «sin horas».
        hours: editing.hours ? String(editing.hours) : '',
        projectRequestId: editing.projectRequestId ?? '',
        taskId: editing.taskId ?? '',
        assetRef: editing.assetRef ?? '',
        requesterRef: editing.requesterRef ?? '',
        justification: editing.justification ?? '',
        description: editing.description ?? '',
        result: editing.result ?? '',
        evidenceUrl: editing.evidenceUrl ?? '',
      });
      setProjectSel(persistedProject(editing));
      setTaskSel(persistedTask(editing));
    } else {
      setValues(emptyValues());
      setProjectSel(null);
      setTaskSel(null);
    }
  });

  const cls = values.classificationCode;
  // Una actividad que viene de una reunión o recurrente conserva clasificación y origen;
  // la de una tarea sugerida conserva su tarea (sí admite cambiar horas y textos).
  const sourceLocked = Boolean(editing?.locked);
  const taskLocked = editing?.source?.kind === 'TASK';
  const wantsOptions = open && cls === 'PLANIFICADA' && !taskLocked;
  const effectiveScope = isJefe ? scope : 'mine';
  const requestKey = [processId, date, includeTerminated, effectiveScope, serverQ, retry].join('|');

  // Las opciones se piden al abrir (solo Planificada) y al cambiar un filtro de
  // lista; la petición anterior se cancela.
  React.useEffect(() => {
    if (!wantsOptions) return;
    const controller = new AbortController();
    getWorklogOptions(
      {
        processId,
        date,
        ...(includeTerminated ? { includeTerminated: true } : {}),
        ...(isJefe ? { scope: effectiveScope } : {}),
        ...(serverQ ? { q: serverQ } : {}),
      },
      controller.signal,
    )
      .then((data) => {
        setResult({ key: requestKey, data });
        setFirstIds(
          (prev) =>
            prev ?? {
              projects: new Set(data.projects.map((p) => p.id)),
              tasks: new Set(data.tasks.map((t) => t.id)),
            },
        );
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setFailure({
          key: requestKey,
          message:
            err instanceof WorklogError
              ? err.message
              : 'Ocurrió un error inesperado. Inténtalo de nuevo.',
        });
      });
    return () => controller.abort();
  }, [wantsOptions, processId, date, includeTerminated, isJefe, effectiveScope, serverQ, requestKey]);

  const data = result?.data ?? null;
  const loadingOptions = wantsOptions && data === null && failure?.key !== requestKey;
  const loadFailure = failure?.key === requestKey ? failure.message : null;

  // Valor guardado que ya no es elegible: se conserva como «Valor actual».
  const persistedProjectId = editing?.projectRequestId ?? null;
  const persistedTaskId = editing?.taskId ?? null;
  const projectIsCurrent =
    firstIds !== null &&
    persistedProjectId !== null &&
    !firstIds.projects.has(persistedProjectId) &&
    projectSel?.value === persistedProjectId;
  const taskIsCurrent =
    firstIds !== null &&
    persistedTaskId !== null &&
    !firstIds.tasks.has(persistedTaskId) &&
    taskSel?.value === persistedTaskId;
  const projectClosed = projectIsCurrent && projectSel?.state === 'CERRADA';

  const projectOptions = React.useMemo<SearchableOption[]>(() => {
    const list = [...(data?.projects ?? [])].sort(
      (a, b) =>
        Number(a.state === 'CERRADA') - Number(b.state === 'CERRADA') ||
        a.code.localeCompare(b.code),
    );
    const hasOthers = list.some((p) => !p.hasMyTasks);
    const hasMine = list.some((p) => p.hasMyTasks);
    const grouped = hasOthers && hasMine;
    const mapped: SearchableOption[] = list.map((p) => ({
      ...projectOptionFrom(p),
      ...(grouped
        ? p.hasMyTasks
          ? { groupKey: 'mine', groupLabel: 'Mis proyectos' }
          : { groupKey: 'others', groupLabel: 'Otros proyectos de tu área' }
        : {}),
    }));
    if (projectIsCurrent && projectSel) {
      mapped.unshift({
        ...projectSel,
        ...CURRENT_GROUP,
        meta: <Badge variant={projectSel.state === 'CERRADA' ? 'neutral' : 'warning'}>{projectSel.state === 'CERRADA' ? 'Cerrado' : 'No disponible'}</Badge>,
      });
    }
    return mapped;
  }, [data, projectIsCurrent, projectSel]);

  const taskOptions = React.useMemo<SearchableOption[]>(() => {
    const all = data?.tasks ?? [];
    const scoped = projectSel ? all.filter((t) => t.requestId === projectSel.value) : all;
    const mapped: SearchableOption[] = scoped.map((t) => {
      const base = taskOptionFrom(t);
      if (t.isMine) {
        return {
          ...base,
          idVariant: 'short' as const,
          groupKey: `mine|${t.requestId}|${t.phaseName}`,
          groupLabel: `${t.requestCode} · ${t.requestTitle} › ${t.phaseName}`,
        };
      }
      return {
        ...base,
        groupKey: 'others',
        groupLabel: 'Otras tareas de tus procesos',
        secondary: [t.requestCode, t.requestTitle, t.phaseName, t.responsibleName]
          .filter(Boolean)
          .join(' · '),
      };
    });
    // Las propias primero; el grupo de ajenas siempre al final.
    mapped.sort(
      (a, b) => Number(a.groupKey === 'others') - Number(b.groupKey === 'others'),
    );
    if (taskIsCurrent && taskSel) {
      mapped.unshift({
        ...taskSel,
        ...CURRENT_GROUP,
        meta: <Badge variant="warning">No disponible</Badge>,
      });
    }
    return mapped;
  }, [data, projectSel, taskIsCurrent, taskSel]);

  function set<K extends keyof ActividadFormValues>(key: K, value: ActividadFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    // El error de un campo se limpia al editarlo; el de la regla combinada,
    // al editar cualquiera de sus campos.
    setValidation((prev) => {
      if (key === 'hours' || key === 'assetRef') {
        return { ...prev, fieldErrors: { ...prev.fieldErrors, [key]: undefined } };
      }
      if (key in prev.combined) return { ...prev, formError: null, combined: {} };
      return prev;
    });
  }

  function applyProject(next: ProjectOpt | null) {
    setProjectSel(next);
    set('projectRequestId', next?.value ?? '');
  }

  function applyTask(next: TaskOpt | null) {
    setTaskSel(next);
    set('taskId', next?.value ?? '');
  }

  function handleProjectSelect(option: SearchableOption | null) {
    const next = option as ProjectOpt | null;
    applyProject(next);
    setNotes((prev) => ({ ...prev, project: null }));
    // Cambiar o limpiar el proyecto quita la tarea si no pertenece al nuevo.
    if (taskSel && (!next || taskSel.requestId !== next.value)) {
      applyTask(null);
      setNotes((prev) => ({ ...prev, task: 'Se quitó la tarea porque pertenece a otro proyecto.' }));
    }
  }

  function handleTaskSelect(option: SearchableOption | null) {
    const next = option as TaskOpt | null;
    applyTask(next);
    setNotes((prev) => ({ ...prev, task: null }));
    // Elegir una tarea rellena su proyecto.
    if (next && next.requestId && projectSel?.value !== next.requestId) {
      const project = data?.projects.find((p) => p.id === next.requestId);
      applyProject(
        project
          ? projectOptionFrom(project)
          : {
              value: next.requestId,
              code: next.requestCode,
              label: next.requestTitle ?? 'Proyecto',
              state: null,
              summary: next.requestTitle ?? 'Proyecto',
            },
      );
      setNotes((prev) => ({ ...prev, project: `Proyecto actualizado a ${next.requestCode}.` }));
    }
  }

  const { fieldErrors, combined } = validation;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const outcome = validate(values);
    setValidation(outcome);
    const hasErrors = Boolean(
      outcome.formError || outcome.fieldErrors.hours || outcome.fieldErrors.assetRef,
    );
    if (hasErrors) {
      // Foco al primer campo con error, en orden del DOM.
      if (outcome.combined.projectRequestId) projectInputRef.current?.focus();
      else if (outcome.fieldErrors.assetRef) assetRef.current?.focus();
      else if (outcome.combined.requesterRef) requesterRef.current?.focus();
      else if (outcome.combined.justification) justificationRef.current?.focus();
      else if (outcome.fieldErrors.hours) hoursRef.current?.focus();
      return;
    }
    onSubmit(values);
  }

  const lockFields = Boolean(loadFailure) || taskLocked;
  const projectEmpty = isJefe && effectiveScope === 'mine' ? (
    <>
      <p>No tienes proyectos propios activos.</p>
      <p className="text-xs">Activa “Todos del área” para ver los demás.</p>
    </>
  ) : isJefe ? (
    <p>No hay proyectos activos en tu área.</p>
  ) : (
    <>
      <p>No tienes proyectos activos con tareas asignadas.</p>
      <p className="text-xs">Si necesitas imputar a uno, pide a tu líder que te asigne una tarea.</p>
    </>
  );
  const taskEmpty = (
    <>
      <p>No hay tareas disponibles.</p>
      {!includeTerminated ? (
        <p className="text-xs">Marca “Incluir terminadas” para ver las que ya cerraste.</p>
      ) : null}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        // Escape con el listado abierto solo cierra el listado, no el diálogo.
        onEscapeKeyDown={(event) => {
          if (isComboboxExpanded(document.activeElement)) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar actividad' : 'Agregar actividad'}</DialogTitle>
          <DialogDescription>
            Los campos obligatorios cambian según la clasificación. Las horas son dedicación (pasos
            de 0,25) y no cambian el avance de la tarea.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-5">
            <RequiredHint />

            <div className="grid gap-4">
              <h3 className="text-sm font-semibold">Clasificación y referencia</h3>
              <Field
                id="act-class"
                label="Clasificación"
                required
                help={sourceLocked ? undefined : CLASSIFICATIONS.find((c) => c.value === cls)?.hint}
              >
                {(control) => sourceLocked || taskLocked ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input {...control} readOnly value={classificationLabel(cls)} className="w-56" />
                    <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                ) : (
                  <Select
                    value={cls}
                    onValueChange={(v) => {
                      set('classificationCode', v as ActivityClass);
                      // Cambian los campos condicionales: sus errores ya no aplican.
                      setValidation((prev) => ({
                        fieldErrors: { hours: prev.fieldErrors.hours },
                        formError: null,
                        combined: {},
                      }));
                    }}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSIFICATIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                      {(['REUNION', 'RECURRENTE'] as const).map((code) => (
                        <SelectItem key={code} value={code} disabled>
                          {CLASSIFICATION_META[code].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              {sourceLocked || taskLocked ? (
                <p className="flex items-start gap-1.5 text-meta text-muted-foreground">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {editing?.source?.kind === 'MEETING'
                      ? `Viene de la reunión «${editing.source.label}»; solo puedes cambiar horas y descripción.`
                      : editing?.source?.kind === 'OCCURRENCE'
                        ? `Viene de la actividad recurrente «${editing.source.label}»; solo puedes cambiar horas y descripción.`
                        : `Viene de la tarea ${editing?.source?.label ?? ''}; la tarea no se puede cambiar, sí las horas y los textos.`}
                  </span>
                </p>
              ) : onGoToSuggestions ? (
                <p className="flex flex-wrap items-center gap-x-2 text-meta text-muted-foreground">
                  <span>Reunión y Actividad recurrente se agregan desde «Revisar sugerencias del día».</span>
                  <Button type="button" variant="link" size="sm" onClick={onGoToSuggestions}>
                    Ir a las sugerencias
                  </Button>
                </p>
              ) : null}

              {/* Campos condicionados por la clasificación (UX; la validación
                  autoritativa es el 400 del backend). */}
              {cls === 'PLANIFICADA' ? (
                <>
                  <div
                    role="group"
                    aria-label="Opciones de la lista de proyectos y tareas"
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-muted/50 px-3 py-2"
                  >
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-8">
                      <Checkbox
                        checked={includeTerminated}
                        onChange={(e) => setIncludeTerminated(e.target.checked)}
                      />
                      Incluir terminadas
                      <span className="sr-only">. Muestra también las tareas ya terminadas.</span>
                    </label>
                    {isJefe ? (
                      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        <span id="act-scope-label" className="text-sm">
                          Mostrar
                        </span>
                        <SegmentedRadio
                          id="act-scope"
                          name="act-scope"
                          labelledBy="act-scope-label"
                          value={scope}
                          onValueChange={(v) => setScope(v === 'all' ? 'all' : 'mine')}
                          options={[
                            { value: 'mine', label: 'Mis proyectos' },
                            { value: 'all', label: 'Todos del área' },
                          ]}
                          className="flex w-full sm:inline-flex sm:w-auto"
                          optionClassName="h-11 sm:h-8 min-w-[7.5rem] flex-1 sm:flex-none"
                        />
                      </div>
                    ) : null}
                  </div>

                  {loadFailure ? (
                    <InlineNotice
                      tone="danger"
                      role="alert"
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRetry((n) => n + 1)}
                        >
                          Reintentar
                        </Button>
                      }
                    >
                      No se pudieron cargar los proyectos y tareas. {loadFailure}
                    </InlineNotice>
                  ) : null}

                  <Field
                    id="act-project"
                    label="Proyecto (solicitud)"
                    help={
                      projectIsCurrent
                        ? projectClosed
                          ? HELP_CLOSED
                          : HELP_PROJECT_UNAVAILABLE
                        : undefined
                    }
                  >
                    {(control) => (
                      <SearchableSelect
                        {...withCombined(control, combined.projectRequestId)}
                        inputRef={projectInputRef}
                        options={projectOptions}
                        selected={projectSel}
                        onSelect={handleProjectSelect}
                        placeholder="Buscar proyecto…"
                        listLabel="Proyectos"
                        clearLabel="Quitar proyecto seleccionado"
                        clearSearchLabel="Borrar búsqueda"
                        loading={loadingOptions}
                        loadingLabel="Cargando proyectos y tareas"
                        readOnly={lockFields && Boolean(projectSel)}
                        disabled={lockFields && !projectSel}
                        emptyContent={projectEmpty}
                        truncated={Boolean(data?.projectsTruncated)}
                        onSearch={setServerQ}
                        announcement={notes.project}
                      />
                    )}
                  </Field>
                  {notes.project ? (
                    <p className="-mt-2 flex items-center gap-1 text-xs text-foreground">
                      <Info className="size-3.5 shrink-0" aria-hidden="true" />
                      {notes.project}
                    </p>
                  ) : null}

                  <Field
                    id="act-task"
                    label="Tarea"
                    help={taskIsCurrent ? HELP_TASK_UNAVAILABLE : TASK_DEFAULT_HELP}
                  >
                    {(control) => (
                      <SearchableSelect
                        {...withCombined(control, combined.taskId)}
                        options={taskOptions}
                        selected={taskSel}
                        onSelect={handleTaskSelect}
                        placeholder="Buscar tarea…"
                        listLabel="Tareas"
                        clearLabel="Quitar tarea seleccionada"
                        clearSearchLabel="Borrar búsqueda"
                        loading={loadingOptions}
                        loadingLabel="Cargando proyectos y tareas"
                        readOnly={lockFields && Boolean(taskSel)}
                        disabled={lockFields && !taskSel}
                        emptyContent={taskEmpty}
                        truncated={Boolean(data?.tasksTruncated)}
                        onSearch={setServerQ}
                        announcement={notes.task}
                      />
                    )}
                  </Field>
                  {notes.task ? (
                    <p className="-mt-2 flex items-center gap-1 text-xs text-foreground">
                      <Info className="size-3.5 shrink-0" aria-hidden="true" />
                      {notes.task}
                    </p>
                  ) : null}
                </>
              ) : null}

              {cls === 'SOPORTE' ? (
                <Field id="act-asset" label="Activo" required error={fieldErrors.assetRef}>
                  <Input
                    ref={assetRef}
                    value={values.assetRef}
                    placeholder="Nombre o referencia del activo"
                    onChange={(e) => set('assetRef', e.target.value)}
                  />
                </Field>
              ) : null}

              {cls === 'EXTRAORDINARIA' ? (
                <>
                  <Field id="act-requester" label="Solicitante" required>
                    {(control) => (
                      <Input
                        ref={requesterRef}
                        {...withCombined(control, combined.requesterRef)}
                        value={values.requesterRef}
                        placeholder="Quién solicitó la actividad"
                        onChange={(e) => set('requesterRef', e.target.value)}
                      />
                    )}
                  </Field>
                  <Field id="act-justification" label="Justificación" required>
                    {(control) => (
                      <Textarea
                        ref={justificationRef}
                        {...withCombined(control, combined.justification)}
                        value={values.justification}
                        placeholder="Por qué fue necesaria"
                        onChange={(e) => set('justification', e.target.value)}
                      />
                    )}
                  </Field>
                </>
              ) : null}
            </div>

            <div className="grid gap-4">
              <h3 className="text-sm font-semibold">Detalle de la actividad</h3>
              <Field
                id="act-hours"
                label="Horas (dedicación)"
                required={cls === 'REUNION' || cls === 'RECURRENTE'}
                error={fieldErrors.hours}
                help="Las horas son dedicación en pasos de 0,25 (15 min). No cambian el estimado ni el avance de la tarea."
              >
                <HoursInput
                  ref={hoursRef}
                  value={values.hours}
                  placeholder="0,25"
                  onChange={(e) => set('hours', e.target.value)}
                />
              </Field>

              <Field id="act-description" label="Descripción">
                <Textarea
                  value={values.description}
                  placeholder="Qué se hizo"
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>

              <Field id="act-result" label="Resultado">
                <Textarea
                  value={values.result}
                  placeholder="Resultado o entregable (opcional)"
                  onChange={(e) => set('result', e.target.value)}
                />
              </Field>

              <Field id="act-evidence" label="Evidencia">
                <Input
                  value={values.evidenceUrl}
                  placeholder="URL o referencia (opcional)"
                  onChange={(e) => set('evidenceUrl', e.target.value)}
                />
              </Field>
            </div>

            <FormError id={FORM_ID} message={validation.formError ?? errorMessage} />
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
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
