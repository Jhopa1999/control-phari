'use client';

import * as React from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { IdChip } from '@/components/id-chip';
import {
  flattenGroups,
  groupFiltered,
  initialActiveIndex,
  type SearchableItem,
} from '@/lib/searchable-filter';
import { cn } from '@/lib/utils';

/*
 * Selector de una opción con buscador (combobox ARIA 1.2) para listas largas.
 * Especificación: docs/design/bitacora-selectores.md.
 *
 * - El foco DOM queda siempre en el input; la opción activa se anuncia con
 *   aria-activedescendant.
 * - El listado se pinta EN LÍNEA (sin portal): dentro de un Dialog modal un
 *   popover en portal rompe el foco, Escape y el scroll lock.
 * - Escape con el listado abierto solo lo cierra. Como Radix escucha Escape en
 *   el documento, el diálogo padre debe ignorarlo mientras el combobox esté
 *   expandido (ver `isComboboxExpanded`).
 * - Estructura del listbox: ul[listbox] > li[presentation] > (encabezado +
 *   ul[group] > li[option]). Nada más dentro del listbox: el estado vacío, el
 *   aviso de truncado y la región viva van fuera.
 */

export interface SearchableOption extends SearchableItem {
  /** Valor que se devuelve al elegir (id). */
  value: string;
  /** Texto del encabezado del grupo (se toma el de la primera opción del grupo). */
  groupLabel?: string | null;
  /** Segunda línea (p. ej. proyecto y responsable de una tarea ajena). */
  secondary?: string | null;
  /** Contenido a la derecha (estado, «Cerrado»…). */
  meta?: React.ReactNode;
  /** `short` (T07) cuando el grupo ya nombra el proyecto. */
  idVariant?: 'full' | 'short';
  /** Línea de resumen bajo el input cuando está elegida (título completo). */
  summary?: string | null;
}

/** Texto del input cuando hay un valor elegido: «PRY-0012 · Título». */
export function selectedText(option: SearchableOption): string {
  return option.code ? `${option.code} · ${option.label}` : option.label;
}

/**
 * `true` si el elemento enfocado es un combobox con el listado abierto. El
 * diálogo padre lo usa en `onEscapeKeyDown` para no cerrarse con ese Escape.
 */
export function isComboboxExpanded(active: Element | null): boolean {
  return Boolean(active?.matches('[role="combobox"][aria-expanded="true"]'));
}

const PAGE_STEP = 8;
const ANNOUNCE_DELAY_MS = 250;
const SEARCH_DELAY_MS = 250;

export interface SearchableSelectProps {
  /** Id del input (el de Field). */
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  options: readonly SearchableOption[];
  /** Opción elegida (objeto completo: no depende de que siga en `options`). */
  selected: SearchableOption | null;
  onSelect: (option: SearchableOption | null) => void;
  placeholder: string;
  /** Nombre accesible del listado (p. ej. «Proyectos»). */
  listLabel: string;
  /** Etiqueta del botón de quitar la selección. */
  clearLabel: string;
  /** Etiqueta del botón cuando solo hay texto de búsqueda. */
  clearSearchLabel: string;
  /** Cargando: sin selección deshabilita; con selección es de solo lectura. */
  loading?: boolean;
  loadingLabel?: string;
  loadingPlaceholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Contenido del estado «sin opciones» (antes de buscar). */
  emptyContent?: React.ReactNode;
  /** La lista llegó recortada: se muestra el pie y se llama a `onSearch`. */
  truncated?: boolean;
  truncatedMessage?: string;
  /** Búsqueda en servidor (con antirrebote) cuando la lista está recortada. */
  onSearch?: (query: string) => void;
  /** Texto extra que la región viva anuncia (cambios automáticos de valor). */
  announcement?: string | null;
  /** Ref al input (foco al primer error). */
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

export function SearchableSelect({
  id,
  'aria-describedby': describedByProp,
  'aria-invalid': invalid,
  'aria-required': required,
  options,
  selected,
  onSelect,
  placeholder,
  listLabel,
  clearLabel,
  clearSearchLabel,
  loading = false,
  loadingLabel = 'Cargando opciones',
  loadingPlaceholder = 'Cargando opciones…',
  disabled = false,
  readOnly = false,
  emptyContent,
  truncated = false,
  truncatedMessage = 'Mostrando las primeras 200. Escribe para acotar.',
  onSearch,
  announcement,
  inputRef,
  className,
}: SearchableSelectProps): React.ReactElement {
  const listboxId = `${id}-listbox`;
  const summaryId = `${id}-summary`;
  const [open, setOpen] = React.useState(false);
  // null = no se está escribiendo: el input muestra el valor elegido.
  const [query, setQuery] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(-1);
  const [announced, setAnnounced] = React.useState('');
  const [selMax, setSelMax] = React.useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const localInputRef = React.useRef<HTMLInputElement>(null);
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchedRef = React.useRef(false);

  const inert = disabled || (loading && !selected);
  const locked = readOnly || (loading && Boolean(selected));
  const effectiveQuery = open && query !== null ? query : '';
  const groups = React.useMemo(
    () => groupFiltered(options, effectiveQuery),
    [options, effectiveQuery],
  );
  const flat = React.useMemo(() => flattenGroups(groups), [groups]);
  const indexByValue = React.useMemo(
    () => new Map(flat.map((option, index) => [option.value, index])),
    [flat],
  );
  const hasGroups = groups.some((g) => g.key !== null);
  const activeIndex = active >= 0 && active < flat.length ? active : -1;
  const optionId = (index: number) => `${id}-opt-${index}`;

  // --- Anuncios (región viva, con antirrebote) -----------------------------
  let statusText = '';
  if (loading) statusText = loadingLabel;
  else if (open) {
    statusText =
      flat.length === 0
        ? 'Sin resultados'
        : flat.length === 1
          ? '1 resultado'
          : `${flat.length} resultados`;
  }
  const liveText = [announcement, statusText].filter(Boolean).join('. ');
  React.useEffect(() => {
    const timer = setTimeout(() => setAnnounced(liveText), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [liveText]);

  // La opción activa siempre queda a la vista.
  React.useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(`${id}-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, id]);

  // Teclado virtual: el alto del listado se limita al viewport visual.
  React.useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const input = localInputRef.current;
      if (!input) return;
      const bottom = input.getBoundingClientRect().bottom - viewport.offsetTop;
      setSelMax(Math.max(120, Math.floor(viewport.height - bottom - 8)));
      input.scrollIntoView({ block: 'nearest' });
    };
    const frame = requestAnimationFrame(update);
    viewport.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
    };
  }, [open]);

  React.useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  // --- Acciones --------------------------------------------------------------
  function scheduleSearch(value: string) {
    if (!truncated && !searchedRef.current) return;
    if (!onSearch) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchedRef.current = value !== '';
      onSearch(value);
    }, SEARCH_DELAY_MS);
  }

  function closeList() {
    setOpen(false);
    setQuery(null);
    setActive(-1);
    if (searchedRef.current) scheduleSearch('');
  }

  function openList(withActive: 'selected-or-first' | 'selected-or-last' | 'none') {
    setOpen(true);
    setQuery(null);
    const selectedIndex = selected
      ? flattenGroups(groupFiltered(options, '')).findIndex((o) => o.value === selected.value)
      : -1;
    const total = flattenGroups(groupFiltered(options, '')).length;
    if (withActive === 'none') setActive(selectedIndex);
    else if (selectedIndex >= 0) setActive(selectedIndex);
    else setActive(total === 0 ? -1 : withActive === 'selected-or-first' ? 0 : total - 1);
  }

  function choose(option: SearchableOption) {
    onSelect(option);
    closeList();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setQuery(value);
    setOpen(true);
    const nextFlat = flattenGroups(groupFiltered(options, value));
    setActive(initialActiveIndex(nextFlat, value));
    scheduleSearch(value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (inert || locked) return;
    const plain = !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openList('selected-or-first');
        else setActive(Math.min(flat.length - 1, activeIndex + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openList('selected-or-last');
        else setActive(activeIndex <= 0 ? (flat.length > 0 ? 0 : -1) : activeIndex - 1);
        break;
      case 'Home':
        if (open && plain) {
          event.preventDefault();
          setActive(flat.length > 0 ? 0 : -1);
        }
        break;
      case 'End':
        if (open && plain) {
          event.preventDefault();
          setActive(flat.length - 1);
        }
        break;
      case 'PageDown':
        if (open) {
          event.preventDefault();
          setActive(Math.min(flat.length - 1, Math.max(0, activeIndex) + PAGE_STEP));
        }
        break;
      case 'PageUp':
        if (open) {
          event.preventDefault();
          setActive(Math.max(0, activeIndex - PAGE_STEP));
        }
        break;
      case 'Enter':
        // Con el listado abierto Enter nunca envía el formulario.
        if (open) {
          event.preventDefault();
          if (activeIndex >= 0) choose(flat[activeIndex]);
        }
        break;
      case 'Escape':
        // Solo cierra el listado; el diálogo lo ignora mientras esté expandido.
        if (open) closeList();
        break;
      case 'Tab':
        if (open) closeList();
        break;
      default:
        break;
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (!next || !event.currentTarget.contains(next)) {
      if (open) closeList();
    }
  }

  function handleClear() {
    onSelect(null);
    setQuery('');
    setOpen(true);
    setActive(-1);
    localInputRef.current?.focus();
    if (searchedRef.current) scheduleSearch('');
  }

  const inputValue = open && query !== null ? query : selected ? selectedText(selected) : '';
  const showClear = !inert && !locked && (Boolean(selected) || (open && Boolean(query)));
  const clearText = selected && !(open && query) ? clearLabel : clearSearchLabel;
  const describedBy =
    [describedByProp, selected?.summary || selected ? summaryId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
  const noOptions = options.length === 0;
  const showEmpty = open && !loading && noOptions && !query;
  const showNoResults = open && !loading && !noOptions && flat.length === 0;

  const renderOption = (option: SearchableOption) => {
    const index = indexByValue.get(option.value) ?? -1;
    const isActive = index === activeIndex;
    const isSelected = selected?.value === option.value;
    return (
      <li
        key={option.value}
        id={optionId(index)}
        role="option"
        aria-selected={isSelected}
        data-active={isActive ? 'true' : undefined}
        onClick={() => choose(option)}
        className={cn(
          'relative flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm sm:min-h-10 pointer-coarse:min-h-11',
          isActive &&
            'bg-accent text-accent-foreground before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-link forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:before:bg-[HighlightText]',
          isSelected && 'font-medium',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          {option.code ? (
            <IdChip
              code={option.code}
              variant={option.idVariant ?? 'full'}
              copyable={false}
              className={isActive ? 'bg-card' : undefined}
            />
          ) : null}
          <span className="min-w-0 flex-1 basis-40 wrap-break-word line-clamp-2">{option.label}</span>
          {option.meta ? (
            // En la fila activa los estados van sobre una píldora de tarjeta: así conservan
            // el contraste medido de los badges (≥ 4.5:1) también sobre bg-accent.
            <span
              className={cn(
                'flex shrink-0 items-center gap-1',
                isActive && 'rounded-md bg-card',
              )}
            >
              {option.meta}
            </span>
          ) : null}
          {option.secondary ? (
            <span className="basis-full text-xs text-muted-foreground">{option.secondary}</span>
          ) : null}
        </div>
        {isSelected ? <Check className="size-4 shrink-0 text-foreground" aria-hidden="true" /> : null}
      </li>
    );
  };

  return (
    <div
      ref={containerRef}
      onBlur={handleBlur}
      aria-busy={loading || undefined}
      className={cn('relative grid gap-1.5', className)}
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={mergeRefs(localInputRef, inputRef)}
          id={id}
          role="combobox"
          type="text"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-required={required}
          disabled={inert}
          readOnly={locked}
          value={loading && !selected ? '' : inputValue}
          title={selected ? selectedText(selected) : undefined}
          placeholder={loading && !selected ? loadingPlaceholder : placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(event) => {
            if (inert || locked) return;
            if (!open) {
              openList('none');
              event.currentTarget.select();
            }
          }}
          className="h-11 w-full min-w-0 rounded-md border border-input bg-background pr-[5.5rem] pl-9 text-sm text-ellipsis text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:focus-visible:outline-danger disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground read-only:bg-muted/50 sm:h-9 pointer-coarse:h-11"
        />
        {showClear ? (
          <button
            type="button"
            aria-label={clearText}
            onClick={handleClear}
            className="absolute top-1/2 right-9 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring sm:size-9 pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        {!inert && !locked ? (
          <ChevronDown
            className={cn(
              'pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground transition-transform motion-reduce:transition-none',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {selected ? (
        <p id={summaryId} className="text-xs break-words text-muted-foreground">
          {selected.summary ?? selected.label}
        </p>
      ) : null}

      {open && flat.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={listLabel}
          onMouseDown={(event) => event.preventDefault()}
          style={selMax ? ({ '--sel-max': `${selMax}px` } as React.CSSProperties) : undefined}
          className="mt-1 max-h-[min(18rem,45dvh,var(--sel-max,18rem))] overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-sm"
        >
          {hasGroups
            ? groups.map((group, groupIndex) => {
                const headingId = `${id}-grp-${groupIndex}`;
                const label = group.items[0]?.groupLabel ?? '';
                return (
                  <li
                    key={group.key ?? `group-${groupIndex}`}
                    role="presentation"
                    className={cn(groupIndex > 0 && 'mt-1 border-t border-border/60')}
                  >
                    <div id={headingId} className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
                      {label}
                    </div>
                    <ul role="group" aria-labelledby={headingId}>
                      {group.items.map(renderOption)}
                    </ul>
                  </li>
                );
              })
            : flat.map(renderOption)}
        </ul>
      ) : (
        // El id existe siempre para que aria-controls apunte a algo válido.
        <span id={listboxId} hidden />
      )}

      {showEmpty ? (
        <div className="rounded-md border border-border bg-popover px-3 py-4 text-sm text-muted-foreground">
          {emptyContent ?? 'No hay opciones disponibles.'}
        </div>
      ) : null}
      {showNoResults ? (
        <div className="rounded-md border border-border bg-popover px-3 py-4 text-sm text-muted-foreground">
          <p>Sin resultados para “{query}”.</p>
          <p className="text-xs">Prueba con el código (PRY-0012, T07) o parte del título.</p>
        </div>
      ) : null}
      {open && truncated && flat.length > 0 ? (
        <p className="text-xs text-muted-foreground">{truncatedMessage}</p>
      ) : null}

      <div role="status" aria-live="polite" className="sr-only">
        {announced}
      </div>
    </div>
  );
}
