'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Process } from '@/lib/api-client';
import {
  ApiError,
  listPortfolio,
  type PortfolioItem,
} from '@/lib/portfolio';
import { listProcesses } from '@/lib/team';
import { REQUEST_STATE_LABELS, requestStateLabel } from '@/lib/request-state';

type LoadState = 'loading' | 'success' | 'error';

/** Valor centinela del Select para "sin filtro" (Radix no admite value vacio). */
const ANY = '__any';

/** Bandas de prioridad del marco §4 + SIN_PRIORIZAR. */
const BANDS = ['P1', 'P2', 'P3', 'P4', 'SIN_PRIORIZAR'] as const;

const BAND_LABELS: Record<string, string> = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
  SIN_PRIORIZAR: 'Sin priorizar',
};

/** Estados operativos en orden del enum RequestState. */
const STATE_OPTIONS = Object.keys(REQUEST_STATE_LABELS);

function messageOf(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Ocurrio un error inesperado.';
}

function dash(value: string | null): string {
  return value === null || value === '' ? '—' : value;
}

/** Badge de banda: P1-P4 con color, SIN_PRIORIZAR neutro, null como '—'. */
function BandBadge({
  band,
  label,
}: {
  band: string | null;
  label: string | null;
}): React.ReactElement {
  if (band === null) {
    return (
      <Badge variant="secondary" aria-label="Sin priorizar">
        Sin priorizar
      </Badge>
    );
  }
  const text = label ?? BAND_LABELS[band] ?? band;
  // P1 mas urgente -> destructive; P2 -> default; P3 -> secondary; P4 -> outline.
  const variant =
    band === 'P1'
      ? 'destructive'
      : band === 'P2'
        ? 'default'
        : band === 'P3'
          ? 'secondary'
          : 'outline';
  return (
    <Badge variant={variant} aria-label={`Banda de prioridad ${text}`}>
      {text}
    </Badge>
  );
}

export function PortafolioView(): React.ReactElement {
  const [processId, setProcessId] = React.useState<string>(ANY);
  const [stateFilter, setStateFilter] = React.useState<string>(ANY);
  const [bandFilter, setBandFilter] = React.useState<string>(ANY);

  const [items, setItems] = React.useState<PortfolioItem[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Procesos para poblar el filtro: acotados por el alcance del backend.
  React.useEffect(() => {
    void (async () => {
      try {
        const procs = await listProcesses();
        setProcesses(procs);
      } catch {
        setProcesses([]);
      }
    })();
  }, []);

  const load = React.useCallback(
    async (filters: {
      mainProcessId?: string;
      state?: string;
      band?: string;
    }) => {
      setState('loading');
      setErrorMessage(null);
      try {
        const data = await listPortfolio(filters);
        setItems(data);
        setState('success');
      } catch (err) {
        setErrorMessage(messageOf(err));
        setState('error');
      }
    },
    [],
  );

  const activeFilters = React.useMemo(
    () => ({
      ...(processId !== ANY ? { mainProcessId: processId } : {}),
      ...(stateFilter !== ANY ? { state: stateFilter } : {}),
      ...(bandFilter !== ANY ? { band: bandFilter } : {}),
    }),
    [processId, stateFilter, bandFilter],
  );

  React.useEffect(() => {
    void load(activeFilters);
  }, [activeFilters, load]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Portafolio</h1>
        <p className="text-sm text-muted-foreground">
          Vista de conjunto de las iniciativas dentro de tu alcance. Filtra por
          proceso, estado operativo o banda de prioridad; los filtros acotan tu
          alcance, no lo amplian.
        </p>
      </header>

      <section
        aria-label="Filtros del portafolio"
        className="grid gap-3 sm:grid-cols-3"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="portafolio-proceso">Proceso</Label>
          <Select value={processId} onValueChange={setProcessId}>
            <SelectTrigger id="portafolio-proceso">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todos</SelectItem>
              {processes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="portafolio-estado">Estado operativo</Label>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger id="portafolio-estado">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todos</SelectItem>
              {STATE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {requestStateLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="portafolio-banda">Banda de prioridad</Label>
          <Select value={bandFilter} onValueChange={setBandFilter}>
            <SelectTrigger id="portafolio-banda">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Todas</SelectItem>
              {BANDS.map((b) => (
                <SelectItem key={b} value={b}>
                  {BAND_LABELS[b]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div aria-live="polite" className="rounded-lg border bg-card">
        {state === 'loading' ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {errorMessage ?? 'No fue posible cargar el portafolio.'}
            </p>
            <Button variant="outline" onClick={() => void load(activeFilters)}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-sm font-medium">
              No hay iniciativas en tu alcance con estos filtros.
            </p>
            <p className="text-sm text-muted-foreground">
              Ajusta o limpia los filtros para ver mas iniciativas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">
                Iniciativas del portafolio dentro de tu alcance, con proceso,
                estado operativo, banda de prioridad, ruta de gobierno,
                responsable y fechas clave.
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Titulo</TableHead>
                  <TableHead scope="col">Proceso</TableHead>
                  <TableHead scope="col">Estado</TableHead>
                  <TableHead scope="col">Banda</TableHead>
                  <TableHead scope="col">Ruta</TableHead>
                  <TableHead scope="col">Responsable</TableHead>
                  <TableHead scope="col">Registro</TableHead>
                  <TableHead scope="col">Objetivo</TableHead>
                  <TableHead scope="col">Compromiso</TableHead>
                  <TableHead scope="col">Bloqueo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{item.mainProcessName}</TableCell>
                    <TableCell>
                      {requestStateLabel(item.operationalState)}
                    </TableCell>
                    <TableCell>
                      <BandBadge
                        band={item.priorityBand}
                        label={item.priorityLabel}
                      />
                    </TableCell>
                    <TableCell>{dash(item.governanceRoute)}</TableCell>
                    <TableCell>{dash(item.responsibleName)}</TableCell>
                    <TableCell className="tabular-nums">
                      {item.registeredAt}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {dash(item.targetDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {dash(item.initialCommitmentDate)}
                    </TableCell>
                    <TableCell>
                      {item.blocked ? (
                        <Badge
                          variant="destructive"
                          aria-label={
                            item.blockedReason
                              ? `Bloqueada: ${item.blockedReason}`
                              : 'Bloqueada'
                          }
                        >
                          Bloqueada
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
