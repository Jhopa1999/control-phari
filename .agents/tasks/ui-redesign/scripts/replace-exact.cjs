// Reemplazo exacto de un bloque de texto en un archivo, en UTF-8 y conservando
// el fin de línea del archivo (CRLF o LF). Falla si el bloque no aparece
// exactamente una vez.
// Uso: node replace-exact.cjs <archivo> <spec.json>
//   spec.json: [{ "from": "texto con \n", "to": "texto con \n" }, ...]
'use strict';
const fs = require('node:fs');
const [file, specFile] = process.argv.slice(2);
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = crlf ? raw.replace(/\r\n/g, '\n') : raw;
const specs = JSON.parse(fs.readFileSync(specFile, 'utf8'));
for (const { from, to } of specs) {
  const count = text.split(from).length - 1;
  if (count !== 1) {
    console.error(`El bloque aparece ${count} veces: ${from.slice(0, 120)}`);
    process.exit(1);
  }
  text = text.replace(from, () => to);
}
fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
console.log(`ok ${file} (${specs.length} reemplazo(s), ${crlf ? 'CRLF' : 'LF'})`);
