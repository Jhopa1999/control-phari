'use client';

import * as React from 'react';
import { CircleCheck } from 'lucide-react';
import { ErrorState } from '@/components/error-state';
import { Section } from '@/components/section';
import { StatStrip, StatTile } from '@/components/stat-tile';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';
import { getAttention, type Attention } from '@/lib/area-control';
import type { ModuleKey } from '@/lib/navigation';

type LoadState = 'loading' | 'success' | 'error';

interface AttentionItem {
  key:
    | 'pendingTriage'
    | 'pendingNoProcess'
    | 'readyToPrioritize'
    | 'pendingApproval'
    | 'pendingTaskReviews'
    | 'overdueTasks';
  moduleKey: ModuleKey;
  href: string;
  /** Nombre del indicador (el número va aparte, en el valor del tile). */
  label: string;
  /** Tono del número: lo vencido destaca más que lo pendiente. */
  danger?: boolean;
}

/** Cada conteo enlaza a la mesa donde se atiende (los mismos destinos del menú). */
const ITEMS: AttentionItem[] = [
  {
    key: 'pendingTriage',
    moduleKey: 'triage',
    href: '/demanda/triage',
    label: 'Pendientes de triage',
  },
  {
    key: 'pendingNoProcess',
    moduleKey: 'triage',
    href: '/demanda/solicitudes?proceso=SIN_PROCESO',
    label: 'Sin proceso por triar',
  },
  {
    key: 'readyToPrioritize',
    moduleKey: 'priority',
    href: '/demanda/priorizacion',
    label: 'Listas para priorizar',
  },
  {
    key: 'pendingApproval',
    moduleKey: 'review',
    href: '/administracion/revision',
    label: 'Solicitudes por aprobar',
  },
  {
    // El servidor devuelve 0 a quien no puede aprobar: no hay lógica de rol aquí.
    key: 'pendingTaskReviews',
    moduleKey: 'assigned',
    href: '/mi-trabajo#por-aprobar',
    label: 'Tareas por aprobar',
  },
  {
    key: 'overdueTasks',
    moduleKey: 'assigned',
    href: '/mi-trabajo',
    label: 'Tareas vencidas',
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
  const [loadError, setLoadError] = React.useState<unknown>(null);

  React.useEffect(() => {
    let active = true;
    getAttention()
      .then((result) => {
        if (!active) return;
        setData(result);
        setState('success');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err);
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
      <div aria-busy="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  } else if (state === 'error' || data === null) {
    content = (
      <div className="overflow-hidden rounded-xl border bg-card">
        <ErrorState
          title="No fue posible cargar lo que requiere tu atención."
          error={loadError}
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
      <StatStrip label="Pendientes de hoy en tu alcance">
        {visible.map((item) => (
          <StatTile
            key={item.key}
            label={item.label}
            value={NUMBER_FORMAT.format(data[item.key])}
            tone={item.danger ? 'danger' : 'default'}
            href={item.href}
          />
        ))}
      </StatStrip>
    );
  }

  return (
    <Section
      title="Requiere tu atención"
      description="Pendientes de hoy en tu alcance."
    >
      {content}
    </Section>
  );
}
