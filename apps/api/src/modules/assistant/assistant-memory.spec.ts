import {
  checkProposalIds,
  collectSeenIds,
  collectUuids,
  compactArgs,
  digestToolResult,
  idProblemMessage,
  proposalsBlock,
  publicToolCalls,
  stableStringify,
  storedMemory,
  toolMemoryBlock,
  turnContext,
} from './assistant-memory';

/**
 * Memoria de herramientas del asistente: resumen de lo consultado con sus ids,
 * contexto de turnos anteriores, validación de identificadores de una propuesta
 * y comparación estable de argumentos.
 */
const ID_A = '9f54f9ca-bf0d-4ec9-99d8-d51ec7438cbb';
const ID_B = 'b94af6cd-8856-40c8-bd31-8eefefdf8e10';
const INVENTED = '8c5a8c5a-8c5a-8c5a-8c5a-8c5a8c5a8c5a';

describe('digestToolResult', () => {
  it('conserva un renglón por registro con su id y campos descriptivos', () => {
    const digest = digestToolResult(
      JSON.stringify([
        { id: ID_A, code: 'BI', name: 'Business Intelligence', extra: 'x'.repeat(500) },
        { id: ID_B, title: 'LUL240', operationalState: 'REGISTRADA' },
      ]),
    );
    expect(digest).toContain(`- id=${ID_A} · name="Business Intelligence" · code="BI"`);
    expect(digest).toContain(`id=${ID_B} · title="LUL240" · operationalState="REGISTRADA"`);
    expect(digest).not.toContain('xxxxx');
  });

  it('encuentra registros anidados y limita la cantidad', () => {
    const nested = digestToolResult(JSON.stringify({ items: [{ id: 'a', name: 'Uno' }], total: 1 }));
    expect(nested).toContain('id=a · name="Uno"');
    const many = digestToolResult(
      JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}`, name: `N${i}` }))),
    );
    expect(many.split('\n')).toHaveLength(40);
  });

  it('sin JSON o sin ids guarda un extracto', () => {
    expect(digestToolResult('texto   plano\ncon saltos')).toBe('texto plano con saltos');
    expect(digestToolResult(JSON.stringify({ total: 3 }))).toBe('{"total":3}');
  });

  it('compactArgs omite lo vacío y recorta lo largo', () => {
    expect(compactArgs({})).toBeUndefined();
    expect(compactArgs(null)).toBeUndefined();
    expect(compactArgs({ q: 'bi' })).toBe('{"q":"bi"}');
    expect(compactArgs({ q: 'x'.repeat(500) })?.length).toBe(301);
  });
});

describe('contexto de turnos anteriores', () => {
  it('arma el bloque de memoria con el nombre, los argumentos y los ids', () => {
    const block = toolMemoryBlock([{ name: 'process.list', args: '{"q":"bi"}', digest: `- id=${ID_A}` }]);
    expect(block).toContain('<memoria_herramientas>');
    expect(block).toContain('process.list {"q":"bi"}:');
    expect(block).toContain(`id=${ID_A}`);
    expect(toolMemoryBlock([])).toBeNull();
    expect(toolMemoryBlock([{ name: 'x', digest: '  ' }])).toBeNull();
  });

  it('describe cada estado de propuesta y pide no repetir lo hecho', () => {
    const base = { toolName: 'request.create', title: 'Crear solicitud', summary: 'Crear «LUL240»', resultId: null, resultTitle: null, error: null };
    const block = proposalsBlock([
      { ...base, status: 'CONFIRMADA', resultId: ID_B, resultTitle: 'LUL240' },
      { ...base, status: 'FALLIDA', error: 'Recurso no encontrado.' },
      { ...base, status: 'PENDIENTE' },
      { ...base, status: 'DESCARTADA' },
      { ...base, status: 'EXPIRADA' },
    ]) as string;
    expect(block).toContain(`CONFIRMADA y ejecutada por la persona. Resultado: «LUL240» id=${ID_B}. No la repitas.`);
    expect(block).toContain('FALLIDA (no se aplicó nada). Motivo: Recurso no encontrado.');
    expect(block).toContain('PENDIENTE: la persona aún no la confirma');
    expect(block).toContain('DESCARTADA por la persona');
    expect(block).toContain('VENCIDA sin respuesta');
    expect(proposalsBlock([])).toBeNull();
  });

  it('turnContext junta ambos bloques o devuelve undefined', () => {
    expect(turnContext([], [])).toBeUndefined();
    expect(turnContext([{ name: 'a', digest: '- id=1' }], [])).toContain('<memoria_herramientas>');
  });
});

describe('lectura de lo guardado', () => {
  it('storedMemory ignora datos antiguos sin memoria', () => {
    expect(storedMemory(null)).toEqual([]);
    expect(storedMemory([{ name: 'a', label: 'a', status: 'done' }])).toEqual([]);
    expect(storedMemory([{ name: 'a', memory: '- id=1', args: '{}' }])).toEqual([
      { name: 'a', digest: '- id=1', args: '{}' },
    ]);
  });

  it('publicToolCalls quita la memoria interna', () => {
    expect(
      publicToolCalls([{ name: 'a', label: 'procesos', status: 'error', memory: 'x', args: 'y' }]),
    ).toEqual([{ name: 'a', label: 'procesos', status: 'error' }]);
    expect(publicToolCalls('nada')).toEqual([]);
  });
});

describe('checkProposalIds', () => {
  const seen = new Set([ID_A, ID_B]);

  it('acepta identificadores que ya aparecieron (sin importar mayúsculas)', () => {
    const args = { body: { mainProcessId: ID_A.toUpperCase(), responsibles: [{ userId: ID_B }] } };
    expect(checkProposalIds(args, seen)).toEqual({ malformed: [], unverified: [] });
  });

  it('marca un identificador válido que nunca apareció', () => {
    const check = checkProposalIds({ body: { mainProcessId: INVENTED } }, seen);
    expect(check.unverified).toEqual([INVENTED]);
    expect(check.malformed).toEqual([]);
  });

  it('marca un identificador cortado en un campo de id, pero no en un texto libre', () => {
    expect(checkProposalIds({ id: 'c8d4e5f6-7890-...' }, seen).malformed).toEqual(['c8d4e5f6-7890-...']);
    expect(checkProposalIds({ body: { notes: 'ver c8d4e5f6-7890 en el acta' } }, seen)).toEqual({
      malformed: [],
      unverified: [],
    });
  });

  it('encuentra identificadores incrustados en un texto', () => {
    const check = checkProposalIds({ notes: `usar ${INVENTED}` }, seen);
    expect(check.unverified).toEqual([INVENTED]);
  });

  it('idProblemMessage explica cómo corregirlo, o devuelve null si no hay problema', () => {
    expect(idProblemMessage({ malformed: [], unverified: [] })).toBeNull();
    const message = idProblemMessage({ malformed: ['abc-1234'], unverified: [INVENTED] }) as string;
    expect(message).toContain('abc-1234');
    expect(message).toContain(INVENTED);
    expect(message).toMatch(/Nunca inventes/);
  });
});

describe('identificadores vistos y comparación de argumentos', () => {
  it('reúne los ids de la persona, los mensajes, las consultas y las acciones ya hechas', () => {
    const seen = collectSeenIds(
      'USER-1',
      [
        { text: `usa el proceso ${ID_A}` },
        { text: 'x', tools: [{ name: 'a', memory: `- id=${ID_B}` }] },
        { text: 'y', attachments: [{ extractedText: 'sin ids' }] },
      ],
      new Map([['m1', [{ resultId: INVENTED.toUpperCase() }, { resultId: null }]]]),
    );
    expect(seen.has('user-1')).toBe(true);
    expect(seen.has(ID_A)).toBe(true);
    expect(seen.has(ID_B)).toBe(true);
    expect(seen.has(INVENTED)).toBe(true);
    expect(collectUuids(`a ${ID_A.toUpperCase()} b`)).toEqual([ID_A]);
  });

  it('stableStringify ignora el orden de las claves', () => {
    expect(stableStringify({ b: 1, a: { d: [1, 2], c: 'x' } })).toBe(
      stableStringify({ a: { c: 'x', d: [1, 2] }, b: 1 }),
    );
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});
