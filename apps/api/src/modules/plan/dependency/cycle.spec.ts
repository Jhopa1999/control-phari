import { Edge, hasCycle, reaches } from './cycle';

describe('cycle helpers (design §6.2)', () => {
  describe('hasCycle (grafo completo)', () => {
    it('ciclo directo A->B->A -> true', () => {
      const edges: Edge[] = [
        { dependentRef: 'A', predecessorRef: 'B' },
        { dependentRef: 'B', predecessorRef: 'A' },
      ];
      expect(hasCycle(edges)).toBe(true);
    });

    it('ciclo transitivo A->B->C->A -> true', () => {
      const edges: Edge[] = [
        { dependentRef: 'A', predecessorRef: 'B' },
        { dependentRef: 'B', predecessorRef: 'C' },
        { dependentRef: 'C', predecessorRef: 'A' },
      ];
      expect(hasCycle(edges)).toBe(true);
    });

    it('DAG A->B, A->C, B->C -> false', () => {
      const edges: Edge[] = [
        { dependentRef: 'A', predecessorRef: 'B' },
        { dependentRef: 'A', predecessorRef: 'C' },
        { dependentRef: 'B', predecessorRef: 'C' },
      ];
      expect(hasCycle(edges)).toBe(false);
    });

    it('grafo vacio -> false', () => {
      expect(hasCycle([])).toBe(false);
    });

    it('auto-arista A->A -> true', () => {
      expect(hasCycle([{ dependentRef: 'A', predecessorRef: 'A' }])).toBe(true);
    });
  });

  describe('reaches (una arista candidata)', () => {
    const edges: Edge[] = [
      { dependentRef: 'A', predecessorRef: 'B' },
      { dependentRef: 'B', predecessorRef: 'C' },
    ];

    it('alcanzable directo: from=A alcanza B', () => {
      expect(reaches(edges, 'A', 'B')).toBe(true);
    });

    it('alcanzable transitivo: from=A alcanza C', () => {
      expect(reaches(edges, 'A', 'C')).toBe(true);
    });

    it('no alcanzable: from=C no alcanza A', () => {
      expect(reaches(edges, 'C', 'A')).toBe(false);
    });

    it('from == to -> true', () => {
      expect(reaches(edges, 'A', 'A')).toBe(true);
    });
  });
});
