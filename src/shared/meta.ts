import type { HubMeta, SessionMeta, SessionSummary } from './types';

export const EMPTY_META: HubMeta = { version: 1, groups: {}, folders: {}, sessions: {} };

/** The SVG paths for these icons live in the renderer. */
export const FOLDER_ICONS = [
  'folder', 'code', 'terminal', 'database', 'server', 'cloud', 'globe', 'chart', 'cash',
  'receipt', 'cart', 'truck', 'briefcase', 'users', 'mail', 'chat', 'phone', 'calendar',
  'book', 'flask', 'wrench', 'bug', 'shield', 'lock', 'rocket', 'bolt', 'star', 'home',
] as const;
export type FolderIcon = (typeof FOLDER_ICONS)[number];
export function isImageIcon(i: unknown): i is string {
  return typeof i === 'string' && i.length <= 200_000 && /^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(i);
}

export function isValidIcon(i: unknown): i is string {
  return (typeof i === 'string' && (FOLDER_ICONS as readonly string[]).includes(i)) || isImageIcon(i);
}

export const PALETTE = [
  '#e0793a', '#3d8fd9', '#4caf6e', '#c4549b', '#8a6ee0',
  '#d6b13a', '#2fb5a8', '#e05a5a', '#7f9c3c', '#5d7bd4',
];

export function autoColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** A session without its own metadata inherits its predecessor's (`continued-in` record). */
export function resolveMeta(sessions: SessionSummary[], meta: HubMeta): Map<string, SessionMeta> {
  const predecessor = new Map<string, string>();
  for (const s of sessions) if (s.continuedIn) predecessor.set(s.continuedIn, s.id);
  const out = new Map<string, SessionMeta>();
  for (const s of sessions) {
    let id: string | undefined = s.id;
    const seen = new Set<string>();
    let found: SessionMeta | undefined;
    while (id && !seen.has(id)) {
      seen.add(id);
      found = meta.sessions[id];
      if (found) break;
      id = predecessor.get(id);
    }
    out.set(s.id, found ?? {});
  }
  return out;
}

export interface GroupKey {
  key: string;
  label: string;
  color: string;
  icon?: string;
  auto: boolean;
  project?: string;
}

export function folderLabel(project: string, meta: HubMeta): string {
  return meta.folders?.[project]?.name?.trim() || project;
}

/** The key is the visible name: a custom group with a folder's name is shown together with that folder. */
export function groupOf(s: SessionSummary, m: SessionMeta, meta: HubMeta): GroupKey {
  if (m.group) {
    const g = meta.groups[m.group];
    const folder = Object.entries(meta.folders ?? {}).find(([p, f]) => (f.name?.trim() || p) === m.group);
    return {
      key: `g:${m.group}`,
      label: m.group,
      color: g?.color ?? folder?.[1].color ?? autoColor(folder?.[0] ?? m.group),
      icon: g?.icon ?? folder?.[1].icon,
      auto: false,
    };
  }
  const f = meta.folders?.[s.project];
  const label = folderLabel(s.project, meta);
  return { key: `g:${label}`, label, color: f?.color ?? autoColor(s.project), icon: f?.icon, auto: true, project: s.project };
}

export function displayTitle(s: SessionSummary, m: SessionMeta): string {
  return m.title?.trim() || s.title;
}

const COLOR = /^#[0-9a-f]{6}$/i;

export function sanitizeMetaPatch(patch: unknown): SessionMeta {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const out: SessionMeta = {};
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : undefined);
  if ('title' in p) out.title = str(p.title, 120);
  if ('group' in p) out.group = str(p.group, 60);
  if ('note' in p) out.note = typeof p.note === 'string' ? p.note.slice(0, 4000) : undefined;
  if ('tags' in p && Array.isArray(p.tags)) {
    const tags = p.tags.map((t) => str(t, 40)?.replace(/^#/, '')).filter((t): t is string => !!t);
    out.tags = [...new Set(tags)].slice(0, 20);
  }
  if ('pinned' in p) out.pinned = p.pinned === true;
  if ('archived' in p) out.archived = p.archived === true;
  return out;
}

export function isValidColor(c: unknown): c is string {
  return typeof c === 'string' && COLOR.test(c);
}

/** Removes empty fields (false too); undefined if nothing is left. */
export function mergeSessionMeta(current: SessionMeta | undefined, patch: SessionMeta): SessionMeta | undefined {
  const merged: SessionMeta = { ...current, ...patch };
  for (const k of Object.keys(merged) as Array<keyof SessionMeta>) {
    const v = merged[k];
    if (v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)) delete merged[k];
  }
  return Object.keys(merged).length ? merged : undefined;
}
