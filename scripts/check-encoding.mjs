#!/usr/bin/env node
// Verifica que los archivos de texto versionados no contengan texto corrupto
// (mojibake) ni BOM. Sin dependencias. Uso: `npm run check:encoding`.
//
// Mojibake = texto UTF-8 leído con otra codificación y vuelto a guardar. Se
// detectan las PAREJAS de caracteres que producen las tildes rotas, nunca el
// carácter aislado, para no marcar los caracteres de dibujo de árboles de
// directorio (`├──`, `│`, `└──`), que son legítimos en bloques de código.
//
// Los patrones se escriben con escapes \u para que este archivo no se
// detecte a sí mismo ni se corrompa al copiarlo.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Caracteres que CP1252 asigna a los bytes 0x80-0xBF (segundo byte de una
// secuencia UTF-8 de 2 bytes) más los no asignados (\x81 \x8D \x8F \x90 \x9D).
const CP1252_CONT =
  '[\\u00A0-\\u00BF\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178\\u0081\\u008D\\u008F\\u0090\\u009D]';

// Una línea que documenta estas secuencias a propósito lleva esta marca (p. ej.
// en un comentario HTML al final de la línea de un .md).
export const MARCA_IGNORAR = 'check-encoding:ignore';

export const PATRONES = [
  {
    // UTF-8 leído como CP1252: á -> "Ã¡", é -> "Ã©", ñ -> "Ã±", Á -> "Ã\x81".
    id: 'cp1252-ã',
    descripcion: 'UTF-8 leído como CP1252 (Ã seguido de byte de continuación)',
    regex: new RegExp('\\u00C3' + CP1252_CONT),
  },
  {
    // Comillas, guiones y puntos suspensivos: "â€œ", "â€”", "â€¦".
    id: 'cp1252-â',
    descripcion: 'UTF-8 de 3 bytes leído como CP1252 (â€ ...)',
    regex: /\u00E2\u20AC/,
  },
  {
    // Espacio duro y signos latinos: "Â ", "Â¿", "Â°".
    id: 'cp1252-â-suelta',
    descripcion: 'Prefijo C2 leído como CP1252 (Â seguido de signo latino)',
    regex: /\u00C2[\u00A0-\u00BF]/,
  },
  {
    // UTF-8 leído como CP850: á -> "├í", é -> "├®", í -> "├¡", ó -> "├│",
    // ú -> "├║", ñ -> "├▒", ü -> "├╝", Á -> "├ü", É -> "├ë", Í -> "├ì",
    // Ó -> "├ô", Ú -> "├Ü", Ñ -> "├æ". El árbol "├──" no coincide: tras ├ va ─.
    id: 'cp850-├',
    descripcion: 'UTF-8 leído como CP850 (├ seguido de carácter de tilde rota)',
    regex: /\u251C[\u00ED\u00AE\u00A1\u2502\u2551\u2592\u255D\u00FC\u00EB\u00EC\u00F4\u00DC\u00E6]/,
  },
  {
    // ¡ -> "┬í", espacio duro -> "┬á". No se usa "┬┐" (¿): ┬┐ es válido en tablas de cajas.
    id: 'cp850-┬',
    descripcion: 'UTF-8 (prefijo C2) leído como CP850 (┬ seguido de signo roto)',
    regex: /\u252C[\u00ED\u00E1]/,
  },
  {
    id: 'reemplazo',
    descripcion: 'Carácter de reemplazo U+FFFD (se perdió información)',
    regex: /\uFFFD/,
  },
];

/**
 * Devuelve los hallazgos de un texto: BOM al inicio y líneas con mojibake.
 * @param {string} texto contenido ya decodificado como UTF-8
 * @returns {{ linea: number, regla: string, descripcion: string, fragmento: string }[]}
 */
export function analizarTexto(texto) {
  const hallazgos = [];
  if (texto.charCodeAt(0) === 0xfeff) {
    hallazgos.push({
      linea: 1,
      regla: 'bom',
      descripcion: 'BOM UTF-8 al inicio del archivo',
      fragmento: '(BOM)',
    });
  }
  const lineas = texto.split(/\r?\n/);
  lineas.forEach((linea, i) => {
    if (linea.includes(MARCA_IGNORAR)) return;
    for (const patron of PATRONES) {
      const m = patron.regex.exec(linea);
      if (m) {
        hallazgos.push({
          linea: i + 1,
          regla: patron.id,
          descripcion: patron.descripcion,
          fragmento: linea.slice(Math.max(0, m.index - 15), m.index + 25).trim(),
        });
      }
    }
  });
  return hallazgos;
}

const EXTENSIONES = /\.(md|json|ts|tsx|js|mjs|cjs|css|yml|yaml|sql|prisma|txt|html)$/i;
const ALCANCE = [
  /^docs\//,
  /^e2e\//,
  /^apps\/[^/]+\/src\//,
  /^\.kiro\//,
  /^[^/]+\.md$/,
];

export function enAlcance(ruta) {
  return ALCANCE.some((re) => re.test(ruta)) && EXTENSIONES.test(ruta);
}

function main() {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const salida = execFileSync('git', ['-C', raiz, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const archivos = salida.split('\0').filter((r) => r && enAlcance(r));
  let total = 0;
  for (const ruta of archivos) {
    let texto;
    try {
      texto = readFileSync(resolve(raiz, ruta), 'utf8');
    } catch {
      continue; // archivo borrado en el árbol de trabajo
    }
    for (const h of analizarTexto(texto)) {
      total += 1;
      console.error(`${ruta}:${h.linea} [${h.regla}] ${h.descripcion}: ${h.fragmento}`);
    }
  }
  if (total > 0) {
    console.error(`\nSe encontraron ${total} problema(s) de codificación en ${archivos.length} archivos revisados.`);
    console.error('Reescribe el texto en UTF-8 sin BOM (ver .kiro/steering/15-reglas-transversales.md).');
    process.exit(1);
  }
  console.log(`Codificación correcta: ${archivos.length} archivos revisados.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
