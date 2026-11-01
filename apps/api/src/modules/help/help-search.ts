/**
 * Búsqueda en la documentación de uso del portal (BL-032: ayuda del asistente).
 * Lógica pura y sin dependencias: parte los archivos Markdown en secciones por
 * encabezado y puntúa cada sección contra una consulta, sin distinguir tildes ni
 * mayúsculas y con coincidencia por raíz («aprobar» encuentra «aprobación»).
 */

/** Sección de un documento: un encabezado `##` o `###` y su cuerpo. */
export interface HelpSection {
  /** Etiqueta legible del documento de origen. */
  source: string;
  /** Archivo de origen (p. ej. `frontend-pantallas.md`). */
  file: string;
  /** Encabezado, con el padre si es `###` («Demanda › Solicitudes»). */
  heading: string;
  /** Texto de la sección sin el encabezado. */
  body: string;
}

/** Resultado de una búsqueda. */
export interface HelpMatch {
  source: string;
  file: string;
  heading: string;
  excerpt: string;
  score: number;
}

/** Largo máximo del extracto devuelto por sección. */
export const MAX_EXCERPT_CHARS = 2500;

const STOPWORDS = new Set([
  'para', 'como', 'cual', 'cuales', 'donde', 'cuando', 'quien', 'que', 'por',
  'con', 'sin', 'una', 'uno', 'unos', 'unas', 'los', 'las', 'del', 'este',
  'esta', 'esto', 'estos', 'estas', 'hay', 'puedo', 'puede', 'pueden', 'hacer',
  'portal', 'sobre', 'entre', 'desde', 'hasta', 'tiene', 'tengo', 'quiero',
  'necesito', 'mis', 'sus', 'mas', 'muy', 'ser', 'son', 'fue', 'ver',
]);

/** Minúsculas, sin tildes y con la puntuación convertida en espacios. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** Raíz de comparación de una palabra de la consulta (prefijo de hasta 5 letras). */
export function stemOf(token: string): string {
  return token.length <= 4 ? token : token.slice(0, 5);
}

/** Palabras significativas de la consulta, ya como raíces y sin repetidos. */
export function queryStems(query: string): string[] {
  const stems = normalize(query)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map(stemOf);
  return [...new Set(stems)];
}

/**
 * Parte un Markdown en secciones por `##` y `###`. El texto previo al primer
 * encabezado se descarta (título y presentación del archivo). Las líneas dentro
 * de bloques de código no se interpretan como encabezados.
 */
export function parseSections(
  source: string,
  file: string,
  markdown: string,
): HelpSection[] {
  const sections: HelpSection[] = [];
  let parent = '';
  let heading: string | null = null;
  let body: string[] = [];
  let inFence = false;

  const flush = (): void => {
    if (heading !== null) {
      sections.push(...splitTables(source, file, heading, body));
    }
    body = [];
  };

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    const match = inFence ? null : /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      const title = match[2].replace(/`/g, '');
      if (match[1] === '##') {
        parent = title;
        heading = title;
      } else {
        heading = parent ? `${parent} › ${title}` : title;
      }
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

/** Texto de una celda de tabla sin formato (comillas invertidas, asteriscos). */
function plainCell(cell: string): string {
  return cell.replace(/[`*]/g, '').trim();
}

/**
 * Convierte el cuerpo de una sección en una o varias secciones. El texto normal
 * queda en la sección; cada FILA de una tabla pasa a ser su propia sección
 * (con el encabezado de la tabla para entender las columnas) y su título sale
 * de la segunda celda —el nombre de la pantalla— o de la primera. Así «cómo
 * apruebo un documento» encuentra la fila de Aprobaciones y no una tabla de 20
 * pantallas recortada.
 */
function splitTables(
  source: string,
  file: string,
  heading: string,
  lines: string[],
): HelpSection[] {
  const out: HelpSection[] = [];
  const prose: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trimStart().startsWith('|')) {
      prose.push(lines[i]);
      i += 1;
      continue;
    }
    const block: string[] = [];
    while (i < lines.length && lines[i].trimStart().startsWith('|')) {
      block.push(lines[i].trim());
      i += 1;
    }
    if (block.length < 3) {
      prose.push(...block);
      continue;
    }
    const [header, separator, ...rows] = block;
    for (const row of rows) {
      const cells = row.split('|').slice(1, -1).map(plainCell);
      const label = cells[1] || cells[0] || '';
      out.push({
        source,
        file,
        heading: label ? `${heading} › ${label}` : heading,
        body: [header, separator, row].join('\n'),
      });
    }
  }
  const text = prose.join('\n').trim();
  if (text !== '') out.unshift({ source, file, heading, body: text });
  return out;
}

/** Cuenta cuántas palabras del texto empiezan por la raíz. */
function countStem(words: string[], stem: string): number {
  let n = 0;
  for (const w of words) if (w.startsWith(stem)) n += 1;
  return n;
}

/**
 * Puntúa las secciones contra la consulta: el encabezado pesa más que el cuerpo
 * y las repeticiones en el cuerpo se topan para que un texto largo no gane solo
 * por su tamaño. Devuelve las `limit` mejores con puntaje mayor que cero.
 */
export function searchSections(
  sections: ReadonlyArray<HelpSection>,
  query: string,
  limit: number,
): HelpMatch[] {
  const stems = queryStems(query);
  if (stems.length === 0) return [];

  const scored: HelpMatch[] = [];
  for (const section of sections) {
    const titleWords = normalize(section.heading).split(' ');
    const bodyWords = normalize(section.body).split(' ');
    let score = 0;
    let matched = 0;
    for (const stem of stems) {
      const inTitle = countStem(titleWords, stem) > 0;
      const inBody = Math.min(countStem(bodyWords, stem), 5);
      if (inTitle || inBody > 0) matched += 1;
      score += (inTitle ? 6 : 0) + inBody;
    }
    // Cubrir más palabras de la consulta vale más que repetir una sola.
    score = score * (1 + matched / stems.length);
    if (score > 0) {
      scored.push({
        source: section.source,
        file: section.file,
        heading: section.heading,
        excerpt:
          section.body.length > MAX_EXCERPT_CHARS
            ? `${section.body.slice(0, MAX_EXCERPT_CHARS).trimEnd()}…`
            : section.body,
        score: Math.round(score * 10) / 10,
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
