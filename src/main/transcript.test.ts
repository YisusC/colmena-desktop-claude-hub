import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyLine, cleanUserText, emptyInfo, summarize } from './transcript';
import { SessionIndex } from './session-index';

const line = (o: object) => JSON.stringify(o);

describe('applyLine', () => {
  it('indexa el texto del usuario sin los bloques inyectados por Claude Code', () => {
    const info = emptyInfo();
    const m = applyLine(info, line({
      type: 'user', cwd: 'C:\\repo\\billing-api', gitBranch: 'main', timestamp: '2026-11-01T10:00:00Z',
      message: { role: 'user', content: '<system-reminder>CLAUDE.md dice trigramas</system-reminder>¿qué tan seguro es el token refresh de OAuth?' },
    }));
    expect(m?.text).toBe('¿qué tan seguro es el token refresh de OAuth?');
    expect(info.cwd).toBe('C:\\repo\\billing-api');
    expect(info.firstPrompt).toBe('¿qué tan seguro es el token refresh de OAuth?');
  });

  it('ignora tool_result del usuario y tool_use del asistente', () => {
    const info = emptyInfo();
    expect(applyLine(info, line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'salida enorme' }] } }))).toBeNull();
    const m = applyLine(info, line({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', input: { command: 'rm -rf' } }, { type: 'text', text: 'Listo.' }] },
    }));
    expect(m).toMatchObject({ role: 'assistant', text: 'Listo.' });
  });

  it('descarta subagentes, meta y registros de API sin parsearlos', () => {
    const info = emptyInfo();
    expect(applyLine(info, line({ type: 'user', isSidechain: true, message: { content: 'x' } }))).toBeNull();
    expect(applyLine(info, line({ type: 'user', isMeta: true, message: { content: 'x' } }))).toBeNull();
    expect(applyLine(info, '{"type":"api-request-blob","message":"system prompt completo"}')).toBeNull();
    expect(applyLine(info, '{"type":"user","message":{"content":"línea cort')).toBeNull();
  });

  it('elige el título: custom > agent > ai > prompt, quedándose con el último de cada tipo', () => {
    const info = emptyInfo();
    applyLine(info, line({ type: 'ai-title', aiTitle: 'Viejo' }));
    applyLine(info, line({ type: 'ai-title', aiTitle: 'Seguridad de OAuth' }));
    const file = { path: 'x.jsonl', sessionId: 'abc', projectKey: 'C--repo', size: 1, mtimeMs: 1 };
    expect(summarize(file, info, 1)).toMatchObject({ title: 'Seguridad de OAuth', titleSource: 'ai' });
    applyLine(info, line({ type: 'custom-title', customTitle: 'Instalación de Postgres' }));
    expect(summarize(file, info, 1)).toMatchObject({ title: 'Instalación de Postgres', titleSource: 'custom' });
  });

  it('conserva el contenido de pegados y comandos, sin las etiquetas', () => {
    expect(cleanUserText('<command-name>/rename</command-name> <command-args>pagos-reembolsos</command-args>')).toBe('/rename   pagos-reembolsos');
    expect(cleanUserText('<local-command-caveat>ruido</local-command-caveat>hola')).toBe('hola');
  });
});

describe('SessionIndex incremental', () => {
  it('lee solo lo anexado y completa líneas cortadas en la siguiente pasada', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-idx-'));
    const proj = path.join(dir, 'C--repo');
    fs.mkdirSync(proj);
    const file = path.join(proj, '11111111-2222-3333-4444-555555555555.jsonl');
    const u = (text: string) => line({ type: 'user', cwd: 'C:\\repo', message: { content: text } });
    fs.writeFileSync(file, `${u('primero')}\n${u('segundo').slice(0, 20)}`);

    const idx = new SessionIndex(dir);
    expect(idx.update(file)).toBe(true);
    expect(idx.summaries()[0]?.messageCount).toBe(1);

    fs.writeFileSync(file, `${u('primero')}\n${u('segundo')}\n${u('tercero')}\n`);
    expect(idx.update(file)).toBe(true);
    expect(idx.summaries()[0]?.messageCount).toBe(3);
    expect(idx.update(file)).toBe(false);

    // Replaced by other, shorter content → full read.
    fs.writeFileSync(file, `${u('nuevo')}\n`);
    idx.update(file);
    expect(idx.summaries()[0]?.messageCount).toBe(1);

    const again = new SessionIndex(dir);
    again.loadCache(JSON.parse(JSON.stringify(idx.toCache())));
    expect(again.summaries()).toEqual(idx.summaries());
    expect(again.update(file)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('modelo y esfuerzo', () => {
  it('guarda el último modelo y esfuerzo del asistente e ignora los sintéticos', () => {
    const info = emptyInfo();
    applyLine(info, line({ type: 'assistant', effort: 'high', message: { model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'a' }] } }));
    applyLine(info, line({ type: 'assistant', effort: 'xhigh', message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: 'b' }] } }));
    applyLine(info, line({ type: 'assistant', message: { model: '<synthetic>', content: [{ type: 'text', text: 'c' }] } }));
    const file = { path: 'x.jsonl', sessionId: 'abc', projectKey: 'C--repo', size: 1, mtimeMs: 1 };
    expect(summarize(file, info, 3)).toMatchObject({ model: 'claude-opus-5-5', effort: 'xhigh' });
  });
});

describe('contexto', () => {
  it('suma entrada, caché creada y caché leída de la última respuesta', () => {
    const info = emptyInfo();
    applyLine(info, line({ type: 'assistant', message: { usage: { input_tokens: 2, cache_creation_input_tokens: 345, cache_read_input_tokens: 584274, output_tokens: 319 }, content: [{ type: 'text', text: 'a' }] } }));
    expect(info.contextTokens).toBe(584621);
  });
});

describe('base fija', () => {
  it('toma el contexto del primer turno como base y el último como actual', () => {
    const info = emptyInfo();
    const turn = (read: number) => line({ type: 'assistant', message: { usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: read }, content: [{ type: 'text', text: 'x' }] } });
    applyLine(info, turn(30000));
    applyLine(info, turn(120000));
    expect(info.baseTokens).toBe(30001);
    expect(info.contextTokens).toBe(120001);
  });
});
