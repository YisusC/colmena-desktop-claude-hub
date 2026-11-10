const MARKS = /\p{M}/gu;
const foldCache = new Map<string, string>();

function foldChar(c: string): string {
  let f = foldCache.get(c);
  if (f === undefined) {
    const n = c.normalize('NFD').replace(MARKS, '').toLowerCase();
    const lower = c.toLowerCase();
    f = n.length === 1 ? n : lower.length === 1 ? lower : c;
    foldCache.set(c, f);
  }
  return f;
}

/** Lowercase and without accents, same UTF-16 length, so highlights map onto the original text. */
export function fold(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 128) {
      out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : s[i];
    } else {
      out += foldChar(s[i]!);
    }
  }
  return out;
}

export interface ParsedQuery {
  needles: string[];
  excludes: string[];
  tags: string[];
  groups: string[];
  projects: string[];
}

/** Syntax: words (all must appear), "exact phrase", -exclude, #tag, g:group, p:project. */
export function parseQuery(input: string): ParsedQuery {
  const q: ParsedQuery = { needles: [], excludes: [], tags: [], groups: [], projects: [] };
  const tokens = input.match(/-?"[^"]*"?|\S+/g) ?? [];
  for (let tok of tokens) {
    let negate = false;
    if (tok.length > 1 && tok.startsWith('-')) {
      negate = true;
      tok = tok.slice(1);
    }
    if (tok.startsWith('"')) {
      const v = fold(tok.replace(/^"|"$/g, '').trim());
      if (v) (negate ? q.excludes : q.needles).push(v);
      continue;
    }
    const filter = /^(#|g:|grupo:|p:|proyecto:)(.+)$/i.exec(tok);
    if (filter && !negate) {
      const kind = filter[1]!.toLowerCase();
      const v = fold(filter[2]!);
      if (kind === '#') q.tags.push(v);
      else if (kind.startsWith('g')) q.groups.push(v);
      else q.projects.push(v);
      continue;
    }
    const v = fold(tok);
    if (v) (negate ? q.excludes : q.needles).push(v);
  }
  return q;
}

export function hasTextQuery(q: ParsedQuery): boolean {
  return q.needles.length > 0 || q.excludes.length > 0;
}
