import type { Page } from '@playwright/test';
// Solo tipos: lib/api-client.ts lanza al evaluarse sin NEXT_PUBLIC_API_BASE_URL.
import type { Request } from '../../apps/web/src/lib/api-client';

/**
 * Fixtures de la oleada 3 (PR-C, móvil y accesibilidad). La BD de la CI parte
 * vacía y mostraría estados «sin datos», no las tablas ni las tarjetas; estas
 * funciones sustituyen solo el cuerpo de los GET (la petición llega a la API
 * real) y no crean ni modifican datos. Las fechas van en UTC (30-pruebas).
 */
const PROCESS_ID = '00000000-0000-4000-8000-000000000000';

function at(day: number): string {
  return new Date(Date.UTC(2026, 0, day, 12)).toISOString();
}

export function pendingApprovalFixture(count = 3): Request[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return {
      id: `00000000-0000-4000-8000-0000000001${n}`,
      code: `PRY-09${n}`,
      title: `Compromiso por aprobar e2e ${n}`,
      registeredAt: at(i + 1),
      createdAt: at(i + 1),
      updatedAt: at(i + 1),
      requesterArea: null,
      requesterName: null,
      functionalOwner: null,
      targetDate: null,
      referenceUrl: null,
      expectedResult: null,
      initialCommitmentDate: null,
      changeJustification: null,
      mainProcessId: PROCESS_ID,
      participants: [],
      operationalState: 'BACKLOG_PRIORIZADO',
      currentTriageDecision: null,
      currentScore: 80 - i * 10,
      priorityLabel: i === 0 ? 'P1' : 'P3',
    } as Request;
  });
}

export function auditFixture(count = 4): {
  data: unknown[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
} {
  const actions = ['CREATE', 'UPDATE', 'DELETE', 'UPDATE'];
  const types = ['REQUEST', 'DOCUMENT', 'ASSET', 'TASK'];
  const data = Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`,
    actorUserId: null,
    action: actions[i % actions.length],
    objectType: types[i % types.length],
    objectId: `00000000-0000-4000-8000-0000000003${String(i).padStart(2, '0')}`,
    scopeProcessId: null,
    before: null,
    after: { title: `Evento e2e ${i}` },
    createdAt: at(i + 1),
  }));
  return { data, page: 1, pageSize: 25, total: count, hasMore: false };
}

export function capacitySummaryFixture(): unknown[] {
  const base = {
    month: '2026-01',
    cargaParcial: false,
    planificado: 10,
    planSobreDisponible: false,
  };
  return [
    {
      ...base,
      userId: '00000000-0000-4000-8000-000000000401',
      userName: 'Persona sobrecargada e2e',
      disponible: 40,
      comprometido: 60,
      utilizacion: 150,
      libre: -20,
      estado: 'SOBRECARGA',
      sobrecargado: true,
      utilizacionPlan: 25,
    },
    {
      ...base,
      userId: '00000000-0000-4000-8000-000000000402',
      userName: 'Persona con holgura e2e',
      disponible: 80,
      comprometido: 20,
      utilizacion: 25,
      libre: 60,
      estado: 'OK',
      sobrecargado: false,
      utilizacionPlan: 12,
    },
  ];
}

/** Sustituye el cuerpo de un GET por `json`; el resto de métodos sigue a la API real. */
export async function mockGet(
  page: Page,
  match: (pathname: string) => boolean,
  json: unknown,
): Promise<void> {
  await page.route(
    (url) => match(url.pathname),
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, json });
    },
  );
}

/** Fixtures de las pantallas de la oleada 3 que dependen de datos. */
export async function mockOleada3Data(page: Page): Promise<void> {
  await mockGet(page, (p) => p.endsWith('/requests/pending-approval'), pendingApprovalFixture());
  // «Planes por autorizar» pide un plan por cada solicitud en planificación;
  // con la BD de desarrollo llena eso tarda. Sin solicitudes, la sección queda vacía.
  await page.route(
    (url) => url.pathname.endsWith('/requests') && url.searchParams.get('state') === 'EN_PLANIFICACION',
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: [] });
    },
  );
  await mockGet(page, (p) => p.endsWith('/audit-events'), auditFixture());
  await mockGet(page, (p) => p.endsWith('/capacity/summary'), capacitySummaryFixture());
}
