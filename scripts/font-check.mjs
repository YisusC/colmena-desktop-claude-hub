// Screenshot of the terminal font (Cascadia Code) and its ligatures. Sends no messages.
//   npm run build && node scripts/font-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-font-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
const errors = [];
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects'), COLMENA_DEFAULT_CWD: cwd } });
try {
  const page = await app.firstWindow();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.row', { timeout: 30_000 });
  await page.keyboard.press('Control+Shift+N');
  await page.fill('.modal input[name="session-name"]', 'hub-fuente-borrar');
  await page.selectOption('.modal select', cwd);
  await page.click('.modal button[type="submit"]');
  const id = await page.locator('.tab[data-id]').first().getAttribute('data-id');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.ready`, { timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.locator('.pane:visible .pane-host').click();
  await page.keyboard.type('=> != === -> <= >= :: www //', { delay: 20 });
  await page.waitForTimeout(800);
  const font = await page.evaluate(() => {
    const row = document.querySelector('.pane:not([style*="none"]) .xterm-rows > div');
    return row ? getComputedStyle(row).fontFamily : '';
  });
  console.log('fuente de la terminal:', font);
  console.log('Cascadia Code cargada:', await page.evaluate(() => document.fonts.check('14px "Cascadia Code"')));
  const box = await page.locator('.pane:visible .xterm-screen').boundingBox();
  await page.screenshot({ path: path.join(root, '.smoke', 'font-check.png'), clip: { x: box.x, y: box.y, width: 700, height: 260 } });
  for (let i = 0; i < 40; i++) await page.keyboard.press('Backspace');
  await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
  await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
  console.log('errores en consola:', errors.length ? errors : 'ninguno');
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
