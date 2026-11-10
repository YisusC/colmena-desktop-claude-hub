import { computed, reactive, watch } from 'vue';
import { displayTitle, EMPTY_META, groupOf, resolveMeta, type GroupKey } from '@shared/meta';
import { fold, hasTextQuery, parseQuery } from '@shared/search';
import type { ContextUsage, HubMeta, IndexStatus, SearchHit, SearchResponse, SessionMeta, SessionSummary } from '@shared/types';

export type TabStatus = 'starting' | 'working' | 'idle' | 'exited' | 'error';

export interface Tab {
  id: string;
  /** Terminal title without the status symbol. */
  liveTitle: string;
  status: TabStatus;
  attention: boolean;
  exitCode?: number;
  error?: string;
  /** Session created from the app that may not have a transcript yet. */
  isNew: boolean;
  newName?: string;
  newCwd?: string;
  /** Incremented to ask the pane to relaunch the process. */
  launch: number;
  since: number;
  /** The current idle period began when a task finished (not when the tab opened). */
  idleAfterWork?: boolean;
  /** Claude asks for permission or asks a question (Notification hook). */
  asking?: boolean;
  askedAt?: number;
  /** The terminal was already running (the UI reloaded): reconnect instead of launching. */
  attach?: boolean;
}

export type SideList = 'active' | 'history';

interface ConfirmRequest {
  title: string;
  message: string;
  okLabel: string;
  resolve(ok: boolean): void;
}

export const hub = window.hub;

export const state = reactive({
  ready: false,
  sessions: [] as SessionSummary[],
  meta: EMPTY_META as HubMeta,
  status: { phase: 'loading', done: 0, total: 0 } as IndexStatus,
  home: '',
  defaultCwd: '',
  claudePath: null as string | null,
  query: '',
  search: null as SearchResponse | null,
  tabs: [] as Tab[],
  activeTabId: null as string | null,
  sideList: 'history' as SideList,
  panelOpen: loadNumber('hub.panelOpen', 1) === 1,
  panelWidth: loadNumber('hub.panelWidth', 320),
  resizingPanel: false,
  narrowView: 'list' as 'list' | 'session',
  view: 'lobby' as 'lobby' | 'session',
  shortcuts: false,
  fullscreen: false,
  headerCollapsed: loadFlag('hub.headerCollapsed'),
  toast: '',
  toastTab: null as string | null,
  windowFocused: true,
  context: {} as Record<string, ContextUsage>,
  contextPanel: null as string | null,
  editingGroup: null as null | { label: string; auto: boolean; color: string; icon?: string; project?: string },
  collapsed: loadCollapsed(),
  editingId: null as string | null,
  newDialog: false,
  confirm: null as ConfirmRequest | null,
  now: Date.now(),
});

export const PANEL_DEFAULT = 320;
export const PANEL_MIN = 220;
export const PANEL_MAX = 600;
export const PANEL_COLLAPSE_AT = 160;

function loadNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // no storage: lasts until the app closes
  }
}

/** The terminal keeps at least 420 px; 52 is the rail width. */
export function panelMax(): number {
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, window.innerWidth - 52 - 420));
}

export function setPanelWidth(px: number): void {
  state.panelWidth = Math.round(Math.min(panelMax(), Math.max(PANEL_MIN, px)));
  save('hub.panelWidth', String(state.panelWidth));
}

export function setPanelOpen(open: boolean): void {
  state.panelOpen = open;
  save('hub.panelOpen', open ? '1' : '0');
}

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function toggleHeader(): void {
  state.headerCollapsed = !state.headerCollapsed;
  try {
    localStorage.setItem('hub.headerCollapsed', state.headerCollapsed ? '1' : '0');
  } catch {
    // no storage: lasts until the app closes
  }
}

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('hub.collapsed') ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}
watch(
  () => ({ ...state.collapsed }),
  (v) => {
    try {
      localStorage.setItem('hub.collapsed', JSON.stringify(v));
    } catch {
      // no storage: lasts until the app closes
    }
  },
);

// If the UI reloads, the live terminals come back in the same order.
const UI_KEY = 'hub.ui';
function saveUi(): void {
  try {
    sessionStorage.setItem(UI_KEY, JSON.stringify({ order: state.tabs.map((t) => t.id), active: state.activeTabId, view: state.view }));
  } catch {
    // no session storage: the order is not restored on reload
  }
}
watch(() => [state.tabs.map((t) => t.id).join(), state.activeTabId, state.view], saveUi);

function restoreLiveTabs(live: Array<{ sessionId: string; cwd: string }>): void {
  if (!live.length) return;
  let saved: { order?: string[]; active?: string | null; view?: 'lobby' | 'session' } = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(UI_KEY) ?? '{}');
  } catch {
    saved = {};
  }
  const rank = (id: string) => {
    const i = saved.order?.indexOf(id) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  for (const l of [...live].sort((a, b) => rank(a.sessionId) - rank(b.sessionId))) {
    if (findTab(l.sessionId)) continue;
    state.tabs.push({
      id: l.sessionId, liveTitle: '', status: 'starting', attention: false, isNew: !sessionById(l.sessionId),
      newCwd: l.cwd, launch: 1, since: Date.now(), attach: true,
    });
  }
  const active = saved.active && findTab(saved.active) ? saved.active : state.tabs[0]?.id;
  if (active) activateTab(active);
  if (saved.view === 'lobby') state.view = 'lobby';
}

export async function boot(): Promise<void> {
  hub.onSessions((s) => (state.sessions = s));
  hub.onIndexStatus((s) => (state.status = s));
  hub.onFullscreen((on) => (state.fullscreen = on));
  hub.onContext((c) => (state.context[c.sessionId] = c));
  hub.onFocusChanged((f) => {
    state.windowFocused = f;
    if (f) clearActiveAttention();
  });
  hub.onNotificationClick((id) => {
    if (findTab(id)) activateTab(id);
  });
  const init = await hub.getInitialState();
  Object.assign(state, {
    sessions: init.sessions.length ? init.sessions : state.sessions,
    meta: init.meta,
    status: init.status,
    home: init.home,
    defaultCwd: init.defaultCwd,
    claudePath: init.claudePath,
    context: init.context ?? {},
    ready: true,
  });
  restoreLiveTabs(init.live ?? []);
  setInterval(() => (state.now = Date.now()), 15_000);
  window.addEventListener('focus', clearActiveAttention);
}

export const effectiveMeta = computed(() => resolveMeta(state.sessions, state.meta));
export const parsedQuery = computed(() => parseQuery(state.query));
export const searching = computed(() => hasTextQuery(parsedQuery.value));

export interface Row {
  s: SessionSummary;
  m: SessionMeta;
  g: GroupKey;
  title: string;
  score: number;
  hit?: SearchHit;
}

export interface GroupView extends GroupKey {
  rows: Row[];
  last: number;
}

const sameNeedles = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const rows = computed<Row[]>(() => {
  const q = parsedQuery.value;
  const text = searching.value;
  const metaMap = effectiveMeta.value;
  const fresh = state.search && sameNeedles(state.search.needles, q.needles) ? state.search : null;
  const hits = new Map((fresh?.hits ?? []).map((h) => [h.sessionId, h]));
  const out: Row[] = [];
  for (const s of state.sessions) {
    const m = metaMap.get(s.id) ?? {};
    const g = groupOf(s, m, state.meta);
    if (q.tags.length && !q.tags.every((t) => (m.tags ?? []).some((x) => fold(x).includes(t)))) continue;
    if (q.groups.length && !q.groups.every((x) => fold(g.label).includes(x))) continue;
    if (q.projects.length && !q.projects.every((x) => fold(s.project).includes(x))) continue;
    const title = displayTitle(s, m);
    let score = 0;
    let hit: SearchHit | undefined;
    if (text) {
      hit = hits.get(s.id);
      const own = fold([title, m.note ?? '', (m.tags ?? []).join(' '), s.project, m.group ?? '', s.branch ?? ''].join('  '));
      const ok = q.needles.every((n, i) => (hit?.needleHits[i] ?? 0) > 0 || own.includes(n));
      const excluded = hit?.excluded || q.excludes.some((e) => own.includes(e));
      if (!ok || excluded) continue;
      const foldedTitle = fold(title);
      score = (hit?.score ?? 0) + q.needles.filter((n) => foldedTitle.includes(n)).length * 4;
    }
    out.push({ s, m, g, title, score, hit });
  }
  const recency = (r: Row) => r.s.mtimeMs;
  out.sort((a, b) => (text ? b.score - a.score : 0) || recency(b) - recency(a));
  return out;
});

const pinnedOnTop = computed(() => !searching.value);
export const pinnedRows = computed(() => (pinnedOnTop.value ? rows.value.filter((r) => r.m.pinned && !r.m.archived) : []));
export const archivedRows = computed(() => (searching.value ? [] : rows.value.filter((r) => r.m.archived)));


export const projectCount = computed(() => new Set(state.sessions.map((s) => s.projectKey)).size);

export const INACTIVE_MS = 10 * 60_000;

export type Phase = 'asking' | 'finished' | 'working' | 'starting' | 'ready' | 'inactive' | 'exited' | 'error';
export const PHASE_LABEL: Record<Phase, string> = {
  asking: 'Te pregunta',
  finished: 'Terminó',
  working: 'Trabajando',
  starting: 'Abriendo',
  ready: 'Esperando',
  inactive: 'Inactiva',
  exited: 'Cerrada',
  error: 'Error',
};
const PHASE_ORDER: Record<Phase, number> = { asking: 0, finished: 1, error: 2, working: 3, starting: 4, ready: 5, inactive: 6, exited: 7 };

/** "finished": went from working to waiting less than 10 min ago; "inactive": waiting for 10 min or more. */
export function phaseOf(t: Tab, now: number): Phase {
  if (t.asking) return 'asking';
  if (t.status === 'idle') {
    if (now - t.since >= INACTIVE_MS) return 'inactive';
    return t.idleAfterWork ? 'finished' : 'ready';
  }
  return t.status;
}

export const inFlight = computed(() =>
  [...state.tabs].sort(
    (a, b) => Number(b.attention) - Number(a.attention) || PHASE_ORDER[phaseOf(a, state.now)] - PHASE_ORDER[phaseOf(b, state.now)],
  ),
);

export const phaseCounts = computed(() => {
  const c = { asking: 0, finished: 0, working: 0, inactive: 0, other: 0 };
  for (const t of state.tabs) {
    const p = phaseOf(t, state.now);
    if (p === 'asking') c.asking++;
    else if (p === 'finished') c.finished++;
    else if (p === 'working' || p === 'starting') c.working++;
    else if (p === 'inactive') c.inactive++;
    else c.other++;
  }
  return c;
});

export const activeTabs = computed(() => {
  const q = parsedQuery.value;
  return inFlight.value.filter((t) => {
    if (!q.needles.length && !q.excludes.length && !q.groups.length && !q.projects.length && !q.tags.length) return true;
    const s = sessionById(t.id);
    const m = metaOf(t.id);
    const g = s ? groupOf(s, m, state.meta) : { label: m.group ?? '' };
    const own = fold([tabTitle(t), s?.project ?? '', g.label, s?.branch ?? '', m.note ?? '', (m.tags ?? []).join(' ')].join('  '));
    return (
      q.needles.every((n) => own.includes(n)) &&
      !q.excludes.some((e) => own.includes(e)) &&
      q.groups.every((x) => fold(g.label).includes(x)) &&
      q.projects.every((x) => fold(s?.project ?? '').includes(x)) &&
      q.tags.every((x) => (m.tags ?? []).some((tag) => fold(tag).includes(x)))
    );
  });
});

export const sideBadge = computed(() => {
  let asking = 0;
  let finished = 0;
  for (const t of state.tabs) {
    if (t.asking) asking++;
    else if (t.attention && phaseOf(t, state.now) === 'finished') finished++;
  }
  return { count: asking + finished, asking, finished, kind: asking ? 'asking' : 'finished' };
});

export function showSideList(list: SideList): void {
  const narrow = window.matchMedia('(max-width: 899px)').matches;
  const showing = narrow ? state.narrowView === 'list' : state.panelOpen;
  if (showing && state.sideList === list) {
    if (narrow) state.narrowView = 'session';
    else setPanelOpen(false);
    return;
  }
  state.sideList = list;
  setPanelOpen(true);
  state.narrowView = 'list';
}

export const groups = computed<GroupView[]>(() => {
  const map = new Map<string, GroupView>();
  for (const r of rows.value) {
    if ((r.m.pinned || r.m.archived) && pinnedOnTop.value) continue;
    let g = map.get(r.g.key);
    if (!g) map.set(r.g.key, (g = { ...r.g, rows: [], last: 0 }));
    g.rows.push(r);
    g.last = Math.max(g.last, r.s.mtimeMs);
  }
  return [...map.values()].sort((a, b) => Number(a.auto) - Number(b.auto) || b.last - a.last);
});

export const knownGroups = computed(() => Object.keys(state.meta.groups).sort((a, b) => a.localeCompare(b, 'es')));

export const knownFolders = computed(() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...state.sessions].sort((a, b) => b.mtimeMs - a.mtimeMs)) {
    if (s.cwd && !seen.has(s.cwd.toLowerCase()) && !/\\Temp\\claude\\/i.test(s.cwd)) {
      seen.add(s.cwd.toLowerCase());
      out.push(s.cwd);
    }
  }
  return out;
});

/** Context window per model, learned from the sessions that ran in the app. */
const windowByModel = computed(() => {
  const out = new Map<string, number>();
  for (const c of Object.values(state.context)) if (c.model && c.contextWindowSize) out.set(c.model, c.contextWindowSize);
  return out;
});

/** Exact if the status line reported it; otherwise estimated from the tokens of the last reply. */
export function contextOf(id: string): { pct: number; estimated: boolean; window: number | null } | null {
  const c = state.context[id];
  if (c && typeof c.usedPercentage === 'number') return { pct: c.usedPercentage, estimated: false, window: c.contextWindowSize };
  const s = sessionById(id);
  const win = (s?.model && windowByModel.value.get(s.model)) || c?.contextWindowSize || null;
  if (s?.contextTokens && win) return { pct: Math.min(100, (s.contextTokens / win) * 100), estimated: true, window: win };
  return null;
}

export interface ContextDetail {
  exact: boolean;
  pct: number;
  used: number;
  window: number;
  free: number;
  /** Estimates: fixed base = first turn; conversation = the rest. */
  base: number | null;
  conversation: number | null;
  turn: { input: number; cacheCreation: number; cacheRead: number; output: number } | null;
  totalIn: number | null;
  totalOut: number | null;
  cost: number | null;
}

export function contextDetail(id: string): ContextDetail | null {
  const c = state.context[id];
  const s = sessionById(id);
  const win = c?.contextWindowSize ?? (s?.model ? windowByModel.value.get(s.model) : undefined) ?? null;
  if (!win) return null;
  const exact = typeof c?.usedPercentage === 'number';
  let used: number | null = null;
  if (c?.currentUsage) used = c.currentUsage.input + c.currentUsage.cacheCreation + c.currentUsage.cacheRead;
  else if (exact) used = (c!.usedPercentage! / 100) * win;
  else if (s?.contextTokens) used = s.contextTokens;
  if (used == null) return null;
  const base = s?.baseTokens != null ? Math.min(s.baseTokens, used) : null;
  return {
    exact,
    pct: exact ? c!.usedPercentage! : (used / win) * 100,
    used,
    window: win,
    free: Math.max(0, win - used),
    base,
    conversation: base != null ? used - base : null,
    turn: c?.currentUsage ?? null,
    totalIn: c?.totalInputTokens ?? null,
    totalOut: c?.totalOutputTokens ?? null,
    cost: c?.costUsd ?? null,
  };
}

export function sessionById(id: string): SessionSummary | undefined {
  return state.sessions.find((s) => s.id === id);
}

export function metaOf(id: string): SessionMeta {
  return effectiveMeta.value.get(id) ?? state.meta.sessions[id] ?? {};
}

export function tabTitle(tab: Tab): string {
  const s = sessionById(tab.id);
  const m = metaOf(tab.id);
  if (m.title) return m.title;
  if (s) return s.title;
  return tab.liveTitle || tab.newName || 'Nueva sesión';
}

export function tabGroup(tab: Tab): { color: string; icon?: string } {
  const s = sessionById(tab.id);
  const m = metaOf(tab.id);
  if (s) return groupOf(s, m, state.meta);
  if (m.group) return { color: state.meta.groups[m.group]?.color ?? '#3d8fd9', icon: state.meta.groups[m.group]?.icon };
  return { color: '#6b7280' };
}

export function tabColor(tab: Tab): string {
  const s = sessionById(tab.id);
  const m = metaOf(tab.id);
  if (s) return groupOf(s, m, state.meta).color;
  if (m.group) return state.meta.groups[m.group]?.color ?? '#3d8fd9';
  return '#6b7280';
}

let searchSeq = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
function runSearch(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    if (!searching.value) {
      state.search = null;
      return;
    }
    const seq = ++searchSeq;
    const r = await hub.search(state.query);
    if (seq === searchSeq) state.search = r;
  }, 120);
}
watch(() => state.query, runSearch);
watch(() => state.sessions, () => searching.value && runSearch());

export function confirmDialog(title: string, message: string, okLabel = 'Continuar'): Promise<boolean> {
  return new Promise((resolve) => {
    state.confirm = {
      title,
      message,
      okLabel,
      resolve: (ok) => {
        state.confirm = null;
        resolve(ok);
      },
    };
  });
}

export function findTab(id: string): Tab | undefined {
  return state.tabs.find((t) => t.id === id);
}

export function activateTab(id: string): void {
  state.activeTabId = id;
  state.narrowView = 'session';
  state.view = 'session';
  const t = findTab(id);
  if (t) t.attention = false;
}

export function setTabStatus(t: Tab, status: TabStatus): void {
  if (t.status !== status) t.since = Date.now();
  t.status = status;
}

export function showLobby(): void {
  state.view = 'lobby';
  state.narrowView = 'session';
}

function clearActiveAttention(): void {
  if (state.view !== 'session') return;
  const t = state.activeTabId ? findTab(state.activeTabId) : undefined;
  if (t) t.attention = false;
}

const RECENT_MS = 90_000;
/** When each session was closed in this app: its recent activity is not from another terminal. */
const closedHere = new Map<string, number>();

export async function openSession(id: string): Promise<void> {
  if (findTab(id)) return activateTab(id);
  const s = sessionById(id);
  if (!s) return;
  const ago = Date.now() - s.mtimeMs;
  const ownActivity = (closedHere.get(id) ?? 0) >= s.mtimeMs - 2000;
  if (ago < RECENT_MS && !ownActivity) {
    const ok = await confirmDialog(
      '¿Ya está abierta en otra terminal?',
      `Esta conversación tuvo actividad hace ${Math.max(1, Math.round(ago / 1000))} s. Si sigue abierta en Windows Terminal y la abres aquí también, los mensajes de ambas se mezclarán en el mismo historial.`,
      'Abrir de todos modos',
    );
    if (!ok) return;
  }
  state.tabs.push({ id, liveTitle: '', status: 'starting', attention: false, isNew: false, launch: 1, since: Date.now() });
  activateTab(id);
}

export async function createSession(opts: { name: string; cwd: string; group: string; color?: string }): Promise<void> {
  const id = crypto.randomUUID();
  if (opts.group) {
    state.meta = await hub.updateSessionMeta(id, { group: opts.group });
    if (opts.color) state.meta = await hub.setGroup(opts.group, { color: opts.color });
  }
  state.tabs.push({
    id, liveTitle: '', status: 'starting', attention: false, isNew: true,
    newName: opts.name, newCwd: opts.cwd, launch: 1, since: Date.now(),
  });
  activateTab(id);
}

export function relaunch(id: string): void {
  const t = findTab(id);
  if (!t) return;
  t.isNew = !sessionById(id);
  setTabStatus(t, 'starting');
  t.error = undefined;
  t.exitCode = undefined;
  t.launch++;
}

export async function closeTab(id: string): Promise<void> {
  const t = findTab(id);
  if (!t) return;
  if (t.status === 'working') {
    const ok = await confirmDialog('Claude está trabajando', 'Si cierras la pestaña se detiene lo que esté haciendo. El historial queda guardado.', 'Cerrar');
    if (!ok) return;
  }
  await hub.closePty(id);
  closedHere.set(id, Date.now());
  const i = state.tabs.findIndex((x) => x.id === id);
  state.tabs.splice(i, 1);
  if (state.activeTabId === id) {
    const next = state.tabs[i] ?? state.tabs[i - 1];
    state.activeTabId = next?.id ?? null;
  }
  if (!state.tabs.length) state.view = 'lobby';
}

export function moveTab(src: string, target: string, after: boolean): void {
  if (src === target) return;
  const from = state.tabs.findIndex((t) => t.id === src);
  if (from < 0) return;
  const [tab] = state.tabs.splice(from, 1);
  let to = state.tabs.findIndex((t) => t.id === target);
  if (to < 0) to = from;
  else if (after) to++;
  state.tabs.splice(to, 0, tab!);
}

export function cycleTab(delta: number): void {
  if (!state.tabs.length) return;
  const i = state.tabs.findIndex((t) => t.id === state.activeTabId);
  const next = state.tabs[(i + delta + state.tabs.length) % state.tabs.length];
  if (next) activateTab(next.id);
}

const WORKING = /^[◐◑◒◓◴◵◶◷⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u;
const IDLE = /^[✳✻✽✶✢*]/u;

/** The status comes from the symbol Claude puts before the title: ◐ working, ✳ waiting. */
export function onTerminalTitle(id: string, title: string): void {
  const t = findTab(id);
  if (!t) return;
  const prev = t.status;
  if (WORKING.test(title)) setTabStatus(t, 'working');
  else if (IDLE.test(title)) setTabStatus(t, 'idle');
  else if (t.status === 'starting') setTabStatus(t, 'idle');
  if (prev !== t.status && t.status === 'idle') t.idleAfterWork = prev === 'working';
  if (prev !== 'working' && t.status === 'working') t.asking = false;
  const name = title.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  if (name && name.toLowerCase() !== 'claude') t.liveTitle = name;
  if (prev === 'working' && t.status === 'idle') flagAttention(t);
}

export function setAsking(id: string, asking: boolean): void {
  const t = findTab(id);
  if (!t || t.asking === asking) return;
  t.asking = asking;
  if (asking) {
    t.askedAt = Date.now();
    flagAttention(t);
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, tabId?: string): void {
  state.toast = message;
  state.toastTab = tabId ?? null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = '';
    state.toastTab = null;
  }, tabId ? 6000 : 1400);
}

// Registered by terminals.ts, which imports this module, to avoid a circular import.
let previewOf: (id: string) => string = () => '';
export function setPreviewProvider(fn: (id: string) => string): void {
  previewOf = fn;
}

const lastNotified = new Map<string, number>();

/** The bell and the title change arrive together: notify only once every 5 s per terminal. */
export function flagAttention(t: Tab): void {
  const focused = state.windowFocused && document.visibilityState === 'visible';
  if (t.id === state.activeTabId && state.view === 'session' && focused) return;
  t.attention = true;
  hub.flashAttention();
  const now = Date.now();
  if (now - (lastNotified.get(t.id) ?? 0) < 5000) return;
  lastNotified.set(t.id, now);
  const title = `${tabTitle(t)} ${t.asking ? 'te pregunta algo' : 'terminó de responder'}`;
  if (focused) showToast(title, t.id);
  else hub.notify({ id: t.id, title, body: previewOf(t.id) });
}

export async function saveMeta(id: string, patch: SessionMeta, groupColor?: string): Promise<void> {
  state.meta = await hub.updateSessionMeta(id, patch);
  if (patch.group && groupColor) state.meta = await hub.setGroup(patch.group, { color: groupColor });
}

export const SESSION_DRAG = 'application/x-hub-session';

/** Into its own folder, removes the custom group; into any other, takes that group's visible name. */
export async function moveToGroup(id: string, target: GroupKey): Promise<void> {
  const s = sessionById(id);
  if (!s) return;
  const m = metaOf(id);
  if (groupOf(s, m, state.meta).key === target.key) return;
  const group = target.auto && target.project === s.project ? '' : target.label;
  state.meta = await hub.updateSessionMeta(id, { ...m, group });
  showToast(`«${displayTitle(s, m)}» ahora está en ${target.label}`);
}

export async function dropOnSection(id: string, section: 'pinned' | 'archived'): Promise<void> {
  const m = metaOf(id);
  state.meta = await hub.updateSessionMeta(id, section === 'pinned' ? { ...m, pinned: true, archived: false } : { ...m, archived: true, pinned: false });
}

export async function togglePin(id: string): Promise<void> {
  const m = metaOf(id);
  state.meta = await hub.updateSessionMeta(id, { ...m, pinned: !m.pinned });
}
