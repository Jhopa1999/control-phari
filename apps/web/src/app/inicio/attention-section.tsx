'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { ErrorState } from '@/components/error-state';
import { Section } from '@/components/section';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import { getAttention, type Attention } from '@/lib/area-control';
import type { ModuleKey } from '@/lib/navigation';
import { cn } from '@/lib/utils';

type LoadState = 'loading' | 'success' | 'error';

interface AttentionItem {
  key: 'pendingTriage' | 'readyToPrioritize' | 'pendingApproval' | 'overdueTasks';
  moduleKey: ModuleKey;
  href: string;
  one: string;
  other: string;
  /** Tono del número: lo vencido destaca más que lo pendiente. */
  danger?: boolean;
}

/** Cada conteo enlaza a la mesa donde se atiende (los mismos destinos del menú). */
const ITEMS: AttentionItem[] = [
  {
    key: 'pendingTriage',
    moduleKey: 'triage',
    href: '/demanda/triage',
    one: 'solicitud pendiente de triage',
    other: 'solicitudes pendientes de triage',
  },
  {
    key: 'readyToPrioritize',
    moduleKey: 'priority',
    href: '/demanda/priorizacion',
    one: 'solicitud lista para priorizar',
    other: 'solicitudes listas para priorizar',
  },
  {
    key: 'pendingApproval',
    moduleKey: 'review',
    href: '/administracion/revision',
    one: 'solicitud por aprobar',
    other: 'solicitudes por aprobar',
  },
  {
    key: 'overdueTasks',
    moduleKey: 'assigned',
    href: '/mi-trabajo',
    one: 'tarea vencida',
    other: 'tareas vencidas',
    danger: true,
  },
];

const NUMBER_FORMAT = new Intl.NumberFormat('es');

/**
 * Bloque «Requiere tu atención» del Panel (BL-025). Lee los conteos de
 * GET /area-control/attention (los calcula el backend) y muestra solo los que
 * tienen trabajo, cada uno con un enlace directo a su mesa. Es un corte a hoy,
 * por eso no depende del periodo del Panel. Un módulo que el rol no tiene no
 * se enlaza ni se cuenta como pendiente propio.
 */
export function AttentionSection(): React.ReactElement {
  const { allowedModules } = useActor();
  const [data, setData] = React.useState<Attention | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    getAttention()
      .then((result) => {
        if (!active) return;
        setData(result);
        setState('success');
      })
      .catch(() => {
        if (!active) return;
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = (): void => {
    setState('loading');
    setAttempt((value) => value + 1);
  };

  const visible =
    data === null
      ? []
      : ITEMS.filter((item) => allowedModules.has(item.moduleKey) && data[item.key] > 0);

  let content: React.ReactNode;
  if (state === 'loading') {
    content = (
      <div aria-busy="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  } else if (state === 'error' || data === null) {
    content = (
      <div className="overflow-hidden rounded-xl border bg-card">
        <ErrorState
          title="No fue posible cargar lo que requiere tu atención."
          message={null}
          onRetry={retry}
        />
      </div>
    );
  } else if (visible.length === 0) {
    content = (
      <p className="flex items-center gap-2 rounded-xl bg-card p-4 text-sm text-muted-foreground shadow-card">
        <CircleCheck aria-hidden="true" className="size-4 text-success" />
        Todo al día: no hay nada pendiente en tu alcance.
      </p>
    );
  } else {
    content = (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((item) => {
          const count = data[item.key];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group flex h-full items-center justify-between gap-3 rounded-xl bg-card p-4 shadow-card transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span
                    className={cn(
                      'text-2xl font-semibold tabular-nums',
                      item.danger && 'text-danger',
                    )}
                  >
                    {NUMBER_FORMAT.format(count)}
                  </span>
                  <span className="text-meta text-muted-foreground">
                    {count === 1 ? item.one : item.other}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-link transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Section
      title="Requiere tu atención"
      description="Pendientes de hoy en tu alcance, sin importar el periodo elegido."
    >
      {content}
    </Section>
  );
}
