// File separate from the index: the user's metadata survives any reindex.
import fs from 'node:fs';
import path from 'node:path';
import { EMPTY_META, isValidColor, isValidIcon, mergeSessionMeta, sanitizeMetaPatch } from '@shared/meta';
import type { FolderDef, GroupDef, HubMeta } from '@shared/types';

export class MetaStore {
  private meta: HubMeta;

  constructor(private readonly file: string) {
    this.meta = this.load();
  }

  get(): HubMeta {
    return this.meta;
  }

  updateSession(sessionId: string, rawPatch: unknown): HubMeta {
    const patch = sanitizeMetaPatch(rawPatch);
    const next = mergeSessionMeta(this.meta.sessions[sessionId], patch);
    const sessions = { ...this.meta.sessions };
    if (next) sessions[sessionId] = next;
    else delete sessions[sessionId];
    const groups = { ...this.meta.groups };
    this.meta = { ...this.meta, sessions, groups };
    this.save();
    return this.meta;
  }

  setGroup(name: unknown, def: GroupDef | null): HubMeta {
    if (typeof name !== 'string' || !name.trim()) return this.meta;
    const key = name.trim().slice(0, 60);
    const groups = { ...this.meta.groups };
    if (def === null) delete groups[key];
    else if (isValidColor(def?.color)) {
      groups[key] = { color: def.color.toLowerCase(), ...(isValidIcon(def.icon) ? { icon: def.icon } : {}) };
    }
    this.meta = { ...this.meta, groups };
    this.save();
    return this.meta;
  }

  /** `null` reverts to the automatic color and icon. */
  setFolder(name: unknown, def: FolderDef | null): HubMeta {
    if (typeof name !== 'string' || !name.trim()) return this.meta;
    const key = name.trim().slice(0, 120);
    const folders = { ...this.meta.folders };
    const next: FolderDef = {};
    if (def && isValidColor(def.color)) next.color = def.color.toLowerCase();
    if (def && isValidIcon(def.icon)) next.icon = def.icon;
    const alias = typeof def?.name === 'string' ? def.name.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60) : '';
    if (alias && alias !== key) next.name = alias;
    if (Object.keys(next).length) folders[key] = next;
    else delete folders[key];
    this.meta = { ...this.meta, folders };
    this.save();
    return this.meta;
  }

  renameGroup(from: unknown, to: unknown): HubMeta {
    if (typeof from !== 'string' || typeof to !== 'string') return this.meta;
    const src = from.trim();
    const dst = to.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
    if (!src || !dst || src === dst) return this.meta;
    const groups = { ...this.meta.groups };
    if (groups[src] && !groups[dst]) groups[dst] = groups[src];
    delete groups[src];
    const sessions = { ...this.meta.sessions };
    for (const [id, m] of Object.entries(sessions)) if (m.group === src) sessions[id] = { ...m, group: dst };
    this.meta = { ...this.meta, groups, sessions };
    this.save();
    return this.meta;
  }

  private load(): HubMeta {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<HubMeta>;
      return { version: 1, groups: raw.groups ?? {}, folders: raw.folders ?? {}, sessions: raw.sessions ?? {} };
    } catch {
      return structuredClone(EMPTY_META);
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.meta, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
