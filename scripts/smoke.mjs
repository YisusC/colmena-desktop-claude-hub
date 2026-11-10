// Smoke test of the built app, with a temporary userData and the fake history in test/fixtures. Sends no messages.
//   npm run build && node scripts/smoke.mjs [screenshotsFolder]
// COLMENA_TEST_CWD picks the folder for the new session (defaults to this repo).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.resolve(process.argv[2] ?? path.join(root, '.smoke'));
fs.mkdirSync(shots, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-smoke-'));
const projects = path.join(root, 'test', 'fixtures', 'projects');
const cwd = process.env.COLMENA_TEST_CWD || root;

const claudeCount = () => {
  const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return out.split('\n').filter((l) => l.includes('claude.exe')).length;
};
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};

const app = await electron.launch({
  executablePath: electronPath,
  args: [root],
  env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: projects, COLMENA_DEFAULT_CWD: cwd },
});
const page = await app.firstWindow();
page.on('console', (m) => m.type() === 'error' && console.log('[renderer]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
try {
  await page.waitForSelector('.row', { timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('.index-status'), null, { timeout: 60_000 });
  await page.screenshot({ path: path.join(shots, '1-inicio.png') });
  check((await page.locator('.row').count()) === 4, `lista con ${await page.locator('.row').count()} filas (4 del fixture)`);

  const search = async (q) => {
    await page.fill('#search', q);
    await page.waitForTimeout(500);
    return page.locator('.row .row-title').allTextContents();
  };
  const refund = await search('refund');
  check(refund[0] === 'Partial refunds return 500', `"refund" → primero: ${refund[0]}`);
  await page.screenshot({ path: path.join(shots, '2-busqueda-refund.png') });
  const mig = await search('migracion');
  check(mig.includes('Migración de la base de datos de pagos'), `"migracion" → incluye la migración (${mig.length} resultados)`);
  const tri = await search('trigram');
  check(tri.length === 0, `"trigram" → ${tri.length} resultados (los <system-reminder> no se indexan)`);
  await search('');

  const firstTitle = (await page.locator('.row .row-title').first().textContent()) ?? '';
  await page.locator('.row').first().click({ button: 'right' });
  await page.waitForSelector('.modal');
  await page.fill('input[list="groups-list"]', 'Prueba humo');
  await page.fill('input[name="tags"]', 'smoke, urgente');
  await page.screenshot({ path: path.join(shots, '3-editor.png') });
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.modal', { state: 'detached' });
  const groupLabels = await page.locator('.group-head .label').allTextContents();
  check(groupLabels.includes('Prueba humo'), `grupo "Prueba humo" creado para "${firstTitle}"`);
  const tagged = await search('#smoke');
  check(tagged.length === 1, `filtro #smoke → ${tagged.length} sesión`);
  await search('');
  await page.screenshot({ path: path.join(shots, '4-grupo.png') });

  const before = claudeCount();
  await page.keyboard.press('Control+Shift+N');
  await page.waitForSelector('.modal');
  await page.fill('.modal input[name="session-name"]', 'smoke-terminal');
  // The fixture folders do not exist on this machine: pick a real one.
  await page.selectOption('.modal select', cwd);
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.tab[data-id]');
  await page.waitForTimeout(6000);
  const during = claudeCount();
  check(during > before, `claude.exe en ejecución: ${before} → ${during}`);
  const screen = await page.locator('.xterm-rows, .xterm-screen').first().innerText().catch(() => '');
  console.log('   pantalla:', screen.replace(/\s+/g, ' ').slice(0, 160));
  await page.screenshot({ path: path.join(shots, '5-terminal.png') });

  await page.locator('.tab .tab-close').first().click();
  if (await page.locator('.modal').count()) await page.click('.modal .btn.primary');
  for (let i = 0; i < 20 && claudeCount() > before; i++) await page.waitForTimeout(500);
  check(claudeCount() <= before, `al cerrar la pestaña vuelve a ${claudeCount()} procesos`);
} finally {
  await app.close();
  console.log('capturas en', shots);
  fs.rmSync(userData, { recursive: true, force: true });
}
