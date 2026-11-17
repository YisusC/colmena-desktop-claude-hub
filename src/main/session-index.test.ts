// Works on a temporary copy of test/fixtures/projects, because it deletes a transcript.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { SessionIndex } from './session-index';

const FIXTURES = fileURLToPath(new URL('../../test/fixtures/projects', import.meta.url));

describe('SessionIndex al borrar una conversación', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colmena-index-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(FIXTURES, dir, { recursive: true });
  const idx = new SessionIndex(dir);
  for (const f of idx.listTranscriptFiles()) idx.update(f);
  const ids = () => idx.summaries().map((s) => s.id);
  const searchableIds = () => [...idx.searchable()].map((s) => s.sessionId);

  it('la siguiente actualización la quita de la lista y de la búsqueda', () => {
    const chart = idx.summaries().find((s) => s.title === 'Chart flickers on resize')!;
    expect(idx.isTranscriptPath(chart.file)).toBe(true);
    expect(searchableIds()).toContain(chart.id);

    fs.rmSync(chart.file);
    expect(idx.update(chart.file)).toBe(true);
    expect(ids()).not.toContain(chart.id);
    expect(searchableIds()).not.toContain(chart.id);
    expect(ids()).toHaveLength(3);
  });

  it('y no vuelve al cargar la caché del índice', () => {
    const fresh = new SessionIndex(dir);
    fresh.loadCache(JSON.parse(JSON.stringify(idx.toCache())));
    expect(fresh.summaries().map((s) => s.id).sort()).toEqual(ids().sort());
  });
});
