'use client';

import * as React from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { CatalogItem, Request } from '@/lib/api-client';
import { listCatalogItems } from '@/lib/catalog';
import { listRequests } from '@/lib/requests';
import { requestStateLabel } from '@/lib/request-state';
import { createTriage, TriageError } from '@/lib/triage';

type LoadState = 'loading' | 'success' | 'error';
type Decision = 'CONTINUAR' | 'DEVOLVER' | 'RECHAZAR';

const CATALOG_FAMILIES = [
  'TRIAGE_ROUTE',
  'DEMAND_TYPE',
  'CRITICALITY',
  'TRIAGE_SIZE',
  'DATA_AVAILABILITY',
] as const;

type CatalogsByFamily = Record<string, CatalogItem[]>;

interface TriageFormValues {
  routeCode: string;
  demandTypeCode: string;
  criticalityCode: string;
  sizeCode: string;
  dataAvailabilityCode: string;
  totalEffortHours: string;
  mainResponsible: string;
  dependencies: string;
  notes: string;
  decision: Decision | '';
}

const EMPTY_FORM: TriageFormValues = {
  routeCode: '',
  demandTypeCode: '',
  criticalityCode: '',
  sizeCode: '',
  dataAvailabilityCode: '',
  totalEffortHours: '',
  mainResponsible: '',
  dependencies: '',
  notes: '',
  decision: '',
};

const NONE = '__none__';

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function selectedOrUndefined(value: string): string | undefined {
  return value && value !== NONE ? value : undefined;
}

export function TriageView(): React.ReactElement {
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [catalogs, setCatalogs] = React.useState<CatalogsByFamily>({});
  const [state, setState] = React.useState<LoadState>('loading');

  const [selectedId, setSelectedId] = React.useState<string>('');
  const [form, setForm] = React.useState<TriageFormValues>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [reqs, ...families] = await Promise.all([
        listRequests(),
        ...CATALOG_FAMILIES.map((catalog) =>
          listCatalogItems({ catalog, active: true }).catch(
            () => [] as CatalogItem[],
          ),
        ),
      ]);
      const byFamily: CatalogsByFamily = {};
      CATALOG_FAMILIES.forEach((catalog, i) => {
        byFamily[catalog] = families[i];
      });
      setRequests(reqs);
      setCatalogs(byFamily);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selected = React.useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );

  // El triage solo se admite desde REGISTRADA (gate server-side; HIGH-1).
  const canDecide = selected?.operationalState === 'REGISTRADA';

  function selectRequest(id: string) {
    setSelectedId(id);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!form.decision) {
      setFormError('La decision es obligatoria.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const effort =
        form.totalEffortHours.trim() === ''
          ? undefined
          : Number.parseInt(form.totalEffortHours, 10);
      await createTriage(selected.id, {
        decision: form.decision,
        routeCode: selectedOrUndefined(form.routeCode),
        demandTypeCode: selectedOrUndefined(form.demandTypeCode),
        criticalityCode: selectedOrUndefined(form.criticalityCode),
        sizeCode: selectedOrUndefined(form.sizeCode),
        dataAvailabilityCode: selectedOrUndefined(form.dataAvailabilityCode),
        totalEffortHours:
          effort !== undefined && Number.isFinite(effort) ? effort : undefined,
        mainResponsible: trimOrUndefined(form.mainResponsible),
        dependencies: trimOrUndefined(form.dependencies),
        notes: trimOrUndefined(form.notes),
      });
      toast.success('Triage registrado.');
      // Reset solo en exito (AC-031); recarga para reflejar el nuevo estado.
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      const message =
        err instanceof TriageError
          ? err.message
          : 'Ocurrio un error inesperado.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function renderCatalogSelect(
    id: string,
    label: string,
    family: string,
    value: string,
    onChange: (value: string) => void,
  ) {
    const items = catalogs[family] ?? [];
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Select value={value || NONE} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Sin especificar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin especificar</SelectItem>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.code}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Triage</h1>
        <p className="text-sm text-muted-foreground">
          Clasifica y decide la ruta de cada solicitud (Continuar, Devolver o
          Rechazar).
        </p>
      </header>

      <section aria-live="polite" className="flex flex-col gap-6">
        {state === 'loading' ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible comunicarse con el servidor.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
            <p className="text-sm font-medium">
              No hay solicitudes en tu alcance.
            </p>
            <p className="text-sm text-muted-foreground">
              Registra solicitudes para poder decidir su triage.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-2 rounded-lg border bg-card p-4">
              <Label htmlFor="triage-request">Solicitud</Label>
              <Select value={selectedId} onValueChange={selectRequest}>
                <SelectTrigger id="triage-request">
                  <SelectValue placeholder="Selecciona una solicitud" />
                </SelectTrigger>
                <SelectContent>
                  {requests.map((req) => (
                    <SelectItem key={req.id} value={req.id}>
                      {req.title} - {requestStateLabel(req.operationalState)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selected ? (
              canDecide ? (
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-4 rounded-lg border bg-card p-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    {renderCatalogSelect(
                      'triage-route',
                      'Ruta',
                      'TRIAGE_ROUTE',
                      form.routeCode,
                      (v) => setForm((f) => ({ ...f, routeCode: v })),
                    )}
                    {renderCatalogSelect(
                      'triage-type',
                      'Tipo de demanda',
                      'DEMAND_TYPE',
                      form.demandTypeCode,
                      (v) => setForm((f) => ({ ...f, demandTypeCode: v })),
                    )}
                    {renderCatalogSelect(
                      'triage-criticality',
                      'Criticidad',
                      'CRITICALITY',
                      form.criticalityCode,
                      (v) => setForm((f) => ({ ...f, criticalityCode: v })),
                    )}
                    {renderCatalogSelect(
                      'triage-size',
                      'Tamano',
                      'TRIAGE_SIZE',
                      form.sizeCode,
                      (v) => setForm((f) => ({ ...f, sizeCode: v })),
                    )}
                    {renderCatalogSelect(
                      'triage-data',
                      'Disponibilidad de datos',
                      'DATA_AVAILABILITY',
                      form.dataAvailabilityCode,
                      (v) =>
                        setForm((f) => ({ ...f, dataAvailabilityCode: v })),
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="triage-effort">Esfuerzo (horas)</Label>
                      <Input
                        id="triage-effort"
                        type="number"
                        min={0}
                        value={form.totalEffortHours}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            totalEffortHours: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="triage-responsible">
                      Responsable principal
                    </Label>
                    <Input
                      id="triage-responsible"
                      value={form.mainResponsible}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          mainResponsible: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="triage-dependencies">Dependencias</Label>
                    <Textarea
                      id="triage-dependencies"
                      value={form.dependencies}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dependencies: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="triage-notes">Observaciones</Label>
                    <Textarea
                      id="triage-notes"
                      value={form.notes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, notes: e.target.value }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="grid gap-2">
                    <Label htmlFor="triage-decision">Decision *</Label>
                    <Select
                      value={form.decision}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, decision: v as Decision }))
                      }
                    >
                      <SelectTrigger id="triage-decision">
                        <SelectValue placeholder="Selecciona la decision" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CONTINUAR">Continuar</SelectItem>
                        <SelectItem value="DEVOLVER">Devolver</SelectItem>
                        <SelectItem value="RECHAZAR">Rechazar</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Solo Continuar habilita la priorizacion.
                    </p>
                  </div>

                  {formError ? (
                    <p className="text-sm text-destructive" role="alert">
                      {formError}
                    </p>
                  ) : null}

                  <div className="flex justify-end">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Guardando...' : 'Guardar triage'}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed bg-card p-6">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Lock aria-hidden="true" className="size-4" />
                    Triage no disponible
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Esta solicitud esta en estado{' '}
                    <Badge variant="secondary">
                      {requestStateLabel(selected.operationalState)}
                    </Badge>
                    . El triage solo puede registrarse cuando la solicitud esta
                    Registrada; una vez decidido no se vuelve a ejecutar.
                  </p>
                </div>
              )
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
