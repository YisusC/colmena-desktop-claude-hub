// The .jsonl format is internal to Claude Code and changes between versions: anything unknown is ignored.
import type { Role, SessionSummary } from '@shared/types';

export interface IndexedMessage {
  role: Role;
  ts: string;
  text: string;
}

export interface SessionInfo {
  cwd: string | null;
  branch: string | null;
  customTitle: string | null;
  agentName: string | null;
  aiTitle: string | null;
  lastPrompt: string | null;
  firstPrompt: string | null;
  firstTs: string | null;
  lastTs: string | null;
  continuedIn: string | null;
  nativeColor: string | null;
  prUrls: string[];
  model: string | null;
  effort: string | null;
  contextTokens: number | null;
  baseTokens: number | null;
}

export function emptyInfo(): SessionInfo {
  return {
    cwd: null, branch: null, customTitle: null, agentName: null, aiTitle: null,
    lastPrompt: null, firstPrompt: null, firstTs: null, lastTs: null,
    continuedIn: null, nativeColor: null, prUrls: [], model: null, effort: null, contextTokens: null, baseTokens: null,
  };
}

const MAX_MESSAGE_CHARS = 20_000;

// Blocks injected into every session (CLAUDE.md, memory): indexing them would make everything match.
const NOISE_BLOCKS =
  /<(system-reminder|local-command-caveat|local-command-stdout|local-command-stderr|command-message|task-notification)\b[^>]*>[\s\S]*?<\/\1>/g;
const WRAPPER_TAGS = /<\/?(command-name|command-args|pasted_content|bash-input|bash-stdout|bash-stderr)\b[^>]*>/g;

export function cleanUserText(text: string): string {
  return text.replace(NOISE_BLOCKS, ' ').replace(WRAPPER_TAGS, ' ').trim();
}

type Json = Record<string, unknown>;

function textBlocks(content: unknown, clean: (s: string) => string): string {
  if (typeof content === 'string') return clean(content);
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const item of content) {
    if (item && typeof item === 'object' && (item as Json).type === 'text') {
      const t = (item as Json).text;
      if (typeof t === 'string') parts.push(clean(t));
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

// Bulky records with no searchable text: skipped without parsing.
const SKIP_PREFIXES = ['{"type":"api-request', '{"type":"file-history', '{"type":"queue-operation'];

/** Updates `info` and returns the line's indexable message, if any. */
export function applyLine(info: SessionInfo, line: string): IndexedMessage | null {
  if (!line || SKIP_PREFIXES.some((p) => line.startsWith(p))) return null;
  let d: Json;
  try {
    d = JSON.parse(line) as Json;
  } catch {
    return null; // truncated line (session still being written) or corrupt
  }
  switch (d.type) {
    case 'custom-title': info.customTitle = str(d.customTitle) ?? info.customTitle; return null;
    case 'agent-name': info.agentName = str(d.agentName) ?? info.agentName; return null;
    case 'ai-title': info.aiTitle = str(d.aiTitle) ?? info.aiTitle; return null;
    case 'last-prompt': info.lastPrompt = str(d.lastPrompt) ?? info.lastPrompt; return null;
    case 'continued-in': info.continuedIn = str(d.continuedInSessionId) ?? info.continuedIn; return null;
    case 'agent-color': info.nativeColor = str(d.agentColor) ?? info.nativeColor; return null;
    case 'pr-link': {
      const url = str(d.prUrl);
      if (url && !info.prUrls.includes(url)) info.prUrls.push(url);
      return null;
    }
    case 'user':
    case 'assistant':
      break;
    default:
      return null;
  }
  if (d.isSidechain === true || d.isMeta === true) return null;

  const cwd = str(d.cwd);
  if (cwd && !info.cwd) info.cwd = cwd;
  info.branch = str(d.gitBranch) ?? info.branch;
  const ts = str(d.timestamp) ?? '';
  if (ts) {
    info.firstTs ??= ts;
    info.lastTs = ts;
  }

  const role = d.type as Role;
  const message = d.message as Json | undefined;
  if (role === 'assistant') {
    const model = str(message?.model);
    if (model && !model.startsWith('<')) info.model = model;
    info.effort = str(d.effort) ?? info.effort;
    const u = message?.usage as Record<string, unknown> | undefined;
    if (u) {
      const n = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : 0);
      const tokens = n('input_tokens') + n('cache_creation_input_tokens') + n('cache_read_input_tokens');
      if (tokens > 0) {
        info.contextTokens = tokens;
        info.baseTokens ??= tokens;
      }
    }
  }
  const text = textBlocks(message?.content, role === 'user' ? cleanUserText : (s) => s.trim());
  if (!text) return null;
  if (role === 'user' && !info.firstPrompt) info.firstPrompt = text.slice(0, 300);
  return { role, ts, text: text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) : text };
}

function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function baseName(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? p;
}

export function summarize(
  file: { path: string; sessionId: string; projectKey: string; size: number; mtimeMs: number },
  info: SessionInfo,
  messageCount: number,
): SessionSummary {
  let title: string;
  let titleSource: SessionSummary['titleSource'];
  if (info.customTitle) [title, titleSource] = [info.customTitle, 'custom'];
  else if (info.agentName) [title, titleSource] = [info.agentName, 'agent'];
  else if (info.aiTitle) [title, titleSource] = [info.aiTitle, 'ai'];
  else if (info.lastPrompt || info.firstPrompt) [title, titleSource] = [oneLine(info.firstPrompt ?? info.lastPrompt ?? '', 80), 'prompt'];
  else [title, titleSource] = [file.sessionId.slice(0, 8), 'none'];

  return {
    id: file.sessionId,
    file: file.path,
    projectKey: file.projectKey,
    project: info.cwd ? baseName(info.cwd) : baseName(file.projectKey.replace(/-+/g, '/')),
    cwd: info.cwd,
    branch: info.branch,
    title,
    titleSource,
    firstPrompt: info.firstPrompt,
    firstTs: info.firstTs,
    lastTs: info.lastTs,
    mtimeMs: file.mtimeMs,
    size: file.size,
    messageCount,
    continuedIn: info.continuedIn,
    nativeColor: info.nativeColor,
    prUrls: info.prUrls,
    model: info.model,
    effort: info.effort,
    contextTokens: info.contextTokens,
    baseTokens: info.baseTokens,
  };
}
