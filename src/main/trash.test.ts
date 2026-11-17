import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { trashTargets } from './trash';

const projects = path.resolve('claude-home', 'projects');
const id = 'c47e9a12-5d3b-4f8a-a1b2-0e9d8c7b6a54';
const other = '3f2b8c1e-7a4d-4e5f-9b21-6c8d0e1f2a3b';
const inProject = (...parts: string[]) => path.join(projects, 'C--work-web-dashboard', ...parts);

describe('trashTargets', () => {
  it('manda a la Papelera el transcript y la carpeta del mismo nombre que está a su lado', () => {
    expect(trashTargets(projects, id, inProject(`${id}.jsonl`))).toEqual({
      transcript: inProject(`${id}.jsonl`),
      folder: inProject(id),
    });
  });

  it('rechaza archivos que no están justo dentro de una carpeta de proyecto', () => {
    expect(trashTargets(projects, id, path.join(projects, `${id}.jsonl`))).toBeNull();
    expect(trashTargets(projects, id, path.join(path.dirname(projects), `${id}.jsonl`))).toBeNull();
    expect(trashTargets(projects, id, path.join(projects, '..', 'C--work-web-dashboard', `${id}.jsonl`))).toBeNull();
    expect(trashTargets(projects, id, inProject(id, 'subagents', `${id}.jsonl`))).toBeNull();
    expect(trashTargets(projects, id, path.resolve('otro-sitio', 'C--work', `${id}.jsonl`))).toBeNull();
  });

  it('rechaza un archivo que no es el de esa sesión', () => {
    expect(trashTargets(projects, id, inProject(`${other}.jsonl`))).toBeNull();
    expect(trashTargets(projects, id, inProject(`${id}.json`))).toBeNull();
  });

  it('rechaza IDs que no son UUID aunque el nombre del archivo coincida', () => {
    // With "..", the folder of the same name would be the projects folder itself.
    expect(trashTargets(projects, '..', inProject('...jsonl'))).toBeNull();
    expect(trashTargets(projects, 'notas', inProject('notas.jsonl'))).toBeNull();
  });
});
