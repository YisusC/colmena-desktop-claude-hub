// Drop files, copy on select and notify on finish. Sends one short message to Claude.
//   npm run build && node scripts/interaction-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-inter-'));
const cwd = process.env.COLMENA_TEST_CWD || root;
const projectDir = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
const dropFile = path.join(root, 'README.md');
let app = null;
let id = null;
let savedClipboard = null;
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
try {
  app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_DEFAULT_CWD: cwd } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.waitForSelector('.rail', { timeout: 30_000 });
  savedClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  // Counts the requested notifications and captures the ones Windows actually shows.
  await app.evaluate(({ ipcMain, Notification }) => {
    globalThis.__notes = [];
    globalThis.__shown = [];
    ipcMain.on('util:notify', (_e, n) => globalThis.__notes.push(n));
    const show = Notification.prototype.show;
    Notification.prototype.show = function () {
      globalThis.__shown.push({ title: this.title, body: this.body });
      return show.call(this);
    };
  });

  await page.keyboard.press('Control+Shift+N');
  await page.fill('.modal input[name="session-name"]', 'hub-interaccion-borrar');
  await page.selectOption('.modal select', cwd);
  await page.click('.modal button[type="submit"]');
  await page.waitForSelector('.tab[data-id]');
  id = await page.locator('.tab[data-id]').first().getAttribute('data-id');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.ready`, { timeout: 30_000 });
  await page.waitForTimeout(1000);

  // A file input yields a File with its real path on disk.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = '__drop';
    input.style.display = 'none';
    document.body.appendChild(input);
  });
  await page.setInputFiles('#__drop', dropFile);
  await page.evaluate(() => {
    const file = document.getElementById('__drop').files[0];
    const dt = new DataTransfer();
    dt.items.add(file);
    const pane = document.querySelector('.pane');
    pane.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(1500);
  const screen = (await page.locator('.pane:visible .xterm-rows').innerText()).replace(/\s+/g, ' ');
  // A path with spaces is quoted: look for the quote attached to its first segment.
  const quoted = /\s/.test(dropFile);
  check(
    screen.includes('README.md') && (!quoted || screen.includes(`"${dropFile.split(/\s/)[0]}`)),
    quoted ? 'soltar el archivo pega su ruta entre comillas' : 'soltar el archivo pega su ruta',
  );
  for (let i = 0; i < dropFile.length + 4; i++) await page.keyboard.press('Backspace');

  const box = await page.locator('.pane:visible .xterm-screen').boundingBox();
  await page.mouse.move(box.x + 90, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 8, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  check(copied.trim().length > 3 && copied !== savedClipboard, `al seleccionar se copia: "${copied.trim().slice(0, 40)}"`);
  check((await page.locator('.toast').textContent().catch(() => '')).includes('Copiado'), 'aviso «Copiado»');

  await page.locator('.pane:visible .pane-host').click();
  await page.keyboard.type('responde solo con la palabra listo', { delay: 15 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.working`, { timeout: 20_000 }).catch(() => {});
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize());
  await page.waitForSelector(`.tab[data-id="${id}"] .state.finished`, { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const notes = await app.evaluate(() => globalThis.__notes);
  check(notes.length >= 1, `notificación pedida: "${notes[0]?.title ?? '—'}" · "${(notes[0]?.body ?? '').slice(0, 60)}"`);
  await page.waitForTimeout(2500);
  const shown = await app.evaluate(() => globalThis.__shown);
  check(/listo/i.test(shown[0]?.body ?? ''), `notificación mostrada con la respuesta: "${shown[0]?.title ?? '—'}" · "${shown[0]?.body ?? ''}"`);
  check(notes.length <= 1, `una sola notificación (campana + título no duplican): ${notes.length}`);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.restore());

  await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
  if (await page.locator('.modal').count()) await page.click('.modal .btn.primary');
  await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
} finally {
  if (app && savedClipboard !== null) await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), savedClipboard).catch(() => {});
  if (app) await app.close().catch(() => {});
  if (id) for (const p of [path.join(projectDir, `${id}.jsonl`), path.join(projectDir, id)]) fs.rmSync(p, { recursive: true, force: true });
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  console.log('sesión de prueba borrada:', id, '· portapapeles restaurado');
}
