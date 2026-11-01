import {
  MAX_EXCERPT_CHARS,
  normalize,
  parseSections,
  queryStems,
  searchSections,
  stemOf,
} from './help-search';

const MARKDOWN = [
  '# Pantallas',
  'Introducción que se descarta.',
  '',
  '## Demanda',
  'Bandejas de solicitudes, triage y priorización.',
  '',
  '### Aprobaciones',
  'Aprueba el compromiso de una solicitud o devuelve a triage. Solo el jefe de área aprueba.',
  '',
  '### Triage',
  'Clasifica la solicitud: ruta, tipo de demanda y criticidad.',
  '',
  '## Documentos',
  'Los documentos tienen versiones y se envían a aprobación.',
  '',
  '```',
  '## esto es código, no un encabezado',
  '```',
].join('\n');

describe('normalize / queryStems', () => {
  it('quita tildes, mayúsculas y puntuación', () => {
    expect(normalize('¿Cómo APRUEBO un Documento?')).toBe('como apruebo un documento');
  });

  it('descarta palabras vacías y cortas y devuelve raíces únicas', () => {
    expect(queryStems('¿Cómo puedo aprobar un documento en el portal?')).toEqual([
      'aprob',
      'docum',
    ]);
    expect(queryStems('aprobar aprobación aprobado')).toEqual(['aprob']);
    expect(queryStems('')).toEqual([]);
  });

  it('las palabras de hasta 4 letras se comparan completas', () => {
    expect(stemOf('plan')).toBe('plan');
    expect(stemOf('solicitudes')).toBe('solic');
  });
});

describe('parseSections', () => {
  const sections = parseSections('Pantallas del portal', 'frontend-pantallas.md', MARKDOWN);

  it('parte por ## y ### y descarta el texto previo al primer encabezado', () => {
    expect(sections.map((s) => s.heading)).toEqual([
      'Demanda',
      'Demanda › Aprobaciones',
      'Demanda › Triage',
      'Documentos',
    ]);
    expect(sections.every((s) => !s.body.includes('Introducción'))).toBe(true);
  });

  it('no interpreta encabezados dentro de bloques de código', () => {
    const last = sections[sections.length - 1];
    expect(last.body).toContain('## esto es código');
    expect(sections.some((s) => s.heading.includes('esto es código'))).toBe(false);
  });

  it('conserva origen y archivo', () => {
    expect(sections[0]).toMatchObject({
      source: 'Pantallas del portal',
      file: 'frontend-pantallas.md',
    });
  });
});

describe('parseSections · tablas', () => {
  const TABLE = [
    '## Administración',
    'Pantallas de administración.',
    '',
    '| Ruta | Pantalla | Qué permite hacer |',
    '| --- | --- | --- |',
    '| `/administracion/revision` | Aprobaciones | Colas de aprobación de compromisos y planes. |',
    '| `/administracion/areas` | Áreas | Crear y editar áreas organizativas. |',
  ].join('\n');
  const sections = parseSections('Pantallas', 'f.md', TABLE);

  it('cada fila es su propia sección, titulada con el nombre de la pantalla', () => {
    expect(sections.map((s) => s.heading)).toEqual([
      'Administración',
      'Administración › Aprobaciones',
      'Administración › Áreas',
    ]);
  });

  it('la fila conserva el encabezado de la tabla para entender las columnas', () => {
    const row = sections[1];
    expect(row.body.split('\n')[0]).toContain('Qué permite hacer');
    expect(row.body).toContain('Colas de aprobación');
    expect(row.body).not.toContain('Crear y editar áreas');
  });

  it('el texto fuera de la tabla queda en la sección', () => {
    expect(sections[0].body).toBe('Pantallas de administración.');
  });

  it('una consulta encuentra la fila concreta, no la tabla entera', () => {
    const [top] = searchSections(sections, 'cómo apruebo un plan', 3);
    expect(top.heading).toBe('Administración › Aprobaciones');
  });

  it('una tabla de menos de tres líneas se trata como texto', () => {
    const tiny = parseSections('S', 'f.md', '## T\n| a | b |\n| - | - |');
    expect(tiny).toHaveLength(1);
    expect(tiny[0].body).toContain('| a | b |');
  });
});

describe('searchSections', () => {
  const sections = parseSections('Pantallas', 'f.md', MARKDOWN);

  it('encuentra por raíz sin importar tildes (aprobar -> Aprobaciones)', () => {
    const [top] = searchSections(sections, 'como aprobar', 3);
    expect(top.heading).toBe('Demanda › Aprobaciones');
  });

  it('el encabezado pesa más que el cuerpo', () => {
    const [top] = searchSections(sections, 'triage', 3);
    expect(top.heading).toBe('Demanda › Triage');
  });

  it('cubrir más palabras de la consulta sube el puntaje', () => {
    const results = searchSections(sections, 'documentos aprobacion', 4);
    expect(results[0].heading).toBe('Documentos');
  });

  it('sin coincidencias o sin palabras útiles devuelve vacío', () => {
    expect(searchSections(sections, 'zzzz inexistente', 4)).toEqual([]);
    expect(searchSections(sections, 'el de la', 4)).toEqual([]);
  });

  it('respeta el límite y ordena de mayor a menor', () => {
    const results = searchSections(sections, 'solicitud triage aprobacion', 2);
    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('recorta extractos largos', () => {
    const long = parseSections('S', 'f.md', `## Tema\n${'palabra '.repeat(1000)}`);
    const [match] = searchSections(long, 'palabra', 1);
    expect(match.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS + 1);
    expect(match.excerpt.endsWith('…')).toBe(true);
  });
});
