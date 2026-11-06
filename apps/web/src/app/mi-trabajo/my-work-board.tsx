'use client';

import * as React from 'react';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MyWorkItem } from '@/lib/api-client';
import { BOARD_OTHER_KEY, boardColumns, type BoardColumn } from '@/lib/my-work-board';
import { taskStatusLabel } from '@/lib/tasks';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { MyWorkBoardCard } from './my-work-board-card';
import type { RowActions } from './mi-trabajo-parts';

/** Orden en que se elige la pestaña inicial en móvil. */
const INITIAL_TAB_ORDER = ['EN_CURSO', 'POR_HACER', 'EN_REVISION', 'BLOQUEADA', 'TERMINADA'];

export function columnLabel(key: string): string {
  return key === BOARD_OTHER_KEY ? 'Otros estados' : taskStatusLabel(key);
}

export function boardHeadingId(key: string): string {
  return `mt-board-h-${key}`;
}

export function boardTabId(key: string): string {
  return `mt-board-tab-${key}`;
}

export interface MyWorkBoardProps {
  /** Tareas ya filtradas por búsqueda y contador. */
  items: MyWorkItem[];
  today: string;
  actions: RowActions;
  /** Hay filtros activos (cambia el texto de las columnas vacías). */
  filtered: boolean;
  /** Tarjeta que debe seguir visible aunque caiga tras el corte. */
  keepVisibleId: string | null;
  expanded: ReadonlySet<string>;
  onExpand: (columnKey: string, firstHiddenId: string, hidden: number) => void;
}

function visibleOf(column: BoardColumn<MyWorkItem>, expanded: boolean, keepVisibleId: string | null) {
  const keepIndex = keepVisibleId ? column.items.findIndex((i) => i.taskId === keepVisibleId) : -1;
  const showAll = expanded || column.items.length <= column.limit || keepIndex >= column.limit;
  const visible = showAll ? column.items : column.items.slice(0, column.limit);
  return { visible, hidden: column.items.length - visible.length };
}

interface CardListProps {
  column: BoardColumn<MyWorkItem>;
  today: string;
  actions: RowActions;
  filtered: boolean;
  keepVisibleId: string | null;
  expanded: boolean;
  onExpand: MyWorkBoardProps['onExpand'];
  /** Mensaje cuando no hay tarjetas. */
  emptyText: string;
}

function CardList({
  column,
  today,
  actions,
  keepVisibleId,
  expanded,
  onExpand,
  emptyText,
}: CardListProps): React.ReactElement {
  const { visible, hidden } = visibleOf(column, expanded, keepVisibleId);
  if (column.items.length === 0) {
    return <p className="py-6 text-center text-meta text-muted-foreground">{emptyText}</p>;
  }
  return (
    <>
      <ul className="flex flex-col gap-3 md:gap-2" aria-label={`Tareas en ${columnLabel(column.key)}`}>
        {visible.map((item) => (
          <MyWorkBoardCard key={item.taskId} item={item} today={today} actions={actions} />
        ))}
      </ul>
      {hidden > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:min-h-11 self-start"
          onClick={() => onExpand(column.key, column.items[visible.length].taskId, hidden)}
        >
          Ver las {hidden} restantes
        </Button>
      ) : null}
    </>
  );
}

/**
 * Tablero de Mi trabajo: una columna por estado. Desde 768 px, columnas (con
 * desplazamiento horizontal o fluidas según el ancho del contenedor); por debajo,
 * una columna a la vez con pestañas. Sin arrastre: ver «Siguiente paso» y «Mover a…».
 */
export function MyWorkBoard({
  items,
  today,
  actions,
  filtered,
  keepVisibleId,
  expanded,
  onExpand,
}: MyWorkBoardProps): React.ReactElement {
  const columns = React.useMemo(() => boardColumns(items), [items]);
  const wide = useMediaQuery('(min-width: 768px)');
  const emptyText = filtered ? 'Sin tareas con estos filtros.' : 'Sin tareas';

  // Pestaña inicial (móvil): la primera con tareas; después manda el usuario.
  const [tab, setTab] = React.useState<string>(
    () =>
      INITIAL_TAB_ORDER.find((key) => columns.find((c) => c.key === key)?.items.length) ??
      INITIAL_TAB_ORDER[0],
  );

  if (!wide) {
    const active = columns.find((c) => c.key === tab) ?? columns[0];
    const others = columns.filter((c) => c.key !== active.key).reduce((n, c) => n + c.items.length, 0);
    return (
      <Tabs
        value={active.key}
        onValueChange={(value) => {
          setTab(value);
          window.requestAnimationFrame(() =>
            document
              .getElementById(boardTabId(value))
              ?.scrollIntoView({ inline: 'center', block: 'nearest' }),
          );
        }}
        className="flex min-w-0 flex-col gap-3"
      >
        <TabsList
          aria-label="Estados de tus tareas"
          className="no-scrollbar snap-x overflow-x-auto scroll-px-3"
        >
          {columns.map((column) => (
            <TabsTrigger
              key={column.key}
              id={boardTabId(column.key)}
              value={column.key}
              className="shrink-0 snap-start px-3 max-md:h-11 min-w-11"
            >
              {columnLabel(column.key)}
              <Badge variant={column.key === 'BLOQUEADA' && column.items.length > 0 ? 'danger' : 'neutral'}>
                {column.items.length}
                <span className="sr-only">
                  {column.items.length === 1 ? ' tarea' : ' tareas'}
                </span>
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        {columns.map((column) => (
          <TabsContent key={column.key} value={column.key} className="flex flex-col gap-3 pt-0">
            {column.items.length === 0 && filtered ? (
              <p className="py-6 text-center text-meta text-muted-foreground">
                Ninguna tarea aquí con los filtros actuales.
                {others > 0 ? ` Hay ${others} en otras pestañas.` : ''}
              </p>
            ) : (
              <CardList
                column={column}
                today={today}
                actions={actions}
                filtered={filtered}
                keepVisibleId={keepVisibleId}
                expanded={expanded.has(column.key)}
                onExpand={onExpand}
                emptyText="Sin tareas"
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  return (
    <div
      role="region"
      aria-label="Tablero de tus tareas por estado"
      tabIndex={0}
      className="snap-x snap-proximity scroll-px-3 overflow-x-auto rounded-xl pb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex w-max items-start gap-3 @[1240px]:grid @[1240px]:w-auto @[1240px]:grid-cols-5">
        {columns.map((column) => (
          <section
            key={column.key}
            aria-labelledby={boardHeadingId(column.key)}
            className={cn(
              'flex w-64 shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/40 p-2',
              '@[1240px]:w-auto @[1240px]:min-w-0',
            )}
          >
            <div className="flex items-center gap-2 px-1 pb-1">
              <h2 id={boardHeadingId(column.key)} tabIndex={-1} className="flex items-center gap-2">
                {column.key === BOARD_OTHER_KEY ? (
                  <span className="text-sm font-semibold">Otros estados</span>
                ) : (
                  <StatusBadge kind="task" value={column.key} />
                )}
              </h2>
              <span className="rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                {column.items.length}
                <span className="sr-only">{column.items.length === 1 ? ' tarea' : ' tareas'}</span>
              </span>
            </div>
            <CardList
              column={column}
              today={today}
              actions={actions}
              filtered={filtered}
              keepVisibleId={keepVisibleId}
              expanded={expanded.has(column.key)}
              onExpand={onExpand}
              emptyText={emptyText}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
