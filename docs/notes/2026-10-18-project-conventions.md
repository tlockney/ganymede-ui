## 2026-10-18, project conventions (#3)

First step of making ganymede-ui a full project
([#2](https://github.com/tlockney/ganymede-ui/issues/2)), carrying over
tlockney/ganymede's conventions. Every pull request links an issue, which
`pr-issue.yml` checks. The dev log is one file per pull request in this
folder, as in ganymede, so parallel pull requests don't conflict on one
file; the old `notes.md` is [archive.md](archive.md).

ganymede renders its log with a VitePress plugin that also rejects
misnamed files. This repository has no docs site, so
`scripts/check-notes.mjs` does the check and runs as part of
`npm run check`, which CI already runs; no workflow change was needed for
it.

Dependabot groups npm and Actions updates weekly, matching ganymede.
