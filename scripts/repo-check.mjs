// ⋯ menu: Commits and PRs tabs with a new session in a repo. Sends no messages.
//   npm run build && node scripts/repo-check.mjs [repoFolder]   (defaults to this repo)
// A repo with no commits or no GitHub remote shows a notice instead of the list: that also passes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = process.argv[2] ?? root;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hub-repo-'));
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const app = await electron.launch({
  executablePath: electronPath,
  args: [root],
  env: { ...process.env, COLMENA_USER_DATA: userData, COLMENA_PROJECTS_DIR: path.join(root, 'test', 'fixtures', 'projects'), COLMENA_DEFAULT_CWD: repo },
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await page.waitForSelector('.row', { timeout: 30_000 });
  await page.keyboard.press('Control+Shift+N');
  await page.fill('.modal input[name="session-name"]', 'hub-repo-borrar');
  await page.selectOption('.modal select', repo);
  await page.click('.modal button[type="submit"]');
  const id = await page.locator('.tab[data-id]').first().getAttribute('data-id');
  await page.waitForSelector(`.tab[data-id="${id}"] .state.ready`, { timeout: 30_000 });
  const panelText = async () => (await page.locator('.ctx-panel').innerText()).replace(/\s+/g, ' ');
  const branchText = async () =>
    (await page.locator('.ctx-panel .repo-branch').count()) ? (await page.locator('.ctx-panel .repo-branch').innerText()).replace(/\s+/g, ' ') : '';

  await page.locator('.ctx-toggle').click();
  await page.locator('.ctx-tabs .view-tab', { hasText: 'Commits' }).click();
  await page.waitForSelector('.ctx-panel .repo-item, .ctx-panel .ctx-note:not(:has-text("Leyendo"))');
  const commits = await page.locator('.ctx-panel .repo-item').count();
  const commitsNote = /Todavía no hay commits en esta rama/.exec(await panelText())?.[0];
  check(commits > 0 || !!commitsNote, commits > 0 ? `commits: ${commits} · ${await branchText()}` : `sin commits que listar: «${commitsNote}»`);
  const b = await page.locator('.ctx-panel').boundingBox();
  await page.screenshot({ path: path.join(root, '.smoke', 'repo-commits.png'), clip: { x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height + 20 } });

  await page.locator('.ctx-tabs .view-tab', { hasText: 'PRs' }).click();
  await page.waitForSelector('.ctx-panel .repo-item, .ctx-panel .ctx-note:not(:has-text("Consultando"))', { timeout: 30_000 });
  const prs = await page.locator('.ctx-panel .repo-item').count();
  const prsNote = /No hay PRs abiertos|no tiene un remoto de GitHub|No encontré la CLI de GitHub|gh no tiene sesión/.exec(await panelText())?.[0];
  check(prs > 0 || !!prsNote, prs > 0 ? `PRs: ${await branchText()}` : `sin PRs que listar: «${prsNote}»`);
  const b2 = await page.locator('.ctx-panel').boundingBox();
  await page.screenshot({ path: path.join(root, '.smoke', 'repo-prs.png'), clip: { x: b2.x - 10, y: b2.y - 10, width: b2.width + 20, height: b2.height + 20 } });

  await page.keyboard.press('Escape');
  await page.locator(`.tab[data-id="${id}"] .tab-close`).click();
  await page.waitForSelector(`.tab[data-id="${id}"]`, { state: 'detached', timeout: 10_000 });
} finally {
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
