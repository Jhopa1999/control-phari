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
  getDemandSummary,
  type DemandSummary,
} from '@/lib/area-control';
import { localMonthPeriod } from '@/lib/format';
import { requestStateLabel } from '@/lib/request-state';

type LoadState = 'loading' | 'success' | 'error';

/** Etiquetas legibles de las bandas de prioridad del marco §4. */
const BAND_LABELS: Record<string, string> = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
  SIN_PRIORIZAR: 'Sin priorizar',
};

function bandLabel(band: string): string {
  return BAND_LABELS[band] ?? band;
}

function messageOf(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Ocurrio un error inesperado.';
}

export function DashboardView(): React.ReactElement {
  // Periodo del mes local del usuario (design §7.9, regla 2), calculado tras el
  // montaje: el inicializador de useState también corre al prerenderizar en el
  // servidor y dejaría la fecha del build y la zona del servidor. Mientras vale
  // '' no se carga nada y cada campo muestra un Skeleton.
  const [from, setFrom] = React.useState<string>('');
  const [to, setTo] = React.useState<string>('');
  React.useEffect(() => {
    const period = localMonthPeriod();
    setFrom((v) => v || period.from);
    setTo((v) => v || period.to);
  }, []);

  const [summary, setSummary] = React.useState<DemandSummary | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async (rangeFrom: string, rangeTo: string) => {
    setState('loading');
    setErrorMessage(null);
    try {
      const data = await getDemandSummary({ from: rangeFrom, to: rangeTo });
      setSummary(data);
      setState('success');
    } catch (err) {
      setErrorMessage(messageOf(err));
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    if (!from || !to) return;
    void load(from, to);
  }, [from, to, load]);

  const hasData =
    summary !== null &&
    (summary.total > 0 ||
      summary.byState.some((s) => s.count > 0) ||
      summary.byPriorityBand.some((b) => b.count > 0));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Control del area
          </h1>
          <p className="text-sm text-muted-foreground">
            Panorama de la demanda del area para el periodo elegido: cuantas
            solicitudes hay, cuantas estan bloqueadas, y su distribucion por
            estado operativo y por banda de prioridad.
          </p>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Periodo</legend>
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="dashboard-from">Desde</Label>
              {from ? (
                <Input
                  id="dashboard-from"
                  type="date"
                  className="w-40"
                  value={from}
                  max={to}
                  onChange={(e) => {
                    if (e.target.value) setFrom(e.target.value);
                  }}
                />
              ) : (
                <Skeleton className="h-9 w-40" />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="dashboard-to">Hasta</Label>
              {to ? (
                <Input
                  id="dashboard-to"
                  type="date"
                  className="w-40"
                  value={to}
                  min={from}
                  onChange={(e) => {
                    if (e.target.value) setTo(e.target.value);
                  }}
                />
              ) : (
                <Skeleton className="h-9 w-40" />
              )}
            </div>
          </div>
        </fieldset>
      </header>

      <div aria-live="polite" className="flex flex-col gap-6">
        {state === 'loading' ? (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {errorMessage ?? 'No fue posible cargar el panorama de demanda.'}
            </p>
            <Button variant="outline" onClick={() => void load(from, to)}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : summary === null ? null : (
          <>
            <section
              aria-label="Resumen general"
              className="grid gap-4 sm:grid-cols-2"
            >
              <div className="rounded-lg border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  Solicitudes en alcance
                </p>
                <p className="text-3xl font-semibold tracking-tight">
                  {summary.total}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  Bloqueadas activas
                </p>
                <p className="text-3xl font-semibold tracking-tight">
                  {summary.blockedActive}
                </p>
              </div>
            </section>

            {!hasData ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-10 text-center">
                <p className="text-sm font-medium">
                  No hay solicitudes en tu alcance para este periodo.
                </p>
                <p className="text-sm text-muted-foreground">
                  Ajusta el periodo para ver la demanda de otro rango.
                </p>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <section
                  aria-labelledby="por-estado-heading"
                  className="flex flex-col gap-3"
                >
                  <h2
                    id="por-estado-heading"
                    className="text-lg font-semibold tracking-tight"
                  >
                    Por estado operativo
                  </h2>
                  <div className="rounded-lg border bg-card">
                    <Table>
                      <caption className="sr-only">
                        Numero de solicitudes por estado operativo en el
                        periodo seleccionado.
                      </caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Estado</TableHead>
                          <TableHead scope="col" className="text-right">
                            Solicitudes
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.byState.map((row) => (
                          <TableRow key={row.state}>
                            <TableCell className="font-medium">
                              {requestStateLabel(row.state)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.count}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>

                <section
                  aria-labelledby="por-banda-heading"
                  className="flex flex-col gap-3"
                >
                  <h2
                    id="por-banda-heading"
                    className="text-lg font-semibold tracking-tight"
                  >
                    Por banda de prioridad
                  </h2>
                  <div className="rounded-lg border bg-card">
                    <Table>
                      <caption className="sr-only">
                        Numero de solicitudes por banda de prioridad en el
                        periodo seleccionado.
                      </caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Banda</TableHead>
                          <TableHead scope="col" className="text-right">
                            Solicitudes
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.byPriorityBand.map((row) => (
                          <TableRow key={row.band}>
                            <TableCell>
                              {row.band === 'SIN_PRIORIZAR' ? (
                                <Badge
                                  variant="secondary"
                                  aria-label="Sin priorizar"
                                >
                                  {bandLabel(row.band)}
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  {bandLabel(row.band)}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.count}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
