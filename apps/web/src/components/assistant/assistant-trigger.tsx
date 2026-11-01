'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { DisabledHint } from '@/components/disabled-reason';
import { Button } from '@/components/ui/button';
import { useAssistant } from './assistant-provider';

const DEFAULT_REASON = 'El asistente no está disponible por ahora.';

/**
 * Botón «Asistente» del encabezado. Con el asistente no disponible se muestra
 * como acción no disponible (sigue enfocable) y el motivo sale en un tooltip;
 * en `/asistente` no se pinta (ya estás en él).
 */
export function AssistantTrigger({
  iconOnly = false,
}: {
  iconOnly?: boolean;
}): React.ReactElement | null {
  const a = useAssistant();
  const pathname = usePathname();
  if (pathname === '/asistente' || pathname.startsWith('/asistente/')) return null;

  const button = (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? 'icon' : 'default'}
      aria-label="Abrir asistente"
      aria-haspopup="dialog"
      className={iconOnly ? undefined : 'h-9 gap-1.5 px-2.5'}
      onClick={() => {
        a.setPanelOpen(true);
        a.refreshAvailability();
      }}
    >
      <Sparkles aria-hidden="true" />
      {iconOnly ? null : <span>Asistente</span>}
    </Button>
  );

  if (a.availability.state === 'unavailable') {
    return (
      <DisabledHint reason={a.availability.reason ?? DEFAULT_REASON} label="Asistente">
        {button}
      </DisabledHint>
    );
  }
  return button;
}
