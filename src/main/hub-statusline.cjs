// Wrapper status line: saves context usage and runs the user's own status line with the same input.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(raw);
    const dir = process.env.COLMENA_CTX_DIR;
    const id = String(j.session_id || '').replace(/[^\w-]/g, '');
    if (dir && id) {
      const cw = j.context_window || {};
      const num = (v) => (typeof v === 'number' ? v : null);
      const cu = cw.current_usage || null;
      const out = {
        sessionId: id,
        usedPercentage: num(cw.used_percentage),
        contextWindowSize: num(cw.context_window_size),
        model: (j.model && (j.model.id || j.model.display_name)) || null,
        currentUsage: cu
          ? {
              input: num(cu.input_tokens) ?? 0,
              cacheCreation: num(cu.cache_creation_input_tokens) ?? 0,
              cacheRead: num(cu.cache_read_input_tokens) ?? 0,
              output: num(cu.output_tokens) ?? 0,
            }
          : null,
        totalInputTokens: num(cw.total_input_tokens),
        totalOutputTokens: num(cw.total_output_tokens),
        costUsd: num(j.cost && j.cost.total_cost_usd),
        at: Date.now(),
      };
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${id}.json`);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(out));
      fs.renameSync(`${file}.tmp`, file);
      if (process.env.COLMENA_CTX_DUMP) fs.writeFileSync(path.join(dir, '_last-input.json'), raw);
    }
  } catch {
    // unexpected input: the user's status line is still shown
  }
  const cmd = process.env.COLMENA_USER_STATUSLINE;
  if (!cmd) return;
  const r = spawnSync(cmd, { input: raw, shell: true, encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (r.stdout) process.stdout.write(r.stdout);
});
