// Context panel (⋯) and "Ver desglose completo" (/context). Sends one short message to Claude.
//   npm run build && node scripts/context-panel-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-ctxpanel-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
const projectDir = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
let id = null;
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_DEFAULT_CWD: cwd } });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.waitForSelector('.rail', { timeout: 30_000 });
  await page.keyboard.press('Control+Shift+N');
  await page.fill('.modal input[name="session-name"]', 'hub-panel-borrar');
  await page.selectOption('.modal select', cwd);
  await page.click('.modal button[type="submit"]');
  id = await page.locator('.tab[data-id]').first().getAttribute('data-id');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.ready`, { timeout: 30_000 });
  await page.locator('.pane:visible .pane-host').click();
  await page.keyboard.type('responde solo con la palabra listo', { delay: 15 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.working`, { timeout: 20_000 }).catch(() => {});
  await page.waitForSelector(`.tab[data-id="${id}"] .state.finished`, { timeout: 90_000 });
  await page.waitForTimeout(3000);

  await page.locator('.ctx-toggle').click();
  await page.waitForSelector('.ctx-panel');
  const text = (await page.locator('.ctx-panel').innerText()).replace(/\s+/g, ' ');
  console.log('   panel:', text.slice(0, 260));
  check(/según Claude/.test(text), 'datos exactos (según Claude)');
  check(/Base fija/.test(text) && /Conversación/.test(text) && /Espacio libre/.test(text), 'reparto base fija / conversación / libre');
  check(/Último turno/.test(text) && /Leído de caché/.test(text), 'detalle del último turno');
  check(/Costo/.test(text), 'totales y costo de la sesión');
  const b = await page.locator('.ctx-panel').boundingBox();
  await page.screenshot({ path: path.join(root, '.smoke', 'context-panel.png'), clip: { x: b.x - 380, y: b.y - 90, width: b.width + 400, height: b.height + 100 } });

  await page.locator('.ctx-run').click();
  check((await page.locator('.ctx-panel').count()) === 0, 'el panel se cierra al pedir el desglose');
  await page.waitForTimeout(4000);
  const screen = (await page.locator('.pane:visible .xterm-rows').innerText()).replace(/\s+/g, ' ');
  // The /context output is long and the command scrolls out of view: seeing its tokens is enough.
  check(/tokens/i.test(screen), '/context se ejecutó en la terminal');
  await page.screenshot({ path: path.join(root, '.smoke', 'context-run.png') });
  await page.keyboard.press('Escape');
  await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
  await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
} finally {
  await app.close();
  if (id) for (const p of [path.join(projectDir, `${id}.jsonl`), path.join(projectDir, id)]) fs.rmSync(p, { recursive: true, force: true });
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
