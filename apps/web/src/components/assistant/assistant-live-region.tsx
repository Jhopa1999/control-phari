'use client';

import * as React from 'react';
import { useAssistant } from './assistant-provider';

/**
 * Región viva única de la superficie (panel o página). Anuncia HITOS del turno
 * («Consultando solicitudes.», «El asistente terminó de responder.»), nunca el
 * texto en streaming. El panel es modal: su región debe vivir dentro de él.
 */
export function AssistantLiveRegion(): React.ReactElement {
  const { liveMessage } = useAssistant();
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {liveMessage}
    </div>
  );
}
