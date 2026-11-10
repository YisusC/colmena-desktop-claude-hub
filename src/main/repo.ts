// git and gh run without a shell, with fixed arguments, in the session's validated folder.
import { execFile } from 'node:child_process';
import type { PullsResult, RepoResult } from '@shared/types';

function run(cmd: string, args: string[], cwd: string, timeout = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim().split('\n')[0] ?? err.message));
      else resolve(stdout);
    });
  });
}

function githubUrl(remote: string): string | null {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/i.exec(remote.trim());
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

export async function repoInfo(cwd: string): Promise<RepoResult> {
  try {
    await run('git', ['rev-parse', '--is-inside-work-tree'], cwd);
  } catch {
    return { ok: false, error: 'Esta carpeta no es un repositorio git.' };
  }
  try {
    const [status, log, remote] = await Promise.all([
      run('git', ['status', '--porcelain=v2', '--branch'], cwd),
      run('git', ['log', '-n', '15', '--pretty=format:%h%x1f%H%x1f%s%x1f%an%x1f%aI%x1f%D'], cwd).catch(() => ''),
      run('git', ['remote', 'get-url', 'origin'], cwd).catch(() => ''),
    ]);
    let branch: string | null = null;
    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;
    let changed = 0;
    for (const line of status.split('\n')) {
      if (line.startsWith('# branch.head ')) branch = line.slice(14).trim();
      else if (line.startsWith('# branch.upstream ')) upstream = line.slice(18).trim();
      else if (line.startsWith('# branch.ab ')) {
        const m = /\+(\d+) -(\d+)/.exec(line);
        if (m) [ahead, behind] = [Number(m[1]), Number(m[2])];
      } else if (line && !line.startsWith('#')) changed++;
    }
    const web = githubUrl(remote);
    const commits = log
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash = '', full = '', subject = '', author = '', date = '', refs = ''] = l.split('\x1f');
        return { hash, subject, author, date, refs, url: web ? `${web}/commit/${full}` : null };
      });
    return { ok: true, branch: branch === '(detached)' ? null : branch, upstream, ahead, behind, changed, web, commits };
  } catch (err) {
    return { ok: false, error: `git falló: ${(err as Error).message}` };
  }
}

export async function openPulls(cwd: string): Promise<PullsResult> {
  try {
    const out = await run(
      'gh',
      ['pr', 'list', '--state', 'open', '--limit', '30', '--json', 'number,title,author,headRefName,isDraft,url,reviewDecision,updatedAt'],
      cwd,
      15000,
    );
    const raw = JSON.parse(out) as Array<{
      number: number; title: string; author?: { login?: string }; headRefName: string;
      isDraft: boolean; url: string; reviewDecision: string; updatedAt: string;
    }>;
    return {
      ok: true,
      prs: raw.map((p) => ({
        number: p.number, title: p.title, author: p.author?.login ?? '', branch: p.headRefName,
        draft: p.isDraft, url: p.url, review: p.reviewDecision || '', updatedAt: p.updatedAt,
      })),
    };
  } catch (err) {
    const msg = (err as Error).message;
    if (/ENOENT|not recognized|no se reconoce/i.test(msg)) return { ok: false, error: 'No encontré la CLI de GitHub (gh). Instálala para ver los PRs.' };
    if (/auth|login/i.test(msg)) return { ok: false, error: 'gh no tiene sesión iniciada: ejecuta «gh auth login».' };
    if (/no git remote|not a git repository|none of the git remotes/i.test(msg)) return { ok: false, error: 'Este repositorio no tiene un remoto de GitHub.' };
    return { ok: false, error: `gh falló: ${msg}` };
  }
}
