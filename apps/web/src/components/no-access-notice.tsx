'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { InlineNotice } from '@/components/inline-notice';
import { useActor } from '@/lib/actor-context';
import { getDefaultHomeHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';

export interface NoAccessCopy {
  title: string;
  children: string;
}

/**
 * Textos fijos de «Sin acceso» por pantalla (docs/design/oleada-3-errores-acceso.md §1.3),
 * contrastados con `MODULE_MATRIX`. La vista decide cuándo mostrarlo; el
 * mensaje del servidor no se muestra aquí.
 */
export const NO_ACCESS_COPY = {
  dashboard: {
    title: 'No tienes acceso a este panel.',
    children:
      'El Panel del área está disponible para el jefe de área, el líder de proceso y el integrante. Tu rol administra la configuración técnica del portal.',
  },
  demandOverview: {
    title: 'No tienes acceso a la vista de demanda.',
    children: 'La vista de demanda está disponible para el jefe de área y el líder de proceso.',
  },
  triage: {
    title: 'No tienes acceso al triage.',
    children: 'El triage lo realizan el jefe de área y el líder de proceso.',
  },
  priority: {
    title: 'No tienes acceso a la priorización.',
    children: 'La priorización la realizan el jefe de área y el líder de proceso.',
  },
  plan: {
    title: 'No tienes acceso a la gestión del plan.',
    children:
      'La gestión del plan está disponible para el jefe de área y el líder de proceso. El integrante ejecuta sus tareas desde Mi trabajo.',
  },
  review: {
    title: 'No tienes acceso a las aprobaciones.',
    children: 'Las aprobaciones están disponibles para el jefe de área y el líder de proceso.',
  },
  log: {
    title: 'No tienes acceso a la bitácora.',
    children:
      'La bitácora está disponible para el jefe de área, el líder de proceso y el integrante.',
  },
  meeting: {
    title: 'No tienes acceso a las reuniones.',
    children:
      'Las reuniones están disponibles para el jefe de área, el líder de proceso y el integrante.',
  },
  capacity: {
    title: 'No tienes acceso a la capacidad.',
    children:
      'La capacidad está disponible para el jefe de área, el líder de proceso y el integrante.',
  },
  recurring: {
    title: 'No tienes acceso a las actividades recurrentes.',
    children:
      'Las actividades recurrentes están disponibles para el jefe de área, el líder de proceso y el integrante.',
  },
  audit: {
    title: 'No tienes acceso a la auditoría.',
    children:
      'La auditoría está disponible para el jefe de área, el líder de proceso y el integrante. El administrador del sistema no la incluye.',
  },
  admin: {
    title: 'No tienes acceso a las maestras.',
    children: 'Administrar las maestras corresponde al jefe de área.',
  },
  team: {
    title: 'No tienes acceso al equipo.',
    children: 'La gestión del equipo corresponde al jefe de área.',
  },
  adminOrBoss: {
    title: 'No tienes acceso a esta pantalla.',
    children:
      'Esta pantalla está disponible para el administrador del sistema y el jefe de área.',
  },
  adminOnly: {
    title: 'No tienes acceso a esta pantalla.',
    children: 'Esta pantalla corresponde al administrador del sistema.',
  },
} as const satisfies Record<string, NoAccessCopy>;

const DEFAULT_TITLE = 'No tienes acceso a esta pantalla.';
const DEFAULT_BODY =
  'Tu rol no incluye esta sección. Puedes usar las demás secciones del portal.';

export interface NoAccessNoticeProps {
  /** Por defecto «No tienes acceso a esta pantalla.». */
  title?: string;
  /** Cuerpo; si falta, el genérico. */
  children?: React.ReactNode;
}

/**
 * Aviso único de «Sin acceso» (informativo, `role="status"`, sin «Reintentar»).
 * Las acciones salen de los módulos permitidos: «Ir a mi inicio» (si no es la
 * ruta actual) e «Ir a Mis permisos».
 */
export function NoAccessNotice({ title = DEFAULT_TITLE, children }: NoAccessNoticeProps): React.ReactElement {
  const { allowedModules } = useActor();
  const homeHref = getDefaultHomeHref(allowedModules);
  const pathname = usePathname();
  const showHome = homeHref !== '/inicio' && homeHref !== pathname;
  const showPermissions = allowedModules.has('permissions');
  const linkClass = cn(
    buttonVariants({ variant: 'outline', size: 'sm' }),
    'w-full pointer-coarse:min-h-11 sm:w-auto',
  );
  const action =
    showHome || showPermissions ? (
      <>
        {showHome ? (
          <Link href={homeHref} className={linkClass}>
            Ir a mi inicio
          </Link>
        ) : null}
        {showPermissions ? (
          <Link href="/gobierno/mis-permisos" className={linkClass}>
            Ir a Mis permisos
          </Link>
        ) : null}
      </>
    ) : undefined;
  return (
    <InlineNotice tone="neutral" role="status" title={title} action={action}>
      <p className="text-muted-foreground">{children ?? DEFAULT_BODY}</p>
    </InlineNotice>
  );
}
