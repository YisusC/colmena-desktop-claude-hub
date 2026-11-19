// The + of a history folder opens a new session in that folder's working directory, with no dialog and no
// name, so Claude Code names it. Swaps the pty:open handler for a recorder: no claude.exe starts. Also checks
// that the "Nueva sesión" dialog says the name is optional.
//   npm run build && node scripts/new-in-folder-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-newin-'));
fs.mkdirSync(path.join(root, '.smoke'), { recursive: true });
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};

const app = await electron.launch({
  executablePath: electronPath,
  args: [root],
  env: {
    ...process.env,
    COLMENA_USER_DATA: path.join(tmp, 'userData'),
    COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects'),
    COLMENA_DEFAULT_CWD: root,
  },
});
try {
  const swapped = await app.evaluate(({ ipcMain }) => {
    globalThis.openedForTest = [];
    ipcMain.removeHandler('pty:open');
    ipcMain.handle('pty:open', (_e, req) => {
      globalThis.openedForTest.push(req);
      return { ok: false, error: 'Prueba: no se abre ninguna terminal.' };
    });
    return true;
  });
  check(swapped, 'pty:open reemplazado: no se abre claude.exe');

  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.waitForSelector('.row', { timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('.index-status'), null, { timeout: 60_000 });

  const head = page.locator('.group-head', { hasText: 'billing-api' });
  const plus = head.getByRole('button', { name: 'Nueva conversación en billing-api' });
  check(!(await plus.isVisible()), 'el + no se ve sin pasar el mouse');
  await head.hover();
  check(await plus.isVisible(), 'el + aparece al pasar el mouse por la carpeta');
  await page.locator('aside.panel').screenshot({ path: path.join(root, '.smoke', 'new-in-folder-hover.png') });
  await plus.click();

  await page.waitForFunction(() => document.querySelectorAll('.tab').length > 0 || !!document.querySelector('.session-head, .tab-bar'));
  await page.waitForTimeout(500);
  const opened = await app.evaluate(() => globalThis.openedForTest);
  const req = opened.at(-1);
  check(opened.length === 1, `una terminal pedida (${opened.length})`);
  check(req?.kind === 'new', `es una sesión nueva (${req?.kind})`);
  check(req?.cwd === 'C:\\work\\billing-api', `en la carpeta de billing-api (${req?.cwd})`);
  check(req?.name === '', `sin nombre: Claude Code lo pone (${JSON.stringify(req?.name)})`);
  check(!(await page.locator('.modal').count()), 'no se abrió ningún diálogo');
  await page.screenshot({ path: path.join(root, '.smoke', 'new-in-folder-open.png') });

  await page.keyboard.press('Control+Shift+N');
  const name = page.locator('.modal input[name="session-name"]');
  await name.waitFor();
  check((await name.getAttribute('placeholder')) === 'Opcional', 'el diálogo marca el nombre como opcional');
  check((await name.getAttribute('required')) === null, 'el nombre no es obligatorio');
  await page.locator('.modal').screenshot({ path: path.join(root, '.smoke', 'new-in-folder-dialog.png') });
} finally {
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
