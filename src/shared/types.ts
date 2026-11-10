export type Role = 'user' | 'assistant';

export interface SessionSummary {
  id: string;
  file: string;
  /** Folder inside ~/.claude/projects (path encoded with dashes). */
  projectKey: string;
  project: string;
  cwd: string | null;
  branch: string | null;
  title: string;
  titleSource: 'custom' | 'agent' | 'ai' | 'prompt' | 'none';
  firstPrompt: string | null;
  firstTs: string | null;
  lastTs: string | null;
  mtimeMs: number;
  size: number;
  messageCount: number;
  continuedIn: string | null;
  nativeColor: string | null;
  prUrls: string[];
  model: string | null;
  effort: string | null;
  contextTokens: number | null;
  /** Tokens of the first turn: system prompt, tools, MCP and memory. */
  baseTokens: number | null;
}

export interface IndexStatus {
  phase: 'loading' | 'indexing' | 'ready' | 'error';
  done: number;
  total: number;
  message?: string;
}

export interface Snippet {
  role: Role;
  ts: string;
  text: string;
  /** [start, end) ranges of matches within `text`. */
  ranges: Array<[number, number]>;
  cutStart: boolean;
  cutEnd: boolean;
}

export interface SearchHit {
  sessionId: string;
  /** Content matches for each search term (same order as `needles`). */
  needleHits: number[];
  excluded: boolean;
  score: number;
  snippets: Snippet[];
}

export interface SearchResponse {
  needles: string[];
  hits: SearchHit[];
}

export interface SessionMeta {
  title?: string;
  group?: string;
  tags?: string[];
  note?: string;
  pinned?: boolean;
  archived?: boolean;
}

export interface GroupDef {
  color: string;
  icon?: string;
}

export interface FolderDef {
  color?: string;
  icon?: string;
  /** Visible alias; the real folder does not change. */
  name?: string;
}

export interface HubMeta {
  version: 1;
  groups: Record<string, GroupDef>;
  /** By project folder name. */
  folders: Record<string, FolderDef>;
  sessions: Record<string, SessionMeta>;
}

export type OpenRequest =
  | { kind: 'resume'; sessionId: string; cols: number; rows: number }
  | { kind: 'new'; sessionId: string; name: string; cwd: string; cols: number; rows: number };

export type OpenResult =
  | { ok: true; sessionId: string; cwd: string }
  | { ok: false; error: string };

export interface ContextUsage {
  sessionId: string;
  usedPercentage: number | null;
  contextWindowSize: number | null;
  model: string | null;
  currentUsage?: { input: number; cacheCreation: number; cacheRead: number; output: number } | null;
  totalInputTokens?: number | null;
  totalOutputTokens?: number | null;
  costUsd?: number | null;
  at: number;
}

export interface RepoCommit { hash: string; subject: string; author: string; date: string; refs: string; url: string | null }
export type RepoResult =
  | { ok: true; branch: string | null; upstream: string | null; ahead: number; behind: number; changed: number; web: string | null; commits: RepoCommit[] }
  | { ok: false; error: string };
export interface PullRequest { number: number; title: string; author: string; branch: string; draft: boolean; url: string; review: string; updatedAt: string }
export type PullsResult = { ok: true; prs: PullRequest[] } | { ok: false; error: string };

export interface InitialState {
  live: Array<{ sessionId: string; cwd: string }>;
  context: Record<string, ContextUsage>;
  sessions: SessionSummary[];
  meta: HubMeta;
  status: IndexStatus;
  home: string;
  defaultCwd: string;
  claudePath: string | null;
}

export interface HubApi {
  getInitialState(): Promise<InitialState>;
  onSessions(cb: (sessions: SessionSummary[]) => void): () => void;
  onIndexStatus(cb: (status: IndexStatus) => void): () => void;
  search(query: string): Promise<SearchResponse>;

  updateSessionMeta(sessionId: string, patch: SessionMeta): Promise<HubMeta>;
  setGroup(name: string, def: GroupDef | null): Promise<HubMeta>;
  setFolder(name: string, def: FolderDef | null): Promise<HubMeta>;
  renameGroup(from: string, to: string): Promise<HubMeta>;

  openSession(req: OpenRequest): Promise<OpenResult>;
  writePty(sessionId: string, data: string): void;
  replayPty(sessionId: string): Promise<string>;
  resizePty(sessionId: string, cols: number, rows: number): void;
  closePty(sessionId: string): Promise<void>;
  onPtyData(cb: (sessionId: string, data: string) => void): () => void;
  onPtyExit(cb: (sessionId: string, exitCode: number) => void): () => void;

  pickFolder(): Promise<string | null>;
  toggleFullscreen(): void;
  onFullscreen(cb: (on: boolean) => void): () => void;
  pickIcon(): Promise<{ ok: true; icon: string } | { ok: false; error: string } | null>;
  clipboardRead(): Promise<string>;
  clipboardWrite(text: string): void;
  openExternal(url: string): void;
  flashAttention(): void;
  notify(n: { id: string; title: string; body: string }): void;
  onNotificationClick(cb: (sessionId: string) => void): () => void;
  onContext(cb: (usage: ContextUsage) => void): () => void;
  repoInfo(sessionId: string): Promise<RepoResult>;
  openPulls(sessionId: string): Promise<PullsResult>;
  onFocusChanged(cb: (focused: boolean) => void): () => void;
  /** On-disk path of a DOM `File`; '' if it has none. */
  pathForFile(file: unknown): string;
}
