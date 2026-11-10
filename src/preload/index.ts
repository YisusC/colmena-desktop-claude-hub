import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { IPC } from '@shared/ipc';
import type { HubApi } from '@shared/types';

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: HubApi = {
  getInitialState: () => ipcRenderer.invoke(IPC.initialState),
  onSessions: (cb) => listen(IPC.sessions, cb),
  onIndexStatus: (cb) => listen(IPC.indexStatus, cb),
  search: (query) => ipcRenderer.invoke(IPC.search, query),

  updateSessionMeta: (id, patch) => ipcRenderer.invoke(IPC.updateMeta, id, patch),
  setGroup: (name, def) => ipcRenderer.invoke(IPC.setGroup, name, def),
  setFolder: (name, def) => ipcRenderer.invoke(IPC.setFolder, name, def),
  renameGroup: (from, to) => ipcRenderer.invoke(IPC.renameGroup, from, to),

  openSession: (req) => ipcRenderer.invoke(IPC.open, req),
  writePty: (id, data) => ipcRenderer.send(IPC.write, id, data),
  replayPty: (id) => ipcRenderer.invoke(IPC.replay, id),
  resizePty: (id, cols, rows) => ipcRenderer.send(IPC.resize, id, cols, rows),
  closePty: (id) => ipcRenderer.invoke(IPC.close, id),
  onPtyData: (cb) => listen(IPC.data, cb),
  onPtyExit: (cb) => listen(IPC.exit, cb),

  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  pickIcon: () => ipcRenderer.invoke(IPC.pickIcon),
  toggleFullscreen: () => ipcRenderer.send(IPC.fullscreenToggle),
  onFullscreen: (cb) => listen(IPC.fullscreenChanged, cb),
  clipboardRead: () => ipcRenderer.invoke(IPC.clipboardRead),
  clipboardWrite: (text) => ipcRenderer.send(IPC.clipboardWrite, text),
  openExternal: (url) => ipcRenderer.send(IPC.openExternal, url),
  flashAttention: () => ipcRenderer.send(IPC.attention),
  notify: (n) => ipcRenderer.send(IPC.notify, n),
  onNotificationClick: (cb) => listen(IPC.notificationClick, cb),
  onContext: (cb) => listen(IPC.context, cb),
  repoInfo: (id) => ipcRenderer.invoke(IPC.repoInfo, id),
  openPulls: (id) => ipcRenderer.invoke(IPC.openPulls, id),
  onFocusChanged: (cb) => listen(IPC.focusChanged, cb),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file as Parameters<typeof webUtils.getPathForFile>[0]);
    } catch {
      return '';
    }
  },
};

contextBridge.exposeInMainWorld('hub', api);
