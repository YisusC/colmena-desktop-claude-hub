// Fake history in test/fixtures/projects, in the same .jsonl format that Claude Code writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fold, parseQuery } from '@shared/search';
import { searchSessions } from './content-search';
import { SessionIndex } from './session-index';

const FIXTURES = fileURLToPath(new URL('../../test/fixtures/projects', import.meta.url));

describe('historial ficticio', () => {
  const idx = new SessionIndex(FIXTURES);
  const files = idx.listTranscriptFiles();
  for (const f of files) idx.update(f);
  const sessions = idx.summaries();
  const byTitle = (title: string) => {
    const s = sessions.find((x) => x.title === title);
    if (!s) throw new Error(`falta la sesión «${title}»`);
    return s;
  };
  const search = (q: string) => searchSessions(idx.searchable(), parseQuery(q));

  it('indexa las 4 sesiones con proyecto, rama, título y número de mensajes', () => {
    expect(files).toHaveLength(4);
    expect(sessions).toHaveLength(4);
    expect(byTitle('Partial refunds return 500')).toMatchObject({
      project: 'billing-api', branch: 'fix/partial-refunds', titleSource: 'custom', messageCount: 6,
    });
    expect(byTitle('Migración de la base de datos de pagos')).toMatchObject({ project: 'billing-api', titleSource: 'ai', messageCount: 6 });
    expect(byTitle('Chart flickers on resize')).toMatchObject({ project: 'web-dashboard', branch: 'main', titleSource: 'ai', messageCount: 6 });
    expect(byTitle('Nightly ETL job times out')).toMatchObject({ project: 'data-pipeline', titleSource: 'custom', messageCount: 4 });
  });

  it('"refund" pone primero la sesión de reembolsos', () => {
    const r = search('refund');
    expect(r.hits[0]?.sessionId).toBe(byTitle('Partial refunds return 500').id);
  });

  it('"migracion" encuentra por título la migración aunque lleve tilde', () => {
    const matches = sessions.filter((s) => fold(s.title).includes('migracion')).map((s) => s.title);
    expect(matches).toEqual(['Migración de la base de datos de pagos']);
  });

  it('"trigram" no encuentra nada: los bloques <system-reminder> no se indexan', () => {
    const chart = byTitle('Chart flickers on resize');
    const raw = fs.readFileSync(chart.file, 'utf8');
    expect(raw).toContain('<system-reminder>');
    expect(raw).toContain('trigram');
    expect(search('trigram').hits).toHaveLength(0);
    expect(chart.firstPrompt).toBe('El gráfico de ingresos parpadea cada vez que cambio el tamaño de la ventana. ¿Qué lo causa?');
  });

  it('lee modelo, esfuerzo y tokens de contexto (primer turno como base, último como actual)', () => {
    expect(byTitle('Partial refunds return 500')).toMatchObject({
      model: 'claude-opus-5-5', effort: 'high', baseTokens: 30353, contextTokens: 35056,
    });
    expect(byTitle('Nightly ETL job times out')).toMatchObject({ model: 'claude-opus-5-5', effort: 'high', contextTokens: 31705 });
    for (const s of sessions) expect(s.model).toBe('claude-opus-5-5');
  });

  it('cada transcript está en la carpeta de su cwd con los no alfanuméricos como "-"', () => {
    for (const s of sessions) expect(path.basename(path.dirname(s.file))).toBe(s.cwd!.replace(/[^A-Za-z0-9]/g, '-'));
  });
});
