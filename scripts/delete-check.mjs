// Deleting a conversation: Enter cancels, the editor's button deletes, metadata goes, a restart keeps it gone.
// Works on a temporary copy of test/fixtures/projects and swaps shell.trashItem for a temporary folder, so
// nothing lands in your Recycle Bin. Sends no messages.
//   npm run build && node scripts/delete-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-delete-'));
const projects = path.join(tmp, 'projects');
const userData = path.join(tmp, 'userData');
const trash = path.join(tmp, 'trash');
fs.cpSync(path.join(root, 'test', 'fixtures', 'projects'), projects, { recursive: true });
fs.mkdirSync(trash);
fs.mkdirSync(path.join(root, '.smoke'), { recursive: true });
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};

async function launch() {
  const app = await electron.launch({
    executablePath: electronPath,
    args: [root],
    env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: projects, COLMENA_DEFAULT_CWD: root },
  });
  const swapped = await app.evaluate(({ shell }, dir) => {
    const fs = process.getBuiltinModule('node:fs');
    const path = process.getBuiltinModule('node:path');
    globalThis.trashedForTest = [];
    shell.trashItem = async (p) => {
      globalThis.trashedForTest.push(p);
      fs.renameSync(p, path.join(dir, path.basename(p)));
    };
    return shell.trashItem.toString().includes('trashedForTest');
  }, trash);
  if (!swapped) {
    await app.close();
    throw new Error('No se pudo reemplazar shell.trashItem: se habría usado la Papelera de verdad.');
  }
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.waitForSelector('.row', { timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('.index-status'), null, { timeout: 60_000 });
  return { app, page };
}

let { app, page } = await launch();
const rowCount = () => page.locator('.row').count();
const savedMeta = () => JSON.parse(fs.readFileSync(path.join(userData, 'meta.json'), 'utf8'));
try {
  const n = await rowCount();
  check(n === 4, `lista con ${n} filas (4 del fixture)`);
  const row = page.locator('.row', { hasText: 'Chart flickers on resize' });
  const id = await row.getAttribute('data-id');
  const file = path.join(projects, 'C--work-web-dashboard', `${id}.jsonl`);
  // Claude Code keeps subagents in a folder named after the session, next to the transcript.
  const folder = path.join(path.dirname(file), id);
  fs.mkdirSync(path.join(folder, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'subagents', 'agent-test.jsonl'), '');

  await row.hover();
  await row.locator('button[aria-label="Fijar arriba"]').click();
  await row.locator('button[aria-label="Desfijar"]').waitFor();
  check(!!savedMeta().sessions[id]?.pinned, 'fijada: tiene metadatos en meta.json');

  await row.hover();
  await row.locator('button[aria-label="Borrar conversación"]').click();
  await page.waitForSelector('.modal[role="alertdialog"]');
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check(focused === 'Cancelar', `la confirmación pone el foco en «${focused}»`);
  await page.screenshot({ path: path.join(root, '.smoke', 'delete-confirm.png') });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.modal[role="alertdialog"]', { state: 'detached' });
  check((await rowCount()) === n && fs.existsSync(file), 'Enter cancela: no se borra nada');
  check((await page.locator('.tab[data-id]').count()) === 0, 'el botón de borrar no abre la conversación');

  await row.click({ button: 'right' });
  await page.locator('.modal button', { hasText: 'Borrar' }).click();
  await page.locator('.modal[role="alertdialog"] .btn.danger').click();
  await page.waitForSelector(`.row[data-id="${id}"]`, { state: 'detached' });
  const toast = await page.locator('.toast').textContent({ timeout: 3000 }).catch(() => '');
  check(/Papelera/.test(toast), `aviso: «${toast.trim()}»`);
  check((await rowCount()) === n - 1, `la fila desaparece (${n} → ${await rowCount()})`);
  check((await page.locator('.modal').count()) === 0, 'el editor y la confirmación se cierran');

  const trashed = (await app.evaluate(() => globalThis.trashedForTest)).map((p) => path.relative(projects, p));
  const expected = [path.relative(projects, file), path.relative(projects, folder)];
  check(trashed.join() === expected.join(), `a la Papelera: ${trashed.join(', ') || '(nada)'}`);
  check(!fs.existsSync(file) && !fs.existsSync(folder), 'el transcript y su carpeta ya no están en projects');
  check(!(id in savedMeta().sessions), 'sus metadatos se borran de meta.json');
  await page.screenshot({ path: path.join(root, '.smoke', 'delete-after.png') });

  await app.close();
  ({ app, page } = await launch());
  check((await rowCount()) === n - 1, `tras reiniciar sigue sin aparecer (${await rowCount()} filas)`);
} finally {
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
