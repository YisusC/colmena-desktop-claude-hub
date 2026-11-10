// Reloading the UI does not stop the terminals: they reconnect and restore their screen. Sends no messages.
//   npm run build && node scripts/reload-check.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-reload-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
// PIDs of the claude.exe processes for these sessions (by their --session-id), not the whole machine.
const pidsFor = (ids) =>
  execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\" | Where-Object { ${ids.map((i) => `$_.CommandLine -like '*${i}*'`).join(' -or ')} } | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8' })
    .split(/\s+/).filter(Boolean).sort().join(',');
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects'), COLMENA_DEFAULT_CWD: cwd } });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.row', { timeout: 30_000 });
  const ids = [];
  for (const name of ['hub-recarga-a', 'hub-recarga-b']) {
    await page.keyboard.press('Control+Shift+N');
    await page.fill('.modal input[name="session-name"]', name);
    await page.selectOption('.modal select', cwd);
    await page.click('.modal button[type="submit"]');
    await page.waitForTimeout(400);
    const id = await page.locator('.tab.active').getAttribute('data-id');
    ids.push(id);
    await page.waitForSelector(`.tab[data-id="${id}"] .state.ready`, { timeout: 30_000 });
  }
  await page.keyboard.press('Control+1'); // the active one is the first
  const before = pidsFor(ids);
  console.log('   procesos de las sesiones:', before);

  await page.reload();
  await page.waitForSelector('.row', { timeout: 30_000 });
  await page.waitForTimeout(2500);
  const after = await page.locator('.tab[data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  check(after.join() === ids.join(), `las pestañas vuelven en el mismo orden (${after.length})`);
  check((await page.locator('.tab.active').getAttribute('data-id')) === ids[0], 'y con la misma pestaña activa');
  const screen = await page.locator('.pane:visible .xterm-rows').innerText();
  check(/Claude Code/.test(screen), 'la pantalla de Claude se repuso');
  const now = pidsFor(ids);
  check(!!before && now === before, `los mismos procesos claude.exe siguen vivos (${now})`);
  await page.locator('.pane:visible .pane-host').click();
  await page.waitForTimeout(1500);
  await page.keyboard.type('hola', { delay: 40 });
  await page.waitForTimeout(2500);
  check(/hola/.test(await page.locator('.pane:visible .xterm-rows').innerText()), 'la terminal reconectada recibe lo que escribes');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  // Ctrl+W in the terminal must not close the app; Ctrl+Shift+R reloads and reconnects.
  await page.keyboard.press('Control+W');
  await page.waitForTimeout(800);
  check(!page.isClosed() && (await page.locator('.tab[data-id]').count()) === 2, 'Ctrl+W ya no cierra la app');
  await page.keyboard.press('Control+Shift+R');
  await page.waitForSelector('.row', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  check((await page.locator('.tab[data-id]').count()) === 2 && pidsFor(ids) === before, 'Ctrl+Shift+R recarga la interfaz y reconecta sin reiniciar procesos');
  for (const id of ids) {
    await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
    await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
  }
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
