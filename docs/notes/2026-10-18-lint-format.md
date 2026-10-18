## 2026-10-18, lint and format (#6)

ESLint 10 (flat config, `eslint.config.js`) with typescript-eslint's
recommended rules, React's hook rules and react-refresh, and Prettier 3
(`.prettierrc.json`: single quotes, 100 columns, `x => y`). `npm run check`
now runs both, so CI checks them with the type-check.

- eslint-plugin-react-hooks 7's `recommended` set includes the React
  Compiler rules (`immutability`, `set-state-in-effect`). They flagged the
  imperative Lumino code (setting `notebook.activeCellIndex` on a widget
  held in state, resetting state when the backend changes). The app
  doesn't use the compiler, so the config turns on only `rules-of-hooks`
  and `exhaustive-deps`.
- `hasUntrustedOutputs` moved from `NotebookPane.tsx` to `src/lib/trust.ts`:
  react-refresh warns when a component file exports anything else, and
  fast refresh then reloads the page.
- The `as any` casts went: `ISignal<unknown, unknown>` in `useSignals`,
  and the widget registry's own `ExportMap` type. The controls module
  needs `as unknown as`, since it also exports `version` and `default`.
- `packages/client` used double quotes and 80 columns; one repo style now,
  so this PR reformats it. Tables in Markdown are padded too.
- The ignore lists name `.claude`: agent worktrees there hold whole
  checkouts with `node_modules`, and ESLint took minutes linting them.
