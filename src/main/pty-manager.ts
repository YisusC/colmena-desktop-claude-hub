import * as pty from 'node-pty';
import { childEnv } from './env';

interface Events {
  data(sessionId: string, data: string): void;
  exit(sessionId: string, exitCode: number): void;
}

const FLUSH_MS = 8;
/** Output kept per terminal to restore the screen if the UI reloads. */
const REPLAY_CHARS = 400_000;

export interface LiveTerminal {
  sessionId: string;
  cwd: string;
}

export class PtyManager {
  private readonly ptys = new Map<string, pty.IPty>();
  private readonly buffers = new Map<string, string>();
  private readonly replay = new Map<string, string>();
  private readonly cwds = new Map<string, string>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly claudePath: string,
    private readonly events: Events,
  ) {}

  has(sessionId: string): boolean {
    return this.ptys.has(sessionId);
  }

  spawn(sessionId: string, args: string[], cwd: string, cols: number, rows: number): void {
    if (this.ptys.has(sessionId)) return;
    const p = pty.spawn(this.claudePath, args, {
      name: 'xterm-256color',
      cols: clamp(cols, 20, 500),
      rows: clamp(rows, 5, 300),
      cwd,
      env: childEnv(process.env),
    });
    this.ptys.set(sessionId, p);
    this.cwds.set(sessionId, cwd);
    this.replay.set(sessionId, '');
    p.onData((d) => {
      const r = (this.replay.get(sessionId) ?? '') + d;
      this.replay.set(sessionId, r.length > REPLAY_CHARS ? r.slice(r.length - REPLAY_CHARS) : r);
      this.queue(sessionId, d);
    });
    p.onExit(({ exitCode }) => {
      this.flush();
      this.ptys.delete(sessionId);
      this.replay.delete(sessionId);
      this.cwds.delete(sessionId);
      this.events.exit(sessionId, exitCode);
    });
  }

  live(): LiveTerminal[] {
    return [...this.ptys.keys()].map((sessionId) => ({ sessionId, cwd: this.cwds.get(sessionId) ?? '' }));
  }

  replayOf(sessionId: string): string {
    return this.replay.get(sessionId) ?? '';
  }

  write(sessionId: string, data: string): void {
    this.ptys.get(sessionId)?.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    try {
      this.ptys.get(sessionId)?.resize(clamp(cols, 20, 500), clamp(rows, 5, 300));
    } catch {
      // the process may have exited in between
    }
  }

  /** Double Ctrl+C before killing: a kill counts as a failed start of Claude's fullscreen mode. */
  close(sessionId: string, timeoutMs = 2500): Promise<void> {
    const p = this.ptys.get(sessionId);
    if (!p) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        sub.dispose();
        this.forceKill(sessionId, p);
        resolve();
      };
      const sub = p.onExit(finish);
      const timer = setTimeout(finish, timeoutMs);
      try {
        p.write('\x03');
        setTimeout(() => {
          if (!done) p.write('\x03');
        }, 200);
      } catch {
        finish();
      }
    });
  }

  closeAll(timeoutMs = 2500): Promise<void> {
    return Promise.all([...this.ptys.keys()].map((id) => this.close(id, timeoutMs))).then(() => undefined);
  }

  private forceKill(sessionId: string, p: pty.IPty): void {
    if (this.ptys.get(sessionId) === p) this.ptys.delete(sessionId);
    try {
      p.kill();
    } catch {
      // already exited
    }
  }

  pids(): number[] {
    return [...this.ptys.values()].map((p) => p.pid);
  }

  // Batches output for a few ms so small chunks do not flood the IPC.
  private queue(sessionId: string, data: string): void {
    this.buffers.set(sessionId, (this.buffers.get(sessionId) ?? '') + data);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    for (const [id, data] of this.buffers) this.events.data(id, data);
    this.buffers.clear();
  }
}

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : min;
}
