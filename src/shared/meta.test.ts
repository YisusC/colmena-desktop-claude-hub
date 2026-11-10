import { describe, expect, it } from 'vitest';
import { groupOf, isValidIcon, mergeSessionMeta, resolveMeta, sanitizeMetaPatch } from './meta';
import type { HubMeta, SessionSummary } from './types';

const s = (id: string, continuedIn: string | null = null) => ({ id, continuedIn }) as SessionSummary;

describe('resolveMeta', () => {
  it('una sesión continuada hereda grupo y etiquetas de su antecesora', () => {
    const meta: HubMeta = { version: 1, groups: {}, folders: {}, sessions: { viejo: { group: 'Pagos', tags: ['reembolsos'] } } };
    const r = resolveMeta([s('viejo', 'nuevo'), s('nuevo')], meta);
    expect(r.get('nuevo')).toEqual({ group: 'Pagos', tags: ['reembolsos'] });
  });

  it('no entra en bucle con cadenas circulares', () => {
    const meta: HubMeta = { version: 1, groups: {}, folders: {}, sessions: {} };
    expect(resolveMeta([s('a', 'b'), s('b', 'a')], meta).get('a')).toEqual({});
  });
});

describe('sanitizeMetaPatch / mergeSessionMeta', () => {
  it('recorta, deduplica etiquetas y elimina campos vacíos', () => {
    const p = sanitizeMetaPatch({ tags: ['#reembolsos', 'reembolsos', '', 'pagos'], group: '  Pagos ', evil: 1 });
    expect(p).toEqual({ tags: ['reembolsos', 'pagos'], group: 'Pagos' });
    expect(mergeSessionMeta({ group: 'Pagos', pinned: true }, { group: '', pinned: false })).toBeUndefined();
  });
});

describe('groupOf', () => {
  it('la carpeta del proyecto lleva su ícono y color; el grupo propio, los suyos', () => {
    const meta: HubMeta = {
      version: 1,
      groups: { Pagos: { color: '#d9a441', icon: 'cash' } },
      folders: { 'billing-api': { icon: 'code' } },
      sessions: {},
    };
    const s = { id: 'x', project: 'billing-api' } as SessionSummary;
    expect(groupOf(s, {}, meta)).toMatchObject({ label: 'billing-api', icon: 'code', auto: true });
    expect(groupOf(s, { group: 'Pagos' }, meta)).toMatchObject({ label: 'Pagos', icon: 'cash', color: '#d9a441', auto: false });
  });
});

describe('isValidIcon', () => {
  it('acepta íconos del set y data URLs de imagen pequeñas; rechaza lo demás', () => {
    expect(isValidIcon('truck')).toBe(true);
    expect(isValidIcon('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isValidIcon('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true);
    expect(isValidIcon('javascript:alert(1)')).toBe(false);
    expect(isValidIcon('data:text/html;base64,PGI+')).toBe(false);
    expect(isValidIcon(`data:image/png;base64,${'A'.repeat(300_000)}`)).toBe(false);
  });
});
