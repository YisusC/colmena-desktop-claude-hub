import { describe, expect, it } from 'vitest';
import { fold, parseQuery } from '@shared/search';
import { searchSessions, type SearchableSession } from './content-search';

const session = (sessionId: string, ...texts: string[]): SearchableSession => ({
  sessionId,
  messages: texts.map((text, i) => ({ role: i % 2 ? 'assistant' : 'user', ts: '', text, norm: fold(text) })),
});

describe('fold', () => {
  it('quita tildes y pasa a minúsculas sin cambiar la longitud', () => {
    const s = 'Instalación ÑANDÚ 🚀 İ';
    expect(fold(s)).toHaveLength(s.length);
    expect(fold('Instalación ÑANDÚ')).toBe('instalacion nandu');
  });
});

describe('parseQuery', () => {
  it('entiende frases, exclusiones y filtros', () => {
    expect(parseQuery('oauth "token refresh" -docker #seguridad g:Pagos p:billing')).toEqual({
      needles: ['oauth', 'token refresh'],
      excludes: ['docker'],
      tags: ['seguridad'],
      groups: ['pagos'],
      projects: ['billing'],
    });
  });
});

describe('searchSessions', () => {
  const sessions = [
    session('a', '¿qué tan seguro es OAuth?', 'OAuth renueva la sesión con el token refresh…'),
    session('b', 'Instalación de Postgres', 'Listo, quedó instalado.'),
    session('c', 'docker y oauth juntos'),
  ];

  it('encuentra sin importar tildes y ordena por relevancia', () => {
    const r = searchSessions(sessions, parseQuery('oauth'));
    expect(r.hits.map((h) => h.sessionId)).toEqual(['a', 'c']);
    expect(searchSessions(sessions, parseQuery('instalacion')).hits[0]?.sessionId).toBe('b');
  });

  it('marca como excluidas las sesiones con términos negados', () => {
    const r = searchSessions(sessions, parseQuery('oauth -docker'));
    expect(r.hits.find((h) => h.sessionId === 'c')?.excluded).toBe(true);
    expect(r.hits.find((h) => h.sessionId === 'a')?.excluded).toBe(false);
  });

  it('devuelve fragmentos con rangos que apuntan al texto original', () => {
    const hit = searchSessions(sessions, parseQuery('instalacion')).hits[0]!;
    const sn = hit.snippets[0]!;
    const [a, b] = sn.ranges[0]!;
    expect(sn.text.slice(a, b)).toBe('Instalación');
  });
});
