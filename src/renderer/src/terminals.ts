// Kept outside reactive state: Vue must not wrap the xterm instances in proxies.
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { LigaturesAddon } from '@xterm/addon-ligatures';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { findTab, flagAttention, hub, onTerminalTitle, setAsking, setPreviewProvider, setTabStatus, showToast } from './store';

interface Entry {
  term: Terminal;
  fit: FitAddon;
}

const entries = new Map<string, Entry>();

hub.onPtyData((id, data) => entries.get(id)?.term.write(data));
hub.onPtyExit((id, code) => {
  const t = findTab(id);
  if (t && t.status !== 'error') {
    setTabStatus(t, 'exited');
    t.exitCode = code;
  }
});

const THEME = {
  background: '#131217',
  foreground: '#d8dbe2',
  cursor: '#d8dbe2',
  cursorAccent: '#131217',
  selectionBackground: '#36415a',
  black: '#1b1e25', red: '#e5686b', green: '#7ec27a', yellow: '#e2bf6a',
  blue: '#6aa6e8', magenta: '#c48ae0', cyan: '#5fc3c9', white: '#c9ccd3',
  brightBlack: '#5c6370', brightRed: '#ff8487', brightGreen: '#9ad995', brightYellow: '#f2d78b',
  brightBlue: '#8cbdf5', brightMagenta: '#d7a6f0', brightCyan: '#7ed8dd', brightWhite: '#f1f3f6',
};

/** Optional preferences in localStorage: `hub.webgl` ('1' enables WebGL) and `hub.font`. */
function pref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function copySelection(term: Terminal): boolean {
  const sel = term.getSelection();
  if (!sel) return false;
  hub.clipboardWrite(sel);
  term.clearSelection();
  return true;
}

async function paste(term: Terminal): Promise<void> {
  const text = await hub.clipboardRead();
  if (text) term.paste(text);
}

export function getOrCreateTerminal(id: string, host: HTMLElement): Entry {
  const existing = entries.get(id);
  if (existing) {
    if (existing.term.element?.parentElement !== host && existing.term.element) host.appendChild(existing.term.element);
    return existing;
  }
  const term = new Terminal({
    fontFamily: pref('hub.font') ?? "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
    fontSize: 14,
    lineHeight: 1,
    cursorBlink: true,
    allowProposedApi: true,
    scrollback: 5000,
    theme: THEME,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
  term.loadAddon(new WebLinksAddon((_e, uri) => hub.openExternal(uri)));
  term.open(host);
  // The sandboxed renderer cannot read the font from disk: the fallback ligature list is used.
  try {
    term.loadAddon(new LigaturesAddon());
  } catch {
    // no ligatures: looks the same as Cascadia Mono
  }
  // WebGL draws tiny, widely spaced glyphs (Electron 45 + xterm 6): DOM by default.
  if (pref('hub.webgl') === '1') {
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // no WebGL: xterm uses the DOM renderer
    }
  }

  // Ctrl+C with a selection copies; without one it still interrupts.
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== 'keydown') return true;
    const key = ev.key.toLowerCase();
    if (ev.ctrlKey && !ev.altKey && key === 'c' && (ev.shiftKey || term.hasSelection())) {
      copySelection(term);
      ev.preventDefault();
      return false;
    }
    if (ev.ctrlKey && !ev.altKey && key === 'v') {
      ev.preventDefault(); // avoids the native paste, which would duplicate the text
      void paste(term);
      return false;
    }
    return true;
  });
  term.onData((d) => {
    // Answering (Enter) or cancelling (Esc) closes the pending question.
    if (d === '\r' || d === '\x1b') setAsking(id, false);
    hub.writePty(id, d);
  });
  // OSC 777 from the notification hook: notify;colmena;ask:<type>
  term.parser.registerOscHandler(777, (data) => {
    const [cmd, app, payload] = data.split(';');
    if (cmd !== 'notify' || app !== 'colmena') return false;
    if (payload?.startsWith('ask')) setAsking(id, true);
    return true;
  });
  term.onResize(({ cols, rows }) => hub.resizePty(id, cols, rows));
  term.onTitleChange((title) => onTerminalTitle(id, title));

  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  term.onSelectionChange(() => {
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      const sel = term.getSelection();
      if (sel.trim()) {
        hub.clipboardWrite(sel);
        showToast('Copiado');
      }
    }, 250);
  });
  // OSC 52: the program writes to the clipboard (write only, never read).
  term.parser.registerOscHandler(52, (data) => {
    const b64 = data.slice(data.indexOf(';') + 1);
    if (!b64 || b64 === '?') return true;
    try {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const text = new TextDecoder().decode(bytes);
      if (text) {
        hub.clipboardWrite(text);
        showToast('Copiado');
      }
    } catch {
      // invalid base64: ignored
    }
    return true;
  });
  term.onBell(() => {
    const t = findTab(id);
    if (t) flagAttention(t);
  });

  const entry = { term, fit };
  entries.set(id, entry);
  return entry;
}

export function fitTerminal(id: string): void {
  const e = entries.get(id);
  const el = e?.term.element?.parentElement;
  if (!e || !el || el.clientWidth === 0 || el.clientHeight === 0) return;
  try {
    e.fit.fit();
  } catch {
    // container in transition
  }
}

export function focusTerminal(id: string): void {
  entries.get(id)?.term.focus();
}

export function disposeTerminal(id: string): void {
  entries.get(id)?.term.dispose();
  entries.delete(id);
}

export function terminalSize(id: string): { cols: number; rows: number } {
  const t = entries.get(id)?.term;
  return { cols: t?.cols ?? 120, rows: t?.rows ?? 32 };
}

export function pasteToTerminal(id: string, text: string): void {
  const t = entries.get(id)?.term;
  if (!t || !text) return;
  t.paste(text);
  t.focus();
}

export function writeRaw(id: string, data: string): void {
  if (data) entries.get(id)?.term.write(data);
}

export function writeNotice(id: string, text: string): void {
  entries.get(id)?.term.write(`\r\n\x1b[2m${text}\x1b[0m\r\n`);
}

// Claude Code chrome that adds nothing to the preview: borders, the input line, mode line and status
// bar. "❯ 1. Yes" is the selected option of a permission question, not the input line, so it stays.
const CHROME = /^[\s─━═│┃╭╮╰╯┌┐└┘—-]*$|^❯(?!\s*\d+\.)|auto mode|shift\+tab|\/effort|for shortcuts|bypass permissions|esc to interrupt|^[✢✳✶✻✽*·]\s+\S+…/i;

export function previewLines(id: string, n = 4): string[] {
  const t = entries.get(id)?.term;
  if (!t) return [];
  const buf = t.buffer.active;
  const out: string[] = [];
  for (let y = buf.baseY + t.rows - 1; y >= 0 && out.length < n; y--) {
    const line = (buf.getLine(y)?.translateToString(true) ?? '').replace(/\s+$/, '');
    const trimmed = line.trim();
    // A run of 8 or more box-drawing characters is a UI border, not content.
    if (!trimmed || CHROME.test(trimmed) || /[─━═]{8,}/.test(trimmed)) continue;
    out.push(line);
  }
  return out.reverse();
}

setPreviewProvider((id) => previewLines(id, 2).map((l) => l.trim()).join(' · ').slice(0, 240));
