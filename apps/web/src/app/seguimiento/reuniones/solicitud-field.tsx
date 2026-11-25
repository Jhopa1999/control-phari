'use client';

import * as React from 'react';
import { Field } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { SearchableSelect, type SearchableOption } from '@/components/searchable-select';
import { Button } from '@/components/ui/button';
import type { CoordinationRequest } from '@/lib/api-client';
import { listLinkableRequests } from '@/lib/related-requests';
import type { RelatedRequestValue } from '@/lib/related-request-value';

export type { RelatedRequestValue };

/** Texto cuando la solicitud guardada ya no se puede leer (nunca se muestra el UUID). */
const UNAVAILABLE_LABEL = 'No disponible';

function toOption(request: CoordinationRequest): SearchableOption {
  return {
    value: request.id,
    code: request.code,
    label: request.title,
    summary: request.title,
    idVariant: 'full',
    meta: request.closed ? (
      <span className="rounded-full border border-neutral-border bg-neutral-subtle px-2 py-0.5 text-xs font-medium text-neutral">
        Cerrada
      </span>
    ) : undefined,
  };
}

function valueToOption(value: RelatedRequestValue): SearchableOption {
  return {
    value: value.id,
    code: value.code,
    label: value.title ?? UNAVAILABLE_LABEL,
    summary: value.title ?? UNAVAILABLE_LABEL,
    idVariant: 'full',
  };
}

export interface RelatedRequestFieldProps {
  id: string;
  value: RelatedRequestValue | null;
  onChange: (value: RelatedRequestValue | null) => void;
  /** El diálogo está abierto: solo entonces se piden las solicitudes. */
  active: boolean;
  help: string;
  /** Error del servidor por la solicitud (sin acceso). */
  error?: string | null;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Campo único «Solicitud o proyecto relacionado» del acta y del compromiso.
 * Selector con búsqueda en servidor (código o título); opcional. Si no se
 * pueden cargar las opciones avisa y deja guardar sin solicitud.
 */
export function RelatedRequestField({
  id,
  value,
  onChange,
  active,
  help,
  error,
  disabled = false,
  inputRef,
}: RelatedRequestFieldProps): React.ReactElement {
  const [options, setOptions] = React.useState<SearchableOption[]>([]);
  const [truncated, setTruncated] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marca la carga antes de pedir las solicitudes.
    setLoading(true);
    listLinkableRequests(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setOptions(result.rows.map(toOption));
        setTruncated(result.truncated);
        setFailed(false);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [active, query, attempt]);

  const selected = value ? valueToOption(value) : null;

  return (
    <div className="grid gap-2">
      <Field id={id} label="Solicitud o proyecto relacionado" help={help} error={error}>
        {(control) => (
          <SearchableSelect
            {...control}
            inputRef={inputRef}
            options={options}
            selected={selected}
            onSelect={(option) =>
              onChange(
                option
                  ? { id: option.value, code: option.code ?? null, title: option.label }
                  : null,
              )
            }
            placeholder="Buscar por código o título"
            listLabel="Solicitudes y proyectos"
            clearLabel="Quitar solicitud relacionada"
            clearSearchLabel="Borrar búsqueda"
            loading={loading && options.length === 0}
            loadingLabel="Cargando solicitudes"
            disabled={disabled}
            truncated={truncated}
            onSearch={setQuery}
            emptyContent="No hay solicitudes disponibles."
          />
        )}
      </Field>
      {failed ? (
        <InlineNotice
          tone="warning"
          role="note"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </Button>
          }
        >
          No pudimos cargar las solicitudes. Puedes guardar sin relacionar una y hacerlo después.
        </InlineNotice>
      ) : null}
    </div>
  );
}
