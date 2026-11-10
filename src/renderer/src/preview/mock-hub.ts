// Mock hub for the browser preview; the desktop app never loads it.
import { EMPTY_META, mergeSessionMeta, sanitizeMetaPatch } from '@shared/meta';
import { fold, parseQuery } from '@shared/search';
import type { ContextUsage, HubApi, HubMeta, PullsResult, RepoResult, SearchHit, SessionSummary } from '@shared/types';

interface Fixture {
  home: string;
  defaultCwd: string;
  sessions: SessionSummary[];
  // Optional, used by scripts/screenshots.mjs. Without them the preview falls back to the defaults below.
  meta?: HubMeta;
  /** Terminal lines shown under the banner, per session id. */
  screens?: Record<string, string[]>;
  context?: Record<string, ContextUsage>;
  repo?: RepoResult;
  pulls?: PullsResult;
}

const DEFAULT_SCREEN = [
  '\x1b[2m> \x1b[0m\x1b[1m¿podemos revisar por qué fallan los reembolsos parciales?\x1b[0m',
  '',
  '● Revisé el flujo de reembolsos. El servicio compara con el monto total y no',
  '  con el saldo pendiente; propongo validar contra lo ya reembolsado.',
];

// Claude Code draws its input box to the terminal width; a wider line would wrap.
const WELCOME = (name: string, cwd: string, screen: string[] = DEFAULT_SCREEN, cols = 80) =>
  [
    '\x1b[38;5;173m ▐▛███▜▌\x1b[0m   \x1b[1mClaude Code\x1b[0m v2.1.319',
    '\x1b[38;5;173m▝▜█████▛▘\x1b[0m  Opus 5.5 with xhigh effort · Claude Team',
    `\x1b[38;5;173m  ▘▘ ▝▝\x1b[0m    ${cwd}`,
    '',
    ...screen,
    '',
    `\x1b[2m${'─'.repeat(Math.max(8, cols - name.length - 4))} ${name} ─\x1b[0m`,
    '\x1b[2m❯\x1b[0m ',
    `\x1b[2m${'─'.repeat(cols - 1)}\x1b[0m`,
    '  \x1b[38;5;214m⏵⏵ auto mode on\x1b[0m\x1b[2m (shift+tab to cycle)\x1b[0m',
  ].join('\r\n');

export async function installMockHub(): Promise<Fixture> {
  const fx: Fixture = await fetch('./fixture.json')
    .then((r) => r.json() as Promise<Fixture>)
    .catch(() => ({ home: 'C:\\Users\\demo', defaultCwd: 'C:\\Users\\demo', sessions: [] }));
  let meta: HubMeta = fx.meta ?? demoMeta(fx.sessions);
  const dataCbs = new Set<(id: string, d: string) => void>();
  const emit = (id: string, d: string) => dataCbs.forEach((cb) => cb(id, d));
  const cols = new Map<string, number>();

  const api: HubApi = {
    getInitialState: async () => ({
      live: [],
      context: fx.context ?? Object.fromEntries(fx.sessions.slice(0, 12).map((s, i) => [s.id, { sessionId: s.id, usedPercentage: [12, 34, 58, 81, 7, 46, 92, 23, 65, 15, 38, 71][i] ?? 20, contextWindowSize: 1000000, model: s.model, at: Date.now() }])),
      sessions: fx.sessions,
      meta,
      status: { phase: 'ready', done: fx.sessions.length, total: fx.sessions.length },
      home: fx.home,
      defaultCwd: fx.defaultCwd,
      claudePath: 'claude.exe',
    }),
    onSessions: () => () => undefined,
    onIndexStatus: () => () => undefined,
    search: async (query) => {
      const q = parseQuery(query);
      const hits: SearchHit[] = [];
      for (const s of fx.sessions) {
        const text = s.firstPrompt ?? '';
        const norm = fold(text);
        const counts = q.needles.map((n) => (norm.includes(n) ? 1 : 0));
        if (counts.every((c) => !c)) continue;
        const n = q.needles.find((x) => norm.includes(x))!;
        const p = norm.indexOf(n);
        hits.push({
          sessionId: s.id, needleHits: counts, excluded: false, score: counts.length,
          snippets: [{ role: 'user', ts: '', text, ranges: [[p, p + n.length]], cutStart: false, cutEnd: false }],
        });
      }
      return { needles: q.needles, hits };
    },
    updateSessionMeta: async (id, patch) => {
      const next = mergeSessionMeta(meta.sessions[id], sanitizeMetaPatch(patch));
      const sessions = { ...meta.sessions };
      if (next) sessions[id] = next;
      else delete sessions[id];
      meta = { ...meta, sessions };
      return meta;
    },
    setGroup: async (name, def) => {
      const groups = { ...meta.groups };
      if (def) groups[name] = def;
      else delete groups[name];
      meta = { ...meta, groups };
      return meta;
    },
    setFolder: async (name, def) => {
      const folders = { ...meta.folders };
      if (def) folders[name] = def;
      else delete folders[name];
      meta = { ...meta, folders };
      return meta;
    },
    renameGroup: async (from, to) => {
      const groups = { ...meta.groups };
      if (groups[from] && !groups[to]) groups[to] = groups[from];
      delete groups[from];
      const sessions = Object.fromEntries(Object.entries(meta.sessions).map(([k, m]) => [k, m.group === from ? { ...m, group: to } : m]));
      meta = { ...meta, groups, sessions };
      return meta;
    },
    openSession: async (req) => {
      const s = fx.sessions.find((x) => x.id === req.sessionId);
      const name = req.kind === 'new' ? req.name || 'nueva' : (s?.title ?? 'sesión');
      const cwd = (req.kind === 'new' ? req.cwd : s?.cwd) ?? fx.defaultCwd;
      setTimeout(() => emit(req.sessionId, `\x1b]0;✳ ${name}\x07${WELCOME(name.slice(0, 30), cwd.replace(fx.home, '~'), fx.screens?.[req.sessionId], cols.get(req.sessionId))}`), 150);
      return { ok: true, sessionId: req.sessionId, cwd };
    },
    writePty: (id, d) => emit(id, d === '\r' ? '\r\n' : d),
    replayPty: async () => '',
    resizePty: (id, c) => void cols.set(id, c),
    closePty: async () => undefined,
    onPtyData: (cb) => (dataCbs.add(cb), () => dataCbs.delete(cb)),
    onPtyExit: () => () => undefined,
    pickFolder: async () => null,
    pickIcon: async () => null,
    toggleFullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => undefined);
    },
    onFullscreen: (cb) => {
      const h = () => cb(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', h);
      return () => document.removeEventListener('fullscreenchange', h);
    },
    clipboardRead: async () => '',
    clipboardWrite: () => undefined,
    openExternal: () => undefined,
    flashAttention: () => undefined,
    notify: () => undefined,
    onNotificationClick: () => () => undefined,
    onContext: () => () => undefined,
    repoInfo: async () => fx.repo ?? { ok: false, error: 'Sin repositorio en la vista previa.' },
    openPulls: async () => fx.pulls ?? { ok: false, error: 'Sin GitHub en la vista previa.' },
    onFocusChanged: (cb) => {
      const on = () => cb(true);
      const off = () => cb(false);
      window.addEventListener('focus', on);
      window.addEventListener('blur', off);
      return () => {
        window.removeEventListener('focus', on);
        window.removeEventListener('blur', off);
      };
    },
    pathForFile: (file) => (file as File).name ?? '',
  };
  (window as unknown as { hub: HubApi }).hub = api;
  // Lets demo.ts simulate state changes.
  (window as unknown as { __mockEmit: typeof emit }).__mockEmit = emit;
  return fx;
}

function demoMeta(sessions: SessionSummary[]): HubMeta {
  const meta: HubMeta = structuredClone(EMPTY_META);
  meta.groups = { Facturación: { color: '#d9a441', icon: 'cash' }, Dashboard: { color: '#44a282', icon: 'chart' } };
  meta.folders = { 'data-pipeline': { icon: 'database' } };
  for (const s of sessions) {
    if (/billing/i.test(s.project)) meta.sessions[s.id] = { group: 'Facturación' };
    else if (/dashboard/i.test(s.project)) meta.sessions[s.id] = { group: 'Dashboard' };
  }
  const recent = [...sessions].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const tag = (i: number, m: object) => {
    const s = recent[i];
    if (s) meta.sessions[s.id] = { ...meta.sessions[s.id], ...m };
  };
  tag(1, { pinned: true, tags: ['urgente'] });
  tag(3, { tags: ['cliente', 'revisar'], note: 'Falta confirmar el código de error para reembolsos parciales' });
  tag(5, { pinned: true });
  return meta;
}
