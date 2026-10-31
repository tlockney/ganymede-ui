# Contributing

Work is tracked in [GitHub issues](https://github.com/tlockney/ganymede-ui/issues).
Each change is a pull request that links the issue it resolves
(`Closes #N`), passes CI, and adds a short dev-log entry under
`docs/notes/`, as [docs/notes.md](docs/notes.md) describes.

You need Node.js 22.12 or later (`engines` in `package.json`); CI uses
Node 24, and the Apple app's build needs 24.

```sh
npm install
npm run dev     # the app, proxying /api to GANYMEDE_URL (README.md, Run)
npm run check   # type-check, check the dev log, lint, check formatting
npm run format  # format with Prettier
npm test        # unit tests: the app's and the client package's
npm run build   # production build
```

`npm run check` type-checks the app, its tests and the end-to-end tests,
checks the dev log, and runs ESLint and Prettier's check
(`npm run lint`, `npm run format:check`; `npm run format` rewrites).
`npm test` runs the app's unit tests (Vitest, jsdom, next to the code as
`*.test.ts(x)`) and the client package's tests; `npm run test:coverage`
prints a coverage summary. One of them checks that
[docs/shortcuts.md](docs/shortcuts.md) matches `src/lib/shortcuts.ts`;
`UPDATE_DOCS=1 npx vitest run shortcuts-doc` rewrites its tables.

`npm run build && npm run e2e` runs the Playwright suite in `e2e/`
against a real `ganymede serve` it starts on a copy of
`e2e/fixtures/Galilean moons.ipynb`. It needs `ganymede` on `PATH` (or
`GANYMEDE_BIN`) and cdp-kernel's `cdp-node` kernelspec, and no Python.
It also writes light and dark screenshots to `test-results/screenshots/`,
the source of the images in `screenshots/`. CI runs all of the above.
`node scripts/render-icons.mjs` regenerates the PNG icons from
`public/icons/icon.svg`.

Releases are cut with `scripts/release.sh <patch|minor|major|X.Y.Z>`, a
dry run by default; `--execute` opens the release pull request. Merging it
tags `vX.Y.Z` and publishes the built app (`ganymede-ui-X.Y.Z.tar.gz` and
`.zip`, a static site) to GitHub Releases. See
[docs/releasing.md](docs/releasing.md) and [CHANGELOG.md](CHANGELOG.md).

No pull request merges without an independent review and a passing
`review-gate` check; [CLAUDE.md](CLAUDE.md#review-gate) has the rules,
including those for `spike` PRs.

[docs/architecture.md](docs/architecture.md) describes how the app is put
together; the Ganymede site renders `docs/*.md` (all but `notes.md`) under
[ganymede-server.com/docs/ganymede-ui](https://ganymede-server.com/docs/ganymede-ui/).

The app is a client of Ganymede's REST and websocket API, which matches
`jupyter_server`. Changes the app needs from the server go to
[tlockney/ganymede](https://github.com/tlockney/ganymede) as issues there.

## What's next

Besides the README's known gaps: file operations (rename, delete,
upload), a command palette and menus, and cdp-kernel running natively
inside the iPad app instead of in its web view.

Report security problems privately, as [SECURITY.md](SECURITY.md) says,
not in a public issue.
