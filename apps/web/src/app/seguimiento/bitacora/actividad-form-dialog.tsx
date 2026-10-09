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
  ActivityClass,
  DailyLogActivity,
  Issue,
  MyWorkItem,
  Request,
} from '@/lib/api-client';

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
  nextStep: string;
  nextStepDate: string;
  evidenceUrl: string;
  relatedIssueId: string;
}

interface ActividadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Actividad en edicion; si se pasa, el dialog edita (PATCH). */
  editing?: DailyLogActivity | null;
  /** Solicitudes en alcance (para "proyecto" planificado). */
  requests: Request[];
  /** Tareas asignadas al actor (para tarea planificada). */
  tasks: MyWorkItem[];
  /** Novedades del proceso del diario (relacion opcional). */
  issues: Issue[];
  submitting: boolean;
  /** Mensaje de error en linea; se conserva ante fallo (AC-031). */
  errorMessage: string | null;
  onSubmit: (values: ActividadFormValues) => void;
}

const CLASSIFICATIONS: { value: ActivityClass; label: string; hint: string }[] =
  [
    {
      value: 'PLANIFICADA',
      label: 'Planificada',
      hint: 'Trabajo sobre un proyecto o una tarea del plan.',
    },
    {
      value: 'SOPORTE',
      label: 'Soporte',
      hint: 'Atencion sobre un activo o servicio.',
    },
    {
      value: 'INTERNA',
      label: 'Interna',
      hint: 'Trabajo interno del area (sin referencia obligatoria).',
    },
    {
      value: 'EXTRAORDINARIA',
      label: 'Extraordinaria',
      hint: 'Requiere solicitante y justificacion.',
    },
  ];

const SIN_VALOR = '__none__';

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
    nextStep: '',
    nextStepDate: '',
    evidenceUrl: '',
    relatedIssueId: '',
  };
}

export function ActividadFormDialog({
  open,
  onOpenChange,
  editing,
  requests,
  tasks,
  issues,
  submitting,
  errorMessage,
  onSubmit,
}: ActividadFormDialogProps): React.ReactElement {
  const isEdit = Boolean(editing);
  const [values, setValues] = React.useState<ActividadFormValues>(emptyValues);
  const [clientError, setClientError] = React.useState<string | null>(null);

  // Inicializa al abrir. El reset solo ocurre aqui; ante fallo del POST/PATCH el
  // padre mantiene el dialog abierto con los valores (AC-031).
  React.useEffect(() => {
    if (!open) return;
    setClientError(null);
    if (editing) {
      setValues({
        classificationCode:
          (editing.classificationCode as ActivityClass) ?? 'PLANIFICADA',
        hours: String(editing.hours ?? 0),
        projectRequestId: editing.projectRequestId ?? '',
        taskId: editing.taskId ?? '',
        assetRef: editing.assetRef ?? '',
        requesterRef: editing.requesterRef ?? '',
        justification: editing.justification ?? '',
        description: editing.description ?? '',
        result: editing.result ?? '',
        nextStep: editing.nextStep ?? '',
        nextStepDate: editing.nextStepDate ?? '',
        evidenceUrl: editing.evidenceUrl ?? '',
        relatedIssueId: editing.relatedIssueId ?? '',
      });
    } else {
      setValues(emptyValues());
    }
  }, [open, editing]);

  function set<K extends keyof ActividadFormValues>(
    key: K,
    value: ActividadFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const cls = values.classificationCode;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Validacion de cliente SOLO como UX; la autoridad es el 400 del backend.
    if (values.hours.trim() !== '') {
      const h = Number(values.hours);
      if (!Number.isInteger(h) || h < 0) {
        setClientError('Las horas deben ser un entero mayor o igual a 0.');
        return;
      }
    }
    if (cls === 'PLANIFICADA' && !values.projectRequestId && !values.taskId) {
      setClientError(
        'Una actividad planificada requiere un proyecto o una tarea.',
      );
      return;
    }
    if (cls === 'SOPORTE' && !values.assetRef.trim()) {
      setClientError('Una actividad de soporte requiere indicar el activo.');
      return;
    }
    if (
      cls === 'EXTRAORDINARIA' &&
      (!values.requesterRef.trim() || !values.justification.trim())
    ) {
      setClientError(
        'Una actividad extraordinaria requiere solicitante y justificacion.',
      );
      return;
    }
    setClientError(null);
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar actividad' : 'Agregar actividad'}
          </DialogTitle>
          <DialogDescription>
            Los campos requeridos cambian segun la clasificacion. Las horas son{' '}
            <strong>dedicacion</strong> y no afectan el avance de la tarea
            (BR-013).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="act-class">Clasificacion *</Label>
            <Select
              value={cls}
              onValueChange={(v) => set('classificationCode', v as ActivityClass)}
            >
              <SelectTrigger id="act-class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {CLASSIFICATIONS.find((c) => c.value === cls)?.hint}
            </p>
          </div>

          {/* Campos condicionados por clasificacion (UX; la validacion
              autoritativa es el 400 del backend). */}
          {cls === 'PLANIFICADA' ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="act-project">Proyecto (solicitud)</Label>
                <Select
                  value={values.projectRequestId || SIN_VALOR}
                  onValueChange={(v) =>
                    set('projectRequestId', v === SIN_VALOR ? '' : v)
                  }
                >
                  <SelectTrigger id="act-project">
                    <SelectValue placeholder="Sin proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>Sin proyecto</SelectItem>
                    {requests.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="act-task">Tarea</Label>
                <Select
                  value={values.taskId || SIN_VALOR}
                  onValueChange={(v) => set('taskId', v === SIN_VALOR ? '' : v)}
                >
                  <SelectTrigger id="act-task">
                    <SelectValue placeholder="Sin tarea" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>Sin tarea</SelectItem>
                    {tasks.map((t) => (
                      <SelectItem key={t.taskId} value={t.taskId}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Indica un proyecto o una tarea (al menos uno).
                </p>
              </div>
            </>
          ) : null}

          {cls === 'SOPORTE' ? (
            <div className="grid gap-2">
              <Label htmlFor="act-asset">Activo *</Label>
              <Input
                id="act-asset"
                value={values.assetRef}
                placeholder="Nombre o referencia del activo"
                onChange={(e) => set('assetRef', e.target.value)}
              />
            </div>
          ) : null}

          {cls === 'EXTRAORDINARIA' ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="act-requester">Solicitante *</Label>
                <Input
                  id="act-requester"
                  value={values.requesterRef}
                  placeholder="Quien solicito la actividad"
                  onChange={(e) => set('requesterRef', e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="act-justification">Justificacion *</Label>
                <Textarea
                  id="act-justification"
                  value={values.justification}
                  placeholder="Por que fue necesaria"
                  onChange={(e) => set('justification', e.target.value)}
                />
              </div>
            </>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="act-hours">Horas (dedicacion)</Label>
            <Input
              id="act-hours"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={values.hours}
              placeholder="0"
              onChange={(e) => set('hours', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Entero mayor o igual a 0. Es dedicacion del dia; no afecta el
              avance de la tarea.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="act-description">Descripcion</Label>
            <Textarea
              id="act-description"
              value={values.description}
              placeholder="Que se hizo"
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="act-result">Resultado</Label>
            <Textarea
              id="act-result"
              value={values.result}
              placeholder="Resultado o entregable (opcional)"
              onChange={(e) => set('result', e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="act-issue">Novedad relacionada</Label>
            <Select
              value={values.relatedIssueId || SIN_VALOR}
              onValueChange={(v) =>
                set('relatedIssueId', v === SIN_VALOR ? '' : v)
              }
            >
              <SelectTrigger id="act-issue">
                <SelectValue placeholder="Sin novedad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VALOR}>Sin novedad</SelectItem>
                {issues.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="act-next">Siguiente paso</Label>
              <Input
                id="act-next"
                value={values.nextStep}
                placeholder="Que sigue (opcional)"
                onChange={(e) => set('nextStep', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="act-next-date">Fecha del siguiente paso</Label>
              <Input
                id="act-next-date"
                type="date"
                value={values.nextStepDate}
                onChange={(e) => set('nextStepDate', e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="act-evidence">Evidencia</Label>
            <Input
              id="act-evidence"
              value={values.evidenceUrl}
              placeholder="URL o referencia (opcional)"
              onChange={(e) => set('evidenceUrl', e.target.value)}
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
                  : 'Agregar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
