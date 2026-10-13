// Sonda temporal (artefacto): réplica exacta de A1-A8 del shell-check con volcado.
const { chromium, expect } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  for (let run = 1; run <= 3; run += 1) {
    const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => window.localStorage.setItem('actorId', 'jefe@demo.local'));
    const page = await context.newPage();
    await page.goto('http://localhost:3300/inicio');
    const nav = page.getByRole('navigation', { name: 'Navegación principal', exact: true });
    await expect(nav.getByRole('link', { name: 'Panel del área', exact: true })).toBeVisible({ timeout: 60000 });
    const dump = async (label) => {
      const state = await page.evaluate(() => ({
        active: document.activeElement ? (document.activeElement.textContent || '').trim().slice(0, 30) : null,
        tooltips: [...document.querySelectorAll('[role="tooltip"]')].map((t) => {
          const cs = getComputedStyle(t);
          const anims = t.getAnimations().map((a) => `${a.animationName}:${a.playState}:${Math.round(a.currentTime || 0)}`);
          return `${t.textContent}|${t.getAttribute('data-state')}|${cs.animationName}|op=${cs.opacity}|${anims.join(',')}`;
        }),
      }));
      console.log(`run${run} ${label}`, JSON.stringify(state));
    };
    await page.getByRole('combobox', { name: 'Usuario actual (dev)', exact: true }).click();
    await page.getByRole('option', { name: 'Carla Integrante BI', exact: true }).click();
    await expect(nav.getByRole('link', { name: 'Triage', exact: true })).toHaveCount(0);
    const mouse = await page.evaluate(() => null);
    void mouse;
    await page.getByRole('button', { name: 'Contraer menú', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Expandir menú', exact: true })).toBeFocused();
    await dump('A6');
    await page.keyboard.press('Shift+Tab');
    await page.evaluate(() => document.activeElement && document.activeElement.textContent);
    await expect(page.getByRole('tooltip')).toHaveCount(1);
    await dump('A7');
    await nav.getByRole('link', { name: 'Proyectos Próximamente', exact: true }).focus();
    await page.waitForTimeout(100);
    await dump('A8 +100ms');
    await page.waitForTimeout(2000);
    await dump('A8 +2.1s');
    await context.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
