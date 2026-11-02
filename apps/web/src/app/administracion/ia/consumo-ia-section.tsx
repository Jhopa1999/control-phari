'use client';

import * as React from 'react';
import { BarChart3 } from 'lucide-react';
import { DataCardList } from '@/components/data-card-list';
import { EmptyState } from '@/components/empty-state';
import { InlineNotice } from '@/components/inline-notice';
import { Section } from '@/components/section';
import { StatStrip, StatTile } from '@/components/stat-tile';
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
import type { AiUsageBreakdown, AiUsageSummary } from '@/lib/api-client';
import { getAiUsage } from '@/lib/ai';
import { BudgetProgress } from './budget-progress';
import {
  currentMonth,
  formatCompact,
  formatMonth,
  formatPct,
  formatUsd,
  recentMonths,
} from './ia-format';

interface ConsumoIaSectionProps {
  /** Cambia cuando otra pieza (p. ej. el presupuesto) pide recargar el consumo. */
  reloadKey: number;
  /** Nombre legible por code de agente. */
  agentNames: Record<string, string>;
  /** Nombre legible por id de modelo. */
  modelLabels: Record<string, string>;
}

/** Resultado de una carga, ligado a la petición que lo produjo. */
interface UsageResult {
  key: string;
  data?: AiUsageSummary;
  error?: string;
}

/**
 * Consumo de IA de un mes (GET /admin/ai/usage): indicadores, barra del
 * presupuesto, aviso de llamadas sin precio y desglose por agente y por modelo.
 * Carga sus propios datos: un fallo aquí no bloquea la configuración.
 */
export function ConsumoIaSection({
  reloadKey,
  agentNames,
  modelLabels,
}: ConsumoIaSectionProps): React.ReactElement {
  const months = React.useMemo(() => recentMonths(12), []);
  const [month, setMonth] = React.useState(() => currentMonth());
  const [attempt, setAttempt] = React.useState(0);
  const [result, setResult] = React.useState<UsageResult | null>(null);
  const requestKey = `${month}|${reloadKey}|${attempt}`;
  const loading = result?.key !== requestKey;

  React.useEffect(() => {
    let cancelled = false;
    getAiUsage(month)
      .then((data) => {
        if (!cancelled) setResult({ key: requestKey, data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          error: err instanceof Error ? err.message : 'Reintenta en unos momentos.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [month, requestKey]);

  const monthSelectId = 'ai-usage-month';
  const data = loading ? undefined : result?.data;

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  } else if (result?.error || !data) {
    body = (
      <div className="rounded-xl bg-card shadow-card">
        <InlineNotice tone="danger" title="No fue posible cargar el consumo.">
          <p className="text-muted-foreground">{result?.error ?? 'Reintenta en unos momentos.'}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)}>
            Reintentar
          </Button>
        </InlineNotice>
      </div>
    );
  } else {
    body = (
      <UsageBody
        data={data}
        agentNames={agentNames}
        modelLabels={modelLabels}
      />
    );
  }

  return (
    <Section
      title="Consumo del mes"
      description="Llamadas, tokens y costo estimado de la IA, con el estado del presupuesto."
      actions={
        <div className="grid gap-1.5 max-sm:w-full">
          <Label htmlFor={monthSelectId} className="text-meta text-muted-foreground">
            Mes
          </Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger id={monthSelectId} className="h-9 w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonth(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      <p className="sr-only" role="status" aria-live="polite">
        {data ? `Consumo de ${formatMonth(data.month)} cargado` : ''}
      </p>
      {body}
    </Section>
  );
}

interface UsageBodyProps {
  data: AiUsageSummary;
  agentNames: Record<string, string>;
  modelLabels: Record<string, string>;
}

function UsageBody({ data, agentNames, modelLabels }: UsageBodyProps): React.ReactElement {
  const { budget } = data;
  const pctText = budget.usedPct === null ? '—' : formatPct(budget.usedPct);
  const empty = data.calls === 0;

  return (
    <div className="flex flex-col gap-4">
      <StatStrip label={`Resumen de consumo de ${formatMonth(data.month)}`}>
        <StatTile label="Gasto del mes" value={formatUsd(data.costUsd)} />
        <StatTile
          label="Tope mensual"
          value={budget.budgetUsd === null ? 'Sin tope' : formatUsd(budget.budgetUsd)}
          tone="default"
        />
        <StatTile
          label="% usado"
          value={pctText}
          tone={budget.exceeded ? 'danger' : budget.alert ? 'warning' : 'default'}
        />
        <StatTile
          label="Llamadas de IA"
          value={data.calls.toLocaleString('es')}
          hint={`Entrada ${formatCompact(data.inputTokens)} · Salida ${formatCompact(data.outputTokens)} tokens`}
        />
      </StatStrip>

      {budget.budgetUsd !== null ? (
        <BudgetProgress budget={budget} />
      ) : (
        <InlineNotice tone="info" title="Sin tope mensual">
          <p className="text-muted-foreground">
            Define uno en Presupuesto para recibir avisos y frenar el gasto.
          </p>
        </InlineNotice>
      )}

      {data.unpricedCalls > 0 ? (
        <InlineNotice
          tone="warning"
          role="status"
          title={`${data.unpricedCalls.toLocaleString('es')} ${data.unpricedCalls === 1 ? 'llamada sin precio' : 'llamadas sin precio'}`}
        >
          <p className="text-muted-foreground">
            No suman al costo porque su modelo no tiene precio en el catálogo. El gasto real puede
            ser mayor.{' '}
            <a href="#catalogo-modelos" className="text-link underline underline-offset-2">
              Revisar precios
            </a>
          </p>
        </InlineNotice>
      ) : null}

      {empty ? (
        <div className="rounded-xl bg-card shadow-card">
          <EmptyState
            icon={BarChart3}
            size="compact"
            title={`Sin consumo en ${formatMonth(data.month)}`}
            description="Las llamadas de IA aparecerán aquí cuando se usen."
          />
        </div>
      ) : (
        <>
          <BreakdownBlock
            title="Por agente"
            label="Consumo por agente"
            rows={data.byAgent}
            totalCost={data.costUsd}
            nameOf={(key) => agentNames[key] ?? key}
          />
          <BreakdownBlock
            title="Por modelo"
            label="Consumo por modelo"
            rows={data.byModel}
            totalCost={data.costUsd}
            nameOf={(key) => modelLabels[key] ?? key}
            mono
          />
        </>
      )}
    </div>
  );
}

interface BreakdownBlockProps {
  title: string;
  label: string;
  rows: AiUsageBreakdown[];
  totalCost: number;
  nameOf: (key: string) => string;
  /** El id del modelo cuando no hay nombre se muestra en monoespaciada. */
  mono?: boolean;
}

/** Desglose de consumo: tabla en escritorio y tarjetas en móvil (< 768 px). */
function BreakdownBlock({
  title,
  label,
  rows,
  totalCost,
  nameOf,
  mono = false,
}: BreakdownBlockProps): React.ReactElement {
  const sorted = React.useMemo(
    () => [...rows].sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
    [rows],
  );
  const share = (row: AiUsageBreakdown): string =>
    totalCost > 0 ? formatPct((row.costUsd / totalCost) * 100) : '—';
  const nameCell = (key: string): React.ReactNode => {
    const name = nameOf(key);
    return name === key && mono ? (
      <span className="font-mono text-meta break-all">{name}</span>
    ) : (
      <span className="font-medium">{name}</span>
    );
  };

  return (
    <Section title={title} headingLevel={3} count={sorted.length}>
      <div className="rounded-xl bg-card shadow-card">
        <div className="hidden md:block">
          <Table scrollLabel={label}>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Llamadas</TableHead>
                <TableHead className="text-right">Tokens de entrada</TableHead>
                <TableHead className="text-right">Tokens de salida</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead className="text-right">% del gasto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{nameCell(row.key)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.calls.toLocaleString('es')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.inputTokens.toLocaleString('es')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.outputTokens.toLocaleString('es')}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {formatUsd(row.costUsd, 4)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{share(row)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DataCardList
          label={label}
          rows={sorted}
          getKey={(row) => row.key}
          card={(row) => ({
            title: nameCell(row.key),
            subtitle: `${row.calls.toLocaleString('es')} ${row.calls === 1 ? 'llamada' : 'llamadas'}`,
            meta: [
              { label: 'Entrada', value: `${row.inputTokens.toLocaleString('es')} tokens` },
              { label: 'Salida', value: `${row.outputTokens.toLocaleString('es')} tokens` },
              { label: 'Costo', value: formatUsd(row.costUsd, 4) },
              { label: '% del gasto', value: share(row) },
            ],
          })}
        />
      </div>
    </Section>
  );
}
