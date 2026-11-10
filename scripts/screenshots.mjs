// README screenshots, taken from the browser preview with the made-up data in scripts/demo-data.mjs.
// Sends no messages and reads no real history.
//   npm run build && node scripts/screenshots.mjs
// Needs Microsoft Edge or Google Chrome. Writes docs/*.png at twice the CSS resolution, so text stays
// sharp on high-density screens and when GitHub scales the image down to the README column.
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { demoFixture } from './demo-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renderer = path.join(root, 'out', 'renderer');
const docs = path.join(root, 'docs');
if (!fs.existsSync(path.join(renderer, 'index.html'))) {
  console.error('Run npm run build first.');
  process.exit(1);
}
fs.writeFileSync(path.join(renderer, 'fixture.json'), JSON.stringify(demoFixture()));
fs.mkdirSync(docs, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(renderer, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(renderer) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const launch = (channel) => chromium.launch({ channel }).catch(() => null);
const browser = (await launch('msedge')) ?? (await launch('chrome'));
if (!browser) {
  server.close();
  console.error('Could not start Microsoft Edge or Google Chrome.');
  process.exit(1);
}

// A detail shot shows one element on a plain background: everything else is hidden while it is taken.
// With `fit`, the clip ends below the lowest visible leaf element instead of at the element's own bottom,
// and `maxHeight` (CSS pixels) leaves out whatever starts below that line.
const shot = async (page, name, el, { fit = false, pad = 20, maxHeight = Infinity } = {}) => {
  const file = path.join(docs, `${name}.png`);
  let clip;
  if (el) {
    const box = await page.evaluate(
      ({ el, fit, maxHeight }) => {
        const node = document.querySelector(el);
        const r = node.getBoundingClientRect();
        const limit = Math.min(r.bottom, r.top + maxHeight);
        let bottom = r.bottom;
        if (fit) {
          bottom = r.top;
          for (const c of node.querySelectorAll('*')) {
            const b = c.getBoundingClientRect();
            if (b.height && !c.children.length && b.bottom <= limit) bottom = Math.max(bottom, b.bottom);
          }
        }
        return { x: r.x, y: r.y, width: r.width, height: bottom - r.top };
      },
      { el, fit, maxHeight: Number.isFinite(maxHeight) ? maxHeight : 1e6 },
    );
    const vp = page.viewportSize();
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    clip = { x, y, width: Math.min(vp.width - x, box.width + pad * 2), height: Math.min(vp.height - y, box.height + pad + Math.max(pad, 16)) };
    await page.addStyleTag({ content: `body * { visibility: hidden !important; } ${el}, ${el} * { visibility: visible !important; }` });
  }
  await page.screenshot({ path: file, clip, animations: 'disabled', caret: 'hide' });
  if (el) await page.evaluate(() => document.head.lastElementChild?.remove());
  console.log(`${name}.png  ${Math.round(fs.statSync(file).size / 1024)} KB`);
};

const blur = (page) => page.evaluate(() => document.activeElement?.blur());

try {
  // 1280×800 keeps the interface text readable once GitHub fits the image to its ~880 px column.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(15_000);
  // The "asks you something" toast would cover the lobby; the yellow state already shows it.
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.toast { display: none !important; }';
      document.head.prepend(style);
    });
  });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  // demo.ts sets the tab phases on timers and then returns to the lobby.
  await page.waitForSelector('.tile .state.asking');
  await page.waitForTimeout(800);
  await shot(page, 'lobby');

  // A finished session with the ⋯ panel open on its context usage.
  await page.locator('.tile', { hasText: 'Payments DB migration' }).click();
  await page.locator('.xterm-rows:visible').waitFor();
  await page.locator('.ctx-toggle').click();
  await page.waitForSelector('.ctx-panel');
  await page.waitForTimeout(600);
  await shot(page, 'session');
  await page.keyboard.press('Escape');

  await page.locator('.side-tab[aria-label="Historial"]').click();
  await page.waitForSelector('.group-head');
  await blur(page);
  await page.waitForTimeout(300);
  // Pinned, Dashboard and Billing: enough to show the grouping without the whole list.
  await shot(page, 'history', '.panel', { fit: true, pad: 0, maxHeight: 630 });

  await page.fill('#search', 'refund');
  await page.waitForSelector('.row .snippet mark');
  await page.waitForTimeout(300);
  await shot(page, 'search', '.panel', { fit: true, pad: 0 });

  await page.fill('#search', '');
  await page.locator('.group-head', { hasText: 'Billing' }).click({ button: 'right' });
  await page.waitForSelector('form.modal');
  await blur(page);
  await page.waitForTimeout(300);
  await shot(page, 'groups', 'form.modal');
} finally {
  await browser.close();
  server.close();
}
