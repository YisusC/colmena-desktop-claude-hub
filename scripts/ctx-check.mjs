// Wrapper status line: per-session context and the user's own status line. With --send, sends one short message.
//   npm run build && node scripts/ctx-check.mjs [--send]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-ctx-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
const projectDir = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
const send = process.argv.includes('--send');
let id = null;
const app = await electron.launch({
  executablePath: electronPath,
  args: [root],
  env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_CTX_DUMP: '1', COLMENA_DEFAULT_CWD: cwd },
});
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.rail', { timeout: 30_000 });
  await page.keyboard.press('Control+Shift+N');
  await page.fill('.modal input[name="session-name"]', 'hub-contexto-borrar');
  await page.selectOption('.modal select', cwd);
  await page.click('.modal button[type="submit"]');
  id = await page.locator('.tab[data-id]').first().getAttribute('data-id');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.ready`, { timeout: 30_000 });
  if (send) {
    await page.locator('.pane:visible .pane-host').click();
    await page.keyboard.type('responde solo con la palabra listo', { delay: 15 });
    await page.waitForTimeout(1200);
    await page.keyboard.press('Enter');
    await page.waitForSelector(`.tab[data-id="${id}"] .state.working`, { timeout: 20_000 }).catch(() => {});
    await page.waitForSelector(`.tab[data-id="${id}"] .state.finished`, { timeout: 90_000 });
  }
  await page.waitForTimeout(6000);
  const dump = path.join(userData, 'ctx', '_last-input.json');
  if (fs.existsSync(dump)) {
    const j = JSON.parse(fs.readFileSync(dump, 'utf8'));
    console.log('claves de la entrada:', Object.keys(j).join(', '));
    console.log('context_window:', JSON.stringify(j.context_window));
    console.log('model:', JSON.stringify(j.model));
    console.log('cost:', JSON.stringify(j.cost));
  } else console.log('✘ la línea de estado no se ejecutó (no hay _last-input.json)');
  const mine = path.join(userData, 'ctx', `${id}.json`);
  console.log('archivo de la sesión:', fs.existsSync(mine) ? fs.readFileSync(mine, 'utf8') : 'no existe');
  const screen = await page.locator('.pane:visible .xterm-rows').innerText();
  console.log('barra del usuario en pantalla:', /Contexto|USO|Opus/.test(screen) ? 'sí' : 'no', '→', (screen.split('\n').find((l) => /USO|Contexto/.test(l)) ?? '').trim().slice(0, 90));
  const head = await page.locator('.session-head .session-line').first().innerText().catch(() => '');
  console.log('encabezado:', head.replace(/\s+/g, ' '), '| donut:', await page.locator('.session-head .ctx').count());
  await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
  await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
} finally {
  await app.close();
  if (id) for (const p of [path.join(projectDir, `${id}.jsonl`), path.join(projectDir, id)]) fs.rmSync(p, { recursive: true, force: true });
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
