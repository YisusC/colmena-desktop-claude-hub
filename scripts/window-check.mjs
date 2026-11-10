// Dark title bar and fullscreen with F11 and with the rail button.
//   npm run build && node scripts/window-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-window-'));
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects') } });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.row', { timeout: 30_000 });
  const isFull = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? false);
  const dark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors);
  check(dark, 'barra de título en tema oscuro');

  await page.keyboard.press('F11');
  await page.waitForTimeout(1200);
  check(await isFull(), 'F11 entra en pantalla completa');
  const pressed = await page.locator('.rail-btn[aria-label="Salir de pantalla completa"]').getAttribute('aria-pressed');
  check(pressed === 'true', 'el botón del riel refleja el estado');
  await page.keyboard.press('F11');
  await page.waitForTimeout(1200);
  check(!(await isFull()), 'F11 de nuevo sale');

  await page.locator('.rail-btn[aria-label="Pantalla completa"]').click();
  await page.waitForTimeout(1200);
  check(await isFull(), 'el botón del riel entra en pantalla completa');
  await page.locator('.rail-btn[aria-label="Salir de pantalla completa"]').click();
  await page.waitForTimeout(1200);
  check(!(await isFull()), 'y el mismo botón sale');
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
