'use client';

import * as React from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MyWorkItem } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { listMyWork } from '@/lib/my-work';
import { taskStatusLabel } from '@/lib/tasks';

type LoadState = 'loading' | 'success' | 'error';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);
}

export function MiTrabajoView(): React.ReactElement {
  const { actorId } = useActor();
  const [items, setItems] = React.useState<MyWorkItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const data = await listMyWork();
      setItems(data);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, actorId]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Mi trabajo</h1>
          <p className="text-sm text-muted-foreground">
            Tus tareas asignadas con su contexto de plan y estado.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw aria-hidden="true" />
          Actualizar
        </Button>
      </header>

      <section aria-live="polite" className="rounded-lg border bg-card">
        {state === 'loading' ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible cargar tu trabajo.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">No tienes tareas asignadas.</p>
            <p className="text-sm text-muted-foreground">
              Las tareas de las que seas responsable apareceran aqui.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarea</TableHead>
                <TableHead>Solicitud</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Accion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.taskId}>
                  <TableCell className="font-medium">
                    {item.title}
                    {item.isMilestone ? (
                      <Badge variant="outline" className="ml-2">
                        Hito
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.requestTitle}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.phaseName}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(item.endDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {taskStatusLabel(item.status)} ({item.progress}%)
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/seguimiento/tareas?taskId=${item.taskId}`}>
                        Abrir
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
