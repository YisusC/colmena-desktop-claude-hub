// Made-up sessions for the README screenshots (scripts/screenshots.mjs). Nothing here comes from a
// real history: projects, people, prompts and numbers are all invented.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const accent = (s) => `\x1b[38;5;173m${s}\x1b[0m`;
const you = (first, ...rest) => [`${dim('>')} ${bold(first)}`, ...rest.map((l) => `  ${bold(l)}`)];
const tool = (name, arg, result) => [`${green('●')} ${bold(name)}(${arg})`, `  ${dim('⎿')}  ${result}`];

// The four most recent sessions become the open tabs, in this order (see src/renderer/src/preview/demo.ts):
// idle for a while, working, finished while you were elsewhere, asking for permission.
// Lines stay under ~50 columns because the lobby tiles show the last few lines without wrapping.
const SESSIONS = [
  {
    id: '0c6f2a8e-1b4d-4f7a-9e3c-5d2b8a1f6e40',
    project: 'data-pipeline', branch: 'perf/nightly-etl', ago: 1 * MIN, messages: 18,
    title: 'Nightly ETL times out', titleSource: 'custom',
    prompt: 'The nightly ETL job times out since we added the events table. Where is the time going?',
    ctx: { pct: 58 },
    screen: [
      ...you('The nightly ETL job times out since we added the', 'events table. Where is the time going?'),
      '',
      ...tool('Bash', 'python -m etl.profile --stage load', 'Profiled 6 stages in 41.2s'),
      '',
      '● The load stage inserts events one row at a time.',
      '  Batched COPY takes it from 38 min to 3 min.',
      '  The change is in etl/load.py and the',
      '  integration tests pass.',
    ],
  },
  {
    id: '5a9e3c71-8d2f-4b6a-a014-7e3f9c2d8b15',
    project: 'web-dashboard', branch: 'main', ago: 2 * MIN, messages: 24,
    title: 'Revenue chart flickers', titleSource: 'ai',
    prompt: 'The revenue chart flickers every time the window is resized. What causes it?',
    ctx: { pct: 81 },
    screen: [
      ...you('The revenue chart flickers every time the window', 'is resized. What causes it?'),
      '',
      '● The chart rebuilds its canvas on every resize',
      '  event instead of resizing the one it has.',
      '',
      ...tool('Read', 'src/charts/RevenueChart.tsx', 'Read 184 lines'),
      ...tool('Update', 'src/charts/RevenueChart.tsx', 'Updated with 12 additions and 9 removals'),
      '',
      `${accent('✻')} Debouncing the resize observer… ${dim('(esc to interrupt)')}`,
    ],
  },
  {
    id: '9d4b7e20-3f1a-4c8e-b6d5-2a7f0e9c1b83',
    project: 'billing-api', branch: 'chore/payments-postgres', ago: 3 * MIN, messages: 32,
    title: 'Payments DB migration', titleSource: 'ai',
    prompt: 'Move the payments tables to Postgres 17 without downtime. Refunds must keep working during the switch.',
    ctx: {
      pct: 34, base: 31_400,
      usage: { input: 12, cacheCreation: 4_210, cacheRead: 335_778, output: 1_904 },
      totalIn: 2_841_330, totalOut: 61_207, cost: 4.87,
    },
    screen: [
      ...you('Move the payments tables to Postgres 17 without', 'downtime. Refunds must keep working.'),
      '',
      ...tool('Bash', 'npm run migrate:dry-run', 'payments, refunds, payouts: 1.2M rows'),
      ...tool('Write', 'migrations/0042_dual_write.sql', 'Wrote 58 lines'),
      ...tool('Bash', 'npm test -- payments', `${green('48 passed')}, 0 failed`),
      '',
      '● Done. The migration runs in three steps:',
      `  1. ${bold('Dual write')} behind the PAYMENTS_PG17 flag.`,
      `  2. ${bold('Backfill')} in batches, checking daily totals.`,
      `  3. ${bold('Switch reads')} once the check is clean.`,
    ],
  },
  {
    id: '2e8c5f19-6a3b-4d7e-8c21-9b4f6a0d3e72',
    project: 'billing-api', branch: 'fix/partial-refunds', ago: 5 * MIN, messages: 14,
    title: 'Partial refunds 500', titleSource: 'custom',
    prompt: 'Partial refunds return a 500 when the refund is smaller than the charge. Can you find out why?',
    ctx: { pct: 12 },
    screen: [
      ...you('Partial refunds return a 500 when the refund is', 'smaller than the charge. Can you find out why?'),
      '',
      '● Validation compares the refund with the total',
      '  charged, not with what is still refundable.',
      '',
      ...tool('Update', 'src/refunds/service.ts', 'Updated with 6 additions and 2 removals'),
      '',
      `${bold('Run the refund tests?')}  ${dim('npm test -- refunds')}`,
      ` ${accent('❯')} 1. Yes`,
      '   2. Yes, and don\u2019t ask again for npm test',
      '   3. No, tell Claude what to do differently',
    ],
  },
  {
    id: '7b1d9f43-2c6e-4a8b-9f35-1e7c4d2a6b90',
    project: 'billing-api', branch: 'feat/invoice-export', ago: 3 * HOUR, messages: 22,
    title: 'CSV export for invoices', titleSource: 'ai',
    prompt: 'Add a CSV export for invoices, with one column for refunded amounts.',
    ctx: { tokens: 212_000 },
  },
  {
    id: '4f6a2d85-9e1c-4b3f-a7d2-8c5e1b9f0a36',
    project: 'billing-api', branch: 'main', ago: 1 * DAY + 2 * HOUR, messages: 40,
    title: 'Rate limits for the public API', titleSource: 'custom',
    prompt: 'Design rate limits for the public API: per key, per IP, and a burst allowance.',
    ctx: { tokens: 455_000 },
  },
  {
    id: 'c3e8a1f7-5b2d-4e9c-8a6f-3d1b7e4c9a52',
    project: 'mobile-app', branch: 'feat/onboarding', ago: 5 * HOUR, messages: 16,
    title: 'Onboarding screens copy', titleSource: 'ai',
    prompt: 'Rewrite the copy of the three onboarding screens so they are shorter and friendlier.',
    ctx: { tokens: 96_000 },
  },
  {
    id: 'a8d3f6b2-1e7c-4a9d-b5e2-6f0c3a8d1e47',
    project: 'mobile-app', branch: 'fix/android-push', ago: 2 * DAY, messages: 28,
    title: 'Push notifications on Android', titleSource: 'ai',
    prompt: 'Push notifications stopped arriving on Android 15 after the last release.',
    ctx: { tokens: 301_000 },
  },
  {
    id: 'e1b7c4d9-8f2a-4c6e-9d3b-5a7f2e1c8b64',
    project: 'docs-site', branch: 'main', ago: 3 * DAY, messages: 12,
    title: 'Dark mode for the docs', titleSource: 'ai',
    prompt: 'Add a dark mode to the docs site that follows the system setting.',
    ctx: { tokens: 74_000 },
  },
  {
    id: 'f5c2e8a1-3d9b-4f7c-a6e4-0b8d2c5f9e13',
    project: 'web-dashboard', branch: 'test/checkout-e2e', ago: 6 * DAY, messages: 20,
    title: 'Flaky checkout e2e test', titleSource: 'ai',
    prompt: 'The checkout end-to-end test fails about one run in five. Find the race.',
    ctx: { tokens: 188_000 },
  },
];

const META = {
  version: 1,
  groups: {
    Billing: { color: '#d6b13a', icon: 'cash' },
    Dashboard: { color: '#4caf6e', icon: 'chart' },
    Mobile: { color: '#c4549b', icon: 'phone' },
  },
  folders: { 'data-pipeline': { icon: 'database' }, 'docs-site': { icon: 'book' } },
  sessions: {
    '9d4b7e20-3f1a-4c8e-b6d5-2a7f0e9c1b83': { group: 'Billing', tags: ['postgres'] },
    '2e8c5f19-6a3b-4d7e-8c21-9b4f6a0d3e72': { group: 'Billing', tags: ['urgent'], note: 'Customer is waiting on the fix' },
    '7b1d9f43-2c6e-4a8b-9f35-1e7c4d2a6b90': { group: 'Billing', note: 'Finance wants it before the month closes' },
    '4f6a2d85-9e1c-4b3f-a7d2-8c5e1b9f0a36': { group: 'Billing', pinned: true },
    '5a9e3c71-8d2f-4b6a-a014-7e3f9c2d8b15': { group: 'Dashboard' },
    'f5c2e8a1-3d9b-4f7c-a6e4-0b8d2c5f9e13': { group: 'Dashboard', archived: true },
    'c3e8a1f7-5b2d-4e9c-8a6f-3d1b7e4c9a52': { group: 'Mobile' },
    'a8d3f6b2-1e7c-4a9d-b5e2-6f0c3a8d1e47': { group: 'Mobile', pinned: true },
  },
};

const iso = (ms) => new Date(ms).toISOString();

export function demoFixture(now = Date.now()) {
  const WINDOW = 1_000_000;
  const sessions = [];
  const screens = {};
  const context = {};
  for (const s of SESSIONS) {
    const mtimeMs = now - s.ago;
    const tokens = s.ctx.tokens ?? (s.ctx.pct / 100) * WINDOW;
    sessions.push({
      id: s.id,
      file: `C:\\Users\\demo\\.claude\\projects\\C--work-${s.project}\\${s.id}.jsonl`,
      projectKey: `C--work-${s.project}`,
      project: s.project,
      cwd: `C:\\work\\${s.project}`,
      branch: s.branch,
      title: s.title,
      titleSource: s.titleSource,
      firstPrompt: s.prompt,
      firstTs: iso(mtimeMs - s.messages * 4 * MIN),
      lastTs: iso(mtimeMs),
      mtimeMs,
      size: s.messages * 9_000,
      messageCount: s.messages,
      continuedIn: null,
      nativeColor: null,
      prUrls: [],
      model: 'claude-opus-5-5',
      effort: 'high',
      contextTokens: Math.round(tokens),
      baseTokens: s.ctx.base ?? 30_000,
    });
    if (s.screen) screens[s.id] = s.screen;
    if (s.ctx.pct != null) {
      context[s.id] = {
        sessionId: s.id,
        usedPercentage: s.ctx.pct,
        contextWindowSize: WINDOW,
        model: 'claude-opus-5-5',
        currentUsage: s.ctx.usage ?? null,
        totalInputTokens: s.ctx.totalIn ?? null,
        totalOutputTokens: s.ctx.totalOut ?? null,
        costUsd: s.ctx.cost ?? null,
        at: now,
      };
    }
  }
  const commit = (hash, subject, author, ago) => ({ hash, subject, author, date: iso(now - ago), refs: '', url: null });
  return {
    home: 'C:\\Users\\demo',
    defaultCwd: 'C:\\work',
    sessions,
    meta: META,
    screens,
    context,
    repo: {
      ok: true, branch: 'chore/payments-postgres', upstream: 'origin/chore/payments-postgres',
      ahead: 2, behind: 0, changed: 3, web: null,
      commits: [
        commit('a41f9c2', 'Add dual write behind PAYMENTS_PG17', 'Ana Ruiz', 6 * MIN),
        commit('7e03b18', 'Backfill payments in batches of 10k', 'Ana Ruiz', 40 * MIN),
        commit('c92d4e7', 'Check daily totals after backfill', 'Leo Park', 3 * HOUR),
        commit('15ab6f0', 'Pin Postgres 17 in docker compose', 'Leo Park', 1 * DAY),
      ],
    },
    pulls: {
      ok: true,
      prs: [
        { number: 482, title: 'Move payments to Postgres 17', author: 'ana-ruiz', branch: 'chore/payments-postgres', draft: false, url: 'https://github.com/example/billing-api/pull/482', review: 'REVIEW_REQUIRED', updatedAt: iso(now - 20 * MIN) },
        { number: 479, title: 'Fix partial refund validation', author: 'leo-park', branch: 'fix/partial-refunds', draft: true, url: 'https://github.com/example/billing-api/pull/479', review: '', updatedAt: iso(now - 2 * HOUR) },
      ],
    },
  };
}
