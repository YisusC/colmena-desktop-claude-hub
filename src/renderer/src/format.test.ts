import { describe, expect, it } from 'vitest';
import { modelLabel } from './format';

describe('modelLabel', () => {
  it('nombra los modelos como los muestra Claude Code', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5');
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5');
    expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1');
    expect(modelLabel('opus')).toBe('Opus');
    expect(modelLabel(null)).toBe('');
  });
});
