'use client';

import * as React from 'react';
import { FileText, Handshake } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Commitment, CoordinationPerson, Meeting, Process } from '@/lib/api-client';
import { CommitmentError, listCommitments } from '@/lib/commitments';
import { MeetingError, listMeetings } from '@/lib/meetings';
import { listProcesses } from '@/lib/team';
import { listCoordinationPeople } from '@/lib/worklog';
import { ActasPanel } from './actas-panel';
import { CompromisosPanel } from './compromisos-panel';

type Tab = 'actas' | 'compromisos';
export type LoadState = 'loading' | 'success' | 'error';

/** Datos compartidos por las dos pestañas (una sola carga). */
export interface CoordinationData {
  meetings: Meeting[];
  commitments: Commitment[];
  processes: Process[];
  people: CoordinationPerson[];
  state: LoadState;
  error: string | null;
  reload: () => Promise<void>;
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
export function ReunionesView(): React.ReactElement {
  const [tab, setTab] = React.useState<Tab>('actas');
  const [initialMeetingId, setInitialMeetingId] = React.useState<string | null>(null);
  const [initialCommitmentId, setInitialCommitmentId] = React.useState<string | null>(null);

  const [meetings, setMeetings] = React.useState<Meeting[]>([]);
  const [commitments, setCommitments] = React.useState<Commitment[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee la pestaña y los ids de la URL tras montar (window no existe en el servidor).
    setTab(readParam('tab') === 'compromisos' ? 'compromisos' : 'actas');
    setInitialMeetingId(readParam('meetingId'));
    setInitialCommitmentId(readParam('commitmentId'));
  }, []);

  const reload = React.useCallback(() => {
    return Promise.all([
      listMeetings(),
      listCommitments(),
      listProcesses().catch(() => [] as Process[]),
      listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
    ])
      .then(([mts, cmts, procs, ppl]) => {
        setMeetings(mts);
        setCommitments(cmts);
        setProcesses(procs);
        setPeople(ppl);
        setError(null);
        setState('success');
      })
      .catch((err: unknown) => {
        setError(
          err instanceof MeetingError || err instanceof CommitmentError ? err.message : null,
        );
        setState('error');
      });
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  function changeTab(next: string): void {
    const value: Tab = next === 'compromisos' ? 'compromisos' : 'actas';
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    url.searchParams.delete('meetingId');
    url.searchParams.delete('commitmentId');
    window.history.replaceState(null, '', url.toString());
  }

  const data: CoordinationData = { meetings, commitments, processes, people, state, error, reload };
  const openCommitments = commitments.filter(
    (c) => c.state !== 'COMPLETADO' && c.state !== 'ARCHIVADO',
  ).length;

  return (
    <PageLayout>
      <PageHeader
        title="Reuniones y compromisos"
        description="Actas de reunión con sus participantes, agenda y decisiones, y el seguimiento de los compromisos acordados."
      />
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="Vistas de reuniones y compromisos">
          <TabsTrigger value="actas">
            <FileText aria-hidden="true" />
            Actas
            {state === 'success' ? <span className="text-muted-foreground">{` (${meetings.length})`}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="compromisos">
            <Handshake aria-hidden="true" />
            Compromisos
            {state === 'success' ? (
              <span className="text-muted-foreground">{` (${openCommitments} abiertos)`}</span>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="actas">
          <ActasPanel
            data={data}
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
      </Tabs>
    </PageLayout>
  );
}
