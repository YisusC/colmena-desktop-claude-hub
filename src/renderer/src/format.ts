const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export function ago(ms: number, now: number): string {
  const s = (ms - now) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return 'ahora';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', year: abs > 300 * 86400 ? 'numeric' : undefined });
}

export function agoShort(ms: number, now: number): string {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d`;
  return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
}

export function durationShort(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  if (m < 1) return '<1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** "claude-opus-5-5" → "Opus 5.5"; "claude-sonnet-5" → "Sonnet 5"; "opus" → "Opus". */
export function modelLabel(id: string | null): string {
  if (!id) return '';
  const m = /^(?:claude-)?([a-z]+)(?:-(\d+))?(?:-(\d+))?/i.exec(id);
  if (!m) return id;
  const name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
  return [name, [m[2], m[3]].filter(Boolean).join('.')].filter(Boolean).join(' ');
}

export function shortPath(p: string | null, home: string): string {
  if (!p) return '';
  return home && p.toLowerCase().startsWith(home.toLowerCase()) ? `~${p.slice(home.length)}` : p;
}
