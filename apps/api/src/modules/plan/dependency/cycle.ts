/**
 * Arista dirigida dependent -> predecessor. El nodo es un `string` generico para
 * servir tanto a UUID de BD (chequeo incremental de DependencyService.add) como
 * a referencias locales del documento (chequeo del grafo completo en el import).
 */
export type Edge = { dependentRef: string; predecessorRef: string };

/** Construye adyacencia dependent -> [predecesoras...] a partir de las aristas. */
function buildAdjacency(edges: Edge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.dependentRef) ?? [];
    list.push(edge.predecessorRef);
    adjacency.set(edge.dependentRef, list);
  }
  return adjacency;
}

/**
 * DFS desde `from` sobre el grafo dependent -> predecessor; devuelve true si
 * alcanza `to`. Es el nucleo del chequeo incremental de una sola arista
 * candidata de DependencyService.add (design §6.2): antes de anadir
 * dependent->predecessor se comprueba si `predecessor` ya alcanza `dependent`.
 */
export function reaches(edges: Edge[], from: string, to: string): boolean {
  const adjacency = buildAdjacency(edges);
  const visited = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const node = stack.pop() as string;
    if (node === to) {
      return true;
    }
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of adjacency.get(node) ?? []) {
      stack.push(next);
    }
  }
  return false;
}

/**
 * true si el grafo dirigido (dependent -> predecessor) contiene ALGUN ciclo.
 * DFS con colores (blanco=no visto, gris=en pila, negro=terminado) sobre todos
 * los nodos: una arista hacia un nodo gris es un back-edge -> ciclo. Es el
 * chequeo que usa el import sobre el grafo completo del documento (design §6.2).
 */
export function hasCycle(edges: Edge[]): boolean {
  const adjacency = buildAdjacency(edges);
  const nodes = new Set<string>();
  for (const edge of edges) {
    nodes.add(edge.dependentRef);
    nodes.add(edge.predecessorRef);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of nodes) color.set(node, WHITE);

  const visit = (start: string): boolean => {
    // DFS iterativo con marca de entrada/salida para colorear gris/negro.
    const stack: Array<{ node: string; phase: 'enter' | 'exit' }> = [
      { node: start, phase: 'enter' },
    ];
    while (stack.length > 0) {
      const frame = stack.pop() as { node: string; phase: 'enter' | 'exit' };
      if (frame.phase === 'exit') {
        color.set(frame.node, BLACK);
        continue;
      }
      if (color.get(frame.node) === GRAY) continue;
      color.set(frame.node, GRAY);
      stack.push({ node: frame.node, phase: 'exit' });
      for (const next of adjacency.get(frame.node) ?? []) {
        const c = color.get(next) ?? WHITE;
        if (c === GRAY) {
          return true;
        }
        if (c === WHITE) {
          stack.push({ node: next, phase: 'enter' });
        }
      }
    }
    return false;
  };

  for (const node of nodes) {
    if (color.get(node) === WHITE && visit(node)) {
      return true;
    }
  }
  return false;
}
