import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MetaStore } from './meta-store';

const A = 'c47e9a12-5d3b-4f8a-a1b2-0e9d8c7b6a54';
const B = '3f2b8c1e-7a4d-4e5f-9b21-6c8d0e1f2a3b';

const dirs: string[] = [];
function metaFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colmena-meta-'));
  dirs.push(dir);
  return path.join(dir, 'meta.json');
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('MetaStore.removeSession', () => {
  it('olvida la sesión borrada en memoria y en disco, sin tocar las demás ni los grupos', () => {
    const file = metaFile();
    const store = new MetaStore(file);
    store.setGroup('Pagos', { color: '#d9a441' });
    store.updateSession(A, { group: 'Pagos', tags: ['reembolsos'], note: 'revisar' });
    const kept = store.updateSession(B, { pinned: true }).sessions[B];

    const meta = store.removeSession(A);
    expect(meta.sessions).toEqual({ [B]: kept });
    expect(meta.groups).toEqual({ Pagos: { color: '#d9a441' } });
    expect(new MetaStore(file).get().sessions).toEqual({ [B]: kept });
  });

  it('si la sesión no tenía metadatos no cambia nada ni reescribe el archivo', () => {
    const file = metaFile();
    const store = new MetaStore(file);
    store.updateSession(B, { pinned: true });
    fs.rmSync(file);
    const before = store.get();
    expect(store.removeSession(A)).toBe(before);
    expect(fs.existsSync(file)).toBe(false);
  });
});
