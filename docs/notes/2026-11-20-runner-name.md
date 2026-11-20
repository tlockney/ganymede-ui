## 2026-11-20, name the runner when Shortcuts run cells (#719)

ganymede#908 (#896) lets `POST /api/kernels/{id}/execute` take an optional
string `by`, shown in the room as `execution_by` while cells run (a tailnet
login wins over it, else `by`, else "an API client"). Servers without it
ignore the unknown field, so the apps stay compatible with v0.14.0.

- `NotebookActions.execute` now sends `"by": "Ganymede"` (the constant
  `NotebookActions.runnerName`), so Shortcuts, App Intents and URL-scheme
  runs show "Ganymede" instead of "an API client".
- `NotebookActionsTests` asserts the field in the execute request body.
- `docs/apps.md` (Shortcuts) says so, with the Unreleased note: it needs a
  server built from ganymede's `main`.
- nb-cli's remote mode also sends no `by`. That is upstream
  (nteract/nb-cli), so it is left on #719 for a person to report.

Checks: `npm run check`, `npm test`, `npm run build`. CI builds the Swift.
