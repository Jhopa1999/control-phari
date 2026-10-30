'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import Link from 'next/link';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { PeriodFieldset } from '@/components/period-fieldset';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
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
import { formatCount, formatPercent, localMonthPeriod, orDash } from '@/lib/format';

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';

const NUMBER_FORMAT = new Intl.NumberFormat('es');

function messageOf(err: unknown): string | null {
  return err instanceof ApiError ? err.message : null;
}

function formatNumber(value: number | null): string {
  return value === null ? orDash(value) : NUMBER_FORMAT.format(value);
}

/**
 * «No aplica» + motivo de la API (reason o futureDataNote). NUNCA se muestra 0
 * ni un número inventado cuando applicable = false (regla del marco §9).
 */
function NotApplicable({ status }: { status: IndicatorStatus }): React.ReactElement {
  const motivo = status.reason ?? status.futureDataNote;
  return (
    <div className="flex flex-col gap-1 sm:items-end sm:text-right">
      <Badge variant="outline">No aplica</Badge>
      {motivo ? <p className="max-w-xs text-meta text-muted-foreground">{motivo}</p> : null}
    </div>
  );
}

/** Valor de un indicador: número de 24 px, unidad y muestra. */
function IndicatorValue({
  value,
  unit,
  sample,
}: {
  value: string;
  unit?: string;
  sample?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5 sm:items-end sm:text-right">
      <p className="whitespace-nowrap">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {unit ? <span className="text-meta text-muted-foreground"> {unit}</span> : null}
      </p>
      {sample ? <p className="text-xs text-muted-foreground">{sample}</p> : null}
    </div>
  );
}

/**
 * Fila de indicador (design §11.13): a la izquierda título y descripción; a la
 * derecha el valor o «No aplica». Las subtablas van debajo, en `children`.
 */
function IndicatorRow({
  title,
  description,
  value,
  children,
}: {
  title: string;
  description: string;
  value: React.ReactNode;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-meta text-muted-foreground">{description}</p>
        </div>
        <div className="shrink-0">{value}</div>
      </div>
      {children}
    </li>
  );
}

function IndicatorList({ children }: { children: React.ReactNode }): React.ReactElement {
  return <ul className="divide-y rounded-lg border bg-card">{children}</ul>;
}

/** Subtabla compacta con su título visible; oculta si no hay filas. */
function SubTable({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="overflow-hidden rounded-md border">
        <Table density="compact">
          <TableCaption>{caption}</TableCaption>
          {children}
        </Table>
      </div>
    </div>
  );
}

function DeliveryGroupTable({
  title,
  caption,
  groups,
}: {
  title: string;
  caption: string;
  groups: DeliveryTimeGroup[];
}): React.ReactElement | null {
  if (groups.length === 0) return null;
  return (
    <SubTable title={title} caption={caption}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Grupo</TableHead>
          <TableHead scope="col" className="text-right tabular-nums">
            Mediana (días)
          </TableHead>
          <TableHead scope="col" className="text-right tabular-nums">
            Cerradas
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => (
          <TableRow key={g.key}>
            <TableCell className="font-medium">{g.label}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(g.medianDays)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(g.count)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </SubTable>
  );
}

function IndicatorsSkeleton(): React.ReactElement {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-56" />
          <div className="divide-y rounded-lg border bg-card">
            {Array.from({ length: 2 }).map((__, j) => (
              <div key={j} className="flex items-start justify-between gap-6 px-4 py-3">
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-full max-w-md" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function IndicatorGroups({ indicators }: { indicators: AreaIndicators }): React.ReactElement {
  const { evaluationTime, milestoneCompliance, deliveryTime, blocks } = indicators;
  return (
    <>
      <Section title="Evaluación de demanda">
        <IndicatorList>
          <IndicatorRow
            title="Tiempo de evaluación inicial"
            description="Mediana de días entre el registro y la decisión inicial de triage."
            value={
              <div className="flex flex-col gap-1.5 sm:items-end">
                {evaluationTime.status.applicable ? (
                  <IndicatorValue
                    value={formatNumber(evaluationTime.medianDays)}
                    unit="días (mediana)"
                    sample={`${formatCount(evaluationTime.sampleSize, {
                      one: 'decisión',
                      other: 'decisiones',
                    })} en el periodo`}
                  />
                ) : (
                  <NotApplicable status={evaluationTime.status} />
                )}
                <p className="text-xs text-muted-foreground sm:text-right">
                  Pendientes de decisión inicial (a hoy):{' '}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatNumber(evaluationTime.pendingCount)}
                  </span>
                </p>
              </div>
            }
          />
        </IndicatorList>
      </Section>

      <Section title="Seguimiento de entrega">
        <IndicatorList>
          <IndicatorRow
            title="Cumplimiento de hitos"
            description="Hitos cumplidos a tiempo sobre los hitos con vencimiento en el periodo."
            value={
              milestoneCompliance.status.applicable && milestoneCompliance.percentage !== null ? (
                <IndicatorValue
                  value={formatPercent(milestoneCompliance.percentage)}
                  sample={`${formatNumber(milestoneCompliance.met)} de ${formatCount(
                    milestoneCompliance.due,
                    { one: 'hito', other: 'hitos' },
                  )} a tiempo`}
                />
              ) : (
                <NotApplicable status={milestoneCompliance.status} />
              )
            }
          />
          <IndicatorRow
            title="Tiempo de entrega"
            description="Mediana de días entre el compromiso y el cierre de las solicitudes cerradas en el periodo."
            value={
              deliveryTime.status.applicable ? (
                <IndicatorValue
                  value={formatNumber(deliveryTime.medianDays)}
                  unit="días (mediana)"
                  sample={
                    <>
                      {`${formatCount(deliveryTime.count, {
                        one: 'cerrada medible',
                        other: 'cerradas medibles',
                      })}`}
                      {deliveryTime.unmeasurableClosed > 0
                        ? ` · ${NUMBER_FORMAT.format(deliveryTime.unmeasurableClosed)} sin compromiso registrable`
                        : ''}
                    </>
                  }
                />
              ) : (
                <NotApplicable status={deliveryTime.status} />
              )
            }
          >
            {deliveryTime.status.applicable &&
            (deliveryTime.byRoute.length > 0 || deliveryTime.byComplexity.length > 0) ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <DeliveryGroupTable
                  title="Por ruta de gobierno"
                  caption="Mediana de tiempo de entrega por ruta de gobierno."
                  groups={deliveryTime.byRoute}
                />
                <DeliveryGroupTable
                  title="Por complejidad"
                  caption="Mediana de tiempo de entrega por complejidad."
                  groups={deliveryTime.byComplexity}
                />
              </div>
            ) : null}
          </IndicatorRow>
        </IndicatorList>
      </Section>

      <Section title="Portafolio y cambios">
        <IndicatorList>
          <IndicatorRow
            title="Bloqueos activos"
            description="Solicitudes con bloqueo activo y novedades de bloqueo abiertas. Un conteo cero es un valor válido."
            value={
              blocks.status.applicable ? (
                <div className="flex gap-6 sm:justify-end">
                  <IndicatorValue
                    value={NUMBER_FORMAT.format(blocks.blockedRequests)}
                    sample="solicitudes bloqueadas"
                  />
                  <IndicatorValue
                    value={NUMBER_FORMAT.format(blocks.openBlockingIssues)}
                    sample="novedades de bloqueo abiertas"
                  />
                </div>
              ) : (
                <NotApplicable status={blocks.status} />
              )
            }
          >
            {blocks.status.applicable && blocks.byCause.length > 0 ? (
              <SubTable title="Bloqueos por causa" caption="Desglose de bloqueos por causa y origen.">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Causa</TableHead>
                    <TableHead scope="col">Origen</TableHead>
                    <TableHead scope="col" className="text-right tabular-nums">
                      Casos
                    </TableHead>
                    <TableHead scope="col" className="text-right tabular-nums">
                      Días acum.
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocks.byCause.map((c, i) => (
                    <TableRow key={`${c.origin}-${c.cause}-${i}`}>
                      <TableCell className="font-medium">{c.cause}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {c.origin === 'ISSUE' ? 'Novedad' : 'Marca de solicitud'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {NUMBER_FORMAT.format(c.count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {NUMBER_FORMAT.format(c.accumulatedDays)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </SubTable>
            ) : null}
          </IndicatorRow>
        </IndicatorList>
      </Section>
    </>
  );
}

/**
 * Indicadores del área (design §11.13, patrón F). Gating COSMÉTICO: el backend
 * es la autoridad y devuelve 403 si corresponde; si los permisos del actor no
 * incluyen el módulo, no se llama a la API y se muestra el mismo aviso que ante
 * un 403.
 */
export function DemandOverviewView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();
  const permissionsLoaded = permissions !== null;
  const moduleAllowed = allowedModules.has('demandOverview');

  // Periodo del mes local del usuario (design §7.9, regla 2), calculado tras el
  // montaje: el inicializador de useState también corre al prerenderizar en el
  // servidor y dejaría la fecha del build y la zona del servidor. Mientras vale
  // '' no se carga nada y cada campo muestra un Skeleton.
  const [from, setFrom] = React.useState<string>('');
  const [to, setTo] = React.useState<string>('');
  React.useEffect(() => {
    const period = localMonthPeriod();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valor por defecto con la fecha local del navegador; se fija tras montar para no desajustar la hidratación (el servidor no conoce la zona horaria del usuario).
    setFrom((v) => v || period.from);
    setTo((v) => v || period.to);
  }, []);

  const [indicators, setIndicators] = React.useState<AreaIndicators | null>(null);
  const [loadedState, setState] = React.useState<LoadState>('loading');
  const state: LoadState = permissionsLoaded && !moduleAllowed ? 'forbidden' : loadedState;
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const fetchIndicators = React.useCallback((rangeFrom: string, rangeTo: string) => {
    return getAreaIndicators({ from: rangeFrom, to: rangeTo })
      .then((data) => {
        setIndicators(data);
        setState('success');
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden');
          return;
        }
        setErrorMessage(messageOf(err));
        setState('error');
      });
  }, []);
  const load = React.useCallback((rangeFrom: string, rangeTo: string) => {
    setState('loading');
    setErrorMessage(null);
    return fetchIndicators(rangeFrom, rangeTo);
  }, [fetchIndicators]);

  // Al cambiar el periodo se vuelve a mostrar la carga.
  useResetOnChange([from, to], () => {
    if (!from || !to) return;
    setState('loading');
    setErrorMessage(null);
  });
  React.useEffect(() => {
    // No llamar mientras no se conozcan los permisos; si el módulo no está
    // permitido, el aviso sale del estado derivado y no se llama al backend.
    if (!permissionsLoaded || !moduleAllowed) return;
    if (!from || !to) return;
    void fetchIndicators(from, to);
  }, [permissionsLoaded, moduleAllowed, from, to, fetchIndicators]);

  let content: React.ReactNode;
  if (state === 'forbidden') {
    content = (
      <InlineNotice
        tone="neutral"
        role="note"
        title="Esta pantalla no está disponible para tu rol."
        action={
          allowedModules.has('dashboard') ? (
            <Link href="/inicio" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Ir al Panel del área
            </Link>
          ) : undefined
        }
      >
        <p className="text-muted-foreground">
          Los indicadores del área son para el jefe de área y los líderes de proceso. Si
          necesitas estos datos, solicita acceso. El panorama de la demanda está en el Panel
          del área.
        </p>
      </InlineNotice>
    );
  } else if (state === 'loading') {
    content = <IndicatorsSkeleton />;
  } else if (state === 'error' || indicators === null) {
    content = (
      <div className="overflow-hidden rounded-lg border bg-card">
        <ErrorState
          title="No fue posible cargar los indicadores."
          message={errorMessage}
          onRetry={() => void load(from, to)}
        />
      </div>
    );
  } else {
    content = <IndicatorGroups indicators={indicators} />;
  }

  return (
    <PageLayout>
      <PageHeader
        title="Indicadores del área"
        description="Indicadores del periodo. Sin casos o sin denominador se informa «No aplica» con su motivo, nunca cero."
      />
      {state === 'forbidden' ? null : (
        <PeriodFieldset
          fromId="indicadores-from"
          toId="indicadores-to"
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
        />
      )}
      {content}
    </PageLayout>
  );
}
