'use client';

import * as React from 'react';
import { KeyRound, Mail, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataCardList } from '@/components/data-card-list';
import { DisabledReason } from '@/components/disabled-reason';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { NoAccessNotice, NO_ACCESS_COPY } from '@/components/no-access-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell } from '@/components/row-actions';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
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
import type { Grant, Process, User } from '@/lib/api-client';
import {
  ApiError,
  createGrant,
  createUser,
  inviteUser,
  listGrants,
  listProcesses,
  listUsers,
  revokeGrant,
} from '@/lib/team';
import { assignableRolesFor } from '@/lib/role-hierarchy';
import { CreateGrantDialog } from './create-grant-dialog';
import { CreateUserDialog } from './create-user-dialog';

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';
type RoleCode = 'JEFE_AREA' | 'LIDER_PROCESO' | 'INTEGRANTE';

const ROLE_LABELS: Record<RoleCode, string> = {
  JEFE_AREA: 'Jefe de área',
  LIDER_PROCESO: 'Líder de proceso',
  INTEGRANTE: 'Integrante',
};

const ASSIGN_REASON_ID = 'asignar-rol-motivo';

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
}

function revokeButtonId(grantId: string): string {
  return `revocar-${grantId}`;
}

/** Tabla y tarjetas conviven en el DOM (una está oculta): devuelve el control que se ve. */
function visibleById(id: string): HTMLElement | null {
  for (const candidate of [id, `${id}-card`]) {
    const el = document.getElementById(candidate);
    if (el && el.offsetParent !== null) return el;
  }
  return null;
}

function inviteButtonId(userId: string): string {
  return `invitar-${userId}`;
}

/**
 * Equipo y permisos (design §11.21 y §10.2, patrón A): usuarios del portal y
 * sus roles asignados por proceso. La tabla de roles no muestra el rol: la API
 * no devuelve su código (pendiente documentado en docs/README.md).
 */
export function EquipoView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();
  const permissionsLoaded = permissions !== null;
  const teamAllowed = allowedModules.has('team');
  const [users, setUsers] = React.useState<User[]>([]);
  const [grants, setGrants] = React.useState<Grant[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [loadedState, setState] = React.useState<LoadState>('loading');
  const state: LoadState = permissionsLoaded && !teamAllowed ? 'forbidden' : loadedState;
  const [loadError, setLoadError] = React.useState<unknown>(null);

  const [userDialogOpen, setUserDialogOpen] = React.useState(false);
  const [grantDialogOpen, setGrantDialogOpen] = React.useState(false);
  const [submittingUser, setSubmittingUser] = React.useState(false);
  const [submittingGrant, setSubmittingGrant] = React.useState(false);
  const [userError, setUserError] = React.useState<string | null>(null);
  const [grantError, setGrantError] = React.useState<string | null>(null);

  // Rol a revocar; se conserva al cerrar para que el texto no cambie durante la animación.
  const [revokeTarget, setRevokeTarget] = React.useState<Grant | null>(null);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const grantsHeadingRef = React.useRef<HTMLHeadingElement>(null);

  // Invitación por reenviar; se conserva al cerrar para que el texto del diálogo
  // no cambie durante la animación de salida (mismo patrón que revokeTarget).
  const [inviteTarget, setInviteTarget] = React.useState<User | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  // Estado de envío por-fila: solo el botón de este id muestra «Enviando…» y se
  // deshabilita; las demás filas quedan intactas.
  const [invitingUserId, setInvitingUserId] = React.useState<string | null>(null);

  const loadData = React.useCallback(() => {
    return Promise.all([listUsers(), listGrants(), listProcesses()])
      .then(([u, g, p]) => {
        setUsers(u);
        setGrants(g);
        setProcesses(p);
        setState('success');
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden');
          return;
        }
        setLoadError(err);
        setState('error');
      });
  }, []);
  const load = React.useCallback(async (silent = false) => {
    // Tras una acción se recarga sin el esqueleto: las tablas siguen montadas y
    // el foco puede volver a sus filas.
    if (!silent) setState('loading');
    await loadData();
  }, [loadData]);

  // Gating cosmético, como en Aprobaciones e Indicadores: sin el módulo team no
  // se llama al backend (respondería 403) y se muestra el aviso; un 403 lleva
  // al mismo aviso.
  React.useEffect(() => {
    if (!permissionsLoaded) return;
    if (!teamAllowed) return;
    void loadData();
  }, [permissionsLoaded, teamAllowed, loadData]);

  const usersById = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const processesById = React.useMemo(() => new Map(processes.map((p) => [p.id, p])), [processes]);

  // Roles que el actor puede asignar segun su jerarquia (roleCodes de
  // /me/permissions). Solo estos aparecen en el selector; el backend es la
  // autoridad (POST /grants responde 403 ante un rol igual o superior).
  const assignableRoles = React.useMemo(
    () => assignableRolesFor(permissions?.roleCodes ?? []),
    [permissions],
  );

  function userName(id: string): string {
    return usersById.get(id)?.name ?? 'Usuario fuera de tu alcance';
  }

  function processName(id: string): string {
    const process = processesById.get(id);
    return process ? `${process.name} (${process.code})` : 'Proceso fuera de tu alcance';
  }

  function openUserDialog(): void {
    setUserError(null);
    setUserDialogOpen(true);
  }

  function openGrantDialog(): void {
    setGrantError(null);
    setGrantDialogOpen(true);
  }

  // Devuelve true en éxito y false en error: el diálogo lo usa para decidir si
  // limpia el formulario (solo tras el éxito).
  async function handleCreateUser(input: { identifier: string; name: string }): Promise<boolean> {
    setSubmittingUser(true);
    setUserError(null);
    try {
      await createUser(input);
      toast.success('Usuario creado.');
      setUserDialogOpen(false);
      await load(true);
      return true;
    } catch (err) {
      const message = messageOf(err);
      setUserError(message);
      toast.error(message);
      return false;
    } finally {
      setSubmittingUser(false);
    }
  }

  async function handleCreateGrant(input: {
    userId: string;
    roleCode: RoleCode;
    processId: string;
  }): Promise<boolean> {
    setSubmittingGrant(true);
    setGrantError(null);
    try {
      await createGrant(input);
      toast.success('Rol asignado.');
      setGrantDialogOpen(false);
      await load(true);
      return true;
    } catch (err) {
      const message = messageOf(err);
      setGrantError(message);
      toast.error(message);
      return false;
    } finally {
      setSubmittingGrant(false);
    }
  }

  async function handleRevoke(): Promise<void> {
    if (!revokeTarget) return;
    try {
      await revokeGrant(revokeTarget.id);
      toast.success('Rol revocado.');
      await load(true);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  async function handleInvite(): Promise<void> {
    if (!inviteTarget) return;
    const target = inviteTarget;
    setInvitingUserId(target.id);
    try {
      await inviteUser(target.id);
      // Éxito en español, sin JSON crudo. No se recarga la tabla: la invitación
      // no cambia el listado de usuarios.
      toast.success(
        `Enviamos el correo de activación a ${target.name} (${target.identifier}). Puede tardar unos minutos en llegar.`,
      );
    } catch (err) {
      // messageOf + messageForStatus ya traduce 403/404/red a texto entendible.
      toast.error(messageOf(err));
    } finally {
      setInvitingUserId(null);
    }
  }

  /**
   * «Revocar» se oculta al revocar (NIT 4): el foco pasa al «Revocar» de la
   * fila activa siguiente (o la anterior) y, si no queda ninguna, al encabezado
   * «Roles asignados».
   */
  function revokeFocusTarget(): HTMLElement | null {
    if (!revokeTarget) return grantsHeadingRef.current;
    const index = grants.findIndex((g) => g.id === revokeTarget.id);
    const candidates = [...grants.slice(index + 1), ...grants.slice(0, Math.max(index, 0)).reverse()];
    for (const grant of candidates) {
      if (!grant.active) continue;
      const button = visibleById(revokeButtonId(grant.id));
      if (button) return button;
    }
    return grantsHeadingRef.current;
  }

  const canAssign = users.length > 0 && processes.length > 0 && assignableRoles.length > 0;
  const assignUnavailable = state === 'success' && !canAssign;
  const assignReason =
    assignableRoles.length === 0
      ? 'Tu rol no permite asignar roles.'
      : 'Necesitas al menos un usuario y un proceso para asignar roles.';

  const headerActions = (
    <>
      <Button type="button" variant="outline" onClick={openUserDialog}>
        <Plus aria-hidden="true" />
        Nuevo usuario
      </Button>
      <div className="flex flex-col items-start gap-1 md:items-end">
        {assignUnavailable ? (
          <Button type="button" unavailable aria-describedby={ASSIGN_REASON_ID}>
            <Plus aria-hidden="true" />
            Asignar rol
          </Button>
        ) : (
          <Button type="button" disabled={state !== 'success'} onClick={openGrantDialog}>
            <Plus aria-hidden="true" />
            Asignar rol
          </Button>
        )}
        {assignUnavailable ? (
          <DisabledReason id={ASSIGN_REASON_ID} className="max-w-xs md:text-right">
            {assignReason}
          </DisabledReason>
        ) : null}
      </div>
    </>
  );

  if (state === 'forbidden') {
    return (
      <PageLayout>
        <PageHeader title="Equipo y permisos" description="Usuarios del portal y sus roles por proceso." />
        <NoAccessNotice {...NO_ACCESS_COPY.team} />
      </PageLayout>
    );
  }

  let content: React.ReactNode;
  if (state === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  } else if (state === 'error') {
    content = (
      <div className="rounded-lg border bg-card">
        <ErrorState title="No fue posible cargar el equipo." error={loadError} onRetry={() => void load()} />
      </div>
    );
  } else {
    content = (
      <>
        <Section title="Usuarios" count={users.length}>
          <div className="overflow-hidden rounded-lg border bg-card">
            {users.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No hay usuarios todavía."
                description="Registra a las personas del área para asignarles roles."
                action={
                  <Button type="button" onClick={openUserDialog}>
                    <Plus aria-hidden="true" />
                    Nuevo usuario
                  </Button>
                }
              />
            ) : (
              <>
              <div className="hidden md:block">
              <Table scrollLabel="Tabla de usuarios">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="min-w-40 font-medium">{user.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {user.identifier}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge kind="active" value={String(user.active)} />
                      </TableCell>
                      <RowActionsCell>
                        {/* «Reenviar invitación»: el endpoint reenvía el correo de
                            activación en ambos casos (invitado o ya activo), y User
                            no expone si ya se activó alguna vez, así que la acción
                            no se puede ocultar por estado. Se muestra como botón solo
                            icono (con tooltip y aria-label) para no repetir nueve
                            veces el mismo texto en la tabla. */}
                        <RowActions
                          rowLabel={user.name}
                          actions={[
                            {
                              key: 'invite',
                              id: inviteButtonId(user.id),
                              label: 'Reenviar invitación',
                              icon: Mail,
                              iconOnly: true,
                              busy: invitingUserId === user.id,
                              busyLabel: 'Enviando…',
                              disabled: invitingUserId !== null && invitingUserId !== user.id,
                              onSelect: () => {
                                setInviteTarget(user);
                                setInviteOpen(true);
                              },
                            },
                          ]}
                        />
                      </RowActionsCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <DataCardList
                label="Usuarios"
                rows={users}
                getKey={(user) => user.id}
                card={(user) => ({
                  title: (
                    <span className="inline-flex min-h-11 items-center font-medium wrap-break-word">
                      {user.name}
                    </span>
                  ),
                  subtitle: user.identifier,
                  badges: [<StatusBadge key="active" kind="active" value={String(user.active)} />],
                  actions: (
                    <Button
                      id={`${inviteButtonId(user.id)}-card`}
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="size-11"
                      aria-label={`Reenviar invitación a ${user.name}`}
                      loading={invitingUserId === user.id}
                      disabled={invitingUserId !== null && invitingUserId !== user.id}
                      onClick={() => {
                        setInviteTarget(user);
                        setInviteOpen(true);
                      }}
                    >
                      <Mail aria-hidden="true" />
                    </Button>
                  ),
                })}
              />
              </>
            )}
          </div>
        </Section>

        <Section title="Roles asignados" count={grants.length} headingRef={grantsHeadingRef}>
          <div className="overflow-hidden rounded-lg border bg-card">
            {grants.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title="No hay roles asignados todavía."
                description="Asigna un rol a un usuario dentro de un proceso."
              />
            ) : (
              <>
              <div className="hidden md:block">
              <Table scrollLabel="Tabla de roles asignados">
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Proceso</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grants.map((grant) => (
                    <TableRow key={grant.id}>
                      <TableCell className="min-w-40 font-medium">{userName(grant.userId)}</TableCell>
                      <TableCell className="min-w-40">{processName(grant.processId)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StatusBadge kind="grant" value={String(grant.active)} />
                      </TableCell>
                      <RowActionsCell>
                        {grant.active ? (
                          <Button
                            id={revokeButtonId(grant.id)}
                            type="button"
                            variant="ghost-destructive"
                            size="sm"
                            onClick={() => {
                              setRevokeTarget(grant);
                              setRevokeOpen(true);
                            }}
                          >
                            Revocar
                          </Button>
                        ) : null}
                      </RowActionsCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <DataCardList
                label="Roles asignados"
                rows={grants}
                getKey={(grant) => grant.id}
                card={(grant) => ({
                  title: (
                    <span className="inline-flex min-h-11 items-center font-medium wrap-break-word">
                      {userName(grant.userId)}
                    </span>
                  ),
                  subtitle: processName(grant.processId),
                  badges: [<StatusBadge key="grant" kind="grant" value={String(grant.active)} />],
                  actions: grant.active ? (
                    <Button
                      id={`${revokeButtonId(grant.id)}-card`}
                      type="button"
                      variant="ghost-destructive"
                      className="h-11 px-3"
                      aria-label={`Revocar rol de ${userName(grant.userId)} en ${processName(grant.processId)}`}
                      onClick={() => {
                        setRevokeTarget(grant);
                        setRevokeOpen(true);
                      }}
                    >
                      Revocar
                    </Button>
                  ) : undefined,
                })}
              />
              </>
            )}
          </div>
        </Section>
      </>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Equipo y permisos"
        description="Usuarios del portal y sus roles por proceso."
        actions={headerActions}
      />
      {content}

      <CreateUserDialog
        open={userDialogOpen}
        onOpenChange={(open) => {
          setUserDialogOpen(open);
          if (!open) setUserError(null);
        }}
        submitting={submittingUser}
        errorMessage={userError}
        onSubmit={handleCreateUser}
      />
      <CreateGrantDialog
        open={grantDialogOpen}
        onOpenChange={(open) => {
          setGrantDialogOpen(open);
          if (!open) setGrantError(null);
        }}
        submitting={submittingGrant}
        users={users}
        processes={processes}
        roleLabels={ROLE_LABELS}
        assignableRoles={assignableRoles}
        errorMessage={grantError}
        onSubmit={handleCreateGrant}
      />
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="¿Revocar este rol?"
        description={
          revokeTarget
            ? `${userName(revokeTarget.userId)} perderá los permisos de ese rol en ${processName(
                revokeTarget.processId,
              )}. Para devolverlos, asigna el rol de nuevo.`
            : ''
        }
        confirmLabel="Revocar rol"
        onConfirm={handleRevoke}
        returnFocusTo={revokeFocusTarget}
      />
      {/* Confirmación: reenviar invalida el enlace anterior, consecuencia no
          obvia; se usa ConfirmDialog (como en revocar) con tono no destructivo.
          La fila no se elimina al invitar, así que el foco vuelve al propio botón. */}
      <ConfirmDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        tone="default"
        title="¿Reenviar la invitación?"
        description={
          inviteTarget
            ? `Enviaremos un nuevo correo de activación a ${inviteTarget.name} (${inviteTarget.identifier}). El enlace de invitaciones anteriores dejará de funcionar.`
            : ''
        }
        confirmLabel="Reenviar invitación"
        busy={invitingUserId === inviteTarget?.id}
        onConfirm={handleInvite}
        returnFocusTo={() =>
          inviteTarget ? visibleById(inviteButtonId(inviteTarget.id)) : null
        }
      />
    </PageLayout>
  );
}
