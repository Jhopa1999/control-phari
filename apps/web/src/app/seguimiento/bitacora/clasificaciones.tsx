import * as React from 'react';
import {
  Building2,
  LifeBuoy,
  ListChecks,
  Repeat,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';

interface ClassificationMeta {
  label: string;
  variant: NonNullable<BadgeProps['variant']>;
  Icon: LucideIcon;
}

/**
 * Categorías de las actividades de la bitácora: etiqueta, tono e icono por
 * código (maestra ACTIVITY_CLASS). Siempre icono + texto, nunca solo color.
 */
export const CLASSIFICATION_META: Record<string, ClassificationMeta> = {
  PLANIFICADA: { label: 'Planificada', variant: 'accent', Icon: ListChecks },
  SOPORTE: { label: 'Soporte', variant: 'neutral', Icon: LifeBuoy },
  INTERNA: { label: 'Interna', variant: 'neutral', Icon: Building2 },
  EXTRAORDINARIA: { label: 'Extraordinaria', variant: 'warning', Icon: Zap },
  REUNION: { label: 'Reunión', variant: 'info', Icon: Users },
  RECURRENTE: { label: 'Actividad recurrente', variant: 'success', Icon: Repeat },
};

export function classificationLabel(code: string): string {
  return CLASSIFICATION_META[code]?.label ?? code;
}

export function ClassificationBadge({
  code,
  className,
}: {
  code: string;
  className?: string;
}): React.ReactElement {
  const meta = CLASSIFICATION_META[code];
  if (!meta) {
    return (
      <Badge variant="outline" className={className}>
        {code}
      </Badge>
    );
  }
  return (
    <Badge variant={meta.variant} className={className}>
      <meta.Icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}
