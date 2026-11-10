# Contributing to Colmena

Thanks for taking the time to help. Bug reports, ideas and pull requests are all welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Colmena reads people's Claude Code conversations. Changes that touch what it reads, writes or
  sends anywhere need a clear explanation in the pull request, and an update to the privacy section
  of the README.

## Setting up

You need Windows 10 or 11, Node.js 22 or later and Claude Code on `PATH`.

```powershell
npm install
npm run build
npm start          # or: npm run dev, for UI hot reload
```

## Checks

Run these before opening a pull request; CI runs the first three on Windows.

```powershell
npm run typecheck
npm test
npm run build
node scripts/smoke.mjs      # end to end, needs Claude Code installed
```

Unit tests use the synthetic transcripts in `test/fixtures/projects`. Never commit real transcripts,
screenshots of real sessions, personal paths or anything else taken from your own history. If a test
needs data, add it to the fixtures.

Some scripts in `scripts/` send one short message to Claude (their first line says so). They use a
temporary data folder and delete the sessions they create, but they do use your Claude Code account.

The UI scripts open sessions in the repository folder by default. The first time Claude Code runs in
a folder it asks whether you trust it, and scripts that type into the terminal stop at that prompt.
Run `claude` once in the repository and accept, or point `COLMENA_TEST_CWD` at a folder you already
trust.

## Code

- TypeScript in strict mode, Vue 3 single-file components, plain CSS with custom properties.
- Keep the renderer sandboxed: it never builds command lines. Main validates every IPC input and
  builds commands itself.
- Comments explain *why* when the code would surprise a reader. Do not restate what the code does.
- Keep app shortcuts on <kbd>Ctrl</kbd>+<kbd>Shift</kbd> (or <kbd>F11</kbd>) so they do not steal keys Claude Code uses.

## Pull requests

- One topic per pull request, with a short description of what changed and how you tested it.
- Add or update tests when you change behavior.
- Screenshots help a lot for interface changes. Take them with `node scripts/screenshots.mjs` or
  from the browser preview, never from your own history. If a change affects the images in `docs/`,
  retake them in the same pull request.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
