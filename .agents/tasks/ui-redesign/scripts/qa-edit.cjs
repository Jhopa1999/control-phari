// Reemplazos exactos en un archivo conservando su fin de línea (CRLF o LF) y
// UTF-8 sin BOM. Uso: node qa-edit.cjs <spec.json>
// spec: { "file": "<ruta>", "edits": [{ "old": "...", "new": "..." }] }
// Cada "old" debe aparecer exactamente una vez; si no, no se escribe nada.
'use strict';
const fs = require('node:fs');
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let text = fs.readFileSync(spec.file, 'utf8');
const bom = text.charCodeAt(0) === 0xfeff;
if (bom) text = text.slice(1);
const crlf = text.includes('\r\n');
const norm = (s) => (crlf ? s.replace(/\r?\n/g, '\r\n') : s.replace(/\r\n/g, '\n'));
for (const [i, edit] of spec.edits.entries()) {
  const oldText = norm(edit.old);
  const count = text.split(oldText).length - 1;
  if (count !== 1) {
    console.error(`edit ${i}: ${count} coincidencias en ${spec.file}`);
    process.exit(1);
  }
  text = text.replace(oldText, () => norm(edit.new));
}
fs.writeFileSync(spec.file, (bom ? '\ufeff' : '') + text, 'utf8');
console.log(`ok ${spec.edits.length} cambios en ${spec.file} (${crlf ? 'CRLF' : 'LF'})`);
