'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListFilter, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Field, FieldSet, FormError, RequiredHint } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import {
  RequestContextBar,
  RequestFacts,
  RequestSummary,
  type RequestPickerGroup,
} from '@/components/request-context-bar';
import { RequirementsPanel, type RequirementItem } from '@/components/requirements-panel';
import { DescriptionList, type DescriptionItem } from '@/components/description-list';
import { StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioCards } from '@/components/ui/radio-cards';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type {
  Asset,
  CatalogItem,
  EligibleResponsible,
  Process,
  Request,
  Triage,
  TriageSuggestion,
} from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { AiTriageError, requestTriageSuggestion } from '@/lib/ai-triage';
import { listAssets } from '@/lib/assets';
import { listCatalogItems } from '@/lib/catalog';
import { formatCount, formatDateTime } from '@/lib/format';
import { listRequests } from '@/lib/requests';
import { isPrioritizable, isTriageable } from '@/lib/request-state';
import { listProcesses } from '@/lib/team';
import { createTriage, listTriage, TriageError } from '@/lib/triage';
import { useRequestIdParam } from '@/lib/use-request-param';
import { AssetBasePanel } from './asset-base-panel';

type LoadState = 'loading' | 'success' | 'error';
type Decision = 'CONTINUAR' | 'DEVOLVER' | 'RECHAZAR';

const TITLE = 'Triage';
/** La misma descripción usa el PageFallback de page.tsx. */
const TRIAGE_DESCRIPTION =
  'Clasifica cada solicitud registrada y decide si continúa, se devuelve o se rechaza.';
const NOT_AVAILABLE = 'La solicitud indicada no está disponible aquí.';
const FORM_ID = 'triage-form';

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
  mainResponsibleUserId: string;
  dependencies: string;
  notes: string;
  decision: Decision | '';
}

type FieldKey = 'totalEffortHours' | 'decision';
type FieldErrors = Partial<Record<FieldKey, string>>;

const EMPTY_FORM: TriageFormValues = {
  routeCode: '',
  demandTypeCode: '',
  criticalityCode: '',
  sizeCode: '',
  dataAvailabilityCode: '',
  totalEffortHours: '',
  mainResponsibleUserId: '',
  dependencies: '',
  notes: '',
  decision: '',
};

const DECISIONS: { value: Decision; label: string }[] = [
  { value: 'CONTINUAR', label: 'Continuar' },
  { value: 'DEVOLVER', label: 'Devolver' },
  { value: 'RECHAZAR', label: 'Rechazar' },
];

const NONE = '__none__';
const PENDING_NOUN = { one: 'pendiente de triage', other: 'pendientes de triage' };
const GROUPS: RequestPickerGroup[] = [{ label: 'Pendientes de triage', match: isTriageable }];

/**
 * Estados que admiten asociar/cambiar el activo base (gate server-side de
 * FEAT-002). Fuera de estos, el backend responde 409.
 */
const ASSET_ASSOCIABLE_STATES: readonly string[] = [
  'REGISTRADA',
  'EN_TRIAGE',
  'BACKLOG_PRIORIZADO',
  'DEVUELTA',
];

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function selectedOrUndefined(value: string): string | undefined {
  return value && value !== NONE ? value : undefined;
}

/**
 * Reglas del cliente, evaluadas todas a la vez (design §9): la decisión es
 * obligatoria y el esfuerzo, si se indica, es un entero mayor o igual a 0 (el
 * mismo min=0 del campo numérico, ahora con su mensaje junto al campo).
 */
function validate(form: TriageFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const effort = form.totalEffortHours.trim();
  if (effort !== '') {
    const hours = Number(effort);
    if (!Number.isInteger(hours) || hours < 0) {
      errors.totalEffortHours = 'Indica un número entero de horas, mayor o igual a 0.';
    }
  }
  if (!form.decision) errors.decision = 'La decisión es obligatoria.';
  return errors;
}

/**
 * Triage (design §11.6 y §10.2, patrón C): barra de contexto con las
 * solicitudes agrupadas, formulario por grupos y, si la solicitud no admite
 * triage, el panel de requisitos con el motivo. La selección se refleja en
 * ?requestId= (§7.9.1).
 */
export function TriageView(): React.ReactElement {
  const router = useRouter();
  const { allowedModules } = useActor();
  const { requestId: urlId, setRequestId } = useRequestIdParam();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [catalogs, setCatalogs] = React.useState<CatalogsByFamily>({});
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState('');
  const selectedRef = React.useRef(selectedId);
  selectedRef.current = selectedId;
  const [eligibleResponsibles, setEligibleResponsibles] = React.useState<
    EligibleResponsible[]
  >([]);
  // Triage ya registrado de la solicitud elegida (0 o 1 fila en Fase 2), para
  // mostrar el detalle de lo decidido cuando la etapa ya está completada.
  const [registeredTriage, setRegisteredTriage] = React.useState<Triage | null>(null);
  const [form, setForm] = React.useState<TriageFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const effortRef = React.useRef<HTMLInputElement>(null);
  // Sugerencia de IA (panel lateral): no persiste nada, solo prefija los selects
  // del formulario para que el humano confirme. Se reinicia al cambiar de solicitud.
  const [suggestion, setSuggestion] = React.useState<TriageSuggestion | null>(null);
  const [suggesting, setSuggesting] = React.useState(false);
  const [suggestionError, setSuggestionError] = React.useState<string | null>(null);

  // Fija la selección, reinicia el formulario y carga los candidatos a
  // responsable principal de esa solicitud (dependen de su proceso principal).
  // La carga es tolerante a fallo (como `processes`): si falla, el desplegable
  // queda con solo «Sin especificar» y el campo sigue siendo opcional.
  const selectRequest = React.useCallback((id: string) => {
    setSelectedId(id);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setRegisteredTriage(null);
    setSuggestion(null);
    setSuggestionError(null);
    setSuggesting(false);
    if (!id) {
      setEligibleResponsibles([]);
      return;
    }
    void listTriage(id)
      .then((ctx) => {
        // Evita condiciones de carrera si la selección cambió mientras cargaba.
        if (selectedRef.current !== id) return;
        setEligibleResponsibles(ctx.eligibleResponsibles);
        // En Fase 2 hay 0 o 1 triage; guardamos el registrado (si existe) para
        // mostrar su detalle cuando la etapa ya está completada.
        setRegisteredTriage(ctx.triages[0] ?? null);
      })
      .catch(() => {
        if (selectedRef.current === id) {
          setEligibleResponsibles([]);
          setRegisteredTriage(null);
        }
      });
  }, []);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [reqs, procs, assts, ...families] = await Promise.all([
        listRequests(),
        listProcesses().catch(() => [] as Process[]),
        listAssets().catch(() => [] as Asset[]),
        ...CATALOG_FAMILIES.map((catalog) =>
          listCatalogItems({ catalog, active: true }).catch(() => [] as CatalogItem[]),
        ),
      ]);
      const byFamily: CatalogsByFamily = {};
      CATALOG_FAMILIES.forEach((catalog, i) => {
        byFamily[catalog] = families[i];
      });
      setRequests(reqs);
      setProcesses(procs);
      setAssets(assts);
      setCatalogs(byFamily);
      setState('success');
      // Regla 3 de §7.9.1: si la solicitud elegida ya no está, se limpia.
      if (selectedRef.current && !reqs.some((r) => r.id === selectedRef.current)) {
        selectRequest('');
        setRequestId(null);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : null);
      setState('error');
    }
  }, [selectRequest, setRequestId]);

  // `load` es estable: carga al montar, como hoy (Triage no recarga al cambiar de actor).
  React.useEffect(() => {
    void load();
  }, [load]);

  // Regla 1 de §7.9.1: adoptar ?requestId= al terminar la carga y cuando cambia.
  React.useEffect(() => {
    if (state !== 'success' || !urlId || urlId === selectedRef.current) return;
    if (requests.some((r) => r.id === urlId)) {
      setNotice(null);
      selectRequest(urlId);
    } else {
      setNotice(NOT_AVAILABLE);
      setRequestId(null);
    }
  }, [state, requests, urlId, selectRequest, setRequestId]);

  // Regla 2: primero el estado, después la URL.
  function handlePick(id: string): void {
    setNotice(null);
    selectRequest(id);
    setRequestId(id);
  }

  const selected = React.useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );
  const pendingCount = React.useMemo(() => requests.filter(isTriageable).length, [requests]);
  const processName = selected
    ? (processes.find((p) => p.id === selected.mainProcessId)?.name ?? null)
    : null;
  const assetName = selected?.assetId
    ? (assets.find((a) => a.id === selected.assetId)?.name ?? 'Activo fuera de tu alcance')
    : null;

  /** Lleva el foco al control «Activo base» (acción del requisito). */
  function focusAssetPanel(): void {
    const panel = document.getElementById('triage-asset-base');
    if (!panel) return;
    panel.scrollIntoView({ block: 'nearest' });
    const focusable = panel.querySelector<HTMLElement>(
      'button:not([disabled]), [role="radio"], input, [role="combobox"]',
    );
    focusable?.focus();
  }

  /**
   * Requisito «activo base» materializado en el panel de requisitos (Opción A,
   * solo pending/met). No evalúa reglas nuevas: refleja selected.assetId y el
   * estado operativo que el backend ya controla.
   */
  function assetRequirement(request: Request): RequirementItem {
    if (request.assetId !== null) {
      return {
        id: 'asset-base',
        label: 'Activo base asociado',
        status: 'met',
        detail: assetName,
      };
    }
    if (request.operationalState === 'REGISTRADA') {
      return {
        id: 'asset-base',
        label: 'Asociar un activo base',
        status: 'pending',
        action: {
          label: 'Asociar activo',
          disabled: true,
          disabledReason: 'Primero registra el triage (Continuar).',
        },
      };
    }
    return {
      id: 'asset-base',
      label: 'Asociar un activo base',
      status: 'pending',
      action: { label: 'Asociar activo', onClick: focusAssetPanel },
    };
  }

  function update<K extends keyof TriageFormValues>(key: K, value: TriageFormValues[K]): void {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => (key in prev ? { ...prev, [key]: undefined } : prev));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected || submitting) return;
    const errors = validate(form);
    setFieldErrors(errors);
    if (errors.totalEffortHours || errors.decision) {
      // Foco al primer campo con error, en orden del DOM.
      if (errors.totalEffortHours) effortRef.current?.focus();
      else document.getElementById('triage-decision-CONTINUAR')?.focus();
      return;
    }
    const decision = form.decision as Decision;
    setSubmitting(true);
    setFormError(null);
    try {
      const effort =
        form.totalEffortHours.trim() === '' ? undefined : Number.parseInt(form.totalEffortHours, 10);
      await createTriage(selected.id, {
        decision,
        routeCode: selectedOrUndefined(form.routeCode),
        demandTypeCode: selectedOrUndefined(form.demandTypeCode),
        criticalityCode: selectedOrUndefined(form.criticalityCode),
        sizeCode: selectedOrUndefined(form.sizeCode),
        dataAvailabilityCode: selectedOrUndefined(form.dataAvailabilityCode),
        totalEffortHours: effort !== undefined && Number.isFinite(effort) ? effort : undefined,
        mainResponsibleUserId: selectedOrUndefined(form.mainResponsibleUserId),
        dependencies: trimOrUndefined(form.dependencies),
        notes: trimOrUndefined(form.notes),
      });
      const priorityHref = `/demanda/priorizacion?requestId=${encodeURIComponent(selected.id)}`;
      toast.success(
        'Triage registrado.',
        decision === 'CONTINUAR' && allowedModules.has('priority')
          ? { action: { label: 'Ir a priorización', onClick: () => router.push(priorityHref) } }
          : undefined,
      );
      // Reset solo en éxito (AC-031); recarga para reflejar el nuevo estado.
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      const message = err instanceof TriageError ? err.message : 'Ocurrió un error inesperado.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Pide una sugerencia de IA para la solicitud elegida. No envía nada: solo
   * guarda la respuesta para que el humano la revise y, si quiere, prefije los
   * selects. En 409/422/503/error deja un mensaje y el triage manual intacto.
   */
  async function handleSuggest(): Promise<void> {
    if (!selected || suggesting) return;
    setSuggesting(true);
    setSuggestion(null);
    setSuggestionError(null);
    const id = selected.id;
    try {
      const result = await requestTriageSuggestion(id);
      if (selectedRef.current !== id) return;
      setSuggestion(result);
    } catch (err) {
      if (selectedRef.current !== id) return;
      const message =
        err instanceof AiTriageError ? err.message : 'Ocurrió un error inesperado.';
      setSuggestionError(message);
    } finally {
      if (selectedRef.current === id) setSuggesting(false);
    }
  }

  function renderCatalogSelect(
    id: string,
    label: string,
    family: string,
    value: string,
    onChange: (value: string) => void,
  ): React.ReactElement {
    const items = catalogs[family] ?? [];
    return (
      <Field id={id} label={label}>
        {(control) => (
          <Select value={value || NONE} onValueChange={onChange}>
            <SelectTrigger {...control}>
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
        )}
      </Field>
    );
  }

  /** Etiqueta visible de un code de catálogo; si no se encuentra, el propio code. */
  function catalogLabel(family: string, code: string | null): string | null {
    if (!code) return null;
    const item = (catalogs[family] ?? []).find((c) => c.code === code);
    return item?.label ?? code;
  }

  /**
   * Panel «Sugerencia de IA» de la columna lateral: botón para pedir la
   * sugerencia, estado de carga, mensaje de degradación (409/422/503/error) y, en
   * éxito, los cinco codes traducidos a etiqueta, la banda P1-P4 orientativa +
   * justificación, los posibles duplicados (enlazados) y la información faltante.
   * Cada code sugerido tiene un botón que PREFIJA el select del formulario; la
   * sugerencia nunca envía nada por sí sola.
   */
  function renderSuggestionPanel(): React.ReactElement {
    const rows: {
      field: keyof TriageFormValues;
      family: string;
      label: string;
      code: string | null;
    }[] = suggestion
      ? [
          { field: 'routeCode', family: 'TRIAGE_ROUTE', label: 'Ruta', code: suggestion.suggestedRouteCode },
          {
            field: 'demandTypeCode',
            family: 'DEMAND_TYPE',
            label: 'Tipo de demanda',
            code: suggestion.suggestedDemandTypeCode,
          },
          {
            field: 'criticalityCode',
            family: 'CRITICALITY',
            label: 'Criticidad',
            code: suggestion.suggestedCriticalityCode,
          },
          { field: 'sizeCode', family: 'TRIAGE_SIZE', label: 'Tamaño', code: suggestion.suggestedSizeCode },
          {
            field: 'dataAvailabilityCode',
            family: 'DATA_AVAILABILITY',
            label: 'Disponibilidad de datos',
            code: suggestion.suggestedDataAvailabilityCode,
          },
        ]
      : [];

    return (
      <section
        aria-labelledby="triage-ai-title"
        className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="triage-ai-title" className="text-base font-semibold">
            Sugerencia de IA
          </h2>
        </div>
        <p className="text-meta text-muted-foreground">
          Es una señal orientativa: nada se envía ni se registra por sí solo. Revisa y confirma en el
          formulario de triage.
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={suggesting}
            onClick={() => void handleSuggest()}
          >
            <Sparkles aria-hidden="true" />
            {suggestion ? 'Volver a sugerir' : 'Sugerir con IA'}
          </Button>
        </div>

        {suggestionError ? (
          <InlineNotice tone="warning" role="status" title="No hay sugerencia disponible.">
            <p className="text-muted-foreground">{suggestionError}</p>
          </InlineNotice>
        ) : null}

        {suggestion ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Clasificación sugerida</h3>
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <li
                    key={row.field}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="text-sm">
                      <span className="text-muted-foreground">{row.label}:</span>{' '}
                      {row.code ? (catalogLabel(row.family, row.code) ?? row.code) : 'Sin sugerencia'}
                    </span>
                    {row.code ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => update(row.field, row.code as TriageFormValues[typeof row.field])}
                      >
                        Usar
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Prioridad orientativa</h3>
              <div className="flex items-center gap-2 text-sm">
                {suggestion.tentativePriorityBand ? (
                  <StatusBadge kind="band" value={suggestion.tentativePriorityBand} />
                ) : (
                  <span className="text-muted-foreground">Sin banda</span>
                )}
              </div>
              {suggestion.priorityRationale ? (
                <p className="text-meta text-muted-foreground">{suggestion.priorityRationale}</p>
              ) : null}
              <p className="text-meta text-muted-foreground">
                Es una señal, no el score oficial de priorización.
              </p>
            </div>

            {suggestion.possibleDuplicates.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Posibles duplicados</h3>
                <ul className="flex flex-col gap-2">
                  {suggestion.possibleDuplicates.map((dup) => (
                    <li key={dup.requestId} className="flex flex-col gap-0.5">
                      <Link
                        href={`/demanda/solicitudes/${encodeURIComponent(dup.requestId)}`}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {dup.title}
                      </Link>
                      {dup.reason ? (
                        <span className="text-meta text-muted-foreground">{dup.reason}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {suggestion.missingInformation.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Información faltante</h3>
                <ul className="list-disc pl-5 text-meta text-muted-foreground">
                  {suggestion.missingInformation.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  /**
   * Detalle de lo registrado en el triage (solo lectura), para cuando la etapa
   * ya está completada. Se muestra junto al ítem «Triage registrado». Los codes
   * de catálogo se traducen a su etiqueta visible; los valores vacíos caen a «—».
   */
  function renderTriageDetail(triage: Triage): React.ReactElement {
    const items: DescriptionItem[] = [
      { term: 'Ruta', value: catalogLabel('TRIAGE_ROUTE', triage.routeCode) },
      { term: 'Tipo de demanda', value: catalogLabel('DEMAND_TYPE', triage.demandTypeCode) },
      { term: 'Criticidad', value: catalogLabel('CRITICALITY', triage.criticalityCode) },
      { term: 'Tamaño', value: catalogLabel('TRIAGE_SIZE', triage.sizeCode) },
      {
        term: 'Disponibilidad de datos',
        value: catalogLabel('DATA_AVAILABILITY', triage.dataAvailabilityCode),
      },
      {
        term: 'Esfuerzo (horas)',
        value: triage.totalEffortHours === null ? null : String(triage.totalEffortHours),
      },
      { term: 'Responsable principal', value: triage.mainResponsibleName },
      { term: 'Fecha de decisión', value: formatDateTime(triage.decidedAt) },
      { term: 'Dependencias', value: triage.dependencies, span: 2 },
      { term: 'Observaciones', value: triage.notes, span: 2 },
    ];
    return (
      <section
        aria-labelledby="triage-detail-title"
        className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4"
      >
        <h2 id="triage-detail-title" className="text-base font-semibold">
          Detalle del triage registrado
        </h2>
        <DescriptionList items={items} columns={2} />
      </section>
    );
  }

  function renderBlock(request: Request): React.ReactElement {
    if (request.currentTriageDecision) {
      // (a) Ya tiene triage: el único ítem está cumplido y el panel se pinta sin pendientes.
      const doneTitle = 'El triage de esta solicitud ya está registrado';
      const item: RequirementItem = {
        id: 'triage',
        label: 'Triage registrado',
        status: 'met',
        detail: (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Decisión: <StatusBadge kind="triage" value={request.currentTriageDecision} />
            <span aria-hidden="true">·</span>
            Estado actual: <StatusBadge kind="request" value={request.operationalState} />
          </span>
        ),
        action:
          isPrioritizable(request) && allowedModules.has('priority')
            ? {
                label: 'Ir a priorización',
                href: `/demanda/priorizacion?requestId=${encodeURIComponent(request.id)}`,
              }
            : undefined,
      };
      return (
        <div className="flex flex-col gap-6">
          <RequirementsPanel
            id="triage-block"
            title={doneTitle}
            doneTitle={doneTitle}
            doneDescription="El triage se registra una sola vez, cuando la solicitud está Registrada."
            items={[item]}
          />
          {/* El detalle solo aparece cuando ya se cargó el triage de esta
              solicitud; mientras llega, el ítem de arriba ya confirma que está
              registrado. */}
          {registeredTriage && registeredTriage.requestId === request.id
            ? renderTriageDetail(registeredTriage)
            : null}
        </div>
      );
    }
    // (b) Sin triage y en otro estado.
    return (
      <RequirementsPanel
        id="triage-block"
        title="No puedes registrar el triage de esta solicitud"
        description="El triage se registra una sola vez, cuando la solicitud está Registrada. Elige una del grupo «Pendientes de triage»."
        items={[
          {
            id: 'state',
            label: 'La solicitud debe estar en estado Registrada',
            status: 'pending',
            detail: (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                Estado actual: <StatusBadge kind="request" value={request.operationalState} />
              </span>
            ),
          },
        ]}
      />
    );
  }

  function renderForm(): React.ReactElement {
    return (
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        aria-labelledby="triage-form-title"
        className="flex flex-col gap-5 rounded-lg border bg-card p-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id="triage-form-title" className="text-base font-semibold">
            Registrar triage
          </h2>
          <RequiredHint />
        </div>

        <div className="grid gap-4">
          <h3 className="text-sm font-semibold">Clasificación</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {renderCatalogSelect('triage-route', 'Ruta', 'TRIAGE_ROUTE', form.routeCode, (v) =>
              update('routeCode', v),
            )}
            {renderCatalogSelect('triage-type', 'Tipo de demanda', 'DEMAND_TYPE', form.demandTypeCode, (v) =>
              update('demandTypeCode', v),
            )}
            {renderCatalogSelect('triage-criticality', 'Criticidad', 'CRITICALITY', form.criticalityCode, (v) =>
              update('criticalityCode', v),
            )}
            {renderCatalogSelect('triage-size', 'Tamaño', 'TRIAGE_SIZE', form.sizeCode, (v) =>
              update('sizeCode', v),
            )}
            {renderCatalogSelect(
              'triage-data',
              'Disponibilidad de datos',
              'DATA_AVAILABILITY',
              form.dataAvailabilityCode,
              (v) => update('dataAvailabilityCode', v),
            )}
            <Field id="triage-effort" label="Esfuerzo (horas)" error={fieldErrors.totalEffortHours}>
              <Input
                ref={effortRef}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={form.totalEffortHours}
                onChange={(e) => update('totalEffortHours', e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="grid gap-4">
          <h3 className="text-sm font-semibold">Responsable y dependencias</h3>
          <Field id="triage-responsible" label="Responsable principal">
            {(control) => (
              <Select
                value={form.mainResponsibleUserId || NONE}
                onValueChange={(v) =>
                  update('mainResponsibleUserId', v === NONE ? '' : v)
                }
              >
                <SelectTrigger {...control}>
                  <SelectValue placeholder="Sin especificar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin especificar</SelectItem>
                  {eligibleResponsibles.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field id="triage-dependencies" label="Dependencias">
            <Textarea value={form.dependencies} onChange={(e) => update('dependencies', e.target.value)} />
          </Field>
          <Field id="triage-notes" label="Observaciones">
            <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} />
          </Field>
        </div>

        {/* Grupo «Decisión»: su título es la legend del FieldSet; un h3 con el
            mismo texto encima la repetiría en pantalla y al lector. */}
        <div className="grid gap-4">
          <FieldSet
            id="triage-decision"
            kind="radio"
            legend="Decisión"
            required
            help="Solo Continuar habilita la priorización."
            error={fieldErrors.decision}
          >
            <RadioCards
              name="triage-decision"
              idPrefix="triage-decision"
              options={DECISIONS}
              value={form.decision}
              onValueChange={(value) => update('decision', value as Decision)}
              invalid={Boolean(fieldErrors.decision)}
            />
          </FieldSet>
        </div>

        <FormError id={FORM_ID} message={formError} />

        <div className="flex justify-end border-t pt-4">
          <Button type="submit" loading={submitting}>
            {submitting ? 'Guardando…' : 'Guardar triage'}
          </Button>
        </div>
      </form>
    );
  }

  let content: React.ReactNode;
  if (state === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  } else if (state === 'error') {
    content = (
      <div className="rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar las solicitudes."
          message={loadError}
          onRetry={() => void load()}
        />
      </div>
    );
  } else if (requests.length === 0) {
    content = (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={ListFilter}
          title="No hay solicitudes en tu alcance."
          description="Registra solicitudes para poder decidir su triage."
          action={
            allowedModules.has('requests') ? (
              <Link href="/demanda/solicitudes" className={buttonVariants({ variant: 'outline' })}>
                Ir a Solicitudes
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  } else {
    content = (
      <>
        <RequestContextBar
          id="triage-request"
          requests={requests}
          value={selectedId}
          onValueChange={handlePick}
          groups={GROUPS}
          helper={formatCount(pendingCount, PENDING_NOUN)}
          summary={selected ? <RequestSummary request={selected} show={['state', 'registered']} /> : null}
          actions={
            selected && allowedModules.has('requests') ? (
              <Link
                href={`/demanda/solicitudes/${encodeURIComponent(selected.id)}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Ver ficha completa
              </Link>
            ) : null
          }
        />
        {notice ? <InlineNotice tone="info">{notice}</InlineNotice> : null}
        {selected ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,45rem)_minmax(18rem,1fr)] xl:items-start">
            <div className="min-w-0">{isTriageable(selected) ? renderForm() : renderBlock(selected)}</div>
            <div className="flex min-w-0 flex-col gap-6">
              <section
                aria-labelledby="triage-facts-title"
                className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4"
              >
                <h2 id="triage-facts-title" className="text-base font-semibold">
                  Ficha de la solicitud
                </h2>
                <RequestFacts request={selected} processName={processName} />
              </section>
              {isTriageable(selected) ? renderSuggestionPanel() : null}
              <RequirementsPanel
                id="triage-asset-requirement"
                title="Falta el activo base"
                description="La solicitud necesita un activo base para poder priorizarse."
                doneTitle="Activo base listo"
                items={[assetRequirement(selected)]}
              />
              {ASSET_ASSOCIABLE_STATES.includes(selected.operationalState) ? (
                <AssetBasePanel
                  request={selected}
                  processName={processName}
                  disabled={selected.operationalState === 'REGISTRADA'}
                  onAssociated={() => void load()}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={ListFilter}
              title="Elige una solicitud para empezar."
              description="Las solicitudes pendientes de triage aparecen primero en el selector."
            />
          </div>
        )}
      </>
    );
  }

  return (
    <PageLayout>
      <PageHeader title={TITLE} description={TRIAGE_DESCRIPTION} />
      {content}
    </PageLayout>
  );
}
