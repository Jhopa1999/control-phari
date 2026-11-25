'use client';

import * as React from 'react';
import { KeyRound, UserRound } from 'lucide-react';
import { DescriptionList } from '@/components/description-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
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
// Las 21 claves de módulo y sus etiquetas vienen de lib/navigation.ts (design
// §8.5): claves únicas, sin advertencias de React.
import { MODULE_LABELS, MODULE_ORDER, NAV_GROUPS } from '@/lib/navigation';
import type { MyPermissions } from '@/lib/api-client';

type Capability = MyPermissions['capabilities'][number];

/** Módulos que aparecen en el menú: los demás son detalle y no se listan. */
const MENU_MODULES: ReadonlySet<string> = new Set(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => item.moduleKey)),
);
const LISTED_MODULES = MODULE_ORDER.filter((key) => MENU_MODULES.has(key));

const SCOPE_LABELS: Record<Capability['scope'], string> = {
  PROCESS: 'En los procesos donde tienes rol',
  AREA: 'En toda el área',
  SYSTEM: 'En la configuración del sistema',
};

function slugOf(group: string): string {
  return group
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

/** Agrupa conservando el orden en que llegan las capacidades y los grupos. */
function groupCapabilities(capabilities: readonly Capability[]): Array<[string, Capability[]]> {
  const groups = new Map<string, Capability[]>();
  for (const capability of capabilities) {
    const list = groups.get(capability.group) ?? [];
    list.push(capability);
    groups.set(capability.group, list);
  }
  return Array.from(groups.entries());
}

function CapabilitiesSection({ permissions }: { permissions: MyPermissions }): React.ReactElement | null {
  const capabilities = permissions.capabilities ?? [];
  if (capabilities.length === 0) return null;
  const total = capabilities.length;
  const allowedCount = capabilities.filter((c) => c.allowed).length;
  const isAdmin = permissions.roleCodes.includes('ADMIN');
  const hasGrants = permissions.grants.length > 0;
  let notice: string | null = null;
  if (isAdmin && !hasGrants) {
    notice =
      'Tu rol de administrador configura el sistema. No participa en solicitudes ni en planes.';
  } else if (!isAdmin && !hasGrants && permissions.roleCodes.length === 0) {
    notice =
      'Todavía no tienes roles, por eso no puedes hacer ninguna de estas acciones. Pide al jefe de área que te asigne un rol.';
  }
  return (
    <Section title="Qué puedes hacer">
      <p className="text-meta text-muted-foreground">
        Puedes hacer {allowedCount} de {total} acciones del portal, según tus roles.
      </p>
      {notice ? <InlineNotice tone="neutral">{notice}</InlineNotice> : null}
      <div className="grid gap-4">
        {groupCapabilities(capabilities).map(([group, items]) => {
          const slug = slugOf(group);
          return (
            <section
              key={group}
              aria-labelledby={`cap-${slug}`}
              className="overflow-hidden rounded-lg border bg-card"
            >
              <h3 id={`cap-${slug}`} className="border-b px-4 py-2.5 text-sm font-semibold text-foreground">
                {group}
              </h3>
              <ul className="divide-y">
                {items.map((capability) => (
                  <li key={capability.key} className="grid gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-foreground">{capability.label}</span>
                      <StatusBadge kind="permission" value={String(capability.allowed)} />
                    </div>
                    <p className="text-meta text-muted-foreground">
                      {capability.description} · {SCOPE_LABELS[capability.scope]}
                    </p>
                    {!capability.allowed && capability.allowedRoles.length > 0 ? (
                      <p className="text-meta text-foreground">
                        <span className="font-medium">Lo hace:</span>{' '}
                        {capability.allowedRoles.map((role) => role.name).join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * Mis permisos (design §11.20, patrón D): identidad, roles con su alcance y
 * módulos habilitados del actor actual, leídos del contexto (sin llamada
 * propia). El servidor aplica los permisos; el menú solo los refleja.
 */
export function MisPermisosView(): React.ReactElement {
  const { actorId, permissions, state, permissionsError, reload } = useActor();

  let content: React.ReactNode;
  if (!actorId) {
    content = (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={UserRound}
          title="Selecciona un usuario en la barra lateral para ver sus permisos."
        />
      </div>
    );
  } else if (state === 'loading') {
    content = (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  } else if (state === 'error' || !permissions) {
    content = (
      <div className="rounded-lg border bg-card">
        <ErrorState title="No fue posible cargar tus permisos." error={permissionsError} onRetry={reload} />
      </div>
    );
  } else {
    const allowed = new Set(permissions.allowedModules);
    content = (
      <>
        <Section title="Identidad">
          <div className="rounded-lg border bg-card p-4">
            <DescriptionList
              columns={2}
              items={[
                { term: 'Nombre', value: permissions.name },
                { term: 'Identificador', value: permissions.identifier },
              ]}
            />
          </div>
        </Section>

        <Section title="Roles y alcance" count={permissions.grants.length}>
          <div className="overflow-hidden rounded-lg border bg-card">
            {permissions.grants.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                size="compact"
                title="No tienes roles activos."
                description="Pide al jefe de área que te asigne un rol en un proceso."
              />
            ) : (
              <Table scrollLabel="Tabla de roles y alcance">
                <TableHeader>
                  <TableRow>
                    <TableHead>Rol</TableHead>
                    <TableHead>Proceso</TableHead>
                    <TableHead>Código</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.grants.map((grant) => (
                    <TableRow key={`${grant.roleCode}-${grant.processId}`}>
                      <TableCell className="font-medium whitespace-nowrap">{grant.roleName}</TableCell>
                      <TableCell className="min-w-40">{grant.processName}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {grant.processCode}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Section>

        <CapabilitiesSection permissions={permissions} />
        <Section title="Módulos">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table density="compact" scrollLabel="Tabla de módulos">
              <TableHeader>
                <TableRow>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Acceso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LISTED_MODULES.map((key) => (
                  <TableRow key={key}>
                    <TableCell className="min-w-48">{MODULE_LABELS[key]}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusBadge kind="permission" value={String(allowed.has(key))} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <InlineNotice tone="neutral">
            El servidor aplica estos permisos; el menú solo muestra lo que tienes habilitado.
          </InlineNotice>
        </Section>
      </>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Mis permisos"
        description="Tus roles, procesos de alcance y módulos habilitados."
      />
      {content}
    </PageLayout>
  );
}
