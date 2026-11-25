'use client';

import * as React from 'react';
import { Sparkles, TriangleAlert } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CoordinationPerson, MeetingAiProposal } from '@/lib/api-client';

/** Compromiso aceptado en la vista previa; se crea después de guardar el acta. */
export interface PendingCommitment {
  key: string;
  title: string;
  /** Vacío si no tiene responsable. */
  assignedUserId: string;
  assignedUserName: string;
  /** YYYY-MM-DD. */
  dueDate: string;
  expectedResult: string;
}

type SectionKey = 'agenda' | 'decisions' | 'notes';

const SECTIONS: ReadonlyArray<{ key: SectionKey; legend: string; empty: string; label: string }> = [
  { key: 'agenda', legend: 'Agenda', empty: 'agenda', label: 'Agenda propuesta' },
  { key: 'decisions', legend: 'Decisiones y acuerdos', empty: 'decisiones', label: 'Decisiones y acuerdos propuestos' },
  { key: 'notes', legend: 'Observaciones', empty: 'observaciones', label: 'Observaciones propuestas' },
];

const SECTION_NAMES: Record<SectionKey, string> = {
  agenda: 'Agenda',
  decisions: 'Decisiones y acuerdos',
  notes: 'Observaciones',
};

export interface AppliedProposal {
  /** Campos del acta que se llenan (ya combinados con lo que había). */
  fields: Partial<Record<SectionKey, string>>;
  commitments: PendingCommitment[];
}

interface ActaIaPreviewProps {
  proposal: MeetingAiProposal;
  /** Personas del proceso (las mismas del selector de responsable). */
  people: CoordinationPerson[];
  /** Lo que la persona ya escribió en el acta. */
  current: Record<SectionKey, string>;
  /** Sube cada vez que el diálogo pide descartar (tecla Escape). */
  discardRequest: number;
  onDiscard: () => void;
  onApply: (applied: AppliedProposal) => void;
}

interface CardState {
  title: string;
  assignedUserId: string;
  assigneeText: string | null;
  dueDate: string;
  expectedResult: string;
  sourceQuote: string;
  accepted: boolean;
}

interface SectionState {
  text: string;
  use: boolean;
  mode: 'append' | 'replace';
}

const SIN_VALOR = '__none__';
const CHIP_WARNING =
  'inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning';

/**
 * Vista previa de la propuesta de IA (segunda vista del diálogo del acta). Nada
 * se guarda aquí: «Usar en el acta» devuelve los campos y los compromisos
 * aceptados al formulario, y la persona guarda el acta como siempre.
 */
export function ActaIaPreview({
  proposal,
  people,
  current,
  discardRequest,
  onDiscard,
  onApply,
}: ActaIaPreviewProps): React.ReactElement {
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const [sections, setSections] = React.useState<Record<SectionKey, SectionState>>(() => ({
    agenda: { text: proposal.agenda, use: proposal.agenda.trim() !== '', mode: 'append' },
    decisions: { text: proposal.decisions, use: proposal.decisions.trim() !== '', mode: 'append' },
    notes: { text: proposal.notes, use: proposal.notes.trim() !== '', mode: 'append' },
  }));
  const [cards, setCards] = React.useState<CardState[]>(() =>
    proposal.commitments.map((c) => ({
      title: c.title,
      assignedUserId: c.assignedUserId ?? '',
      assigneeText: c.assigneeText,
      dueDate: c.dueDate ?? '',
      expectedResult: c.expectedResult ?? '',
      sourceQuote: c.sourceQuote,
      // Todas nacen sin aceptar: no hay «Aceptar todos».
      accepted: false,
    })),
  );
  const [errors, setErrors] = React.useState<Array<{ title?: string; dueDate?: string }>>([]);
  const [showErrorNotice, setShowErrorNotice] = React.useState(false);
  const [edited, setEdited] = React.useState(false);
  // La confirmación se abre con el botón o con Escape (discardRequest) si hubo ediciones.
  const [buttonConfirm, setButtonConfirm] = React.useState(false);
  const [ackedRequest, setAckedRequest] = React.useState(discardRequest);
  const confirmOpen = buttonConfirm || (edited && discardRequest > ackedRequest);

  React.useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const hasSections = SECTIONS.some((s) => (proposal[s.key] ?? '').trim() !== '');
  const isEmpty = !hasSections && proposal.commitments.length === 0;
  const usedSections = SECTIONS.filter((s) => sections[s.key].use && sections[s.key].text.trim() !== '');
  const acceptedCount = cards.filter((c) => c.accepted).length;
  const nothingToUse = usedSections.length === 0 && acceptedCount === 0;

  function requestDiscard() {
    if (edited) setButtonConfirm(true);
    else onDiscard();
  }

  // Escape (interceptado por el diálogo) pide descartar; sube `discardRequest`.
  const lastRequest = React.useRef(discardRequest);
  React.useEffect(() => {
    if (discardRequest === lastRequest.current) return;
    lastRequest.current = discardRequest;
    // Con ediciones, el aviso de confirmación se abre solo (ver `confirmOpen`).
    if (!edited) onDiscard();
  }, [discardRequest, edited, onDiscard]);

  function updateSection(key: SectionKey, patch: Partial<SectionState>) {
    setSections((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function updateCard(index: number, patch: Partial<CardState>) {
    setCards((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    setErrors((prev) => prev.map((e, i) => (i === index ? {} : e)));
  }

  function handleApply() {
    const nextErrors = cards.map((c) => {
      if (!c.accepted) return {};
      return {
        title: c.title.trim() ? undefined : 'El título es obligatorio.',
        dueDate: c.dueDate ? undefined : 'Elige la fecha límite del compromiso.',
      };
    });
    const firstBad = nextErrors.findIndex((e) => e.title || e.dueDate);
    setErrors(nextErrors);
    setShowErrorNotice(firstBad !== -1);
    if (firstBad !== -1) {
      const field = nextErrors[firstBad].title ? 'title' : 'date';
      document.getElementById(`reu-ia-c${firstBad}-${field}`)?.focus();
      return;
    }
    const fields: AppliedProposal['fields'] = {};
    for (const s of usedSections) {
      const { text, mode } = sections[s.key];
      const before = current[s.key].trim();
      fields[s.key] = mode === 'append' && before ? `${current[s.key].trimEnd()}\n\n${text.trim()}` : text.trim();
    }
    const commitments: PendingCommitment[] = cards
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.accepted)
      .map(({ c, i }) => ({
        key: `${Date.now()}-${i}`,
        title: c.title.trim(),
        assignedUserId: c.assignedUserId,
        assignedUserName: people.find((p) => p.id === c.assignedUserId)?.name ?? '',
        dueDate: c.dueDate,
        expectedResult: c.expectedResult.trim(),
      }));
    onApply({ fields, commitments });
  }

  const summaryParts: string[] = [];
  if (usedSections.length > 0) {
    summaryParts.push(usedSections.length === 1 ? '1 sección' : `${usedSections.length} secciones`);
  }
  if (acceptedCount > 0) {
    summaryParts.push(acceptedCount === 1 ? '1 compromiso' : `${acceptedCount} compromisos`);
  }
  const summary = nothingToUse
    ? 'Marca al menos una sección o un compromiso para continuar.'
    : `Se usarán ${summaryParts.join(' y ')}.`;

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            Revisa lo que propone la IA
          </DialogTitle>
          <span className="inline-flex items-center gap-1 rounded-full border border-info-border bg-info-subtle px-2 py-0.5 text-xs font-medium text-info">
            <Sparkles className="size-3" aria-hidden="true" />
            Generado con IA
          </span>
        </div>
        <DialogDescription>
          Nada se guarda todavía. Elige qué usar y edita lo que haga falta; después guardas el acta
          como siempre.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="grid gap-5">
        <span className="sr-only" role="status">
          {`Propuesta lista: ${SECTIONS.filter((s) => (proposal[s.key] ?? '').trim() !== '').length} secciones del acta y ${proposal.commitments.length} compromisos para revisar.`}
        </span>
        <InlineNotice tone="neutral" role="note" icon={Sparkles}>
          Señal orientativa: nada se registra por sí solo. Revisa y confirma antes de usar el
          resultado.
        </InlineNotice>

        {proposal.warnings.length > 0 ? (
          <InlineNotice tone="warning" role="note" title="La IA tuvo dudas">
            <ul className="list-disc pl-4">
              {proposal.warnings.map((w, i) => (
                <li key={i} className="break-words">
                  {w}
                </li>
              ))}
            </ul>
          </InlineNotice>
        ) : null}

        {isEmpty ? (
          <EmptyState
            icon={Sparkles}
            size="compact"
            title="La IA no encontró nada que ordenar"
            description="Prueba con un texto más completo o escribe el acta a mano."
            action={
              <Button type="button" variant="outline" onClick={onDiscard}>
                Volver a mis notas
              </Button>
            }
          />
        ) : (
          <>
            <section className="grid gap-3" aria-labelledby="reu-ia-acta-title">
              <h3 id="reu-ia-acta-title" className="text-sm font-semibold text-foreground">
                Acta reestructurada
              </h3>
              {SECTIONS.map((s) => {
                const state = sections[s.key];
                const proposed = (proposal[s.key] ?? '').trim() !== '';
                const hasPrevious = current[s.key].trim() !== '';
                return (
                  <fieldset
                    key={s.key}
                    className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <legend className="px-1 text-sm font-semibold text-foreground">{s.legend}</legend>
                    {proposed ? (
                      <Textarea
                        aria-label={s.label}
                        className="min-h-24 resize-y"
                        value={state.text}
                        onChange={(e) => {
                          updateSection(s.key, { text: e.target.value });
                          setEdited(true);
                        }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        La IA no encontró {s.empty} en el texto.
                      </p>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium pointer-coarse:min-h-11">
                        <Checkbox
                          checked={state.use && proposed}
                          disabled={!proposed}
                          onChange={(e) => updateSection(s.key, { use: e.target.checked })}
                        />
                        Usar en el acta
                      </label>
                      {proposed && hasPrevious ? (
                        <div className="grid gap-1 sm:w-60">
                          <Select
                            value={state.mode}
                            onValueChange={(v) =>
                              updateSection(s.key, { mode: v === 'replace' ? 'replace' : 'append' })
                            }
                          >
                            <SelectTrigger
                              aria-label={`Qué hacer con lo que ya escribiste en ${SECTION_NAMES[s.key]}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="append">Agregar al final</SelectItem>
                              <SelectItem value="replace">Reemplazar lo que escribí</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-meta text-muted-foreground">Ya escribiste en este campo.</p>
                        </div>
                      ) : null}
                    </div>
                  </fieldset>
                );
              })}
            </section>

            <section className="grid gap-3" aria-labelledby="reu-ia-comp-title">
              <div className="flex items-center justify-between gap-2">
                <h3 id="reu-ia-comp-title" className="text-sm font-semibold text-foreground">
                  Compromisos propuestos ({cards.length})
                </h3>
                <span aria-live="polite" className="text-meta text-muted-foreground">
                  {acceptedCount} de {cards.length} aceptados
                </span>
              </div>
              {cards.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  La IA no encontró compromisos en el texto. Puedes agregarlos después desde el acta.
                </p>
              ) : (
                <>
                  <p className="text-meta text-muted-foreground">
                    Acepta cada compromiso por separado. Los que no aceptes se descartan. Al guardar el
                    acta se crean y cada persona recibe su aviso.
                  </p>
                  {showErrorNotice ? (
                    <InlineNotice tone="danger" role="alert">
                      Revisa los compromisos aceptados: faltan datos obligatorios.
                    </InlineNotice>
                  ) : null}
                  <ul className="grid gap-3">
                    {cards.map((c, i) => (
                      <li key={i}>
                        <fieldset
                          className={`grid min-w-0 gap-3 rounded-lg border p-3 ${
                            c.accepted
                              ? 'border-primary bg-primary-subtle/40'
                              : 'border-border bg-card'
                          }`}
                        >
                          <legend className="sr-only">
                            Compromiso {i + 1} de {cards.length}
                          </legend>
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium pointer-coarse:min-h-11">
                              <Checkbox
                                checked={c.accepted}
                                onChange={(e) => updateCard(i, { accepted: e.target.checked })}
                              />
                              Aceptar este compromiso
                            </label>
                            <span className="text-meta text-muted-foreground">
                              {i + 1} de {cards.length}
                            </span>
                          </div>
                          <Field id={`reu-ia-c${i}-title`} label="Título" required={c.accepted} error={errors[i]?.title}>
                            <Input
                              value={c.title}
                              onChange={(e) => {
                                updateCard(i, { title: e.target.value });
                                setEdited(true);
                              }}
                            />
                          </Field>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field id={`reu-ia-c${i}-person`} label="Responsable">
                              {(control) => (
                                <Select
                                  value={c.assignedUserId || SIN_VALOR}
                                  onValueChange={(v) => {
                                    updateCard(i, { assignedUserId: v === SIN_VALOR ? '' : v });
                                    setEdited(true);
                                  }}
                                >
                                  <SelectTrigger {...control}>
                                    <SelectValue placeholder="Sin responsable" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={SIN_VALOR}>Sin responsable</SelectItem>
                                    {people.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </Field>
                            <Field
                              id={`reu-ia-c${i}-date`}
                              label="Fecha límite"
                              required={c.accepted}
                              error={errors[i]?.dueDate}
                            >
                              <Input
                                type="date"
                                value={c.dueDate}
                                onChange={(e) => {
                                  updateCard(i, { dueDate: e.target.value });
                                  setEdited(true);
                                }}
                              />
                            </Field>
                          </div>
                          {c.assigneeText && !c.assignedUserId ? (
                            <p className="text-meta text-muted-foreground break-words">
                              En tus notas aparece «{c.assigneeText}», pero no coincide con nadie del
                              proceso. Elige a quién asignarlo.
                            </p>
                          ) : null}
                          {c.accepted && !c.assignedUserId ? (
                            <>
                              <span className={`${CHIP_WARNING} w-fit`}>
                                <TriangleAlert className="size-3" aria-hidden="true" />
                                Sin responsable
                              </span>
                              <p className="text-meta text-muted-foreground">
                                Sin responsable, el compromiso no aparecerá en Mi trabajo de nadie.
                              </p>
                            </>
                          ) : null}
                          {c.expectedResult ? (
                            <Field id={`reu-ia-c${i}-result`} label="Resultado esperado (opcional)">
                              <Textarea
                                className="min-h-16"
                                value={c.expectedResult}
                                onChange={(e) => {
                                  updateCard(i, { expectedResult: e.target.value });
                                  setEdited(true);
                                }}
                              />
                            </Field>
                          ) : null}
                          {c.sourceQuote ? (
                            <details>
                              <summary className="cursor-pointer rounded-sm text-meta font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                Ver la frase de tus notas
                              </summary>
                              <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-meta italic text-muted-foreground break-words">
                                {c.sourceQuote}
                              </blockquote>
                            </details>
                          ) : null}
                        </fieldset>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </>
        )}

        <p className="text-meta text-muted-foreground">
          Generado con {proposal.model}. Revisa siempre el resultado.
        </p>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={requestDiscard}>
          Descartar propuesta
        </Button>
        {isEmpty ? null : (
          <Button type="button" unavailable={nothingToUse} onClick={handleApply}>
            Usar en el acta
          </Button>
        )}
        {isEmpty ? null : (
          <p
            aria-live="polite"
            className="text-meta text-muted-foreground sm:order-first sm:mr-auto sm:self-center"
          >
            {summary}
          </p>
        )}
      </DialogFooter>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (next) return;
          setButtonConfirm(false);
          setAckedRequest(discardRequest);
        }}
        title="¿Descartar tus cambios en la propuesta?"
        description="Editaste la propuesta de la IA. Si la descartas, esos cambios se pierden."
        confirmLabel="Descartar"
        cancelLabel="Seguir revisando"
        onConfirm={onDiscard}
      />
    </>
  );
}
