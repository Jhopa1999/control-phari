// Contraste AA de los pares de tokens principales, medido EN EL NAVEGADOR.
// Abre /login de la web (que carga globals.css), resuelve cada token con
// getComputedStyle sobre un elemento real y lo convierte a sRGB pintándolo en
// un canvas 1x1 (así el valor OKLCH lo convierte el propio Chromium). Calcula
// la razón de contraste WCAG 2.x en claro y en oscuro (clase .dark en <html>).
// Solo lectura. Uso: node qa-contrast.cjs [--base http://localhost:3300] [--out archivo.json]
'use strict';
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const BASE = opt('base', 'http://localhost:3300');
const OUT = opt('out', null);
// [texto, fondo, mínimo, uso]
const PAIRS = [
  ['foreground', 'background', 4.5, 'texto principal'],
  ['foreground', 'surface-subtle', 4.5, 'texto sobre superficie sutil'],
  ['card-foreground', 'card', 4.5, 'texto en tarjetas'],
  ['popover-foreground', 'popover', 4.5, 'menús y desplegables'],
  ['muted-foreground', 'background', 4.5, 'texto secundario'],
  ['muted-foreground', 'card', 4.5, 'texto secundario en tarjeta'],
  ['muted-foreground', 'muted', 4.5, 'texto secundario sobre muted'],
  ['muted-foreground', 'surface-subtle', 4.5, 'texto secundario en barra de contexto'],
  ['primary', 'background', 4.5, 'enlaces'],
  ['primary', 'primary-subtle', 4.5, 'elemento activo / seleccionado'],
  ['primary-foreground', 'primary', 4.5, 'botón primario'],
  ['primary-foreground', 'primary-hover', 4.5, 'botón primario (hover)'],
  ['secondary-foreground', 'secondary', 4.5, 'botón secundario'],
  ['secondary-foreground', 'secondary-hover', 4.5, 'botón secundario (hover)'],
  ['accent-foreground', 'accent', 4.5, 'hover de fila / ghost'],
  ['destructive-foreground', 'destructive', 4.5, 'botón destructivo'],
  ['destructive-foreground', 'destructive-hover', 4.5, 'botón destructivo (hover)'],
  ['success', 'success-subtle', 4.5, 'badge éxito'],
  ['warning', 'warning-subtle', 4.5, 'badge aviso'],
  ['danger', 'danger-subtle', 4.5, 'badge peligro'],
  ['info', 'info-subtle', 4.5, 'badge información'],
  ['neutral', 'neutral-subtle', 4.5, 'badge neutro'],
  ['success', 'background', 4.5, 'texto de éxito'],
  ['warning', 'background', 4.5, 'texto de aviso'],
  ['danger', 'background', 4.5, 'texto de error de campo'],
  ['success-foreground', 'success', 4.5, 'relleno de éxito'],
  ['sidebar-foreground', 'sidebar', 4.5, 'menú lateral'],
  ['sidebar-muted-foreground', 'sidebar', 4.5, 'grupos del menú'],
  ['sidebar-accent-foreground', 'sidebar-accent', 4.5, 'ítem activo del menú'],
  ['input', 'background', 3, 'borde de campo (no texto, 1.4.11)'],
  ['ring', 'background', 3, 'anillo de foco (no texto, 2.4.11/1.4.11)'],
];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 180000 });
  const report = {};
  for (const theme of ['light', 'dark']) {
    report[theme] = await page.evaluate(
      ({ pairs, theme }) => {
        const html = document.documentElement;
        html.classList.toggle('dark', theme === 'dark');
        const probe = document.createElement('div');
        document.body.appendChild(probe);
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const cache = new Map();
        function rgbOf(token) {
          if (cache.has(token)) return cache.get(token);
          probe.style.color = `var(--${token})`;
          const css = getComputedStyle(probe).color;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 1, 1);
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          const value = { css, rgb: [r, g, b] };
          cache.set(token, value);
          return value;
        }
        const lum = ([r, g, b]) => {
          const ch = (v) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
        };
        const rows = pairs.map(([fg, bg, min, use]) => {
          const f = rgbOf(fg);
          const b = rgbOf(bg);
          const l1 = lum(f.rgb);
          const l2 = lum(b.rgb);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          return { fg, bg, use, min, ratio: Math.round(ratio * 100) / 100, pass: ratio >= min, fgCss: f.css, bgCss: b.css, fgRgb: f.rgb, bgRgb: b.rgb };
        });
        probe.remove();
        html.classList.remove('dark');
        return rows;
      },
      { pairs: PAIRS, theme },
    );
  }
  await browser.close();
  let failed = 0;
  for (const theme of Object.keys(report)) {
    console.log(`\n${theme === 'light' ? 'Claro' : 'Oscuro'}:`);
    for (const r of report[theme]) {
      if (!r.pass) failed += 1;
      console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.ratio.toFixed(2).padStart(5)}:1 (mín ${r.min}) ${r.fg} / ${r.bg} — ${r.use}`);
    }
  }
  const total = report.light.length + report.dark.length;
  console.log(`\npares=${total} fallidos=${failed}`);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ measuredAt: new Date().toISOString(), base: BASE, report }, null, 2), 'utf8');
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
