# Security policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub: open the repository's
**Security** tab and choose **Report a vulnerability**. Include what you found, how to reproduce it
and what an attacker could do with it.

You can expect an acknowledgement within a week. Fixes are released as soon as they are ready, and
reporters are credited unless they prefer otherwise.

## Scope

Colmena runs Claude Code sessions and reads local transcripts, so these areas matter most:

- the IPC between the interface and the main process (input validation, command construction);
- anything that could run commands or open files the user did not ask for;
- exposure of transcript contents, tokens or other local data;
- the settings, hook and status line Colmena passes to the sessions it starts.
