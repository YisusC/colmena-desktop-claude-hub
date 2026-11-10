// Full cycle with a throwaway session (create, search, resume, reindex). Sends one short message.
//   npm run build && node scripts/lifecycle.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, '.smoke');
fs.mkdirSync(shots, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-life-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
const projectDir = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
const NAME = 'hub-prueba-borrar';
const WORD = 'zorbexquil';

const claudeCount = () =>
  execFileSync('tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
    .split('\n').filter((l) => l.includes('claude.exe')).length;
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const launch = async () => {
  const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_DEFAULT_CWD: cwd } });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.waitForSelector('.rail', { timeout: 30_000 });
  return { app, page };
};
const screenText = (page) => page.locator('.pane:visible .xterm-rows').innerText().catch(() => '');
const waitStatus = (page, id, cls, timeout) =>
  page.waitForSelector(`.tab[data-id="${id}"][data-status="${cls}"]`, { timeout }).then(() => true, () => false);

let id = null;
let app = null;
const baseline = claudeCount();
try {
  let page;
  ({ app, page } = await launch());
  page.setDefaultTimeout(15_000);

  await page.keyboard.press('Control+Shift+N');
  await page.fill('.modal input[name="session-name"]', NAME);
  await page.selectOption('.modal select', cwd);
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.tab[data-id]');
  id = await page.locator('.tab[data-id]').first().getAttribute('data-id');
  check(await waitStatus(page, id, 'idle', 30_000), 'Claude arrancó y quedó esperando (✳)');
  const first = await screenText(page);
  check(!/didn't finish starting/i.test(first), 'sin aviso de pantalla completa fallida');

  await page.locator('.pane:visible .pane-host').click();
  await page.keyboard.type(`responde solo con la palabra listo. ${WORD}`, { delay: 25 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  check(await waitStatus(page, id, 'working', 20_000), 'pasó a trabajando (◐)');
  check(await waitStatus(page, id, 'idle', 90_000), 'volvió a esperando al responder');
  const file = path.join(projectDir, `${id}.jsonl`);
  check(fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(`"customTitle":"${NAME}"`), 'transcript guardado con el nombre');

  const t0 = Date.now();
  const listed = await page.waitForSelector(`.row[data-id="${id}"]`, { timeout: 20_000 }).then(() => true, () => false);
  check(listed, `aparece en la lista sin recargar (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  await page.fill('#search', WORD);
  const found = await page.waitForSelector(`.row[data-id="${id}"] .snippet mark`, { timeout: 10_000 }).then(() => true, () => false);
  check(found, `búsqueda "${WORD}" la encuentra con fragmento resaltado`);
  await page.screenshot({ path: path.join(shots, 'life-1-busqueda.png') });
  await page.fill('#search', '');

  await page.locator(`.row[data-id="${id}"]`).click({ button: 'right' });
  await page.fill('input[name="tags"]', 'persiste');
  await page.click('.modal button[type="submit"]');

  const tClose = Date.now();
  await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
  await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
  check(true, `pestaña cerrada en ${((Date.now() - tClose) / 1000).toFixed(1)} s`);
  await page.waitForTimeout(1500);
  check(claudeCount() <= baseline, `sin claude.exe huérfanos (${claudeCount()} vs ${baseline} al inicio)`);

  await page.locator(`.row[data-id="${id}"]`).click();
  const warned = await page.waitForSelector('.modal', { timeout: 1500 }).then(() => true, () => false);
  check(!warned, 'no avisa de "otra terminal" tras cerrarla aquí mismo');
  if (warned) await page.click('.modal .btn.primary');
  check(await waitStatus(page, id, 'idle', 30_000), 'reanudada y esperando');
  await page.waitForTimeout(1500);
  const resumed = await screenText(page);
  check(resumed.includes(WORD), 'la reanudación muestra la conversación anterior');
  check(!/didn't finish starting/i.test(resumed), 'sin aviso de pantalla completa fallida al reanudar');
  await page.screenshot({ path: path.join(shots, 'life-2-reanudada.png') });
  await app.close();
  await new Promise((r) => setTimeout(r, 1500));
  check(claudeCount() <= baseline, 'al salir de la app no quedan procesos');

  fs.rmSync(path.join(userData, 'index-cache.json'), { force: true });
  ({ app, page } = await launch());
  page.setDefaultTimeout(15_000);
  await page.waitForFunction(() => !document.querySelector('.index-status'), null, { timeout: 60_000 });
  await page.fill('#search', '#persiste');
  await page.waitForTimeout(500);
  const ids = await page.locator('.row').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  check(ids.length === 1 && ids[0] === id, 'la etiqueta sigue tras borrar la caché del índice');
  await app.close();
  app = null;
} finally {
  if (app) await app.close().catch(() => {});
  if (id) {
    for (const p of [path.join(projectDir, `${id}.jsonl`), path.join(projectDir, id)]) fs.rmSync(p, { recursive: true, force: true });
    console.log('sesión de prueba borrada:', id);
  }
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
