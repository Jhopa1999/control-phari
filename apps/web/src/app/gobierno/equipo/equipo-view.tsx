'use client';

import * as React from 'react';
import { KeyRound, LockOpen, Mail, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataCardList } from '@/components/data-card-list';
import { DisabledReason } from '@/components/disabled-reason';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { NoAccessNotice, NO_ACCESS_COPY } from '@/components/no-access-notice';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  forcePasswordChange,
  inviteUser,
  listGrants,
  listProcesses,
  listUsers,
  revokeGrant,
} from '@/lib/team';
import { assignableRolesFor } from '@/lib/role-hierarchy';
import { describeForceFailure, describeForceResult } from '@/lib/password-messages';
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

function forceButtonId(userId: string): string {
  return `exigir-cambio-${userId}`;
}

function personas(n: number): string {
  return n === 1 ? 'persona' : 'personas';
}

/** Qué confirma el diálogo de «Exigir cambio de contraseña». */
type ForceTarget =
  | { kind: 'all' }
  | { kind: 'selection' }
  | { kind: 'one'; user: User }
  | { kind: 'clear'; user: User };

/** Insignia «Cambio de contraseña pendiente» (icono y texto: no depende del color). */
function PendingPasswordBadge(): React.ReactElement {
  return (
    <Badge variant="warning">
      <KeyRound aria-hidden="true" />
      Cambio de contraseña pendiente
    </Badge>
  );
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

  // Cambio de contraseña obligatorio (solo jefe de área; el backend es la autoridad).
  const isJefe = permissions?.roleCodes.includes('JEFE_AREA') === true;
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [forceTarget, setForceTarget] = React.useState<ForceTarget | null>(null);
  const [forceOpen, setForceOpen] = React.useState(false);
  const [forcingUserId, setForcingUserId] = React.useState<string | null>(null);
  const [forcingBulk, setForcingBulk] = React.useState(false);
  const usersHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const selectAllRef = React.useRef<HTMLInputElement>(null);

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

  // La selección solo conserva personas que siguen en la lista.
  const selectedIds = React.useMemo(
    () => users.filter((u) => selected.has(u.id)).map((u) => u.id),
    [users, selected],
  );
  const allSelected = users.length > 0 && selectedIds.length === users.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  React.useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected, users.length, loadedState]);

  function toggleUser(id: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean): void {
    setSelected(checked ? new Set(users.map((u) => u.id)) : new Set());
  }

  function askForce(target: ForceTarget): void {
    setForceTarget(target);
    setForceOpen(true);
  }

  async function handleForce(): Promise<void> {
    if (!forceTarget) return;
    const target = forceTarget;
    const enabled = target.kind !== 'clear';
    const body =
      target.kind === 'all'
        ? { all: true }
        : target.kind === 'selection'
          ? { userIds: selectedIds }
          : { userIds: [target.user.id], enabled };
    if (target.kind === 'one' || target.kind === 'clear') setForcingUserId(target.user.id);
    else setForcingBulk(true);
    try {
      const result = await forcePasswordChange(body);
      const summary = describeForceResult(result, enabled);
      if (summary.tone === 'info') toast.info(summary.message);
      else toast.success(summary.message, { description: summary.detail });
      setSelected(new Set());
      await load(true);
    } catch (err) {
      toast.error(describeForceFailure(err instanceof ApiError ? err.status : undefined));
    } finally {
      setForcingUserId(null);
      setForcingBulk(false);
    }
  }

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

  // Acciones de fila del cambio obligatorio: solo el jefe, siempre en el menú «…».
  function forceRowActions(user: User): RowAction[] {
    if (!isJefe) return [];
    const busy = forcingUserId === user.id;
    const otherBusy = forcingUserId !== null && !busy;
    return user.mustChangePassword
      ? [
          {
            key: 'clear-force',
            id: forceButtonId(user.id),
            label: 'Retirar exigencia',
            icon: LockOpen,
            placement: 'menu',
            busy,
            busyLabel: 'Guardando…',
            disabled: otherBusy,
            onSelect: () => askForce({ kind: 'clear', user }),
          },
        ]
      : [
          {
            key: 'force',
            id: forceButtonId(user.id),
            label: 'Exigir cambio de contraseña',
            icon: KeyRound,
            placement: 'menu',
            busy,
            busyLabel: 'Guardando…',
            disabled: otherBusy,
            onSelect: () => askForce({ kind: 'one', user }),
          },
        ];
  }

  // Diálogo de confirmación del cambio obligatorio (tono no destructivo: es reversible).
  const SESSION_NOTES = [
    'Las sesiones abiertas se interrumpen en la siguiente acción de cada persona.',
    'Los accesos por MCP o scripts de esas personas quedan limitados hasta que cambien su contraseña.',
  ];
  let forceDialog: {
    title: string;
    description: string;
    confirmLabel: string;
    notes: string[];
    names?: string[];
  } | null = null;
  if (forceTarget?.kind === 'all') {
    forceDialog = {
      title: '¿Exigir el cambio de contraseña a todo el equipo?',
      description:
        'Cada persona con contraseña, excepto tú, deberá elegir una nueva la próxima vez que use el portal.',
      confirmLabel: 'Exigir cambio a todos',
      notes: [
        ...SESSION_NOTES,
        'Para dejar fuera a alguien, cancela y selecciona solo a las personas que quieras.',
        'Puedes retirar la exigencia después desde esta pantalla.',
      ],
    };
  } else if (forceTarget?.kind === 'selection') {
    const n = selectedIds.length;
    const names = users.filter((u) => selected.has(u.id)).map((u) => u.name);
    forceDialog = {
      title: `¿Exigir el cambio de contraseña a ${n} ${personas(n)}?`,
      description: 'Cada una deberá elegir una contraseña nueva la próxima vez que use el portal.',
      confirmLabel: `Exigir cambio a ${n} ${personas(n)}`,
      notes: SESSION_NOTES,
      names: names.length > 5 ? [...names.slice(0, 5), `y ${names.length - 5} más.`] : names,
    };
  } else if (forceTarget?.kind === 'one') {
    forceDialog = {
      title: `¿Exigir a ${forceTarget.user.name} que cambie su contraseña?`,
      description: 'Deberá elegir una contraseña nueva la próxima vez que use el portal.',
      confirmLabel: 'Exigir cambio',
      notes: [],
    };
  } else if (forceTarget?.kind === 'clear') {
    forceDialog = {
      title: `¿Retirar la exigencia a ${forceTarget.user.name}?`,
      description: 'Podrá seguir usando el portal sin cambiar su contraseña.',
      confirmLabel: 'Retirar exigencia',
      notes: [],
    };
  }

  // Aviso cuando quien ejecuta la acción también queda marcado (selección o fila propia).
  const selfInForce =
    forceTarget?.kind === 'selection'
      ? selectedIds.includes(permissions?.userId ?? '')
      : forceTarget?.kind === 'one' && forceTarget.user.id === permissions?.userId;

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
        <Section
          title="Usuarios"
          count={users.length}
          headingRef={usersHeadingRef}
          actions={
            isJefe && users.length > 0 ? (
              <Button type="button" variant="outline" onClick={() => askForce({ kind: 'all' })}>
                <KeyRound aria-hidden="true" />
                Exigir cambio a todos
              </Button>
            ) : undefined
          }
        >
          {isJefe && selectedIds.length > 0 ? (
            <InlineNotice
              tone="info"
              icon={false}
              action={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => askForce({ kind: 'selection' })}
                  >
                    <KeyRound aria-hidden="true" />
                    Exigir cambio de contraseña
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setSelected(new Set())}
                  >
                    Quitar selección
                  </Button>
                </>
              }
            >
              <span aria-live="polite" className="font-medium">
                {selectedIds.length}{' '}
                {selectedIds.length === 1 ? 'persona seleccionada' : 'personas seleccionadas'}
              </span>
            </InlineNotice>
          ) : null}
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
                    {isJefe ? (
                      <TableHead className="w-10">
                        <label className="flex min-h-8 cursor-pointer items-center">
                          <Checkbox
                            ref={selectAllRef}
                            checked={allSelected}
                            onChange={(e) => toggleAll(e.target.checked)}
                          />
                          <span className="sr-only">Seleccionar todos los usuarios</span>
                        </label>
                      </TableHead>
                    ) : null}
                    <TableHead>Nombre</TableHead>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      {isJefe ? (
                        <TableCell className="w-10">
                          <label className="flex min-h-8 cursor-pointer items-center">
                            <Checkbox
                              checked={selected.has(user.id)}
                              onChange={(e) => toggleUser(user.id, e.target.checked)}
                            />
                            <span className="sr-only">Seleccionar a {user.name}</span>
                          </label>
                        </TableCell>
                      ) : null}
                      <TableCell className="min-w-40 font-medium">{user.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {user.identifier}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge kind="active" value={String(user.active)} />
                          {user.mustChangePassword ? <PendingPasswordBadge /> : null}
                        </div>
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
                            ...forceRowActions(user),
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
                  title: isJefe ? (
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 font-medium wrap-break-word">
                      <Checkbox
                        className="size-5"
                        checked={selected.has(user.id)}
                        onChange={(e) => toggleUser(user.id, e.target.checked)}
                      />
                      <span>{user.name}</span>
                    </label>
                  ) : (
                    <span className="inline-flex min-h-11 items-center font-medium wrap-break-word">
                      {user.name}
                    </span>
                  ),
                  subtitle: user.identifier,
                  badges: [
                    <StatusBadge key="active" kind="active" value={String(user.active)} />,
                    ...(user.mustChangePassword ? [<PendingPasswordBadge key="pending" />] : []),
                  ],
                  actions: (
                    <div className="flex items-center gap-1">
                    {isJefe ? (
                      <RowActions rowLabel={user.name} menuOnly actions={forceRowActions(user)} />
                    ) : null}
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
                    </div>
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
        open={forceOpen}
        onOpenChange={setForceOpen}
        tone="default"
        title={forceDialog?.title ?? ''}
        description={forceDialog?.description ?? ''}
        confirmLabel={forceDialog?.confirmLabel ?? 'Confirmar'}
        busy={forcingBulk || forcingUserId !== null}
        onConfirm={handleForce}
        returnFocusTo={() =>
          forceTarget?.kind === 'one' || forceTarget?.kind === 'clear'
            ? (visibleById(forceButtonId(forceTarget.user.id)) ?? usersHeadingRef.current)
            : usersHeadingRef.current
        }
      >
        {selfInForce ? (
          <InlineNotice tone="warning">
            Tu usuario está en la selección. Al confirmar, tú también deberás cambiar tu contraseña
            en tu próxima acción.
          </InlineNotice>
        ) : null}
        {forceDialog?.names && forceDialog.names.length > 0 ? (
          <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
            {forceDialog.names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : null}
        {forceDialog && forceDialog.notes.length > 0 ? (
          <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
            {forceDialog.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </ConfirmDialog>
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
