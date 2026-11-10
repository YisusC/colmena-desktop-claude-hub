// The .jsonl files are append-only and can weigh hundreds of MB: only what is new since the last byte is read.
import fs from 'node:fs';
import path from 'node:path';
import { fold } from '@shared/search';
import type { SessionSummary } from '@shared/types';
import type { SearchableMessage, SearchableSession } from './content-search';
import { applyLine, emptyInfo, summarize, type SessionInfo } from './transcript';

interface FileState {
  path: string;
  sessionId: string;
  projectKey: string;
  /** Byte right after the last complete line processed. */
  offset: number;
  size: number;
  mtimeMs: number;
  /** First bytes (latin1) to detect that the file was replaced. */
  head: string;
  info: SessionInfo;
  messages: SearchableMessage[];
}

interface CacheFile {
  v: number;
  files: Array<Omit<FileState, 'messages'> & { messages: Array<[SearchableMessage['role'], string, string]> }>;
}

const CACHE_VERSION = 4;
const HEAD_BYTES = 256;
const CHUNK = 4 * 1024 * 1024;

function readHead(file: string, len: number): string {
  if (len <= 0) return '';
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, 0);
    return buf.toString('latin1', 0, n);
  } finally {
    fs.closeSync(fd);
  }
}

export class SessionIndex {
  private files = new Map<string, FileState>();

  constructor(private readonly projectsDir: string) {}

  /** Only projects/<project>/<session>.jsonl; subagent files sit deeper and are ignored. */
  listTranscriptFiles(): string[] {
    const out: string[] = [];
    let dirs: fs.Dirent[];
    try {
      dirs = fs.readdirSync(this.projectsDir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const dir = path.join(this.projectsDir, d.name);
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) if (e.isFile() && e.name.endsWith('.jsonl')) out.push(path.join(dir, e.name));
    }
    return out;
  }

  isTranscriptPath(file: string): boolean {
    const rel = path.relative(this.projectsDir, file);
    return !rel.startsWith('..') && rel.split(/[\\/]/).length === 2 && rel.endsWith('.jsonl');
  }

  update(file: string): boolean {
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      return this.files.delete(file);
    }
    let s = this.files.get(file);
    if (s && st.size === s.size && st.mtimeMs === s.mtimeMs) return false;
    // If it shrank or its start changed, it was replaced: full read.
    if (s && (st.size < s.offset || readHead(file, s.head.length) !== s.head)) s = undefined;
    if (!s) s = this.fresh(file);
    this.readNew(s, st.size);
    s.size = st.size;
    s.mtimeMs = st.mtimeMs;
    this.files.set(file, s);
    return true;
  }

  prune(existing: Set<string>): boolean {
    let changed = false;
    for (const f of [...this.files.keys()]) {
      if (!existing.has(f)) changed = this.files.delete(f) || changed;
    }
    return changed;
  }

  summaries(): SessionSummary[] {
    const out: SessionSummary[] = [];
    for (const s of this.files.values()) {
      if (s.messages.length === 0) continue;
      out.push(summarize(s, s.info, s.messages.length));
    }
    return out;
  }

  /** Reads newly appended data first, without waiting for the watcher; '' if the reply is not written yet. */
  lastAssistantText(sessionId: string): string {
    let file = [...this.files.values()].find((s) => s.sessionId === sessionId)?.path;
    file ??= this.listTranscriptFiles().find((f) => path.basename(f, '.jsonl') === sessionId);
    if (!file) return '';
    this.update(file);
    const msgs = this.files.get(file)?.messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]!;
      if (m.role === 'assistant') return m.text;
      if (m.role === 'user') return '';
    }
    return '';
  }

  *searchable(): Iterable<SearchableSession> {
    for (const s of this.files.values()) yield { sessionId: s.sessionId, messages: s.messages };
  }

  private fresh(file: string): FileState {
    return {
      path: file,
      sessionId: path.basename(file, '.jsonl'),
      projectKey: path.basename(path.dirname(file)),
      offset: 0,
      size: 0,
      mtimeMs: 0,
      head: '',
      info: emptyInfo(),
      messages: [],
    };
  }

  private readNew(s: FileState, size: number): void {
    if (s.offset >= size) return;
    const fd = fs.openSync(s.path, 'r');
    try {
      const buf = Buffer.allocUnsafe(CHUNK);
      let pos = s.offset;
      let carry: Buffer | null = null;
      while (pos < size) {
        const n = fs.readSync(fd, buf, 0, Math.min(CHUNK, size - pos), pos);
        if (n <= 0) break;
        pos += n;
        const data: Buffer = carry ? Buffer.concat([carry, buf.subarray(0, n)]) : buf.subarray(0, n);
        let start = 0;
        // 0x0A never appears inside a multibyte UTF-8 character: splitting by bytes is safe.
        for (let nl = data.indexOf(10, start); nl >= 0; nl = data.indexOf(10, start)) {
          const end = nl > start && data[nl - 1] === 13 ? nl - 1 : nl;
          const m = applyLine(s.info, data.toString('utf8', start, end));
          if (m) s.messages.push({ ...m, norm: fold(m.text) });
          start = nl + 1;
        }
        carry = start < data.length ? Buffer.from(data.subarray(start)) : null;
        s.offset = pos - (carry ? carry.length : 0);
      }
    } finally {
      fs.closeSync(fd);
    }
    if (!s.head) s.head = readHead(s.path, Math.min(HEAD_BYTES, s.offset));
  }

  toCache(): CacheFile {
    return {
      v: CACHE_VERSION,
      files: [...this.files.values()].map((s) => ({
        ...s,
        messages: s.messages.map((m) => [m.role, m.ts, m.text] as [SearchableMessage['role'], string, string]),
      })),
    };
  }

  loadCache(raw: unknown): number {
    const c = raw as CacheFile | null;
    if (!c || c.v !== CACHE_VERSION || !Array.isArray(c.files)) return 0;
    for (const f of c.files) {
      this.files.set(f.path, {
        ...f,
        info: { ...emptyInfo(), ...f.info },
        messages: f.messages.map(([role, ts, text]) => ({ role, ts, text, norm: fold(text) })),
      });
    }
    return c.files.length;
  }
}
