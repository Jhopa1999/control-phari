'use client';

import * as React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
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
import type { Grant, Process, User } from '@/lib/api-client';
import {
  ApiError,
  createGrant,
  createUser,
  listGrants,
  listProcesses,
  listUsers,
  revokeGrant,
} from '@/lib/team';
import { CreateUserDialog } from './create-user-dialog';
import { CreateGrantDialog } from './create-grant-dialog';

type LoadState = 'loading' | 'success' | 'error';

const ROLE_LABELS: Record<string, string> = {
  JEFE_AREA: 'Jefe de area',
  LIDER_PROCESO: 'Lider de proceso',
  INTEGRANTE: 'Integrante',
};

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrio un error inesperado.';
}

export function EquipoView(): React.ReactElement {
  const [users, setUsers] = React.useState<User[]>([]);
  const [grants, setGrants] = React.useState<Grant[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  const [userDialogOpen, setUserDialogOpen] = React.useState(false);
  const [grantDialogOpen, setGrantDialogOpen] = React.useState(false);
  const [submittingUser, setSubmittingUser] = React.useState(false);
  const [submittingGrant, setSubmittingGrant] = React.useState(false);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [u, g, p] = await Promise.all([
        listUsers(),
        listGrants(),
        listProcesses(),
      ]);
      setUsers(u);
      setGrants(g);
      setProcesses(p);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const usersById = React.useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const processesById = React.useMemo(() => {
    const map = new Map<string, Process>();
    for (const p of processes) map.set(p.id, p);
    return map;
  }, [processes]);

  // Devuelve true en exito, false en error. El dialog usa el valor para decidir
  // si limpiar el formulario (solo en exito, AC-031).
  async function handleCreateUser(input: {
    identifier: string;
    name: string;
  }): Promise<boolean> {
    setSubmittingUser(true);
    try {
      await createUser(input);
      toast.success('Usuario creado.');
      setUserDialogOpen(false);
      await load();
      return true;
    } catch (err) {
      toast.error(messageOf(err));
      return false;
    } finally {
      setSubmittingUser(false);
    }
  }

  async function handleCreateGrant(input: {
    userId: string;
    roleCode: 'JEFE_AREA' | 'LIDER_PROCESO' | 'INTEGRANTE';
    processId: string;
  }): Promise<boolean> {
    setSubmittingGrant(true);
    try {
      await createGrant(input);
      toast.success('Grant asignado.');
      setGrantDialogOpen(false);
      await load();
      return true;
    } catch (err) {
      toast.error(messageOf(err));
      return false;
    } finally {
      setSubmittingGrant(false);
    }
  }

  async function handleRevoke(grant: Grant) {
    setRevokingId(grant.id);
    try {
      await revokeGrant(grant.id);
      toast.success('Grant revocado.');
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Equipo y permisos
          </h1>
          <p className="text-sm text-muted-foreground">
            Administra usuarios y sus asignaciones (grants) por proceso.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setUserDialogOpen(true)}
          >
            <Plus aria-hidden="true" />
            Nuevo usuario
          </Button>
          <Button
            onClick={() => setGrantDialogOpen(true)}
            disabled={users.length === 0 || processes.length === 0}
          >
            <Plus aria-hidden="true" />
            Asignar grant
          </Button>
        </div>
      </header>

      {state === 'loading' ? (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </section>
      ) : state === 'error' ? (
        <section
          aria-live="polite"
          className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center"
        >
          <p className="text-sm text-muted-foreground">
            No fue posible cargar el equipo.
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-live="polite" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Usuarios</h2>
            <div className="rounded-lg border bg-card">
              {users.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <p className="text-sm font-medium">No hay usuarios todavia.</p>
                  <Button onClick={() => setUserDialogOpen(true)}>
                    <Plus aria-hidden="true" />
                    Nuevo usuario
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Identificador</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.identifier}
                        </TableCell>
                        <TableCell>
                          {user.active ? (
                            <Badge variant="success">Activo</Badge>
                          ) : (
                            <Badge variant="secondary">Inactivo</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>

          <section aria-live="polite" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Grants</h2>
            <div className="rounded-lg border bg-card">
              {grants.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <p className="text-sm font-medium">
                    No hay grants todavia.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Asigna un rol a un usuario dentro de un proceso.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Proceso</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grants.map((grant) => {
                      const user = usersById.get(grant.userId);
                      const process = processesById.get(grant.processId);
                      return (
                        <TableRow key={grant.id}>
                          <TableCell className="font-medium">
                            {user?.name ?? grant.userId}
                          </TableCell>
                          <TableCell>
                            {process
                              ? `${process.name} (${process.code})`
                              : grant.processId}
                          </TableCell>
                          <TableCell>
                            {grant.active ? (
                              <Badge variant="success">Activo</Badge>
                            ) : (
                              <Badge variant="secondary">Revocado</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={
                                  !grant.active || revokingId === grant.id
                                }
                                onClick={() => void handleRevoke(grant)}
                              >
                                Revocar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>
        </div>
      )}

      <CreateUserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        submitting={submittingUser}
        onSubmit={handleCreateUser}
      />
      <CreateGrantDialog
        open={grantDialogOpen}
        onOpenChange={setGrantDialogOpen}
        submitting={submittingGrant}
        users={users}
        processes={processes}
        roleLabels={ROLE_LABELS}
        onSubmit={handleCreateGrant}
      />
    </div>
  );
}
