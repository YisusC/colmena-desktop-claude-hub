// Screenshots the session header expanded and collapsed (Ctrl+Shift+H). Sends no messages.
//   npm run build && node scripts/header-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-head-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects'), COLMENA_DEFAULT_CWD: cwd } });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.row', { timeout: 30_000 });
  await page.keyboard.press('Control+Shift+N');
  await page.fill('.modal input[name="session-name"]', 'hub-cabecera-borrar');
  await page.selectOption('.modal select', cwd);
  await page.click('.modal button[type="submit"]');
  const id = await page.locator('.tab[data-id]').first().getAttribute('data-id');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.ready`, { timeout: 30_000 });
  await page.waitForTimeout(600);
  const shot = async (name) => {
    const b = await page.locator('.main').boundingBox();
    await page.screenshot({ path: path.join(root, '.smoke', name), clip: { x: b.x, y: b.y, width: Math.min(b.width, 1100), height: 230 } });
  };
  const h1 = async () => (await page.locator('.session-head').boundingBox())?.height ?? 0;
  const open = await h1();
  await shot('header-open.png');
  await page.keyboard.press('Control+Shift+H');
  await page.waitForTimeout(300);
  const closed = await h1();
  await shot('header-collapsed.png');
  check(closed < open, `plegado ${Math.round(closed)} px frente a ${Math.round(open)} px abierto`);
  check((await page.evaluate(() => localStorage.getItem('hub.headerCollapsed'))) === '1', 'la preferencia se recuerda');
  await page.keyboard.press('Control+Shift+H');
  await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
  await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
