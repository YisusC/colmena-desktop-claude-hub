import path from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What deleting a session sends to the Recycle Bin: its transcript, only when it sits directly inside a
 * project folder of `projectsDir` and is named after the session, plus the folder of the same name next
 * to it (subagents, tool results). `null` for anything else.
 */
export function trashTargets(projectsDir: string, sessionId: string, file: string): { transcript: string; folder: string } | null {
  // The ID becomes a path segment of the folder: anything but a UUID (say, "..") could point elsewhere.
  if (!UUID.test(sessionId)) return null;
  const transcript = path.resolve(file);
  const rel = path.relative(path.resolve(projectsDir), transcript);
  if (!rel || path.isAbsolute(rel)) return null;
  const parts = rel.split(/[\\/]/);
  if (parts.length !== 2 || parts[0] === '..' || parts[1] !== `${sessionId}.jsonl`) return null;
  return { transcript, folder: path.join(path.dirname(transcript), sessionId) };
}
