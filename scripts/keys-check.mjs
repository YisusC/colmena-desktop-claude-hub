// Ctrl+1…9 switches tabs (Ctrl+9: the last one) and does not reach the terminal. Sends no messages.
//   npm run build && node scripts/keys-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-keys-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects'), COLMENA_DEFAULT_CWD: cwd } });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.row', { timeout: 30_000 });
  for (const name of ['hub-tecla-1', 'hub-tecla-2', 'hub-tecla-3']) {
    await page.keyboard.press('Control+Shift+N');
    await page.fill('.modal input[name="session-name"]', name);
    await page.selectOption('.modal select', cwd);
    await page.click('.modal button[type="submit"]');
    await page.waitForTimeout(2500);
  }
  // Type right after the «❯» to detect whether any control character reaches Claude.
  await page.locator('.pane:visible .pane-host').click();
  const active = () => page.locator('.tab.active .tab-title').textContent();
  await page.keyboard.press('Control+1');
  check((await active()) === 'hub-tecla-1', `Ctrl+1 → ${await active()}`);
  await page.keyboard.press('Control+2');
  check((await active()) === 'hub-tecla-2', `Ctrl+2 → ${await active()}`);
  await page.keyboard.press('Control+9');
  check((await active()) === 'hub-tecla-3', `Ctrl+9 (la última) → ${await active()}`);
  await page.keyboard.press('Control+3');
  await page.waitForTimeout(800);
  const screen = await page.locator('.pane:visible .xterm-rows').innerText();
  check(!/Interrupted|interrump/i.test(screen), 'Ctrl+3 ya no interrumpe a Claude');
  for (const id of await page.locator('.tab[data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))) {
    await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
    await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
  }
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
