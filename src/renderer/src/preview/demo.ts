import { activateTab, findTab, showLobby, state } from '../store';

export function openDemoTabs(): void {
  const recent = [...state.sessions].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 4);
  for (const s of recent) state.tabs.push({ id: s.id, liveTitle: '', status: 'starting', attention: false, isNew: false, launch: 1, since: Date.now() });
  const [a, b, c, d] = recent;
  state.sideList = 'active';
  if (a) activateTab(a.id);
  const emit = (window as unknown as { __mockEmit: (id: string, d: string) => void }).__mockEmit;
  const title = (id: string | undefined, glyph: string, name: string) => id && emit(id, `\x1b]0;${glyph} ${name}\x07`);
  // b and d are working; c finished while another tab was in view; a has been waiting 25 min.
  setTimeout(() => {
    title(b?.id, '◐', b?.title ?? '');
    title(c?.id, '◐', c?.title ?? '');
    title(d?.id, '◑', d?.title ?? '');
  }, 600);
  setTimeout(() => {
    title(c?.id, '✳', c?.title ?? '');
    const ta = a && findTab(a.id);
    if (ta) ta.since = Date.now() - 25 * 60_000;
    const tc = c && findTab(c.id);
    if (tc) tc.since = Date.now() - 3 * 60_000;
    // d asks for permission with the same OSC 777 the hook emits.
    if (d) emit(d.id, '\x1b]777;notify;colmena;ask:permission_prompt\x07');
    showLobby();
  }, 1300);
}
