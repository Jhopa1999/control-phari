'use client';

import * as React from 'react';
import { Search, TriangleAlert, UserCheck, Users, X } from 'lucide-react';
import { FieldSet } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { CoordinationPerson } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/** Con más personas que esto aparece el buscador. */
const SEARCH_THRESHOLD = 8;

export type PeopleLoadState = 'idle' | 'loading' | 'error' | 'ready';

export interface SavedParticipant {
  id: string;
  name: string;
}

interface ParticipantesFieldProps {
  loadState: PeopleLoadState;
  /** Personas del proceso elegido (candidatas a participante). */
  people: CoordinationPerson[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** El responsable ya ve el acta: se marca en la lista, sin casilla propia. */
  responsibleUserId: string;
  myId: string | null;
  /** Participantes guardados en el acta (edición): conservan su nombre aunque dejen el proceso. */
  saved: SavedParticipant[];
  onRetry: () => void;
}

const BADGE_BASE = 'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '');
  return letters.toUpperCase();
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'es');
}

/**
 * Selector de participantes del acta: personas del proceso elegido, con chips de
 * lo marcado, buscador cuando son muchas y estados de carga, vacío y error.
 * La lista la decide la API (`GET /coordination/people?processId=`); aquí solo
 * se presenta.
 */
export function ParticipantesField({
  loadState,
  people,
  selectedIds,
  onChange,
  responsibleUserId,
  myId,
  saved,
  onRetry,
}: ParticipantesFieldProps): React.ReactElement {
  const [query, setQuery] = React.useState('');

  const inProcess = new Set(people.map((p) => p.id));
  // Guardados que ya no son del proceso: arriba y marcados, para poder quitarlos.
  const stale = saved.filter((s) => !inProcess.has(s.id)).sort(byName);
  const rows: Array<{ id: string; name: string; stale: boolean }> = [
    ...stale.map((s) => ({ ...s, stale: true })),
    ...[...people].sort(byName).map((p) => ({ id: p.id, name: p.name, stale: false })),
  ];
  const nameOf = (id: string): string =>
    rows.find((r) => r.id === id)?.name ?? saved.find((s) => s.id === id)?.name ?? 'Participante sin nombre disponible';

  const needle = query.trim().toLocaleLowerCase('es');
  const visible = needle ? rows.filter((r) => r.name.toLocaleLowerCase('es').includes(needle)) : rows;
  const showSearch = people.length > SEARCH_THRESHOLD;
  const count = selectedIds.length;

  function toggle(id: string): void {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  let body: React.ReactNode;
  if (loadState === 'idle') {
    body = (
      <p id="reu-participants-wait" className="text-meta text-muted-foreground">
        Elige primero un proceso para ver a sus integrantes.
      </p>
    );
  } else if (loadState === 'loading') {
    body = (
      <div className="flex flex-col gap-1 rounded-md border border-input bg-card px-1 py-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        ))}
      </div>
    );
  } else if (loadState === 'error') {
    body = (
      <InlineNotice
        tone="danger"
        role="alert"
        action={
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        }
      >
        No pudimos cargar las personas del proceso. Intenta de nuevo.
      </InlineNotice>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="flex items-start gap-3 rounded-md border border-dashed px-3 py-3 text-sm">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-subtle text-link">
          <Users className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium">Este proceso no tiene más personas</p>
          <p className="text-muted-foreground">
            Pídele a la persona líder o a la jefatura que agregue integrantes al proceso.
          </p>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        {showSearch ? (
          <div className="relative">
            <label htmlFor="reu-participants-search" className="sr-only">
              Buscar persona
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="reu-participants-search"
              type="search"
              className="pl-9"
              placeholder="Buscar por nombre"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        ) : null}
        <div className="max-h-48 overflow-y-auto rounded-md border border-input bg-card px-1 py-1 sm:max-h-56">
          {visible.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              <p>Ninguna persona coincide. Revisa el nombre o borra la búsqueda.</p>
              <Button type="button" variant="link" size="sm" onClick={() => setQuery('')}>
                Borrar búsqueda
              </Button>
            </div>
          ) : (
            <ul className={cn(rows.length > 12 && 'sm:grid sm:grid-cols-2')}>
              {visible.map((row) => {
                const checked = selectedIds.includes(row.id);
                return (
                  <li key={row.id}>
                    <label
                      className={cn(
                        'flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted pointer-coarse:min-h-11',
                        checked && 'bg-primary-subtle/60',
                      )}
                    >
                      <Checkbox checked={checked} onChange={() => toggle(row.id)} />
                      <span
                        className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-subtle text-xs font-semibold text-link"
                        aria-hidden="true"
                      >
                        {initialsOf(row.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={row.name}>
                        {row.name}
                        {row.id === myId ? <span className="text-muted-foreground"> (tú)</span> : null}
                      </span>
                      {row.stale ? (
                        <span className={cn(BADGE_BASE, 'border-warning-border bg-warning-subtle text-warning')}>
                          <TriangleAlert className="size-3" aria-hidden="true" />
                          Ya no está en el proceso
                        </span>
                      ) : null}
                      {row.id === responsibleUserId ? (
                        <span className={cn(BADGE_BASE, 'border-info-border bg-info-subtle text-info')}>
                          <UserCheck className="size-3" aria-hidden="true" />
                          Responsable
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="text-meta text-muted-foreground">
          El responsable ya puede ver el acta; no hace falta marcarlo.
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {needle
            ? visible.length === 0
              ? `Ninguna persona coincide con «${query.trim()}»`
              : `${visible.length} ${visible.length === 1 ? 'persona coincide' : 'personas coinciden'}`
            : ''}
        </p>
      </>
    );
  }

  return (
    <FieldSet
      id="reu-participants"
      legend={
        <span className="flex items-baseline justify-between gap-2">
          <span>Participantes</span>
          <span className="text-meta font-normal text-muted-foreground" aria-live="polite">
            {count === 1 ? '1 seleccionado' : `${count} seleccionados`}
          </span>
        </span>
      }
      kind="checkbox"
    >
      <div aria-busy={loadState === 'loading'} className="grid gap-2">
        {loadState === 'loading' ? <span className="sr-only">Cargando personas del proceso</span> : null}
        {count > 0 ? (
          <ul aria-label="Participantes seleccionados" className="flex flex-wrap gap-1.5">
            {selectedIds.map((id) => {
              const name = nameOf(id);
              return (
                <li
                  key={id}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-subtle py-0.5 pl-2.5 pr-1 text-xs font-medium text-foreground"
                >
                  <span className="max-w-[16rem] truncate" title={name}>
                    {name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar a ${name}`}
                    onClick={() => toggle(id)}
                    className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/15 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-8"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {body}
      </div>
    </FieldSet>
  );
}
