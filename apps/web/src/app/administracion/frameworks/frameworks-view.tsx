'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Field } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { ReasonDialog } from '@/components/reason-dialog';
import { RequestContextBar } from '@/components/request-context-bar';
import { Section } from '@/components/section';
import { PriorityBadge, StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActor } from '@/lib/actor-context';
import type { CatalogItem, CoordinationPerson, Request } from '@/lib/api-client';
import { listCatalogItems } from '@/lib/catalog';
import {
  ApiError,
  type CreateValidation,
  type GovernanceBoard,
  type ValidationRecord,
  approveGate,
  confirmStabilizationStage,
  createValidation,
  getGovernanceBoard,
  listValidations,
  markReadyStage,
  requestValidationStage,
  resolveBlocking,
  setGovernanceRoute,
  waiveGate,
} from '@/lib/governance';
import { listRequests } from '@/lib/requests';
import { routeLabel } from '@/lib/status-presentation';
import { useRequestIdParam } from '@/lib/use-request-param';
import { listCoordinationPeople } from '@/lib/worklog';
import { GateItem, gateHeadingId } from './gate-item';
import { ValidationFormDialog } from './validation-form-dialog';
import { ValidationsTab } from './validations-tab';

type LoadState = 'loading' | 'success' | 'error';
type DetailState = LoadState | 'idle';
type TabValue = 'controles' | 'validaciones';

const TITLE = 'Controles de gobierno';
/** La misma descripción usa el PageFallback de page.tsx. */
const DESCRIPTION = 'Controles GC1–GC5, ruta proporcional y validaciones de cada solicitud.';
const NOT_AVAILABLE = 'La solicitud indicada no está disponible aquí.';
const ROLE_NOTE =
  'Tu rol permite consultar y registrar validaciones. Aprobar controles, cambiar la ruta y marcar «No aplica» corresponde al jefe de área o al líder de proceso.';

/** Roles con capacidad `review` (autoridad): aprobar, «No aplica», ruta y etapas. */
const REVIEW_ROLES = ['JEFE_AREA', 'LIDER_PROCESO'] as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Controles de gobierno (design §11.18, patrón C con pestañas): barra de
 * contexto con la solicitud, pestañas «Controles» y «Validaciones» y, en el
 * lateral, la ruta proporcional y el avance de etapas. El backend es la
 * autoridad de las reglas; esta pantalla solo las refleja. La selección se
 * refleja en ?requestId= (§7.9.1).
 */
export function FrameworksView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();
  const { requestId: urlId, setRequestId } = useRequestIdParam();

  const canReview = React.useMemo(() => {
    const roles = new Set((permissions?.grants ?? []).map((g) => g.roleCode));
    return REVIEW_ROLES.some((r) => roles.has(r));
  }, [permissions]);

  const [requests, setRequests] = React.useState<Request[]>([]);
  const [routeCatalog, setRouteCatalog] = React.useState<CatalogItem[]>([]);
  const [typeCatalog, setTypeCatalog] = React.useState<CatalogItem[]>([]);
  const [resultCatalog, setResultCatalog] = React.useState<CatalogItem[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [listState, setListState] = React.useState<LoadState>('loading');
  const [listError, setListError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState('');
  const selectedRef = React.useRef(selectedId);
  // Ultimo valor para los callbacks asincronos (se actualiza tras el render, no durante).
  React.useEffect(() => {
    selectedRef.current = selectedId;
  });
  const [board, setBoard] = React.useState<GovernanceBoard | null>(null);
  const [validations, setValidations] = React.useState<ValidationRecord[]>([]);
  const [detailState, setDetailState] = React.useState<DetailState>('idle');
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState<TabValue>('controles');
  const validationsRef = React.useRef<HTMLDivElement>(null);

  const [routeDraft, setRouteDraft] = React.useState('');
  const [resolvingId, setResolvingId] = React.useState<string | null>(null);

  const [validationOpen, setValidationOpen] = React.useState(false);
  const [validationSubmitting, setValidationSubmitting] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  // El código se conserva al cerrar, para que el título no cambie durante la animación.
  const [waiveCode, setWaiveCode] = React.useState<string | null>(null);
  const [waiveOpen, setWaiveOpen] = React.useState(false);
  const [waiveSubmitting, setWaiveSubmitting] = React.useState(false);
  const [waiveError, setWaiveError] = React.useState<string | null>(null);

  const loadDetail = React.useCallback(async (requestId: string, silent = false) => {
    // Tras una acción se recarga sin el esqueleto, para que los controles sigan
    // montados y el foco no se pierda.
    if (!silent) setDetailState('loading');
    try {
      const [b, v] = await Promise.all([getGovernanceBoard(requestId), listValidations(requestId)]);
      if (selectedRef.current !== requestId) return; // se eligió otra solicitud
      setBoard(b);
      setValidations(v);
      setRouteDraft(b.governanceRoute ?? '');
      setDetailState('success');
    } catch {
      if (selectedRef.current !== requestId) return;
      setBoard(null);
      setValidations([]);
      setDetailState('error');
    }
  }, []);

  const selectRequest = React.useCallback(
    (id: string) => {
      selectedRef.current = id;
      setSelectedId(id);
      setTab('controles');
      setBoard(null);
      setValidations([]);
      if (id) void loadDetail(id);
      else setDetailState('idle');
    },
    [loadDetail],
  );

  const loadList = React.useCallback(async () => {
    setListState('loading');
    try {
      const [reqs, routes, types, results, persons] = await Promise.all([
        listRequests(),
        listCatalogItems({ catalog: 'GOVERNANCE_ROUTE', active: true }),
        listCatalogItems({ catalog: 'VALIDATION_TYPE', active: true }),
        listCatalogItems({ catalog: 'VALIDATION_RESULT', active: true }),
        // Solo da nombres (responsables y ejecutor): si falla, se degrada a [].
        listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
      ]);
      setRequests(reqs);
      setRouteCatalog(routes);
      setTypeCatalog(types);
      setResultCatalog(results);
      setPeople(persons);
      setListState('success');
      // Regla 3 de §7.9.1: si la solicitud elegida ya no está, se limpia.
      if (selectedRef.current && !reqs.some((r) => r.id === selectedRef.current)) {
        selectRequest('');
        setRequestId(null);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : null);
      setListState('error');
    }
  }, [selectRequest, setRequestId]);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  // Regla 1 de §7.9.1: adoptar ?requestId= al terminar la carga y cuando cambia.
  React.useEffect(() => {
    if (listState !== 'success' || !urlId || urlId === selectedRef.current) return;
    if (requests.some((r) => r.id === urlId)) {
      setNotice(null);
      selectRequest(urlId);
    } else {
      setNotice(NOT_AVAILABLE);
      setRequestId(null);
    }
  }, [listState, requests, urlId, selectRequest, setRequestId]);

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
  const peopleById = React.useMemo(
    () => new Map(people.map((person) => [person.id, person.name])),
    [people],
  );
  const gc4Summary = board?.gates.find((g) => g.gateCode === 'GC4')?.validationSummary ?? null;

  async function refreshDetail(): Promise<void> {
    if (selectedId) await loadDetail(selectedId, true);
  }

  function showValidations(): void {
    setTab('validaciones');
    // NIT 4: el panel de la pestaña recibe el foco cuando ya está montado.
    requestAnimationFrame(() => validationsRef.current?.focus());
  }

  async function handleSaveRoute(): Promise<void> {
    if (!selectedId || !routeDraft) return;
    setBusy(true);
    try {
      const updated = await setGovernanceRoute(selectedId, routeDraft);
      setBoard(updated);
      setRouteDraft(updated.governanceRoute ?? '');
      toast.success('Ruta proporcional actualizada.');
    } catch (err) {
      toast.error(errorMessage(err, 'No fue posible actualizar la ruta.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleStage(
    action: (id: string) => Promise<GovernanceBoard>,
    successMessage: string,
  ): Promise<void> {
    if (!selectedId) return;
    setBusy(true);
    try {
      const updated = await action(selectedId);
      setBoard(updated);
      toast.success(successMessage);
      await refreshDetail();
    } catch (err) {
      toast.error(errorMessage(err, 'No fue posible completar la acción.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(gateCode: string): Promise<void> {
    if (!selectedId) return;
    setBusy(true);
    try {
      await approveGate(selectedId, gateCode);
      toast.success(`${gateCode} aprobado.`);
      await refreshDetail();
    } catch (err) {
      toast.error(errorMessage(err, 'No fue posible aprobar el control.'));
    } finally {
      setBusy(false);
    }
  }

  function openWaive(gateCode: string): void {
    setWaiveError(null);
    setWaiveCode(gateCode);
    setWaiveOpen(true);
  }

  async function handleWaive(reason: string): Promise<void> {
    if (!selectedId || !waiveCode) return;
    const gateCode = waiveCode;
    setWaiveSubmitting(true);
    setWaiveError(null);
    setBusy(true);
    try {
      await waiveGate(selectedId, gateCode, reason);
      toast.success(`${gateCode} marcado como no aplica.`);
      await refreshDetail();
      // Se cierra tras recargar: el botón ya no existe y el foco va al encabezado del control.
      setWaiveOpen(false);
    } catch (err) {
      const message = errorMessage(err, 'No fue posible marcar el control.');
      setWaiveError(message);
      toast.error(message);
    } finally {
      setWaiveSubmitting(false);
      setBusy(false);
    }
  }

  async function handleResolveBlocking(validationId: string): Promise<void> {
    if (!selectedId) return;
    setBusy(true);
    setResolvingId(validationId);
    try {
      await resolveBlocking(selectedId, validationId);
      toast.success('Defecto bloqueante resuelto.');
      await refreshDetail();
      // El botón desaparece de la fila: el foco pasa al panel de la pestaña (NIT 4).
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) validationsRef.current?.focus();
      });
    } catch (err) {
      toast.error(errorMessage(err, 'No fue posible resolver el bloqueo.'));
    } finally {
      setResolvingId(null);
      setBusy(false);
    }
  }

  function openValidation(): void {
    setValidationError(null);
    setValidationOpen(true);
  }

  async function handleCreateValidation(input: CreateValidation): Promise<void> {
    if (!selectedId) return;
    setValidationSubmitting(true);
    setValidationError(null);
    try {
      await createValidation(selectedId, input);
      toast.success('Validación registrada. Registrarla no aprueba el control.');
      setValidationOpen(false);
      await refreshDetail();
    } catch (err) {
      // El diálogo sigue abierto con los valores intactos.
      const message = errorMessage(err, 'No fue posible registrar la validación.');
      setValidationError(message);
      toast.error(message);
    } finally {
      setValidationSubmitting(false);
    }
  }

  function renderSidebar(current: GovernanceBoard): React.ReactElement {
    const currentRoute = current.governanceRoute;
    const currentLine = currentRoute ? (
      <p className="text-sm">
        <span className="text-muted-foreground">Actual: </span>
        {routeLabel(currentRoute, routeCatalog)}
      </p>
    ) : (
      <p className="text-sm text-muted-foreground">Sin ruta asignada.</p>
    );
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <div className="rounded-lg border bg-card p-4">
          <Section
            title="Ruta proporcional"
            description="Determina qué controles son exigibles. La elige el líder, sin reclasificación automática."
          >
            {canReview ? (
              <div className="flex flex-col gap-3">
                <Field id="governance-route" label="Ruta">
                  {(control) => (
                    <Select value={routeDraft} onValueChange={setRouteDraft} disabled={busy}>
                      <SelectTrigger {...control}>
                        <SelectValue placeholder="Sin ruta asignada" />
                      </SelectTrigger>
                      <SelectContent>
                        {routeCatalog.map((item) => (
                          <SelectItem key={item.code} value={item.code}>
                            {routeLabel(item.code, routeCatalog)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {currentLine}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSaveRoute()}
                    disabled={busy || !routeDraft || routeDraft === (currentRoute ?? '')}
                  >
                    Guardar ruta
                  </Button>
                </div>
              </div>
            ) : (
              currentLine
            )}
          </Section>
        </div>

        {canReview ? (
          <div className="rounded-lg border bg-card p-4">
            <Section
              title="Avance de etapas"
              description="Cada avance exige el estado de origen correcto; si no corresponde, verás el motivo."
            >
              <div className="flex flex-col items-stretch gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void handleStage(requestValidationStage, 'Solicitud enviada a validación.')
                  }
                >
                  Enviar a validación
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleStage(markReadyStage, 'Solicitud lista para liberar.')}
                >
                  Marcar lista para liberar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void handleStage(confirmStabilizationStage, 'Estabilización confirmada.')
                  }
                >
                  Confirmar estabilización
                </Button>
              </div>
            </Section>
          </div>
        ) : null}
      </div>
    );
  }

  function renderDetail(): React.ReactNode {
    if (detailState === 'loading' || detailState === 'idle') {
      return (
        <div aria-busy="true" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-96 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      );
    }
    if (detailState === 'error' || !board) {
      return (
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar el tablero de gobierno."
            onRetry={() => void loadDetail(selectedId)}
          />
        </div>
      );
    }
    return (
      <>
        {board.blocked ? (
          <InlineNotice tone="danger" role="alert" title="Solicitud bloqueada">
            {board.blockedReason ?? 'Hay un bloqueo transversal vigente.'}
          </InlineNotice>
        ) : null}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value === 'validaciones' ? 'validaciones' : 'controles')}
            className="min-w-0"
          >
            <TabsList>
              <TabsTrigger value="controles">Controles</TabsTrigger>
              <TabsTrigger value="validaciones">{`Validaciones (${validations.length})`}</TabsTrigger>
            </TabsList>
            <TabsContent value="controles">
              <ol
                aria-label="Controles de gobierno GC1 a GC5"
                className="divide-y rounded-lg border bg-card"
              >
                {board.gates.map((gate) => (
                  <GateItem
                    key={gate.gateCode}
                    gate={gate}
                    canReview={canReview}
                    busy={busy}
                    peopleById={peopleById}
                    onApprove={() => void handleApprove(gate.gateCode)}
                    onWaive={() => openWaive(gate.gateCode)}
                    onShowValidations={showValidations}
                  />
                ))}
              </ol>
            </TabsContent>
            <TabsContent value="validaciones" ref={validationsRef}>
              <ValidationsTab
                validations={validations}
                typeCatalog={typeCatalog}
                resultCatalog={resultCatalog}
                gc4Summary={gc4Summary}
                canReview={canReview}
                busy={busy}
                resolvingId={resolvingId}
                onRegister={openValidation}
                onResolve={(id) => void handleResolveBlocking(id)}
              />
            </TabsContent>
          </Tabs>
          {renderSidebar(board)}
        </div>
      </>
    );
  }

  let content: React.ReactNode;
  if (listState === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  } else if (listState === 'error') {
    content = (
      <div className="rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar las solicitudes."
          message={listError}
          onRetry={() => void loadList()}
        />
      </div>
    );
  } else if (requests.length === 0) {
    content = (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={ShieldCheck}
          title="No hay solicitudes en tu alcance."
          description="Los controles de gobierno se revisan por solicitud."
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
          id="governance-request"
          requests={requests}
          value={selectedId}
          onValueChange={handlePick}
          summary={
            selected ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="request" value={selected.operationalState} />
                <PriorityBadge
                  variant="full"
                  score={selected.currentScore}
                  label={selected.priorityLabel}
                />
              </div>
            ) : null
          }
        />
        {!canReview ? (
          <InlineNotice tone="neutral" role="note">
            {ROLE_NOTE}
          </InlineNotice>
        ) : null}
        {notice ? <InlineNotice tone="info">{notice}</InlineNotice> : null}
        {selectedId ? (
          renderDetail()
        ) : (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={ShieldCheck}
              title="Elige una solicitud para empezar."
              description="Verás sus controles GC1–GC5, las validaciones registradas y la ruta proporcional."
            />
          </div>
        )}
      </>
    );
  }

  return (
    <PageLayout>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      {content}

      <ValidationFormDialog
        open={validationOpen}
        onOpenChange={(open) => {
          setValidationOpen(open);
          if (!open) setValidationError(null);
        }}
        typeCatalog={typeCatalog}
        resultCatalog={resultCatalog}
        people={people}
        submitting={validationSubmitting}
        errorMessage={validationError}
        onSubmit={(input) => void handleCreateValidation(input)}
      />
      <ReasonDialog
        open={waiveOpen}
        onOpenChange={(open) => {
          setWaiveOpen(open);
          if (!open) setWaiveError(null);
        }}
        title={`Marcar ${waiveCode ?? ''} como no aplica`}
        description="Indica por qué este control no aplica a la solicitud. Quedará registrado."
        fieldId="waive-reason"
        confirmLabel="Marcar como no aplica"
        busyLabel="Guardando…"
        tone="default"
        submitting={waiveSubmitting}
        errorMessage={waiveError}
        requiredMessage="Escribe por qué este control no aplica."
        onConfirm={(reason) => void handleWaive(reason)}
        returnFocusTo={() => (waiveCode ? document.getElementById(gateHeadingId(waiveCode)) : null)}
      />
    </PageLayout>
  );
}
