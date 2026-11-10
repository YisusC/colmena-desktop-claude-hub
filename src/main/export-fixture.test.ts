// Exports the summaries to a fixture for the preview. Only runs with COLMENA_EXPORT_FIXTURE=<path>.
// Reads COLMENA_PROJECTS_DIR if set (e.g. test/fixtures/projects); otherwise ~/.claude/projects.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'vitest';
import { SessionIndex } from './session-index';

it.runIf(process.env.COLMENA_EXPORT_FIXTURE)('exporta el fixture de la vista previa', () => {
  const projectsDir = process.env.COLMENA_PROJECTS_DIR ? path.resolve(process.env.COLMENA_PROJECTS_DIR) : path.join(os.homedir(), '.claude', 'projects');
  const idx = new SessionIndex(projectsDir);
  for (const f of idx.listTranscriptFiles()) idx.update(f);
  const sessions = idx.summaries();
  const out = process.env.COLMENA_EXPORT_FIXTURE!;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ home: os.homedir(), defaultCwd: path.join(os.homedir(), 'Documents', 'GitHub'), sessions }));
  console.log(`${sessions.length} sesiones de ${projectsDir} → ${out}`);
});
