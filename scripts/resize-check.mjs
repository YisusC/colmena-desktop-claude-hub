// Sidebar width: drag, collapse, reopen by dragging, double-click, remember and shortcut.
//   npm run build && node scripts/resize-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-resize-'));
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({ executablePath: electronPath, args: [root], env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects') } });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.row', { timeout: 30_000 });
  const panelW = async () => ((await page.locator('.panel').isVisible()) ? Math.round((await page.locator('.panel').boundingBox()).width) : 0);
  const handle = async () => {
    const b = await page.locator('.panel-resizer').boundingBox();
    return { x: b.x + b.width / 2, y: b.y + 300 };
  };
  const drag = async (dx) => {
    const h = await handle();
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + dx, h.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const info = await page.evaluate(([x, y]) => ({ inner: window.innerWidth, at: document.elementFromPoint(x, y)?.className }), [h.x, h.y]);
    console.log(`   arrastre ${dx}: ventana ${info.inner}px, bajo el puntero al empezar: ${info.at}`);
  };

  check((await panelW()) === 320, `ancho inicial ${await panelW()} px`);
  await drag(+140);
  check((await panelW()) === 460, `ensanchar 140 px → ${await panelW()} px`);
  await drag(-200);
  check((await panelW()) === 260, `angostar 200 px → ${await panelW()} px`);
  await drag(-80);
  check((await panelW()) === 220, `no baja del mínimo: ${await panelW()} px`);
  await drag(-120);
  check((await panelW()) === 0, 'arrastrar hasta el borde la colapsa');
  await drag(+260);
  check((await panelW()) >= 220, `arrastrar desde el riel la reabre: ${await panelW()} px`);
  await page.locator('.panel-resizer').dblclick();
  await page.waitForTimeout(200);
  check((await panelW()) === 320, `doble clic vuelve al ancho original: ${await panelW()} px`);

  await drag(+80);
  await page.reload();
  await page.waitForSelector('.row', { timeout: 30_000 });
  check((await panelW()) === 400, `recuerda el ancho tras recargar: ${await panelW()} px`);
  await page.keyboard.press('Control+Shift+B');
  await page.waitForTimeout(200);
  check((await panelW()) === 0, 'Ctrl+Shift+B la colapsa');
  await page.keyboard.press('Control+Shift+B');
  await page.waitForTimeout(200);
  check((await panelW()) === 400, 'y la vuelve a mostrar con su ancho');
  await page.screenshot({ path: path.join(root, '.smoke', 'resize.png') });
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
