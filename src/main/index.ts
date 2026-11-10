import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, Notification, session, shell } from 'electron';
import { IPC } from '@shared/ipc';
import type { ContextUsage, FolderDef, GroupDef, InitialState, OpenRequest, OpenResult } from '@shared/types';
import { resolveClaudePath, resolveNodePath } from './env';
import HOOK_SCRIPT from './hub-hook.cjs?raw';
import STATUSLINE_SCRIPT from './hub-statusline.cjs?raw';

function embeddedSettings(userData: string): Record<string, unknown> {
  const settings: Record<string, unknown> = { preferredNotifChannel: 'terminal_bell' };
  const node = resolveNodePath();
  if (!node) return settings;
  const hook = path.join(userData, 'hub-hook.cjs');
  fs.writeFileSync(hook, HOOK_SCRIPT);
  const q = (p: string) => `"${p.replace(/\\/g, '/')}"`;
  settings.hooks = { Notification: [{ hooks: [{ type: 'command', command: `${q(node)} ${q(hook)}` }] }] };

  const statusline = path.join(userData, 'hub-statusline.cjs');
  fs.writeFileSync(statusline, STATUSLINE_SCRIPT);
  const user = userStatusLine();
  process.env.COLMENA_CTX_DIR = path.join(userData, 'ctx');
  if (user?.command) process.env.COLMENA_USER_STATUSLINE = user.command;
  else delete process.env.COLMENA_USER_STATUSLINE;
  settings.statusLine = {
    type: 'command',
    command: `${q(node)} ${q(statusline)}`,
    ...(typeof user?.padding === 'number' ? { padding: user.padding } : {}),
  };
  return settings;
}

function userStatusLine(): { command?: string; padding?: number } | null {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8')) as {
      statusLine?: { type?: string; command?: string; padding?: number };
    };
    return s.statusLine?.type === 'command' ? { command: s.statusLine.command, padding: s.statusLine.padding } : null;
  } catch {
    return null;
  }
}
import { pickIcon } from './icon-picker';
import { openPulls, repoInfo } from './repo';
import { IndexerClient } from './indexer-client';
import { MetaStore } from './meta-store';
import { PtyManager } from './pty-manager';

// Data stays in %APPDATA%/claude-hub even though the app is named Colmena; COLMENA_USER_DATA isolates it.
app.setPath('userData', process.env.COLMENA_USER_DATA || path.join(app.getPath('appData'), 'claude-hub'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void start();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDir(p: unknown): p is string {
  try {
    return typeof p === 'string' && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

async function start(): Promise<void> {
  await app.whenReady();
  // Also darkens the native title bar.
  nativeTheme.themeSource = 'dark';

  const home = os.homedir();
  // COLMENA_PROJECTS_DIR and COLMENA_DEFAULT_CWD allow testing with another history and another starting folder.
  const projectsDir = process.env.COLMENA_PROJECTS_DIR ? path.resolve(process.env.COLMENA_PROJECTS_DIR) : path.join(home, '.claude', 'projects');
  const userData = app.getPath('userData');
  const githubDir = path.join(home, 'Documents', 'GitHub');
  const envCwd = process.env.COLMENA_DEFAULT_CWD;
  const defaultCwd = isDir(envCwd) ? envCwd : isDir(githubDir) ? githubDir : home;

  // Own settings via --settings: the user's global settings.json is left untouched.
  const settingsPath = path.join(userData, 'claude-settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(embeddedSettings(userData), null, 2));

  let win: BrowserWindow | null = null;
  const send = (channel: string, ...args: unknown[]) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
  };

  const meta = new MetaStore(path.join(userData, 'meta.json'));
  const indexer = new IndexerClient(
    { projectsDir, cachePath: path.join(userData, 'index-cache.json') },
    { sessions: (s) => send(IPC.sessions, s), status: (s) => send(IPC.indexStatus, s) },
  );
  const claudePath = resolveClaudePath();
  const ptys = claudePath
    ? new PtyManager(claudePath, {
        data: (id, data) => send(IPC.data, id, data),
        exit: (id, code) => send(IPC.exit, id, code),
      })
    : null;

  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  // Per-session context usage, written by the wrapper status line.
  const ctxDir = path.join(userData, 'ctx');
  fs.mkdirSync(ctxDir, { recursive: true });
  const context: Record<string, ContextUsage> = {};
  const readCtx = (name: string): ContextUsage | null => {
    if (!/^[\w-]+\.json$/.test(name) || name.startsWith('_')) return null;
    try {
      const c = JSON.parse(fs.readFileSync(path.join(ctxDir, name), 'utf8')) as ContextUsage;
      return typeof c.sessionId === 'string' ? c : null;
    } catch {
      return null;
    }
  };
  for (const name of fs.readdirSync(ctxDir)) {
    const c = readCtx(name);
    if (c) context[c.sessionId] = c;
  }
  const ctxTimers = new Map<string, NodeJS.Timeout>();
  fs.watch(ctxDir, (_evt, filename) => {
    const name = filename?.toString();
    if (!name) return;
    clearTimeout(ctxTimers.get(name));
    ctxTimers.set(name, setTimeout(() => {
      const c = readCtx(name);
      if (!c) return;
      context[c.sessionId] = c;
      send(IPC.context, c);
    }, 150));
  });

  ipcMain.handle(IPC.replay, (_e, id: unknown) => (typeof id === 'string' ? (ptys?.replayOf(id) ?? '') : ''));

  ipcMain.handle(IPC.initialState, (): InitialState => ({
    live: ptys?.live() ?? [],
    context,
    sessions: indexer.sessions,
    meta: meta.get(),
    status: indexer.status,
    home,
    defaultCwd,
    claudePath,
  }));
  ipcMain.handle(IPC.search, (_e, query: unknown) => indexer.search(typeof query === 'string' ? query : ''));
  ipcMain.handle(IPC.updateMeta, (_e, id: unknown, patch: unknown) =>
    typeof id === 'string' && UUID.test(id) ? meta.updateSession(id, patch) : meta.get(),
  );
  ipcMain.handle(IPC.setGroup, (_e, name: unknown, def: GroupDef | null) => meta.setGroup(name, def));
  ipcMain.handle(IPC.setFolder, (_e, name: unknown, def: FolderDef | null) => meta.setFolder(name, def));
  ipcMain.handle(IPC.renameGroup, (_e, from: unknown, to: unknown) => meta.renameGroup(from, to));

  // Folder of each terminal: new sessions are not in the index yet.
  const liveCwd = new Map<string, string>();

  // The renderer never sends commands: main builds the arguments from validated data.
  ipcMain.handle(IPC.open, (_e, req: OpenRequest): OpenResult => {
    if (!ptys) return { ok: false, error: 'No encontré claude.exe. Instala Claude Code o revisa el PATH.' };
    if (!req || typeof req !== 'object') return { ok: false, error: 'Solicitud inválida' };
    const cols = Number(req.cols);
    const rows = Number(req.rows);
    if (req.kind === 'resume') {
      const s = indexer.find(String(req.sessionId));
      if (!s) return { ok: false, error: 'La sesión no está en el índice.' };
      const cwd = isDir(s.cwd) ? s.cwd : home;
      if (!ptys.has(s.id)) {
        // Without the original folder, resume by transcript path from HOME.
        ptys.spawn(s.id, ['--settings', settingsPath, '--resume', cwd === s.cwd ? s.id : s.file], cwd, cols, rows);
      }
      liveCwd.set(s.id, cwd);
      return { ok: true, sessionId: s.id, cwd };
    }
    if (req.kind === 'new') {
      const id = String(req.sessionId);
      if (!UUID.test(id) || indexer.find(id) || ptys.has(id)) return { ok: false, error: 'ID de sesión inválido.' };
      if (!isDir(req.cwd)) return { ok: false, error: 'La carpeta no existe.' };
      const name = typeof req.name === 'string' ? req.name.replace(/[\u0000-\u001f"]/g, ' ').trim().slice(0, 80) : '';
      const args = ['--settings', settingsPath, '--session-id', id, ...(name ? ['-n', name] : [])];
      ptys.spawn(id, args, req.cwd, cols, rows);
      liveCwd.set(id, req.cwd);
      return { ok: true, sessionId: id, cwd: req.cwd };
    }
    return { ok: false, error: 'Tipo de solicitud desconocido' };
  });
  ipcMain.on(IPC.write, (_e, id: unknown, data: unknown) => {
    if (typeof id === 'string' && typeof data === 'string') ptys?.write(id, data);
  });
  ipcMain.on(IPC.resize, (_e, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id === 'string') ptys?.resize(id, Number(cols), Number(rows));
  });
  ipcMain.handle(IPC.close, async (_e, id: unknown) => {
    if (typeof id === 'string') await ptys?.close(id);
  });

  ipcMain.handle(IPC.pickIcon, () => pickIcon(win));
  // Only the folder the index knows for that ID, never a path from the renderer.
  const repoCwd = (id: unknown): string | null => {
    if (typeof id !== 'string') return null;
    const cwd = indexer.find(id)?.cwd ?? liveCwd.get(id);
    return cwd && isDir(cwd) ? cwd : null;
  };
  ipcMain.handle(IPC.repoInfo, (_e, id: unknown) => {
    const cwd = repoCwd(id);
    return cwd ? repoInfo(cwd) : { ok: false, error: 'La sesión no tiene una carpeta conocida.' };
  });
  ipcMain.handle(IPC.openPulls, (_e, id: unknown) => {
    const cwd = repoCwd(id);
    return cwd ? openPulls(cwd) : { ok: false, error: 'La sesión no tiene una carpeta conocida.' };
  });
  ipcMain.on(IPC.fullscreenToggle, () => {
    if (win) win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle(IPC.pickFolder, async () => {
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: defaultCwd });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });
  ipcMain.handle(IPC.clipboardRead, () => clipboard.readText());
  ipcMain.on(IPC.clipboardWrite, (_e, text: unknown) => {
    if (typeof text === 'string') clipboard.writeText(text);
  });
  ipcMain.on(IPC.openExternal, (_e, url: unknown) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  ipcMain.on(IPC.attention, () => {
    if (win && !win.isFocused()) win.flashFrame(true);
  });
  // Kept until closed so the GC does not collect them.
  const live = new Set<Notification>();
  ipcMain.on(IPC.notify, async (_e, n: unknown) => {
    const p = n as { id?: unknown; title?: unknown; body?: unknown } | null;
    if (!p || typeof p.id !== 'string' || typeof p.title !== 'string' || !Notification.isSupported()) return;
    const id = p.id;
    const title = p.title.slice(0, 120);
    // Body comes from the transcript (the screen has spinners); wait for it to finish being written.
    await new Promise((r) => setTimeout(r, 700));
    const last = (await indexer.lastAssistant(id)).replace(/\s+/g, ' ').trim();
    const body = (last || (typeof p.body === 'string' ? p.body : '')).slice(0, 240);
    const note = new Notification({ title, body });
    live.add(note);
    note.on('click', () => {
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
      send(IPC.notificationClick, id);
    });
    note.on('close', () => live.delete(note));
    note.show();
  });

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#111317',
    autoHideMenuBar: true,
    title: 'Colmena',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  // No menu: its hidden shortcuts (Ctrl+W, Ctrl+R) steal keys from the terminal.
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || !input.shift) return;
    const key = input.key.toLowerCase();
    if (key === 'i') win?.webContents.toggleDevTools();
    // Reload from main: will-navigate blocks reloads started by the page.
    else if (key === 'r') win?.webContents.reload();
    else return;
    event.preventDefault();
  });
  win.on('focus', () => win?.flashFrame(false));
  // document.hasFocus() stays true while the window is minimized: main reports the real focus.
  const sendFocus = () => send(IPC.focusChanged, !!win && win.isFocused() && !win.isMinimized());
  for (const ev of ['focus', 'blur', 'minimize', 'restore', 'hide', 'show'] as const) win.on(ev as 'focus', sendFocus);
  win.on('enter-full-screen', () => send(IPC.fullscreenChanged, true));
  win.on('leave-full-screen', () => send(IPC.fullscreenChanged, false));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await win.loadFile(path.join(__dirname, '../renderer/index.html'));

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  let quitting = false;
  app.on('before-quit', (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    void Promise.all([ptys?.closeAll(), indexer.flush()]).finally(() => {
      indexer.terminate();
      app.quit();
    });
  });
  app.on('window-all-closed', () => app.quit());
}
