import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The PATH of an app launched from Explorer may differ from the terminal's. */
export function resolveClaudePath(): string | null {
  const candidates: string[] = [];
  try {
    const out = execFileSync('where.exe', ['claude'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    candidates.push(...out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  } catch {
    // where.exe returns exit code 1 if it finds nothing
  }
  candidates.push(path.join(os.homedir(), '.local', 'bin', 'claude.exe'));
  return candidates.find((c) => c.toLowerCase().endsWith('.exe') && fs.existsSync(c)) ?? null;
}

// Markers Claude Code sets for its child processes: if inherited, the embedded session does not save the transcript.
const INHERITED =
  /^(ELECTRON_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$|CLAUDE_CODE_(CHILD_SESSION|SESSION_ID|SESSION_ATTENDED|MESSAGING_SOCKET|MESSAGING_TOKEN|ENTRYPOINT|EXECPATH|SSE_PORT)$)/;

export function childEnv(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined && !INHERITED.test(k)) env[k] = v;
  }
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  return env;
}

export function resolveNodePath(): string | null {
  try {
    const out = execFileSync('where.exe', ['node'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    return out.split(/\r?\n/).map((s) => s.trim()).find((c) => c.toLowerCase().endsWith('.exe') && fs.existsSync(c)) ?? null;
  } catch {
    return null;
  }
}
