import type { Worker } from 'node:worker_threads';
import type { IndexStatus, SearchResponse, SessionSummary } from '@shared/types';
import createIndexerWorker from './indexer.worker?nodeWorker';
import type { WorkerIn, WorkerOut } from './indexer.worker';

export class IndexerClient {
  private readonly worker: Worker;
  private reqId = 0;
  private readonly waiting = new Map<number, (r: SearchResponse) => void>();
  private readonly waitingText = new Map<number, (t: string) => void>();
  private flushWaiter: (() => void) | null = null;
  sessions: SessionSummary[] = [];
  status: IndexStatus = { phase: 'loading', done: 0, total: 0 };

  constructor(
    opts: { projectsDir: string; cachePath: string },
    private readonly on: { sessions(s: SessionSummary[]): void; status(s: IndexStatus): void },
  ) {
    this.worker = createIndexerWorker({ workerData: opts });
    this.worker.on('message', (m: WorkerOut) => this.handle(m));
    this.worker.on('error', (err) => {
      this.status = { phase: 'error', done: 0, total: 0, message: String(err) };
      this.on.status(this.status);
    });
  }

  find(sessionId: string): SessionSummary | undefined {
    return this.sessions.find((s) => s.id === sessionId);
  }

  search(query: string): Promise<SearchResponse> {
    const reqId = ++this.reqId;
    return new Promise((resolve) => {
      this.waiting.set(reqId, resolve);
      this.post({ type: 'search', reqId, query: query.slice(0, 500) });
    });
  }

  lastAssistant(sessionId: string, timeoutMs = 1500): Promise<string> {
    const reqId = ++this.reqId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waitingText.delete(reqId);
        resolve('');
      }, timeoutMs);
      this.waitingText.set(reqId, (t) => {
        clearTimeout(timer);
        resolve(t);
      });
      this.post({ type: 'lastAssistant', reqId, sessionId });
    });
  }

  flush(timeoutMs = 1500): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        this.flushWaiter = null;
        resolve();
      };
      this.flushWaiter = done;
      setTimeout(done, timeoutMs);
      this.post({ type: 'flush' });
    });
  }

  terminate(): void {
    void this.worker.terminate();
  }

  private post(m: WorkerIn): void {
    this.worker.postMessage(m);
  }

  private handle(m: WorkerOut): void {
    switch (m.type) {
      case 'sessions':
        this.sessions = m.sessions;
        this.on.sessions(m.sessions);
        break;
      case 'status':
        this.status = m.status;
        this.on.status(m.status);
        break;
      case 'searchResult':
        this.waiting.get(m.reqId)?.(m.result);
        this.waiting.delete(m.reqId);
        break;
      case 'lastAssistantResult':
        this.waitingText.get(m.reqId)?.(m.text);
        this.waitingText.delete(m.reqId);
        break;
      case 'flushed':
        this.flushWaiter?.();
        break;
    }
  }
}
