// Runs in a worker so it does not block the main process, which forwards terminal output.
import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { parseQuery } from '@shared/search';
import type { IndexStatus } from '@shared/types';
import { searchSessions } from './content-search';
import { SessionIndex } from './session-index';

export type WorkerIn =
  | { type: 'search'; reqId: number; query: string }
  | { type: 'flush' }
  | { type: 'lastAssistant'; reqId: number; sessionId: string };

export type WorkerOut =
  | { type: 'status'; status: IndexStatus }
  | { type: 'sessions'; sessions: ReturnType<SessionIndex['summaries']> }
  | { type: 'searchResult'; reqId: number; result: ReturnType<typeof searchSessions> }
  | { type: 'flushed' }
  | { type: 'lastAssistantResult'; reqId: number; text: string };

const { projectsDir, cachePath } = workerData as { projectsDir: string; cachePath: string };
const port = parentPort!;
const index = new SessionIndex(projectsDir);
const post = (m: WorkerOut) => port.postMessage(m);

let sessionsTimer: NodeJS.Timeout | null = null;
function emitSessions(delay = 250): void {
  if (sessionsTimer) return;
  sessionsTimer = setTimeout(() => {
    sessionsTimer = null;
    post({ type: 'sessions', sessions: index.summaries() });
  }, delay);
}

let saveTimer: NodeJS.Timeout | null = null;
function saveCacheNow(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const tmp = `${cachePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(index.toCache()));
    fs.renameSync(tmp, cachePath);
  } catch (err) {
    console.error('[indexer] no se pudo guardar la caché', err);
  }
}
function scheduleSave(): void {
  if (!saveTimer) saveTimer = setTimeout(saveCacheNow, 10_000);
}

const yieldToEvents = () => new Promise<void>((r) => setImmediate(r));

let scanning = false;
async function fullScan(reportProgress: boolean): Promise<void> {
  if (scanning) return;
  scanning = true;
  try {
    const files = index.listTranscriptFiles();
    let changed = index.prune(new Set(files));
    for (let i = 0; i < files.length; i++) {
      changed = index.update(files[i]!) || changed;
      if (reportProgress && (i % 4 === 0 || i === files.length - 1)) {
        post({ type: 'status', status: { phase: 'indexing', done: i + 1, total: files.length } });
      }
      await yieldToEvents(); // lets searches through while indexing
    }
    if (changed) {
      emitSessions(0);
      scheduleSave();
    }
    if (reportProgress) post({ type: 'status', status: { phase: 'ready', done: files.length, total: files.length } });
  } catch (err) {
    post({ type: 'status', status: { phase: 'error', done: 0, total: 0, message: String(err) } });
  } finally {
    scanning = false;
  }
}

const pending = new Map<string, NodeJS.Timeout>();
function scheduleFile(file: string): void {
  const prev = pending.get(file);
  if (prev) clearTimeout(prev);
  pending.set(
    file,
    setTimeout(() => {
      pending.delete(file);
      if (index.update(file)) {
        emitSessions();
        scheduleSave();
      }
    }, 400),
  );
}

port.on('message', (msg: WorkerIn) => {
  if (msg.type === 'search') {
    const result = searchSessions(index.searchable(), parseQuery(msg.query));
    post({ type: 'searchResult', reqId: msg.reqId, result });
  } else if (msg.type === 'lastAssistant') {
    let text = '';
    try {
      text = index.lastAssistantText(msg.sessionId);
    } catch {
      // no transcript yet
    }
    post({ type: 'lastAssistantResult', reqId: msg.reqId, text });
  } else if (msg.type === 'flush') {
    saveCacheNow();
    post({ type: 'flushed' });
  }
});

async function main(): Promise<void> {
  post({ type: 'status', status: { phase: 'loading', done: 0, total: 0 } });
  try {
    const n = index.loadCache(JSON.parse(fs.readFileSync(cachePath, 'utf8')));
    if (n) post({ type: 'sessions', sessions: index.summaries() });
  } catch {
    // no cache or invalid cache: index from scratch
  }
  await fullScan(true);
  try {
    fs.watch(projectsDir, { recursive: true }, (_evt, filename) => {
      if (!filename) return;
      const file = path.join(projectsDir, filename.toString());
      if (index.isTranscriptPath(file)) scheduleFile(file);
    });
  } catch (err) {
    console.error('[indexer] fs.watch no disponible; solo reescaneo periódico', err);
  }
  setInterval(() => void fullScan(false), 60_000);
}

void main();
