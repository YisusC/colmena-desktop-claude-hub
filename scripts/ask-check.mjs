// The tab shows "Te pregunta" when Claude asks a question. Sends one short message to Claude.
//   npm run build && node scripts/ask-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-ask-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
const projectDir = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
const shots = path.join(root, '.smoke');
let app = null;
let id = null;
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
try {
  app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_DEFAULT_CWD: cwd } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.waitForSelector('.rail', { timeout: 30_000 });
  const settings = JSON.parse(fs.readFileSync(path.join(userData, 'claude-settings.json'), 'utf8'));
  check(!!settings.hooks?.Notification, `hook Notification instalado: ${settings.hooks?.Notification?.[0]?.hooks?.[0]?.command ?? 'no'}`);

  await page.keyboard.press('Control+Shift+N');
  await page.fill('.modal input[name="session-name"]', 'hub-pregunta-borrar');
  await page.selectOption('.modal select', cwd);
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.tab[data-id]');
  id = await page.locator('.tab[data-id]').first().getAttribute('data-id');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.ready`, { timeout: 30_000 });
  await page.locator('.pane:visible .pane-host').click();
  await page.keyboard.type('Usa la herramienta AskUserQuestion para preguntarme si prefiero te o cafe. No hagas nada mas.', { delay: 15 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.working`, { timeout: 20_000 }).catch(() => {});
  await page.keyboard.press('Control+Shift+L');
  const asked = await page.waitForSelector(`.tab[data-id="${id}"] .state.asking`, { timeout: 90_000 }).then(() => true, () => false);
  check(asked, 'la pestaña pasa a "Te pregunta" (ícono amarillo)');
  await page.screenshot({ path: path.join(shots, 'ask-lobby.png') });
  await page.locator(`.tab[data-id="${id}"]`).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, 'ask-terminal.png') });
  await page.locator('.pane:visible .pane-host').click();
  await page.keyboard.press('Escape');
  const cleared = await page.waitForSelector(`.tab[data-id="${id}"] .state:not(.asking)`, { timeout: 10_000 }).then(() => true, () => false);
  check(cleared, 'al responder o cancelar deja de mostrar la pregunta');
  await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
  if (await page.locator('.modal').count()) await page.click('.modal .btn.primary');
  await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
} finally {
  if (app) await app.close().catch(() => {});
  if (id) for (const p of [path.join(projectDir, `${id}.jsonl`), path.join(projectDir, id)]) fs.rmSync(p, { recursive: true, force: true });
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  console.log('sesión de prueba borrada:', id);
}
