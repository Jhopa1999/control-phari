// Sonda jwt: mensaje del login cuando la API no responde (peticiones abortadas).
'use strict';
const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:3300/login');
  await p.locator('#password').waitFor();
  await p.route((u) => u.origin === 'http://localhost:3301', (r) => r.abort('connectionrefused'));
  await p.locator('#identifier').fill('jefe@demo.local');
  await p.locator('#password').fill('dev1234');
  await p.getByRole('button', { name: 'Ingresar' }).click();
  await p.locator('#login-error, [role="alert"]').filter({ hasText: /\S/ }).first().waitFor({ timeout: 30000 });
  console.log(JSON.stringify(await p.locator('[role="alert"]').allInnerTexts()), p.url());
  await b.close();
})();
