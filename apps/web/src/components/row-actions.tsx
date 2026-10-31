'use client';

import * as React from 'react';
import Link from 'next/link';
import { Ellipsis, LoaderCircle, type LucideIcon } from 'lucide-react';
import { DisabledHint } from '@/components/disabled-reason';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableCell } from '@/components/ui/table';
import { LabelTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface RowAction {
  key: string;
  /** Texto visible y nombre accesible. */
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  /** Ruta interna (next/link). */
  href?: string;
  disabled?: boolean;
  /** Obligatorio si `disabled` y no es transitorio (§10.3). */
  disabledReason?: string;
  /** Acción en curso: spinner + deshabilitado. */
  busy?: boolean;
  /** «Eliminando…» */
  busyLabel?: string;
  tone?: 'default' | 'danger';
  /** Por defecto: las 2 primeras en línea y el resto en el menú. */
  placement?: 'inline' | 'menu';
  /** En línea como botón solo icono (icon-sm) con aria-label y LabelTooltip. */
  iconOnly?: boolean;
  /** Id DOM del botón en línea (p. ej. para devolverle el foco al reordenar fases). */
  id?: string;
}

export interface RowActionsProps {
  actions: RowAction[];
  /** Nombre de la fila, para «Más acciones para «{rowLabel}»». */
  rowLabel: string;
  /**
   * Tarjetas móviles (BL-024): todas las acciones van al menú «…», cuyo
   * disparador mide 44 × 44 px (objetivo táctil).
   */
  menuOnly?: boolean;
}

// En densidad compacta los botones miden 28 px (por encima de los 24 px de WCAG 2.5.8).
const COMPACT_TEXT = '[[data-density=compact]_&]:h-7 [[data-density=compact]_&]:px-2';
const COMPACT_ICON = '[[data-density=compact]_&]:size-7';

/**
 * Reparte las acciones: las que fijan `placement` lo respetan; el resto ocupa
 * los huecos en línea hasta 2 y después va al menú. Con 2 acciones o menos no
 * hay menú, salvo que la vista lo pida.
 */
function splitActions(actions: RowAction[]): { inline: RowAction[]; menu: RowAction[] } {
  const inline: RowAction[] = [];
  const menu: RowAction[] = [];
  for (const action of actions) {
    if (action.placement === 'menu') menu.push(action);
    else if (action.placement === 'inline' || inline.length < 2) inline.push(action);
    else menu.push(action);
  }
  return { inline, menu };
}

function InlineAction({ action }: { action: RowAction }): React.ReactElement {
  const Icon = action.icon;
  const iconOnly = action.iconOnly === true;
  const variant = action.tone === 'danger' ? 'ghost-destructive' : 'ghost';
  const size = iconOnly ? 'icon-sm' : 'sm';
  const className = iconOnly ? COMPACT_ICON : COMPACT_TEXT;
  const iconNode = Icon ? <Icon aria-hidden="true" /> : null;

  if (action.busy) {
    return (
      <Button
        id={action.id}
        type="button"
        variant={variant}
        size={size}
        className={className}
        loading
        aria-label={iconOnly ? action.label : undefined}
      >
        {iconOnly ? null : (action.busyLabel ?? action.label)}
      </Button>
    );
  }

  const content = iconOnly ? iconNode : (
    <>
      {iconNode}
      {action.label}
    </>
  );

  // Regla con motivo: aria-disabled + DisabledHint, también si la acción es un
  // enlace (se pinta como botón: un enlace no disponible no es un enlace).
  if (action.disabled && action.disabledReason) {
    return (
      <DisabledHint reason={action.disabledReason} label={iconOnly ? action.label : undefined}>
        <Button
          id={action.id}
          type="button"
          variant={variant}
          size={size}
          className={className}
          aria-label={iconOnly ? action.label : undefined}
        >
          {content}
        </Button>
      </DisabledHint>
    );
  }

  // Sin motivo (transitorio, límite natural, sin cambios): atributo disabled.
  if (action.disabled) {
    return (
      <Button
        id={action.id}
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled
        aria-label={iconOnly ? action.label : undefined}
      >
        {content}
      </Button>
    );
  }

  const button = action.href ? (
    <Button
      asChild
      variant={variant}
      size={size}
      className={className}
      aria-label={iconOnly ? action.label : undefined}
    >
      <Link id={action.id} href={action.href}>
        {content}
      </Link>
    </Button>
  ) : (
    <Button
      id={action.id}
      type="button"
      variant={variant}
      size={size}
      className={className}
      aria-label={iconOnly ? action.label : undefined}
      onClick={action.onSelect}
    >
      {content}
    </Button>
  );
  // El tooltip de un botón solo icono repite su nombre y no lo describe.
  return iconOnly ? <LabelTooltip label={action.label}>{button}</LabelTooltip> : button;
}

function MenuAction({ action }: { action: RowAction }): React.ReactElement {
  const Icon = action.icon;
  const content = (
    <>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {action.label}
    </>
  );
  if (action.busy) {
    return (
      <DropdownMenuItem tone={action.tone} busy busyLabel={action.busyLabel}>
        {content}
      </DropdownMenuItem>
    );
  }
  if (action.disabled && action.disabledReason) {
    return (
      <DropdownMenuItem tone={action.tone} unavailableReason={action.disabledReason}>
        {content}
      </DropdownMenuItem>
    );
  }
  if (action.disabled) {
    return (
      <DropdownMenuItem tone={action.tone} disabled>
        {content}
      </DropdownMenuItem>
    );
  }
  if (action.href) {
    return (
      <DropdownMenuItem tone={action.tone} asChild>
        <Link href={action.href}>{content}</Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem tone={action.tone} onSelect={() => action.onSelect?.()}>
      {content}
    </DropdownMenuItem>
  );
}

/**
 * Acciones de una fila (design §7.6): hasta 2 en línea (ghost sm, o
 * ghost-destructive) y el resto en «Más acciones». El disparador del menú no
 * lleva tooltip: Radix le devuelve el foco al cerrarse y el tooltip se abriría
 * solo (§14). Con alguna acción del menú en curso, el disparador muestra
 * LoaderCircle y aria-busy, y sigue habilitado.
 */
export function RowActions({
  actions,
  rowLabel,
  menuOnly = false,
}: RowActionsProps): React.ReactElement {
  const { inline, menu } = menuOnly
    ? { inline: [] as RowAction[], menu: actions }
    : splitActions(actions);
  const menuBusy = menu.some((action) => action.busy);
  return (
    <div className="flex justify-end gap-1">
      {inline.map((action) => (
        <InlineAction key={action.key} action={action} />
      ))}
      {menu.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn(COMPACT_ICON, menuOnly && 'size-11')}
              aria-label={`Más acciones para «${rowLabel}»`}
              aria-busy={menuBusy ? true : undefined}
            >
              {menuBusy ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Ellipsis aria-hidden="true" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {menu.map((action) => (
              <MenuAction key={action.key} action={action} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/**
 * Celda de acciones: toda columna de acciones la usa, con TableHead «Acciones»
 * alineado a la derecha. Sin relleno vertical: el borde de 1 px de la fila se
 * suma al contenido, así que el botón de 32 px (28 px en compacta) cabe en la
 * fila de 40 px (32 px) sin agrandarla; con py-1 mediría 41 px.
 */
export function RowActionsCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <TableCell
      className={cn(
        'w-px py-0 text-right whitespace-nowrap [[data-density=compact]_&]:py-0',
        className,
      )}
    >
      {children}
    </TableCell>
  );
}
