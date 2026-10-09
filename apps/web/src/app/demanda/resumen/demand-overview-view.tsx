'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ApiError,
  getAreaIndicators,
  type AreaIndicators,
  type DeliveryTimeGroup,
  type IndicatorStatus,
} from '@/lib/area-control';
import { useActor } from '@/lib/actor-context';

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';

/** Primer dia del mes en curso (UTC), formato YYYY-MM-DD. */
function monthStart(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/** Primer dia del mes siguiente (UTC), limite exclusivo, formato YYYY-MM-DD. */
function nextMonthStart(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}-01`;
}

function messageOf(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Ocurrio un error inesperado.';
}

/**
 * Etiqueta "No aplica" + motivo. NUNCA se muestra 0 ni un numero inventado
 * cuando applicable=false (regla del marco §9). El Badge es visualmente
 * distinto de un conteo 0.
 */
function NotApplicable({
  status,
}: {
  status: IndicatorStatus;
}): React.ReactElement {
  const motivo = status.reason ?? status.futureDataNote;
  return (
    <div className="flex flex-col gap-1">
      <Badge variant="secondary" aria-label="No aplica">
        No aplica
      </Badge>
      {motivo ? (
        <p className="text-xs text-muted-foreground">{motivo}</p>
      ) : null}
    </div>
  );
}

/** Tarjeta de indicador con titulo, descripcion y cuerpo. */
function IndicatorCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <article className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="mt-1">{children}</div>
    </article>
  );
}

/** Grupo visual que nombra una instancia de seguimiento del marco §9. */
function IndicatorGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function DeliveryGroupTable({
  caption,
  groups,
}: {
  caption: string;
  groups: DeliveryTimeGroup[];
}): React.ReactElement | null {
  if (groups.length === 0) return null;
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Grupo</TableHead>
          <TableHead scope="col" className="text-right">
            Mediana (dias)
          </TableHead>
          <TableHead scope="col" className="text-right">
            Cerradas
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => (
          <TableRow key={g.key}>
            <TableCell className="font-medium">{g.label}</TableCell>
            <TableCell className="text-right tabular-nums">
              {g.medianDays}
            </TableCell>
            <TableCell className="text-right tabular-nums">{g.count}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DemandOverviewView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();

  // Gating COSMETICO: el backend es la autoridad y devuelve 403 si corresponde.
  // Si los permisos del actor no incluyen el modulo, evitamos la llamada y
  // mostramos el mismo aviso entendible que ante un 403.
  const permissionsLoaded = permissions !== null;
  const moduleAllowed = allowedModules.has('demandOverview');

  const [from, setFrom] = React.useState<string>(() => monthStart());
  const [to, setTo] = React.useState<string>(() => nextMonthStart());

  const [indicators, setIndicators] = React.useState<AreaIndicators | null>(
    null,
  );
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (rangeFrom: string, rangeTo: string) => {
      setState('loading');
      setErrorMessage(null);
      try {
        const data = await getAreaIndicators({ from: rangeFrom, to: rangeTo });
        setIndicators(data);
        setState('success');
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden');
          return;
        }
        setErrorMessage(messageOf(err));
        setState('error');
      }
    },
    [],
  );

  React.useEffect(() => {
    // No llamar mientras no sepamos los permisos; si el modulo no esta
    // permitido, mostrar el aviso sin pegarle al backend.
    if (!permissionsLoaded) return;
    if (!moduleAllowed) {
      setState('forbidden');
      return;
    }
    void load(from, to);
  }, [permissionsLoaded, moduleAllowed, from, to, load]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Resumen de demanda
          </h1>
          <p className="text-sm text-muted-foreground">
            Indicadores del area para el periodo elegido. Cuando no hay casos o
            no hay denominador, el indicador se reporta como &quot;No
            aplica&quot; con su motivo, no como cero.
          </p>
        </div>
        {state === 'forbidden' ? null : (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Periodo</legend>
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="indicadores-from">Desde</Label>
                <Input
                  id="indicadores-from"
                  type="date"
                  className="w-40"
                  value={from}
                  max={to}
                  onChange={(e) => {
                    if (e.target.value) setFrom(e.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="indicadores-to">Hasta</Label>
                <Input
                  id="indicadores-to"
                  type="date"
                  className="w-40"
                  value={to}
                  min={from}
                  onChange={(e) => {
                    if (e.target.value) setTo(e.target.value);
                  }}
                />
              </div>
            </div>
          </fieldset>
        )}
      </header>

      <div aria-live="polite" className="flex flex-col gap-8">
        {state === 'forbidden' ? (
          <div
            role="note"
            className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-6"
          >
            <p className="text-sm font-medium">
              Esta pantalla no esta disponible para tu rol.
            </p>
            <p className="text-sm text-muted-foreground">
              Los indicadores del area son para el jefe de area y los lideres de
              proceso. Si necesitas estos datos, solicita acceso a quien
              corresponda. El panorama de demanda esta disponible en Inicio.
            </p>
          </div>
        ) : state === 'loading' ? (
          <div className="flex flex-col gap-8">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="h-6 w-56" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {errorMessage ?? 'No fue posible cargar los indicadores.'}
            </p>
            <Button variant="outline" onClick={() => void load(from, to)}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : indicators === null ? null : (
          <>
            <IndicatorGroup
              id="grupo-evaluacion-heading"
              title="Evaluacion de demanda"
            >
              <IndicatorCard
                title="Tiempo de evaluacion inicial"
                description="Mediana de dias entre el registro y la decision inicial de triage."
              >
                {indicators.evaluationTime.status.applicable ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-2xl font-semibold tabular-nums">
                      {indicators.evaluationTime.medianDays}{' '}
                      <span className="text-sm font-normal text-muted-foreground">
                        dias (mediana)
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {indicators.evaluationTime.sampleSize} decisiones en el
                      periodo
                    </p>
                  </div>
                ) : (
                  <NotApplicable status={indicators.evaluationTime.status} />
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Pendientes de decision inicial (a hoy):{' '}
                  <span className="font-medium tabular-nums">
                    {indicators.evaluationTime.pendingCount}
                  </span>
                </p>
              </IndicatorCard>
            </IndicatorGroup>

            <IndicatorGroup
              id="grupo-entrega-heading"
              title="Seguimiento de entrega"
            >
              <IndicatorCard
                title="Cumplimiento de hitos"
                description="Hitos cumplidos a tiempo sobre los hitos con vencimiento en el periodo."
              >
                {indicators.milestoneCompliance.status.applicable ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-2xl font-semibold tabular-nums">
                      {indicators.milestoneCompliance.percentage}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {indicators.milestoneCompliance.met} de{' '}
                      {indicators.milestoneCompliance.due} hitos a tiempo
                    </p>
                  </div>
                ) : (
                  <NotApplicable
                    status={indicators.milestoneCompliance.status}
                  />
                )}
              </IndicatorCard>

              <IndicatorCard
                title="Tiempo de entrega"
                description="Mediana de dias entre el compromiso y el cierre de las solicitudes cerradas en el periodo."
              >
                {indicators.deliveryTime.status.applicable ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <p className="text-2xl font-semibold tabular-nums">
                        {indicators.deliveryTime.medianDays}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                          dias (mediana)
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {indicators.deliveryTime.count} cerradas medibles
                        {indicators.deliveryTime.unmeasurableClosed > 0
                          ? ` · ${indicators.deliveryTime.unmeasurableClosed} sin compromiso registrable`
                          : ''}
                      </p>
                    </div>
                    <DeliveryGroupTable
                      caption="Mediana de tiempo de entrega por ruta de gobierno."
                      groups={indicators.deliveryTime.byRoute}
                    />
                    <DeliveryGroupTable
                      caption="Mediana de tiempo de entrega por complejidad."
                      groups={indicators.deliveryTime.byComplexity}
                    />
                  </div>
                ) : (
                  <NotApplicable status={indicators.deliveryTime.status} />
                )}
              </IndicatorCard>
            </IndicatorGroup>

            <IndicatorGroup
              id="grupo-portafolio-heading"
              title="Portafolio y cambios"
            >
              <IndicatorCard
                title="Bloqueos activos"
                description="Solicitudes con bloqueo activo y novedades de bloqueo abiertas. Un conteo cero es un valor valido."
              >
                {indicators.blocks.status.applicable ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-8">
                      <div className="flex flex-col">
                        <span className="text-2xl font-semibold tabular-nums">
                          {indicators.blocks.blockedRequests}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          solicitudes bloqueadas
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-2xl font-semibold tabular-nums">
                          {indicators.blocks.openBlockingIssues}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          novedades de bloqueo abiertas
                        </span>
                      </div>
                    </div>
                    {indicators.blocks.byCause.length > 0 ? (
                      <Table>
                        <caption className="sr-only">
                          Desglose de bloqueos por causa y origen.
                        </caption>
                        <TableHeader>
                          <TableRow>
                            <TableHead scope="col">Causa</TableHead>
                            <TableHead scope="col">Origen</TableHead>
                            <TableHead scope="col" className="text-right">
                              Casos
                            </TableHead>
                            <TableHead scope="col" className="text-right">
                              Dias acum.
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {indicators.blocks.byCause.map((c, i) => (
                            <TableRow key={`${c.origin}-${c.cause}-${i}`}>
                              <TableCell className="font-medium">
                                {c.cause}
                              </TableCell>
                              <TableCell>
                                {c.origin === 'ISSUE'
                                  ? 'Novedad'
                                  : 'Marca de solicitud'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {c.count}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {c.accumulatedDays}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : null}
                  </div>
                ) : (
                  <NotApplicable status={indicators.blocks.status} />
                )}
              </IndicatorCard>

              <IndicatorCard
                title="Cambios fallidos"
                description="Indicador de dato futuro."
              >
                <NotApplicable status={indicators.failedChanges.status} />
              </IndicatorCard>
            </IndicatorGroup>

            <IndicatorGroup
              id="grupo-operativa-heading"
              title="Revision operativa"
            >
              <IndicatorCard
                title="Recuperacion"
                description="Indicador de dato futuro."
              >
                <NotApplicable status={indicators.recovery.status} />
              </IndicatorCard>
            </IndicatorGroup>

            <IndicatorGroup
              id="grupo-valor-heading"
              title="Revision de valor"
            >
              <IndicatorCard
                title="Adopcion y valor"
                description="Indicador de dato futuro."
              >
                <NotApplicable status={indicators.adoptionValue.status} />
              </IndicatorCard>
            </IndicatorGroup>
          </>
        )}
      </div>
    </div>
  );
}
