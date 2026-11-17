import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Prueba guardiana: los mensajes de las excepciones de los módulos van en
 * español con tildes y nunca interpolan el id de un recurso (UUID).
 */
const MODULES_DIR = path.resolve(__dirname, '../../modules');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

/** Argumentos de cada `new XException(...)`, respetando cadenas y paréntesis anidados. */
function exceptionArguments(source: string): string[] {
  const args: string[] = [];
  const re = /new\s+\w+Exception\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    let i = match.index + match[0].length;
    const start = i;
    let depth = 1;
    let quote: string | null = null;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
      } else if (c === "'" || c === '"' || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    args.push(source.slice(start, i - 1));
    re.lastIndex = i - 1;
  }
  return args;
}

function stringLiterals(arg: string): string[] {
  return Array.from(arg.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/gs), (m) => m[2]);
}

const ID_INTERPOLATION = /\$\{[^}]*\b(?:id|Id|ids|Ids)\b[^}]*\}/;
const MISSING_TILDES = [
  /\bArea\b/,
  /\barea\b/,
  /\b[Aa]signacion/,
  /\b[Rr]eunion/,
  /proteccion/,
  /\binvalid[ao]\b/,
  /\bvalid[ao]\b/,
  /\blider\b/,
  /\b[Cc]lasificacion/,
  /\b[Ee]jecucion/,
  /\bcodigo\b/,
  /\bunic[ao]\b/,
  /\baccion\b/,
  /\besta (desactivad|fuera|activo|inactivo|abierta|duplicado|habilitado|disponible)/,
  /\b[Vv]ersion\b/,
  /\brevision\b/,
  /\boperacion\b/,
  /\bcatalogo\b/,
  /justificacion/,
  /priorizacion/,
  /\bdias\b/,
  /\bmaximo\b/,
  /\bsegun\b/,
  /\bAun\b/,
];

describe('mensajes de excepción de los módulos', () => {
  const entries = walk(MODULES_DIR).flatMap((file) =>
    exceptionArguments(fs.readFileSync(file, 'utf8')).flatMap((arg) =>
      stringLiterals(arg).map((literal) => ({ file: path.relative(MODULES_DIR, file), literal })),
    ),
  );

  it('encuentra los mensajes (la guardia no está vacía)', () => {
    expect(entries.length).toBeGreaterThan(300);
  });

  it('ninguno interpola el id de un recurso', () => {
    const bad = entries.filter((e) => ID_INTERPOLATION.test(e.literal));
    expect(bad).toEqual([]);
  });

  it('ninguno contiene palabras sin tilde de la lista negra', () => {
    const bad = entries.filter((e) => MISSING_TILDES.some((re) => re.test(e.literal)));
    expect(bad).toEqual([]);
  });
});
