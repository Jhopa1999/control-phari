'use client';

import * as React from 'react';
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
import { useActor } from '@/lib/actor-context';
import { NAV_GROUPS, type ModuleKey } from '@/lib/navigation';
import type { MyGrant } from '@/lib/api-client';

/** Etiqueta visible de cada moduleKey, derivada del modelo de navegacion. */
const MODULE_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      map[item.moduleKey] = `${group.label} · ${item.label}`;
    }
  }
  return map;
})();

/** Todas las claves de modulo conocidas, en el orden del menu. */
const ALL_MODULE_KEYS: ModuleKey[] = NAV_GROUPS.flatMap((g) =>
  g.items.map((i) => i.moduleKey),
);

function moduleLabel(key: string): string {
  return MODULE_LABELS[key] ?? key;
}

export function MisPermisosView(): React.ReactElement {
  const { actorId, permissions, state, reload } = useActor();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mis permisos</h1>
        <p className="text-sm text-muted-foreground">
          Rol(es), procesos de alcance y modulos permitidos para el usuario
          actual.
        </p>
      </header>

      <section aria-live="polite" className="flex flex-col gap-6">
        {!actorId ? (
          <div className="rounded-lg border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Selecciona un usuario en la barra lateral para ver sus permisos.
            </p>
          </div>
        ) : state === 'loading' ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' || !permissions ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible cargar tus permisos.
            </p>
            <Button variant="outline" onClick={reload}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">{permissions.name}</p>
              <p className="text-sm text-muted-foreground">
                {permissions.identifier}
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold">Roles y alcance</h2>
              {permissions.grants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tienes grants activos.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rol</TableHead>
                      <TableHead>Proceso</TableHead>
                      <TableHead>Codigo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permissions.grants.map((grant: MyGrant) => (
                      <TableRow
                        key={`${grant.roleCode}-${grant.processId}`}
                      >
                        <TableCell className="font-medium">
                          {grant.roleName}
                        </TableCell>
                        <TableCell>{grant.processName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {grant.processCode}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold">Modulos</h2>
              <ul className="flex flex-col gap-2">
                {ALL_MODULE_KEYS.map((key) => {
                  const allowed = permissions.allowedModules.includes(key);
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
                    >
                      <span className="text-sm">{moduleLabel(key)}</span>
                      {allowed ? (
                        <Badge variant="success">Permitido</Badge>
                      ) : (
                        <Badge variant="secondary">No permitido</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                Las acciones de los modulos marcados como no permitidos estan
                deshabilitadas para tu rol; el control se aplica en el servidor.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
