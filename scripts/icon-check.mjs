// Custom folder icon without the native dialog: an .exe and a PNG, in the list and in the lobby.
//   npm run build && node scripts/icon-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-icon-'));
const png = path.join(root, '.smoke', '1-inicio.png');
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects') } });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.row', { timeout: 30_000 });
  // Same conversion as src/main/icon-picker.ts, run in the main process.
  const icons = await app.evaluate(async ({ app: a, nativeImage }, files) => {
    const shrink = (img) => {
      const { width, height } = img.getSize();
      const k = Math.min(1, 64 / Math.max(width, height, 1));
      return (k < 1 ? img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' }) : img).toDataURL();
    };
    const exe = await a.getFileIcon(files.exe, { size: 'large' });
    const raster = nativeImage.createFromPath(files.png);
    return { exe: exe.isEmpty() ? '' : shrink(exe), png: raster.isEmpty() ? '' : shrink(raster) };
  }, { exe: 'C:\\Windows\\System32\\notepad.exe', png });
  check(icons.exe.startsWith('data:image/png;base64,'), `ícono de notepad.exe extraído (${icons.exe.length} caracteres)`);
  check(icons.png.startsWith('data:image/png;base64,'), `PNG reducido a 64 px (${icons.png.length} caracteres)`);

  const project = await page.locator('.group-head .label').first().textContent();
  const meta = await page.evaluate(([name, icon]) => window.hub.setFolder(name, { color: '#3d8fd9', icon }), [project, icons.exe]);
  check(meta.folders[project]?.icon === icons.exe, `guardado en la carpeta "${project}"`);
  const rejected = await page.evaluate(([name]) => window.hub.setFolder(name, { color: '#3d8fd9', icon: 'data:text/html;base64,PGI+' }), [project]);
  check(!rejected.folders[project]?.icon, 'rechaza un data URL que no es imagen');
  await page.evaluate(([name, icon]) => window.hub.setFolder(name, { color: '#3d8fd9', icon }), [project, icons.exe]);
  await page.reload();
  await page.waitForSelector('.row', { timeout: 30_000 });
  const inList = await page.locator('.group-head img.group-img').count();
  check(inList >= 1, 'la cabecera de la carpeta muestra la imagen tras recargar');
  const inLobby = await page.locator('.recent-table img.group-img, .recent-table svg.group-mark').count();
  check(inLobby >= 1, `las filas de "Retomar" llevan ícono (${inLobby})`);
  await page.locator('.group-head').first().click({ button: 'right' });
  await page.waitForSelector('.modal .pick-row');
  await page.screenshot({ path: path.join(root, '.smoke', 'icon-editor.png') });
  check(true, 'el editor muestra «Elegir de mis archivos…»');
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
