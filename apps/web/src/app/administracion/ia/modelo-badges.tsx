import * as React from 'react';
import {
  Box,
  CircleDollarSign,
  Eye,
  FileText,
  Gem,
  Star,
  Thermometer,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AiModelCatalogEntry } from '@/lib/api-client';
import { formatUsd } from './ia-format';

type Tier = AiModelCatalogEntry['tier'];
type CapabilityKey =
  | 'supportsTemperature'
  | 'supportsTools'
  | 'supportsVision'
  | 'supportsDocuments';

/** Nivel del modelo: tono, icono y etiqueta (nunca solo color). */
export const TIERS: Record<
  Tier,
  { label: string; variant: 'success' | 'info' | 'neutral'; Icon: LucideIcon }
> = {
  default: { label: 'Recomendado', variant: 'success', Icon: Star },
  premium: { label: 'Premium', variant: 'info', Icon: Gem },
  other: { label: 'Otro', variant: 'neutral', Icon: Box },
};

/** Capacidades que declara un modelo, con su icono y etiqueta. */
export const CAPABILITIES: ReadonlyArray<{
  key: CapabilityKey;
  label: string;
  Icon: LucideIcon;
}> = [
  { key: 'supportsTemperature', label: 'Temperatura', Icon: Thermometer },
  { key: 'supportsTools', label: 'Herramientas', Icon: Wrench },
  { key: 'supportsVision', label: 'Visión', Icon: Eye },
  { key: 'supportsDocuments', label: 'Documentos', Icon: FileText },
];

export function ModelTierBadge({ tier }: { tier: Tier }): React.ReactElement {
  const { label, variant, Icon } = TIERS[tier];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

/** Capacidades presentes como badges; sin ninguna, «Solo texto». */
export function CapabilityBadges({
  model,
}: {
  model: Pick<AiModelCatalogEntry, CapabilityKey>;
}): React.ReactElement {
  const present = CAPABILITIES.filter((c) => model[c.key]);
  if (present.length === 0) {
    return <span className="text-meta text-muted-foreground">Solo texto</span>;
  }
  return (
    <ul aria-label="Capacidades" className="flex flex-wrap gap-1">
      {present.map(({ key, label, Icon }) => (
        <li key={key}>
          <Badge variant="neutral">
            <Icon aria-hidden="true" />
            {label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Precio por millón de tokens, o «Sin precio» (no suma al costo). */
export function PriceText({ value }: { value: number | null }): React.ReactElement {
  if (value === null) {
    return (
      <Badge variant="warning">
        <CircleDollarSign aria-hidden="true" />
        Sin precio
        <span className="sr-only">: no suma al costo</span>
      </Badge>
    );
  }
  return (
    <span className="tabular-nums">
      {formatUsd(value, 4)} <span className="text-muted-foreground">por millón de tokens</span>
    </span>
  );
}
