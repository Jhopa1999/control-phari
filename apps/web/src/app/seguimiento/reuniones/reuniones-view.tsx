'use client';

import { ModuleGate } from '@/components/module-gate';
import { NO_ACCESS_COPY } from '@/components/no-access-notice';
import * as React from 'react';
import { FileText, Handshake, ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { CoordinationPerson, Process } from '@/lib/api-client';
import { countOpenCommitments } from '@/lib/commitments';
import { countMeetings, listOpenCommitmentsOfMyMeetings } from '@/lib/meetings';
import { listProcesses } from '@/lib/team';
import { listCoordinationPeople } from '@/lib/worklog';
import { ActasPanel } from './actas-panel';
import { CompromisosMisReunionesPanel } from './compromisos-mis-reuniones-panel';
import { CompromisosPanel } from './compromisos-panel';

type Tab = 'actas' | 'compromisos' | 'mis-abiertos';
export type LoadState = 'loading' | 'success' | 'error';

/** Datos compartidos por las pestañas (una sola carga); las listas se piden por página en cada una. */
export interface CoordinationData {
  processes: Process[];
  people: CoordinationPerson[];
  /** Totales sin búsqueda ni filtros (null si no se pudieron cargar). */
  totals: { meetings: number | null; openCommitments: number | null };
  state: LoadState;
  error: unknown;
  /** Vuelve a leer los totales y el conteo de vencidos tras un cambio. */
  reload: () => Promise<void>;
}

/** Pestaña que no encoge y de 44 px con puntero táctil; la lista hace scroll propio en móvil. */
const TAB_TRIGGER = 'shrink-0 pointer-coarse:h-11';

function parseTab(value: string | null): Tab {
  return value === 'compromisos' || value === 'mis-abiertos' ? value : 'actas';
}

function readParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Reuniones y compromisos (módulo unificado `meeting`): control de actas de
 * reunión y de los compromisos que salen de ellas. Pestaña «Actas» (cada acta
 * con su lista de compromisos) y «Compromisos» (seguimiento consolidado, con o
 * sin acta). La pestaña activa y la selección viajan en la URL
 * (`?tab=compromisos&commitmentId=…` o `?meetingId=…`) para los enlaces de las
 * notificaciones.
 */
function ReunionesViewContent(): React.ReactElement {
  const [tab, setTab] = React.useState<Tab>('actas');
  const [initialMeetingId, setInitialMeetingId] = React.useState<string | null>(null);
  const [initialCommitmentId, setInitialCommitmentId] = React.useState<string | null>(null);

  const [totals, setTotals] = React.useState<CoordinationData['totals']>({
    meetings: null,
    openCommitments: null,
  });
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  // Conteo de vencidos de «Mis compromisos abiertos» para la pestaña (null si no se pudo cargar).
  const [myOverdue, setMyOverdue] = React.useState<number | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const tabsListRef = React.useRef<HTMLDivElement>(null);
  // Hueco a la derecha de las pestañas donde «Actas» pone «Nueva acta».
  const [actionSlot, setActionSlot] = React.useState<HTMLDivElement | null>(null);
  // Con scroll propio en la lista de pestañas, la activa se lleva a la vista (también si cambia por código).
  React.useEffect(() => {
    tabsListRef.current
      ?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee la pestaña y los ids de la URL tras montar (window no existe en el servidor).
    setTab(parseTab(readParam('tab')));
    setInitialMeetingId(readParam('meetingId'));
    setInitialCommitmentId(readParam('commitmentId'));
  }, []);

  const reload = React.useCallback(() => {
    return Promise.all([
      countMeetings().catch(() => null),
      countOpenCommitments().catch(() => null),
      listProcesses().catch(() => [] as Process[]),
      listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
      listOpenCommitmentsOfMyMeetings()
        .then((res) => res.counts.vencido)
        .catch(() => null),
    ])
      .then(([meetingsTotal, openTotal, procs, ppl, overdue]) => {
        setMyOverdue(overdue);
        setTotals({ meetings: meetingsTotal, openCommitments: openTotal });
        setProcesses(procs);
        setPeople(ppl);
        setError(null);
        setState('success');
      })
      .catch((err: unknown) => {
        setError(err);
        setState('error');
      });
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  function changeTab(next: string): void {
    const value = parseTab(next);
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    url.searchParams.delete('meetingId');
    url.searchParams.delete('commitmentId');
    window.history.replaceState(null, '', url.toString());
  }

  const data: CoordinationData = { processes, people, totals, state, error, reload };

  return (
    <PageLayout>
      <PageHeader
        title="Reuniones y compromisos"
        description="Actas de reunión con sus participantes, agenda y decisiones, y el seguimiento de los compromisos acordados."
      />
      <Tabs value={tab} onValueChange={changeTab} className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList
          ref={tabsListRef}
          aria-label="Vistas de reuniones y compromisos"
          className="max-w-full overflow-x-auto pb-px"
        >
          <TabsTrigger value="actas" className={TAB_TRIGGER}>
            <FileText aria-hidden="true" />
            Actas
            {totals.meetings !== null ? (
              <span className="text-muted-foreground">{` (${totals.meetings})`}</span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="compromisos" className={TAB_TRIGGER}>
            <Handshake aria-hidden="true" />
            Compromisos
            {totals.openCommitments !== null ? (
              <span className="text-muted-foreground">{` (${totals.openCommitments} abiertos)`}</span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="mis-abiertos" className={TAB_TRIGGER}>
            <ListChecks aria-hidden="true" />
            Mis compromisos abiertos
            {myOverdue !== null && myOverdue > 0 ? (
              <Badge variant="danger" className="tabular-nums">
                {myOverdue}
                <span className="sr-only"> vencidos</span>
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <div ref={setActionSlot} className="flex items-center gap-2" />
        </div>
        <TabsContent value="actas" className="mt-3">
          <ActasPanel
            data={data}
            actionSlot={actionSlot}
            initialMeetingId={initialMeetingId}
            onOpenCommitment={(id) => {
              setInitialCommitmentId(id);
              setTab('compromisos');
            }}
          />
        </TabsContent>
        <TabsContent value="compromisos">
          <CompromisosPanel
            data={data}
            initialCommitmentId={initialCommitmentId}
            onOpenMeeting={(id) => {
              setInitialMeetingId(id);
              setTab('actas');
            }}
          />
        </TabsContent>
        <TabsContent value="mis-abiertos">
          <CompromisosMisReunionesPanel
            data={data}
            onOpenMeeting={(id) => {
              setInitialMeetingId(id);
              setTab('actas');
            }}
            onOpenCommitment={(id) => {
              setInitialCommitmentId(id);
              setTab('compromisos');
            }}
          />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}

export function ReunionesView(): React.ReactElement {
  return (
    <ModuleGate
      moduleKey="meeting"
      title="Reuniones y compromisos"
      description="Actas de reunión con sus participantes, agenda y decisiones, y el seguimiento de los compromisos acordados."
      copy={NO_ACCESS_COPY.meeting}
    >
      <ReunionesViewContent />
    </ModuleGate>
  );
}
