// Visible name (Colmena), internal data folder and a screenshot of the brand mark.
//   npm run build && node scripts/name-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'colmena-name-'));
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects') } });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.row', { timeout: 30_000 });
  check((await page.title()) === 'Colmena', `título de la ventana: ${await page.title()}`);
  check((await app.evaluate(({ app: a }) => a.getName())) === 'Colmena', 'nombre de la app: Colmena');
  check((await page.locator('.mark').getAttribute('title')) === 'Colmena', 'marca del riel: Colmena');
  await page.screenshot({ path: path.join(root, '.smoke', 'colmena-mark.png'), clip: { x: 0, y: 0, width: 360, height: 110 } });
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
const src = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8');
check(src.includes("path.join(app.getPath('appData'), 'claude-hub')"), 'los datos siguen en %APPDATA%/claude-hub');
