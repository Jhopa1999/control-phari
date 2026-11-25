'use client';

import * as React from 'react';
import { ClipboardList } from 'lucide-react';
import { DueBadge } from '@/components/due-badge';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { Meeting } from '@/lib/api-client';
import { formatDateOnly } from '@/lib/format';

/** Más caracteres que esto y las decisiones quedan recortadas tras «Ver todo». */
const DECISIONS_CLAMP_CHARS = 400;
/** Compromisos visibles antes de «Ver los N restantes». */
const COMMITMENTS_VISIBLE = 5;

/**
 * Resumen del acta para quien no asistió: qué se decidió y quién hace qué. Solo
 * lee lo que el acta ya trae (sin llamadas ni IA). No se pinta si el acta no
 * tiene decisiones ni compromisos.
 */
export function ActaResumen({
  meeting,
  personName,
}: {
  meeting: Meeting;
  /** Nombre de una persona del acta (los datos del acta primero). */
  personName: (id: string | null) => string;
}): React.ReactElement | null {
  const [expandedDecisions, setExpandedDecisions] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const titleId = React.useId();
  const listId = `${titleId}-lista`;
  const decisionsId = `${titleId}-decisiones`;

  const decisions = meeting.decisions?.trim() ?? '';
  const commitments = meeting.commitments;
  if (decisions === '' && commitments.length === 0) return null;

  const long = decisions.length > DECISIONS_CLAMP_CHARS;
  const visible = showAll ? commitments : commitments.slice(0, COMMITMENTS_VISIBLE);
  const hidden = commitments.length - COMMITMENTS_VISIBLE;

  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4"
    >
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 shrink-0 text-link" aria-hidden="true" />
          <h3 id={titleId} className="text-sm font-semibold text-foreground">
            Resumen
          </h3>
        </div>
        <p className="text-meta text-muted-foreground">
          Lo esencial para ponerse al día: qué se decidió y quién hace qué.
        </p>
      </div>

      <div className="grid gap-1">
        <h4 className="text-sm font-semibold text-foreground">Qué se decidió</h4>
        {decisions === '' ? (
          <p className="text-sm text-muted-foreground">No se registraron decisiones.</p>
        ) : (
          <>
            <p
              id={decisionsId}
              className={`whitespace-pre-line wrap-break-word text-sm text-foreground ${
                long && !expandedDecisions ? 'line-clamp-6' : ''
              }`}
            >
              {decisions}
            </p>
            {long ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="self-start text-link"
                aria-expanded={expandedDecisions}
                aria-controls={decisionsId}
                onClick={() => setExpandedDecisions((v) => !v)}
              >
                {expandedDecisions ? 'Ver menos' : 'Ver todo'}
              </Button>
            ) : null}
          </>
        )}
      </div>

      <div className="grid gap-2">
        <h4 className="text-sm font-semibold text-foreground">Quién hace qué</h4>
        {commitments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No se registraron compromisos.</p>
        ) : (
          <>
            <ul id={listId} className="grid gap-2">
              {visible.map((c) => {
                const who = c.assignedUserId ?? c.responsibleUserId;
                return (
                  <li
                    key={c.id}
                    className="flex flex-col gap-1 rounded-lg bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium wrap-break-word">{c.title}</p>
                      <p className="text-meta text-muted-foreground">
                        {who
                          ? `${c.assignedUserName ?? c.responsibleUserName ?? personName(who)} · Vence ${formatDateOnly(c.dueDate)}`
                          : `Sin persona asignada · Vence ${formatDateOnly(c.dueDate)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DueBadge status={c.dueStatus} daysToDue={c.daysToDue} dueDate={c.dueDate} />
                      {c.state === 'BLOQUEADO' ? <StatusBadge kind="record" value={c.state} /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {hidden > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                aria-expanded={showAll}
                aria-controls={listId}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Ver menos' : `Ver los ${hidden} restantes`}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
