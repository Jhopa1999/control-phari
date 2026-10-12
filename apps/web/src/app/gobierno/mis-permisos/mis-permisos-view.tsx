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
import { MODULE_LABELS, MODULE_ORDER } from '@/lib/navigation';

/**
 * Mis permisos (design §11.20, patrón D): identidad, roles con su alcance y
 * módulos habilitados del actor actual, leídos del contexto (sin llamada
 * propia). El servidor aplica los permisos; el menú solo los refleja.
 */
export function MisPermisosView(): React.ReactElement {
  const { actorId, permissions, state, reload } = useActor();

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
      </div>
    );
  } else if (state === 'error' || !permissions) {
    content = (
      <div className="rounded-lg border bg-card">
        <ErrorState title="No fue posible cargar tus permisos." onRetry={reload} />
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
                {MODULE_ORDER.map((key) => (
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
