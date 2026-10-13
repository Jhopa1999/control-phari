#!/usr/bin/env node
/**
 * review-safe.cjs — genera copias de capturas aptas para que un revisor las
 * abra (read_file) sin superar el limite del servicio de modelos: ninguna
 * imagen puede medir mas de 2000 px de ancho ni de alto cuando se envian varias
 * en la misma peticion.
 *
 * Uso:
 *   node review-safe.cjs <carpeta-de-capturas> [--max 1800]
 *
 * Recorre la carpeta (recursivo) y, para cada PNG:
 *   - si mide <= max en ambos lados, lo copia tal cual a <carpeta>/review/...
 *   - si es mas alto, lo trocea en tramos de max px de alto (ancho intacto):
 *       nombre--parte-1-de-3.png, nombre--parte-2-de-3.png, ...
 *   - si es mas ancho que max, lo reescala proporcionalmente antes de trocear.
 * Ignora la propia carpeta review/. Escribe review/index.json con el mapeo
 * origen -> archivos generados y sus dimensiones.
 *
 * Sin dependencias nuevas: usa el Chromium de Playwright ya instalado en el
 * node_modules del checkout principal.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { chromium } = require(require.resolve('@playwright/test', { paths: [ROOT] }));

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: node review-safe.cjs <carpeta-de-capturas> [--max 1800]');
  process.exit(2);
}
const srcDir = path.resolve(args[0]);
const maxIdx = args.indexOf('--max');
const MAX = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 1800;
if (!Number.isFinite(MAX) || MAX < 200 || MAX > 2000) {
  console.error('--max debe estar entre 200 y 2000');
  process.exit(2);
}
const outDir = path.join(srcDir, 'review');

/** Lee ancho/alto de la cabecera IHDR de un PNG. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function listPngs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (path.resolve(f) === path.resolve(outDir)) continue;
      out.push(...listPngs(f));
    } else if (e.name.toLowerCase().endsWith('.png')) {
      out.push(f);
    }
  }
  return out;
}

(async () => {
  const files = listPngs(srcDir);
  fs.mkdirSync(outDir, { recursive: true });
  const index = [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const file of files) {
      const rel = path.relative(srcDir, file);
      const { width, height } = pngSize(file);
      const relBase = rel.replace(/\.png$/i, '');
      const targetBase = path.join(outDir, relBase);
      fs.mkdirSync(path.dirname(targetBase), { recursive: true });

      if (width <= MAX && height <= MAX) {
        const dest = `${targetBase}.png`;
        fs.copyFileSync(file, dest);
        index.push({ source: rel, outputs: [{ file: path.relative(srcDir, dest), width, height }] });
        continue;
      }

      const scale = width > MAX ? MAX / width : 1;
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      const dataUrl = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
      await page.setViewportSize({ width: w, height: Math.min(h, MAX) });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:#fff">` +
          `<img id="i" src="${dataUrl}" style="display:block;width:${w}px;height:${h}px"></body></html>`,
      );
      await page.waitForFunction(() => {
        const i = document.getElementById('i');
        return i instanceof HTMLImageElement && i.complete && i.naturalWidth > 0;
      });

      const parts = Math.ceil(h / MAX);
      const outputs = [];
      for (let p = 0; p < parts; p += 1) {
        const y = p * MAX;
        const ch = Math.min(MAX, h - y);
        const dest = `${targetBase}--parte-${p + 1}-de-${parts}.png`;
        await page.screenshot({ path: dest, clip: { x: 0, y, width: w, height: ch }, fullPage: true });
        outputs.push({ file: path.relative(srcDir, dest), width: w, height: ch });
      }
      index.push({ source: rel, scaled: scale !== 1, outputs });
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');

  // Comprobacion final: ninguna salida supera MAX.
  const over = listPngs(outDir).filter((f) => {
    const s = pngSize(f);
    return s.width > MAX || s.height > MAX;
  });
  const total = index.reduce((n, e) => n + e.outputs.length, 0);
  console.log(`origen: ${files.length} PNG | generados en review/: ${total} | por encima de ${MAX}px: ${over.length}`);
  if (over.length > 0) {
    for (const f of over) console.log(`  EXCEDE: ${path.relative(srcDir, f)}`);
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
