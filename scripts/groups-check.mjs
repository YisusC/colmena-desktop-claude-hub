// Groups and tabs: rename, move and reorder by dragging. Temporary userData; sends no messages.
//   npm run build && node scripts/groups-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-groups-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects'), COLMENA_DEFAULT_CWD: cwd } });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.waitForSelector('.row', { timeout: 30_000 });
  const labels = () => page.locator('.group-head .label').allTextContents();
  const sectionOf = (id) =>
    page.evaluate((sid) => document.querySelector(`.row[data-id="${sid}"]`)?.closest('.group')?.querySelector('.group-head .label')?.textContent, id);

  const before = await labels();
  const folder = before[0];
  await page.locator('.group-head').first().click({ button: 'right' });
  await page.waitForSelector('.modal');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('maxlength'));
  check(focused === '60', 'clic derecho abre el editor con el foco en «Nombre»');
  await page.fill('.modal input[maxlength="60"]', `${folder} (alias)`);
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.modal', { state: 'detached' });
  check((await labels()).includes(`${folder} (alias)`), `carpeta «${folder}» renombrada a «${folder} (alias)»`);

  const second = (await labels())[1];
  const rowId = await page.evaluate((lbl) => {
    const sec = [...document.querySelectorAll('.group')].find((g) => g.querySelector('.group-head .label')?.textContent === lbl);
    return sec?.querySelector('.row')?.getAttribute('data-id');
  }, second);
  const target = page.locator('.group', { has: page.locator('.group-head .label', { hasText: `${folder} (alias)` }) }).first();
  await page.locator(`.row[data-id="${rowId}"]`).dragTo(target.locator('.group-head'));
  await page.waitForTimeout(600);
  check((await sectionOf(rowId)) === `${folder} (alias)`, `conversación de «${second}» movida a «${folder} (alias)» arrastrándola`);

  await page.locator(`.row[data-id="${rowId}"]`).click({ button: 'right' });
  await page.waitForSelector('.modal');
  await page.fill('input[list="groups-list"]', 'Grupo prueba');
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.locator('.group-head', { hasText: 'Grupo prueba' }).click({ button: 'right' });
  await page.waitForSelector('.modal');
  await page.fill('.modal input[maxlength="60"]', 'Grupo renombrado');
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.modal', { state: 'detached' });
  check((await sectionOf(rowId)) === 'Grupo renombrado', 'grupo propio renombrado y su conversación lo sigue');

  await page.locator(`.row[data-id="${rowId}"]`).dragTo(page.locator('.group-head', { hasText: 'Grupo renombrado' }));
  const pinTarget = page.locator('.group-head.static');
  if (await pinTarget.count()) {
    const other = await page.evaluate(() => [...document.querySelectorAll('.group:not(:first-child) .row')][3]?.getAttribute('data-id'));
    await page.locator(`.row[data-id="${other}"]`).dragTo(pinTarget);
    await page.waitForTimeout(500);
    check((await sectionOf(other)) === 'Fijadas', 'soltar en «Fijadas» la fija');
  } else {
    console.log('   (sin sección Fijadas en estos datos: se omite)');
  }

  for (const name of ['hub-orden-a', 'hub-orden-b']) {
    await page.keyboard.press('Control+Shift+N');
    await page.fill('.modal input[name="session-name"]', name);
    await page.selectOption('.modal select', cwd);
    await page.click('.modal button[type="submit"]');
    await page.waitForTimeout(2500);
  }
  check((await page.locator('.lobby-tab svg').count()) === 1, 'la pestaña Lobby es un ícono de casa');
  check((await page.locator('.rail-btn[aria-label="Lobby"] svg path').getAttribute('d'))?.startsWith('M2 7.5l6-5'), 'el riel usa el mismo ícono');
  const order = () => page.locator('.tab[data-id] .tab-title').allTextContents();
  const o1 = await order();
  await page.locator('.tab[data-id]').nth(1).dragTo(page.locator('.tab[data-id]').nth(0), { targetPosition: { x: 5, y: 10 } });
  await page.waitForTimeout(400);
  const o2 = await order();
  check(o1.join() !== o2.join() && o2[0] === o1[1], `reordenar pestañas: ${o1.join(' | ')} → ${o2.join(' | ')}`);
  await page.screenshot({ path: path.join(root, '.smoke', 'groups-tabs.png') });
  for (const id of await page.locator('.tab[data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))) {
    await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
    await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
  }
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
