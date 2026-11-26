'use client';

import * as React from 'react';
import Link from 'next/link';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DisabledReason } from '@/components/disabled-reason';
import { ErrorState } from '@/components/error-state';
import { IdChip } from '@/components/id-chip';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RequestFacts } from '@/components/request-context-bar';
import { Section } from '@/components/section';
import { VerAuditoriaLink } from '@/components/ver-auditoria-link';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import type {
  Approval,
  CatalogItem,
  Plan,
  PriorityEvaluation,
  Process,
  Request,
  Requester,
  Triage,
} from '@/lib/api-client';
import { listApprovals } from '@/lib/approval';
import { listCatalogItems } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import {
  type GovernanceBoard,
  type ValidationRecord,
  getGovernanceBoard,
  listValidations,
} from '@/lib/governance';
import { getPlan } from '@/lib/plan';
import { listPriorityEvaluations } from '@/lib/priority';
import { listRequesters } from '@/lib/requesters';
import { RequestError, getRequest, resubmitRequest, updateRequest } from '@/lib/requests';
import {
  editPolicy,
  isPlannable,
  isPrioritizable,
  isTriageable,
  requestActorFrom,
  resubmitPolicy,
} from '@/lib/request-state';
import { listProcesses } from '@/lib/team';
import { listTriage } from '@/lib/triage';
import {
  AprobacionDetalle,
  EstabilizacionDetalle,
  GobiernoDetalle,
  PlanDetalle,
  PrioridadDetalle,
  TriageDetalle,
  TriageHistorial,
  TriageResumen,
  type TriageCatalogs,
} from './ficha-detalles';
import { FichaStep, FichaStrip } from './ficha-step';
import { SolicitudFormDialog, type SolicitudFormValues } from '../solicitud-form-dialog';
import { solicitudUpdatePayload } from '../solicitud-payload';
import { ClosurePanel } from './closure-panel';
import { EjecucionSection } from './ejecucion-section';
import {
  approvalStepState,
  governanceStepState,
  planStepState,
  priorityStepState,
  solicitudStepState,
  stabilizationStepState,
  triageStepState,
  type StepState,
} from './ficha-steps';

type LoadState = 'loading' | 'success' | 'error';

/** Datos de las etapas, cada una tolerante a fallo/404 (patrón frameworks-view). */
interface StageData {
  processes: Process[];
  triages: Triage[];
  evaluations: PriorityEvaluation[];
  approvals: Approval[];
  plan: Plan | null;
  board: GovernanceBoard | null;
  validations: ValidationRecord[];
  triageCatalogs: TriageCatalogs;
  routeCatalog: CatalogItem[];
  validationTypeCatalog: CatalogItem[];
  validationResultCatalog: CatalogItem[];
}

const EMPTY_STAGE: StageData = {
  processes: [],
  triages: [],
  evaluations: [],
  approvals: [],
  plan: null,
  board: null,
  validations: [],
  triageCatalogs: {
    route: [],
    demandType: [],
    criticality: [],
    size: [],
    dataAvailability: [],
  },
  routeCatalog: [],
  validationTypeCatalog: [],
  validationResultCatalog: [],
};

/** Texto para una etapa aún sin registro. */
function SinRegistro({ children }: { children: React.ReactNode }): React.ReactElement {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/**
 * Ficha de detalle de una solicitud (SOLO LECTURA): reúne el recorrido completo
 * del ciclo de vida en un stepper vertical con todos los pasos visibles. Cada
 * paso deriva su estado del dato existente y, cuando el módulo y el predicado lo
 * permiten, ofrece un enlace «Ir a actuar» a la bandeja correspondiente. La
 * ficha nunca escribe: solo consulta y navega.
 */
export function FichaView({
  id,
  from = 'solicitudes',
}: {
  id: string;
  /** Pantalla de origen: define la miga y el enlace de regreso (el menú lo marca la ruta). */
  from?: 'solicitudes' | 'portafolio';
}): React.ReactElement {
  const origin =
    from === 'portafolio'
      ? { label: 'Portafolio', href: '/seguimiento/portafolio' }
      : { label: 'Solicitudes', href: '/demanda/solicitudes' };
  const { allowedModules, permissions } = useActor();
  const requestActor = React.useMemo(() => requestActorFrom(permissions), [permissions]);
  const [requesters, setRequesters] = React.useState<Requester[]>([]);
  const [editOpen, setEditOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [resubmitOpen, setResubmitOpen] = React.useState(false);
  const [state, setState] = React.useState<LoadState>('loading');
  const [request, setRequest] = React.useState<Request | null>(null);
  const [data, setData] = React.useState<StageData>(EMPTY_STAGE);
  const [errorMessage, setErrorMessage] = React.useState<unknown>(null);

  const loadData = React.useCallback(() => {
    // getRequest es el dato troncal: si falla, es error global de la ficha.
    return getRequest(id)
      .then((req) =>
        // Las demás lecturas toleran fallo/404 por etapa y se degradan a vacío.
        Promise.all([
          listProcesses().catch(() => [] as Process[]),
          listRequesters().catch(() => [] as Requester[]),
          listTriageSafe(id),
          listPriorityEvaluations(id).catch(() => [] as PriorityEvaluation[]),
          listApprovals(id).catch(() => [] as Approval[]),
          getPlanSafe(id),
          getGovernanceBoard(id).catch(() => null),
          listValidations(id).catch(() => [] as ValidationRecord[]),
          listCatalog('TRIAGE_ROUTE'),
          listCatalog('DEMAND_TYPE'),
          listCatalog('CRITICALITY'),
          listCatalog('TRIAGE_SIZE'),
          listCatalog('DATA_AVAILABILITY'),
          listCatalog('GOVERNANCE_ROUTE'),
          listCatalog('VALIDATION_TYPE'),
          listCatalog('VALIDATION_RESULT'),
        ]).then(
          ([
            processes,
            requestersList,
            triageContext,
            evaluations,
            approvals,
            plan,
            board,
            validations,
            route,
            demandType,
            criticality,
            size,
            dataAvailability,
            governanceRoute,
            validationType,
            validationResult,
          ]) => {
            setRequest(req);
            setRequesters(requestersList);
            setData({
              processes,
              triages: triageContext,
              evaluations,
              approvals,
              plan,
              board,
              validations,
              triageCatalogs: {
                route,
                demandType,
                criticality,
                size,
                dataAvailability,
              },
              routeCatalog: governanceRoute,
              validationTypeCatalog: validationType,
              validationResultCatalog: validationResult,
            });
            setState('success');
          },
        ),
      )
      .catch((err: unknown) => {
        setErrorMessage(err);
        setState('error');
      });
  }, [id]);
  const load = React.useCallback(async () => {
    setState('loading');
    setErrorMessage(null);
    await loadData();
  }, [loadData]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (state === 'loading') {
    return (
      <PageLayout>
        <div aria-busy="true" className="flex flex-col gap-6">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </PageLayout>
    );
  }

  if (state === 'error' || !request) {
    return (
      <PageLayout>
        <PageHeader
          title="Detalle de la solicitud"
          breadcrumbs={[{ label: origin.label, href: origin.href }]}
        />
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar la solicitud."
            error={errorMessage}
            onRetry={() => void load()}
          />
          <div className="flex justify-center pb-6">
            <Link
              href={origin.href}
              className={buttonVariants({ variant: 'outline' })}
            >
              {`Volver a ${origin.label}`}
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  const edit = editPolicy(requestActor, request);
  const resubmit = resubmitPolicy(requestActor, request);

  async function handleEdit(values: SolicitudFormValues): Promise<void> {
    if (!request) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await updateRequest(request.id, solicitudUpdatePayload(values));
      toast.success('Solicitud actualizada.');
      setEditOpen(false);
      await load();
    } catch (err) {
      // Fallo: el diálogo sigue abierto con lo escrito (AC-031).
      const message = err instanceof RequestError ? err.message : 'Ocurrió un error inesperado.';
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResubmit(): Promise<void> {
    if (!request) return;
    try {
      await resubmitRequest(request.id);
      toast.success('Solicitud reenviada a triage.');
      await load();
    } catch (err) {
      toast.error(err instanceof RequestError ? err.message : 'Ocurrió un error inesperado.');
    }
  }

  const processName =
    request.mainProcessId === null
      ? 'Sin proceso aún'
      : data.processes.find((p) => p.id === request.mainProcessId)?.name ?? null;

  return (
    <PageLayout>
      <PageHeader
        title={request.title}
        breadcrumbs={[
          { label: origin.label, href: origin.href },
          { label: request.title },
        ]}
        actions={<VerAuditoriaLink code={request.code} />}
        meta={
          <>
            <IdChip code={request.code} />
            <StatusBadge kind="request" value={request.operationalState} />
            <PriorityBadge
              variant="full"
              score={request.currentScore}
              label={request.priorityLabel}
            />
            <span className="text-meta text-muted-foreground">
              {`Registro: ${formatDate(request.registeredAt)}`}
            </span>
          </>
        }
      />

      {request.operationalState === 'DEVUELTA' ? (
        <InlineNotice tone="warning" title="Solicitud devuelta">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="min-w-0">
              <p className="text-meta font-medium text-muted-foreground">Motivo del triage</p>
              <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-foreground">
                {request.currentTriageReason ?? 'El motivo está en el historial de la solicitud.'}
              </p>
              {request.currentTriageDecidedAt ? (
                <p className="mt-1 text-meta tabular-nums text-muted-foreground">
                  {`Devuelta el ${formatDate(request.currentTriageDecidedAt)}`}
                </p>
              ) : null}
            </div>
            {resubmit.allowed ? (
              <>
                <p className="text-sm">Corrige la ficha y reenvía la solicitud a triage.</p>
                <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <Button
                    type="button"
                    className="order-first h-11 w-full sm:order-last sm:h-9 sm:w-auto"
                    onClick={() => setResubmitOpen(true)}
                  >
                    <Send aria-hidden="true" />
                    Reenviar a triage
                  </Button>
                  {edit.allowed ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full sm:h-9 sm:w-auto"
                      onClick={() => {
                        setFormError(null);
                        setEditOpen(true);
                      }}
                    >
                      Editar ficha
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <DisabledReason id="ficha-resubmit-reason">
                {resubmit.reason ?? 'No puedes reenviar esta solicitud.'}
              </DisabledReason>
            )}
          </div>
        </InlineNotice>
      ) : null}

      <Section title="Ficha de la solicitud">
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <RequestFacts request={request} processName={processName} columns={4} />
        </div>
      </Section>

      <Stepper
        request={request}
        data={data}
        allowedModules={allowedModules}
      />
      <div className="grid items-start gap-x-4 gap-y-6 lg:-mt-2 lg:grid-cols-2">
        {allowedModules.has('portfolio') ? (
          <EjecucionSection requestId={request.id} canOpenPlan={allowedModules.has('plan')} />
        ) : null}
        <ClosurePanel request={request} onChanged={() => void load()} />
      </div>


      <SolicitudFormDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setFormError(null);
        }}
        editing={request}
        requesters={requesters}
        onRequesterCreated={(r) => setRequesters((prev) => [...prev, r])}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={(values) => void handleEdit(values)}
      />

      <ConfirmDialog
        open={resubmitOpen}
        onOpenChange={setResubmitOpen}
        tone="default"
        title="¿Reenviar a triage?"
        description="La solicitud volverá a Registrada y aparecerá en «Pendientes de triage». El jefe de área recibirá un aviso."
        confirmLabel="Reenviar a triage"
        onConfirm={handleResubmit}
      >
        <div className="mx-4 grid min-w-0 gap-2 break-words rounded-lg bg-muted/50 p-3 sm:mx-0">
          <p className="flex min-w-0 items-start gap-2 text-sm font-medium">
            <IdChip code={request.code} />
            <span className="line-clamp-3">{request.title}</span>
          </p>
          <p className="text-meta text-muted-foreground">
            {`Motivo de la devolución: ${request.currentTriageReason ?? 'sin motivo registrado'}`}
          </p>
        </div>
      </ConfirmDialog>
    </PageLayout>
  );
}

/** Enlace «Ir a actuar» o, si el predicado no se cumple, el motivo. */
function Actuar({
  show,
  href,
  label,
  blockedReason,
}: {
  /** El módulo está permitido para el actor. */
  show: boolean;
  href: string;
  label: string;
  /** Si el módulo está permitido pero el predicado no, el motivo del bloqueo. */
  blockedReason?: string | null;
}): React.ReactElement | null {
  if (!show) return null;
  if (blockedReason) {
    return (
      <p className="flex items-start gap-1.5 text-meta text-muted-foreground">
        {blockedReason}
      </p>
    );
  }
  return (
    <Link href={href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      {label}
    </Link>
  );
}

/** Stepper vertical con un paso por etapa, en el orden del encargo. */
function Stepper({
  request,
  data,
  allowedModules,
}: {
  request: Request;
  data: StageData;
  allowedModules: Set<string>;
}): React.ReactElement {
  const id = encodeURIComponent(request.id);
  // Vigente = el último registro. El triage llega de la API de más reciente a más
  // antiguo (tras un reenvío hay varias decisiones); la prioridad, al revés.
  const triage = data.triages.length > 0 ? data.triages[0] : null;
  const evaluation =
    data.evaluations.length > 0 ? data.evaluations[data.evaluations.length - 1] : null;
  const hasPlan = data.plan !== null;
  const hasValidations = data.validations.length > 0;

  // Estados derivados de cada paso (sin reglas nuevas; ver ficha-steps.ts).
  const states: Record<string, StepState> = {
    solicitud: solicitudStepState(),
    triage: triageStepState(request, data.triages),
    prioridad: priorityStepState(request, data.evaluations),
    aprobacion: approvalStepState(request, data.approvals),
    plan: planStepState(request, hasPlan),
    gobierno: governanceStepState(request, hasValidations),
    estabilizacion: stabilizationStepState(request),
  };

  const estabilizacionAplica =
    states.estabilizacion === 'en-curso' || states.estabilizacion === 'completado';

  const strip: { title: string; headingId: string; state: StepState }[] = [
    { title: 'Solicitud', headingId: 'paso-solicitud', state: states.solicitud },
    { title: 'Triage', headingId: 'paso-triage', state: states.triage },
    { title: 'Priorización', headingId: 'paso-prioridad', state: states.prioridad },
    { title: 'Aprobación', headingId: 'paso-aprobacion', state: states.aprobacion },
    { title: 'Planificación', headingId: 'paso-plan', state: states.plan },
    { title: 'Gobierno', headingId: 'paso-gobierno', state: states.gobierno },
    { title: 'Estabilización', headingId: 'paso-estabilizacion', state: states.estabilizacion },
  ];

  return (
    <>
    <FichaStrip steps={strip} />
    <ol
      aria-label="Recorrido de la solicitud por etapas"
      className="flex flex-col lg:-mb-3 lg:block lg:columns-2 lg:gap-4 min-[1800px]:columns-3"
    >
      <FichaStep index={1} title="Solicitud" state={states.solicitud} headingId="paso-solicitud">
        <p className="text-sm text-muted-foreground">
          La solicitud quedó registrada. Sus datos aparecen en la ficha superior.
        </p>
      </FichaStep>

      <FichaStep
        index={2}
        title="Triage"
        state={states.triage}
        headingId="paso-triage"
        stateBadge={
          request.currentTriageDecision ? (
            <StatusBadge kind="triage" value={request.currentTriageDecision} />
          ) : null
        }
        actionSlot={
          <Actuar
            show={allowedModules.has('triage')}
            href={`/demanda/triage?requestId=${id}`}
            label="Ir a triage"
            blockedReason={
              allowedModules.has('triage') && !isTriageable(request)
                ? 'El triage solo se registra mientras la solicitud está en estado Registrada.'
                : null
            }
          />
        }
      >
        {triage ? (
          <div className="flex flex-col gap-4">
            <TriageDetalle
              triage={triage}
              catalogs={data.triageCatalogs}
              request={request}
              processes={data.processes}
            />
            <TriageHistorial triages={data.triages} />
          </div>
        ) : request.currentTriageDecision ? (
          // Sin acceso al triage completo (p. ej. el solicitante): solo decisión y motivo.
          <TriageResumen request={request} />
        ) : (
          <SinRegistro>Esta etapa aún no se ha registrado.</SinRegistro>
        )}
      </FichaStep>

      <FichaStep
        index={3}
        title="Priorización"
        state={states.prioridad}
        headingId="paso-prioridad"
        actionSlot={
          <Actuar
            show={allowedModules.has('priority')}
            href={`/demanda/priorizacion?requestId=${id}`}
            label="Ir a priorización"
            blockedReason={
              allowedModules.has('priority') && !isPrioritizable(request)
                ? 'La priorización requiere un triage con decisión Continuar y la solicitud en triage o backlog priorizado.'
                : null
            }
          />
        }
      >
        {evaluation ? (
          <PrioridadDetalle evaluation={evaluation} request={request} />
        ) : (
          <SinRegistro>Esta etapa aún no se ha registrado.</SinRegistro>
        )}
      </FichaStep>

      <FichaStep
        index={4}
        title="Aprobación / Compromiso"
        state={states.aprobacion}
        headingId="paso-aprobacion"
        actionSlot={
          <Actuar
            show={allowedModules.has('review')}
            href="/administracion/revision"
            label="Ir a aprobaciones"
          />
        }
      >
        {data.approvals.length > 0 ? (
          <AprobacionDetalle approvals={data.approvals} />
        ) : (
          <SinRegistro>Esta etapa aún no se ha registrado.</SinRegistro>
        )}
      </FichaStep>

      <FichaStep
        index={5}
        title="Planificación"
        state={states.plan}
        headingId="paso-plan"
        actionSlot={
          <Actuar
            show={allowedModules.has('plan')}
            href={`/seguimiento/plan?requestId=${id}`}
            label="Ir a planificación"
            blockedReason={
              allowedModules.has('plan') && !isPlannable(request)
                ? 'La planificación está disponible cuando la solicitud está comprometida, en planificación o en ejecución.'
                : null
            }
          />
        }
      >
        {data.plan ? (
          <PlanDetalle plan={data.plan} />
        ) : (
          <SinRegistro>Esta solicitud aún no tiene un plan.</SinRegistro>
        )}
      </FichaStep>

      <FichaStep
        index={6}
        title="Gobierno y validación"
        state={states.gobierno}
        headingId="paso-gobierno"
        actionSlot={
          <Actuar
            show={allowedModules.has('frameworks')}
            href={`/administracion/frameworks?requestId=${id}`}
            label="Ir a controles de gobierno"
          />
        }
      >
        <GobiernoDetalle
          board={data.board}
          validations={data.validations}
          routeCatalog={data.routeCatalog}
          validationTypeCatalog={data.validationTypeCatalog}
          validationResultCatalog={data.validationResultCatalog}
        />
      </FichaStep>

      <FichaStep
        index={7}
        title="Estabilización / Cierre"
        state={states.estabilizacion}
        headingId="paso-estabilizacion"
        last
      >
        {estabilizacionAplica ? (
          <EstabilizacionDetalle operationalState={request.operationalState} />
        ) : (
          <SinRegistro>La solicitud aún no llegó a la fase de estabilización o cierre.</SinRegistro>
        )}
      </FichaStep>
    </ol>
    </>
  );
}

// --- Lecturas tolerantes por etapa (404 o fallo -> valor vacío) ---

/** Catálogo de una familia; si falla, se degrada a lista vacía. */
async function listCatalog(catalog: string): Promise<CatalogItem[]> {
  return listCatalogItems({ catalog, active: true }).catch(() => [] as CatalogItem[]);
}

/** Triage: devuelve las filas del contexto; si falla, lista vacía. */
async function listTriageSafe(id: string): Promise<Triage[]> {
  return listTriage(id)
    .then((context) => context.triages)
    .catch(() => [] as Triage[]);
}

/** Plan: 404 (sin plan) o cualquier fallo -> null (etapa sin registrar). */
async function getPlanSafe(id: string): Promise<Plan | null> {
  return getPlan(id).catch(() => null);
}
