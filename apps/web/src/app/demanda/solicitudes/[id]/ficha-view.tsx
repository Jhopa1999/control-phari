'use client';

import * as React from 'react';
import Link from 'next/link';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RequestFacts } from '@/components/request-context-bar';
import { Section } from '@/components/section';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import type {
  Approval,
  CatalogItem,
  Plan,
  PriorityEvaluation,
  Process,
  Request,
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
import { RequestError, getRequest } from '@/lib/requests';
import {
  isPlannable,
  isPrioritizable,
  isTriageable,
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
  type TriageCatalogs,
} from './ficha-detalles';
import { FichaStep } from './ficha-step';
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
export function FichaView({ id }: { id: string }): React.ReactElement {
  const { allowedModules } = useActor();
  const [state, setState] = React.useState<LoadState>('loading');
  const [request, setRequest] = React.useState<Request | null>(null);
  const [data, setData] = React.useState<StageData>(EMPTY_STAGE);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    setErrorMessage(null);
    try {
      // getRequest es el dato troncal: si falla, es error global de la ficha.
      const req = await getRequest(id);
      // Las demás lecturas toleran fallo/404 por etapa y se degradan a vacío.
      const [
        processes,
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
      ] = await Promise.all([
        listProcesses().catch(() => [] as Process[]),
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
      ]);
      setRequest(req);
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
    } catch (err) {
      setErrorMessage(err instanceof RequestError ? err.message : 'Ocurrió un error inesperado.');
      setState('error');
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

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
          breadcrumbs={[{ label: 'Solicitudes', href: '/demanda/solicitudes' }]}
        />
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar la solicitud."
            message={errorMessage}
            onRetry={() => void load()}
          />
          <div className="flex justify-center pb-6">
            <Link
              href="/demanda/solicitudes"
              className={buttonVariants({ variant: 'outline' })}
            >
              Volver a Solicitudes
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  const processName =
    data.processes.find((p) => p.id === request.mainProcessId)?.name ?? null;

  return (
    <PageLayout>
      <PageHeader
        title={request.title}
        breadcrumbs={[
          { label: 'Solicitudes', href: '/demanda/solicitudes' },
          { label: request.title },
        ]}
        meta={
          <>
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

      <Section title="Ficha de la solicitud">
        <div className="rounded-lg border bg-card p-4">
          <RequestFacts request={request} processName={processName} />
        </div>
      </Section>

      <Stepper
        request={request}
        data={data}
        allowedModules={allowedModules}
      />
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
  // Vigente = el último registro (triage: 0 o 1 fila; prioridad: última evaluación).
  const triage = data.triages.length > 0 ? data.triages[data.triages.length - 1] : null;
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

  return (
    <ol
      aria-label="Recorrido de la solicitud por etapas"
      className="flex flex-col"
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
          <TriageDetalle triage={triage} catalogs={data.triageCatalogs} />
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
