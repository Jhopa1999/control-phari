import type { Process, Request } from '@/lib/api-client';

/**
 * «Multiproceso» es una etiqueta DERIVADA, no un dato capturado: aplica cuando
 * la solicitud tiene más de un proceso que interviene (participantes). Antes se
 * pedía como valor de la «Ruta» del triage; hoy la coordinación entre procesos
 * se expresa marcando participantes.
 *
 * Devuelve el texto a mostrar (con los nombres de los procesos que intervienen,
 * el principal primero) o `null` si la solicitud no es multiproceso.
 */
export function multiprocessSummary(
  request: Pick<Request, 'mainProcessId' | 'participants'>,
  processes: readonly Pick<Process, 'id' | 'name'>[],
): string | null {
  if (request.participants.length <= 1) return null;
  const nameOf = (id: string): string => processes.find((p) => p.id === id)?.name ?? 'Proceso fuera de tu alcance';
  const ordered = [...request.participants].sort((a, b) => {
    if (a.processId === request.mainProcessId) return -1;
    if (b.processId === request.mainProcessId) return 1;
    return 0;
  });
  return `Multiproceso · ${ordered.map((p) => nameOf(p.processId)).join(', ')}`;
}
