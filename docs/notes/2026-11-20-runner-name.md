## 2026-11-20, name the runner when Shortcuts run cells (#719)

ganymede#908 (#896) lets `POST /api/kernels/{id}/execute` take an optional
string `by`, shown in the room as `execution_by` while cells run (a tailnet
login wins over it, else `by`, else "an API client"). Servers without it
ignore the unknown field, so the apps stay compatible with v0.14.0.

- `NotebookActions.execute` now sends `"by": "Ganymede"` (the constant
  `NotebookActions.runnerName`), so the room names "Ganymede" instead of
  "an API client" as the runner of Shortcuts, App Intents and URL-scheme
  runs. Nothing in the apps shows `execution_by` yet (#702). Run Notebook
  with Parameters uses another endpoint with no room and isn't covered.
- `NotebookActionsTests` asserts the field in the execute request body.
- `docs/apps.md` (Shortcuts) says so, with the Unreleased note: it needs a
  server built from ganymede's `main`.
- nb-cli's remote mode also sends no `by`. That is upstream
  (nteract/nb-cli), so the PR uses `Refs #719` and leaves that report
  open on #719 for a person to file.

Checks: `npm run check`, `npm test`, `npm run build`. CI builds the Swift.
