// Linear in-memory scan: the useful history takes a few MB and answers in milliseconds.
import type { ParsedQuery } from '@shared/search';
import type { SearchHit, SearchResponse, Snippet } from '@shared/types';
import type { IndexedMessage } from './transcript';

export interface SearchableMessage extends IndexedMessage {
  /** `fold(text)`: same length as `text`. */
  norm: string;
}

export interface SearchableSession {
  sessionId: string;
  messages: SearchableMessage[];
}

const MAX_COUNT_PER_MESSAGE = 50;
const SNIPPETS_PER_SESSION = 3;
const BEFORE = 60;
const AFTER = 160;

function countOccurrences(hay: string, needle: string): number {
  let n = 0;
  let p = hay.indexOf(needle);
  while (p >= 0 && n < MAX_COUNT_PER_MESSAGE) {
    n++;
    p = hay.indexOf(needle, p + needle.length);
  }
  return n;
}

export function makeSnippet(m: SearchableMessage, needles: string[]): Snippet {
  let first = -1;
  for (const n of needles) {
    const p = m.norm.indexOf(n);
    if (p >= 0 && (first < 0 || p < first)) first = p;
  }
  if (first < 0) first = 0;
  let start = Math.max(0, first - BEFORE);
  let end = Math.min(m.text.length, first + AFTER);
  if (start > 0) {
    const sp = m.text.indexOf(' ', start);
    if (sp >= 0 && sp < first) start = sp + 1;
  }
  if (end < m.text.length) {
    const sp = m.text.lastIndexOf(' ', end);
    if (sp > first) end = sp;
  }
  const ranges: Array<[number, number]> = [];
  const windowNorm = m.norm.slice(start, end);
  for (const n of needles) {
    let p = windowNorm.indexOf(n);
    while (p >= 0) {
      ranges.push([p, p + n.length]);
      p = windowNorm.indexOf(n, p + n.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return {
    role: m.role,
    ts: m.ts,
    text: m.text.slice(start, end),
    ranges: merged,
    cutStart: start > 0,
    cutEnd: end < m.text.length,
  };
}

export function searchSessions(sessions: Iterable<SearchableSession>, q: ParsedQuery): SearchResponse {
  const { needles, excludes } = q;
  const hits: SearchHit[] = [];
  if (!needles.length && !excludes.length) return { needles, hits };

  for (const s of sessions) {
    const counts = needles.map(() => 0);
    let excluded = false;
    const candidates: Array<{ distinct: number; m: SearchableMessage }> = [];
    for (const m of s.messages) {
      if (!excluded && excludes.some((e) => m.norm.includes(e))) excluded = true;
      let distinct = 0;
      for (let i = 0; i < needles.length; i++) {
        const c = countOccurrences(m.norm, needles[i]!);
        if (c) {
          counts[i]! += c;
          distinct++;
        }
      }
      if (distinct && candidates.length < 400) candidates.push({ distinct, m });
    }
    if (!excluded && counts.every((c) => c === 0)) continue;
    candidates.sort((a, b) => b.distinct - a.distinct);
    const snippets = candidates.slice(0, SNIPPETS_PER_SESSION).map((c) => makeSnippet(c.m, needles));
    const present = counts.filter((c) => c > 0).length;
    const score = counts.reduce((acc, c) => acc + Math.log1p(c), 0) + present * 2 + (present === needles.length ? 5 : 0);
    hits.push({ sessionId: s.sessionId, needleHits: counts, excluded, score, snippets });
  }
  hits.sort((a, b) => b.score - a.score);
  return { needles, hits };
}
