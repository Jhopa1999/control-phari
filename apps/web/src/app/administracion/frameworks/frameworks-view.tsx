'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Lock,
  MinusCircle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useActor } from '@/lib/actor-context';
import type { CatalogItem, Request } from '@/lib/api-client';
import { listCatalogItems } from '@/lib/catalog';
import {
  ApiError,
  type GateCheck,
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
import { requestStateLabel } from '@/lib/request-state';

type LoadState = 'loading' | 'success' | 'error';

/** Roles con capacidad `review` (autoridad): aprobar, waive, ruta, preparar. */
const REVIEW_ROLES = ['JEFE_AREA', 'LIDER_PROCESO'] as const;

/** Etiquetas legibles del estado de un gate. */
const GATE_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  CUMPLIDO: 'Cumplido',
  NO_APLICA: 'No aplica',
};

/** Etiquetas legibles de las rutas proporcionales. */
const ROUTE_LABELS: Record<string, string> = {
  COMPLETA: 'Completa',
  SIMPLIFICADA: 'Simplificada',
  EXPLORACION: 'Exploracion',
};

/**
 * Deriva la banda de prioridad P1-P4 del score vigente (cortes del marco
 * 80/65/45, design §1.1). El backend sigue siendo la autoridad del score; esto
 * es solo presentacion. Devuelve null si no hay score.
 */
function priorityBand(score: number | null): 'P1' | 'P2' | 'P3' | 'P4' | null {
  if (score === null) return null;
  if (score >= 80) return 'P1';
  if (score >= 65) return 'P2';
  if (score >= 45) return 'P3';
  return 'P4';
}

function PriorityBandBadge({
  score,
  label,
}: {
  score: number | null;
  label: string | null;
}): React.ReactElement | null {
  const band = priorityBand(score);
  if (band === null) return null;
  return (
    <Badge variant="secondary" title={label ?? undefined}>
      {band}
      {label ? ` · ${label}` : ''}
    </Badge>
  );
}

/**
 * Badge de estado del gate con icono (no depende solo del color) + texto.
 */
function GateStatusBadge({
  status,
}: {
  status: string;
}): React.ReactElement {
  const label = GATE_STATUS_LABELS[status] ?? status;
  if (status === 'CUMPLIDO') {
    return (
      <Badge variant="success">
        <CheckCircle2 aria-hidden="true" className="mr-1 size-3.5" />
        {label}
      </Badge>
    );
  }
  if (status === 'NO_APLICA') {
    return (
      <Badge variant="outline">
        <MinusCircle aria-hidden="true" className="mr-1 size-3.5" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <CircleDashed aria-hidden="true" className="mr-1 size-3.5" />
      {label}
    </Badge>
  );
}

function catalogLabel(items: CatalogItem[], code: string): string {
  return items.find((i) => i.code === code)?.label ?? code;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

interface ValidationFormState {
  validationTypeCode: string;
  testCase: string;
  version: string;
  environment: string;
  resultCode: string;
  blocking: boolean;
  executedByUserId: string;
  executedAt: string;
  evidenceRef: string;
  notes: string;
}

function emptyValidationForm(): ValidationFormState {
  return {
    validationTypeCode: '',
    testCase: '',
    version: '',
    environment: '',
    resultCode: '',
    blocking: false,
    executedByUserId: '',
    executedAt: '',
    evidenceRef: '',
    notes: '',
  };
}

export function FrameworksView(): React.ReactElement {
  const { permissions } = useActor();

  const canReview = React.useMemo(() => {
    const roles = new Set(
      (permissions?.grants ?? []).map((g) => g.roleCode),
    );
    return REVIEW_ROLES.some((r) => roles.has(r));
  }, [permissions]);

  const [requests, setRequests] = React.useState<Request[]>([]);
  const [routeCatalog, setRouteCatalog] = React.useState<CatalogItem[]>([]);
  const [typeCatalog, setTypeCatalog] = React.useState<CatalogItem[]>([]);
  const [resultCatalog, setResultCatalog] = React.useState<CatalogItem[]>([]);
  const [listState, setListState] = React.useState<LoadState>('loading');

  const [selectedId, setSelectedId] = React.useState<string>('');
  const [board, setBoard] = React.useState<GovernanceBoard | null>(null);
  const [validations, setValidations] = React.useState<ValidationRecord[]>([]);
  const [detailState, setDetailState] = React.useState<LoadState | 'idle'>(
    'idle',
  );
  const [busy, setBusy] = React.useState(false);

  const [routeDraft, setRouteDraft] = React.useState<string>('');
  const [valForm, setValForm] = React.useState<ValidationFormState>(
    emptyValidationForm(),
  );
  const [valFormError, setValFormError] = React.useState<string | null>(null);

  const loadList = React.useCallback(async () => {
    setListState('loading');
    try {
      const [reqs, routes, types, results] = await Promise.all([
        listRequests(),
        listCatalogItems({ catalog: 'GOVERNANCE_ROUTE', active: true }),
        listCatalogItems({ catalog: 'VALIDATION_TYPE', active: true }),
        listCatalogItems({ catalog: 'VALIDATION_RESULT', active: true }),
      ]);
      setRequests(reqs);
      setRouteCatalog(routes);
      setTypeCatalog(types);
      setResultCatalog(results);
      setListState('success');
    } catch {
      setListState('error');
    }
  }, []);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = React.useCallback(async (requestId: string) => {
    setDetailState('loading');
    try {
      const [b, v] = await Promise.all([
        getGovernanceBoard(requestId),
        listValidations(requestId),
      ]);
      setBoard(b);
      setValidations(v);
      setRouteDraft(b.governanceRoute ?? '');
      setDetailState('success');
    } catch {
      setBoard(null);
      setValidations([]);
      setDetailState('error');
    }
  }, []);

  function selectRequest(id: string) {
    setSelectedId(id);
    setValForm(emptyValidationForm());
    setValFormError(null);
    void loadDetail(id);
  }

  const selectedRequest = React.useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );

  async function refreshDetail() {
    if (selectedId) await loadDetail(selectedId);
  }

  function errorMessage(err: unknown, fallback: string): string {
    return err instanceof ApiError ? err.message : fallback;
  }

  async function handleSaveRoute() {
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
  ) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const updated = await action(selectedId);
      setBoard(updated);
      toast.success(successMessage);
      await refreshDetail();
    } catch (err) {
      toast.error(errorMessage(err, 'No fue posible completar la accion.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(gateCode: string) {
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

  async function handleWaive(gateCode: string) {
    if (!selectedId) return;
    const reason = window.prompt(
      `Motivo para marcar ${gateCode} como "No aplica":`,
    );
    if (!reason || !reason.trim()) return;
    setBusy(true);
    try {
      await waiveGate(selectedId, gateCode, reason.trim());
      toast.success(`${gateCode} marcado como no aplica.`);
      await refreshDetail();
    } catch (err) {
      toast.error(errorMessage(err, 'No fue posible marcar el control.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveBlocking(validationId: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await resolveBlocking(selectedId, validationId);
      toast.success('Defecto bloqueante resuelto.');
      await refreshDetail();
    } catch (err) {
      toast.error(errorMessage(err, 'No fue posible resolver el bloqueo.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateValidation(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setValFormError(null);
    if (
      !valForm.validationTypeCode ||
      !valForm.testCase.trim() ||
      !valForm.resultCode ||
      !valForm.executedByUserId.trim() ||
      !valForm.executedAt
    ) {
      setValFormError(
        'Completa tipo, caso, resultado, ejecutor y fecha de ejecucion.',
      );
      return;
    }
    setBusy(true);
    try {
      await createValidation(selectedId, {
        validationTypeCode: valForm.validationTypeCode,
        testCase: valForm.testCase.trim(),
        version: valForm.version.trim() || undefined,
        environment: valForm.environment.trim() || undefined,
        resultCode: valForm.resultCode,
        blocking: valForm.blocking,
        executedByUserId: valForm.executedByUserId.trim(),
        executedAt: new Date(valForm.executedAt).toISOString(),
        evidenceRef: valForm.evidenceRef.trim() || undefined,
        notes: valForm.notes.trim() || undefined,
      });
      toast.success('Validacion registrada (no aprueba el control, BR-008).');
      setValForm(emptyValidationForm());
      await refreshDetail();
    } catch (err) {
      const message = errorMessage(
        err,
        'No fue posible registrar la validacion.',
      );
      setValFormError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const gc4 = board?.gates.find((g) => g.gateCode === 'GC4') ?? null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Gobierno y cumplimiento
        </h1>
        <p className="text-sm text-muted-foreground">
          Controles GC1-GC5 del marco corporativo, validaciones y ruta
          proporcional de cada solicitud. El backend es la autoridad de las
          reglas; esta pantalla solo las refleja.
        </p>
      </header>

      <section aria-live="polite" className="flex flex-col gap-6">
        {listState === 'loading' ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : listState === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible comunicarse con el servidor.
            </p>
            <Button variant="outline" onClick={() => void loadList()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
            <p className="text-sm font-medium">
              No hay solicitudes en tu alcance.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-2 rounded-lg border bg-card p-4">
              <Label htmlFor="governance-request">Solicitud</Label>
              <Select value={selectedId} onValueChange={selectRequest}>
                <SelectTrigger id="governance-request">
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
              {selectedRequest ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Estado:{' '}
                    {requestStateLabel(selectedRequest.operationalState)}
                  </span>
                  <PriorityBandBadge
                    score={selectedRequest.currentScore}
                    label={selectedRequest.priorityLabel}
                  />
                </div>
              ) : null}
            </div>

            {!selectedId ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Selecciona una solicitud para ver su tablero de gobierno.
                </p>
              </div>
            ) : detailState === 'loading' ? (
              <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : detailState === 'error' ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No fue posible cargar el tablero de gobierno.
                </p>
                <Button variant="outline" onClick={() => void refreshDetail()}>
                  <RefreshCw aria-hidden="true" />
                  Reintentar
                </Button>
              </div>
            ) : board ? (
              <>
                {board.blocked ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
                  >
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-4 text-destructive"
                    />
                    <div>
                      <p className="font-medium text-destructive">
                        Solicitud bloqueada
                      </p>
                      <p className="text-muted-foreground">
                        {board.blockedReason ??
                          'Hay un bloqueo transversal vigente.'}
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* Ruta proporcional */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Ruta proporcional
                    </CardTitle>
                    <CardDescription>
                      Determina que controles son exigibles. Eleccion manual del
                      lider (sin reclasificacion automatica).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="governance-route">Ruta</Label>
                      <Select
                        value={routeDraft}
                        onValueChange={setRouteDraft}
                        disabled={!canReview || busy}
                      >
                        <SelectTrigger
                          id="governance-route"
                          className="w-56"
                        >
                          <SelectValue placeholder="Sin ruta asignada" />
                        </SelectTrigger>
                        <SelectContent>
                          {routeCatalog.map((item) => (
                            <SelectItem key={item.code} value={item.code}>
                              {ROUTE_LABELS[item.code] ?? item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {canReview ? (
                      <Button
                        onClick={() => void handleSaveRoute()}
                        disabled={
                          busy ||
                          !routeDraft ||
                          routeDraft === (board.governanceRoute ?? '')
                        }
                      >
                        Guardar ruta
                      </Button>
                    ) : null}
                    {board.governanceRoute ? (
                      <Badge variant="outline">
                        Actual:{' '}
                        {ROUTE_LABELS[board.governanceRoute] ??
                          board.governanceRoute}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Sin ruta asignada.
                      </span>
                    )}
                  </CardContent>
                </Card>

                {/* Preparacion de etapas (review) */}
                {canReview ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Avance de etapas
                      </CardTitle>
                      <CardDescription>
                        Prepara el flujo hacia los controles de autoridad. Cada
                        avance exige el estado de origen correcto (el backend
                        valida).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void handleStage(
                            requestValidationStage,
                            'Solicitud enviada a validacion.',
                          )
                        }
                      >
                        Enviar a validacion
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void handleStage(
                            markReadyStage,
                            'Solicitud lista para liberar.',
                          )
                        }
                      >
                        Marcar lista para liberar
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void handleStage(
                            confirmStabilizationStage,
                            'Estabilizacion confirmada.',
                          )
                        }
                      >
                        Confirmar estabilizacion
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Tablero de gates */}
                <div
                  role="list"
                  aria-label="Controles de gobierno GC1 a GC5"
                  className="flex flex-col gap-4"
                >
                  {board.gates.map((gate) => (
                    <GateCard
                      key={gate.gateCode}
                      gate={gate}
                      canReview={canReview}
                      busy={busy}
                      onApprove={() => void handleApprove(gate.gateCode)}
                      onWaive={() => void handleWaive(gate.gateCode)}
                    />
                  ))}
                </div>

                <Separator />

                {/* Validaciones */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Registro de validaciones
                    </CardTitle>
                    <CardDescription>
                      Evidencias y pruebas del expediente. Registrar una
                      validacion no aprueba ningun control (BR-008). GC4 se
                      bloquea si hay un defecto bloqueante sin resolver.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-6">
                    {validations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Aun no hay validaciones registradas.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Caso</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead>Ambiente</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Resultado</TableHead>
                            <TableHead>Bloqueante</TableHead>
                            <TableHead>Evidencia</TableHead>
                            {canReview ? (
                              <TableHead>Acciones</TableHead>
                            ) : null}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {validations.map((v) => {
                            const unresolved = v.blocking && !v.blockingResolved;
                            return (
                              <TableRow key={v.id}>
                                <TableCell>
                                  {catalogLabel(
                                    typeCatalog,
                                    v.validationTypeCode,
                                  )}
                                </TableCell>
                                <TableCell>{v.testCase}</TableCell>
                                <TableCell>{v.version ?? '-'}</TableCell>
                                <TableCell>{v.environment ?? '-'}</TableCell>
                                <TableCell>
                                  {formatDateTime(v.executedAt)}
                                </TableCell>
                                <TableCell>
                                  {catalogLabel(resultCatalog, v.resultCode)}
                                </TableCell>
                                <TableCell>
                                  {v.blocking ? (
                                    v.blockingResolved ? (
                                      <Badge variant="outline">
                                        Resuelto
                                      </Badge>
                                    ) : (
                                      <Badge variant="destructive">
                                        <AlertTriangle
                                          aria-hidden="true"
                                          className="mr-1 size-3.5"
                                        />
                                        Sin resolver
                                      </Badge>
                                    )
                                  ) : (
                                    <span className="text-muted-foreground">
                                      No
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {v.evidenceRef ? (
                                    /^https?:\/\//i.test(v.evidenceRef) ? (
                                      <a
                                        href={v.evidenceRef}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary underline underline-offset-2"
                                      >
                                        Enlace
                                      </a>
                                    ) : (
                                      v.evidenceRef
                                    )
                                  ) : v.evidenceDocumentId ? (
                                    'Documento del expediente'
                                  ) : (
                                    '-'
                                  )}
                                </TableCell>
                                {canReview ? (
                                  <TableCell>
                                    {unresolved ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() =>
                                          void handleResolveBlocking(v.id)
                                        }
                                      >
                                        Resolver bloqueo
                                      </Button>
                                    ) : (
                                      '-'
                                    )}
                                  </TableCell>
                                ) : null}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}

                    <Separator />

                    <form
                      onSubmit={handleCreateValidation}
                      className="grid gap-4"
                      aria-label="Registrar validacion"
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="val-type">Tipo</Label>
                          <Select
                            value={valForm.validationTypeCode}
                            onValueChange={(v) =>
                              setValForm((s) => ({
                                ...s,
                                validationTypeCode: v,
                              }))
                            }
                          >
                            <SelectTrigger id="val-type">
                              <SelectValue placeholder="Selecciona un tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              {typeCatalog.map((item) => (
                                <SelectItem key={item.code} value={item.code}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="val-result">Resultado</Label>
                          <Select
                            value={valForm.resultCode}
                            onValueChange={(v) =>
                              setValForm((s) => ({ ...s, resultCode: v }))
                            }
                          >
                            <SelectTrigger id="val-result">
                              <SelectValue placeholder="Selecciona un resultado" />
                            </SelectTrigger>
                            <SelectContent>
                              {resultCatalog.map((item) => (
                                <SelectItem key={item.code} value={item.code}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="val-case">Caso de prueba</Label>
                        <Input
                          id="val-case"
                          value={valForm.testCase}
                          onChange={(e) =>
                            setValForm((s) => ({
                              ...s,
                              testCase: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="val-version">
                            Version de la solucion
                          </Label>
                          <Input
                            id="val-version"
                            value={valForm.version}
                            onChange={(e) =>
                              setValForm((s) => ({
                                ...s,
                                version: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="val-env">Ambiente</Label>
                          <Input
                            id="val-env"
                            value={valForm.environment}
                            onChange={(e) =>
                              setValForm((s) => ({
                                ...s,
                                environment: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="val-executor">
                            Ejecutor (id de usuario)
                          </Label>
                          <Input
                            id="val-executor"
                            value={valForm.executedByUserId}
                            onChange={(e) =>
                              setValForm((s) => ({
                                ...s,
                                executedByUserId: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="val-executed-at">
                            Fecha de ejecucion
                          </Label>
                          <Input
                            id="val-executed-at"
                            type="datetime-local"
                            value={valForm.executedAt}
                            onChange={(e) =>
                              setValForm((s) => ({
                                ...s,
                                executedAt: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="val-evidence">
                          Evidencia (URL o nota)
                        </Label>
                        <Input
                          id="val-evidence"
                          value={valForm.evidenceRef}
                          onChange={(e) =>
                            setValForm((s) => ({
                              ...s,
                              evidenceRef: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="val-notes">Notas</Label>
                        <Textarea
                          id="val-notes"
                          value={valForm.notes}
                          onChange={(e) =>
                            setValForm((s) => ({
                              ...s,
                              notes: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input"
                          checked={valForm.blocking}
                          onChange={(e) =>
                            setValForm((s) => ({
                              ...s,
                              blocking: e.target.checked,
                            }))
                          }
                        />
                        Defecto bloqueante
                      </label>

                      {valFormError ? (
                        <p className="text-sm text-destructive" role="alert">
                          {valFormError}
                        </p>
                      ) : null}

                      <div className="flex justify-end">
                        <Button type="submit" disabled={busy}>
                          {busy ? 'Guardando...' : 'Registrar validacion'}
                        </Button>
                      </div>
                    </form>

                    {gc4 && gc4.validationSummary ? (
                      <div className="rounded-md bg-muted p-3 text-sm">
                        <p className="font-medium">Resumen GC4</p>
                        <p className="text-muted-foreground">
                          {gc4.validationSummary.total} validacion(es);{' '}
                          {gc4.validationSummary.blockingUnresolved} bloqueante(s)
                          sin resolver.{' '}
                          {gc4.validationSummary.approvable
                            ? 'Aprobable segun el recomputo del backend.'
                            : 'No aprobable todavia.'}
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </>
        )}
      </section>

      {!canReview ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock aria-hidden="true" className="size-3.5" />
          Tu rol permite consultar y registrar validaciones. Las acciones de
          autoridad (aprobar, ruta, waive) requieren rol de revision.
        </p>
      ) : null}
    </div>
  );
}

interface GateCardProps {
  gate: GateCheck;
  canReview: boolean;
  busy: boolean;
  onApprove: () => void;
  onWaive: () => void;
}

function GateCard({
  gate,
  canReview,
  busy,
  onApprove,
  onWaive,
}: GateCardProps): React.ReactElement {
  const isGc4 = gate.gateCode === 'GC4';
  const isGc5 = gate.gateCode === 'GC5';
  const summary = gate.validationSummary;
  // GC1-GC3 se derivan de fases previas y no se aprueban aqui (design D-B3).
  const approvableGate = isGc4 || isGc5;
  const blockedReason =
    isGc4 && summary && !summary.approvable
      ? summary.blockingReasons.join('; ') ||
        'Hay validaciones bloqueantes o falta la validacion obligatoria.'
      : null;
  const approveDisabled =
    busy ||
    gate.status === 'NO_APLICA' ||
    (isGc4 && summary ? !summary.approvable : false);

  return (
    <Card role="listitem" aria-label={`Control ${gate.gateCode}: ${gate.title}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {gate.gateCode} · {gate.title}
          </CardTitle>
          <GateStatusBadge status={gate.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div>
          <p className="font-medium">Condicion</p>
          <p className="text-muted-foreground">{gate.conditionText}</p>
        </div>
        <div>
          <p className="font-medium">Autoridad</p>
          <p className="text-muted-foreground">{gate.authorityText}</p>
        </div>

        {gate.status === 'NO_APLICA' && gate.waiverReason ? (
          <p className="rounded-md bg-muted p-2 text-muted-foreground">
            No aplica: {gate.waiverReason}
          </p>
        ) : null}

        {gate.pendingItems.length > 0 ? (
          <div>
            <p className="font-medium">Faltantes</p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {gate.pendingItems.map((item) => (
                <li key={item.id}>
                  {item.description}
                  {item.resolved ? ' (resuelto)' : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isGc4 && summary ? (
          <div className="rounded-md border p-2">
            <p className="font-medium">Validaciones</p>
            <p className="text-muted-foreground">
              {summary.total} registrada(s); {summary.blockingUnresolved}{' '}
              bloqueante(s) sin resolver;{' '}
              {summary.hasMandatoryApproving
                ? 'validacion obligatoria presente'
                : 'falta la validacion obligatoria'}
              .
            </p>
          </div>
        ) : null}

        {blockedReason ? (
          <p
            id={`${gate.gateCode}-block`}
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            Aprobar deshabilitado: {blockedReason}
          </p>
        ) : null}

        {canReview && approvableGate ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={approveDisabled}
              onClick={onApprove}
              aria-describedby={
                blockedReason ? `${gate.gateCode}-block` : undefined
              }
            >
              Aprobar {gate.gateCode}
            </Button>
            {gate.status !== 'NO_APLICA' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onWaive}
              >
                Marcar no aplica
              </Button>
            ) : null}
          </div>
        ) : !approvableGate ? (
          <p className="text-xs text-muted-foreground">
            Este control se deriva de fases previas y no se aprueba desde
            gobierno.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
