## 2026-11-07, save before a reload the page starts (#375)

The notebook pane's Reload button (after a stale chunk, #364) reloads the
whole page. A browser asks first through `beforeunload` when an open
notebook has edits, but WKWebView only shows that prompt through
`_webView:runBeforeUnloadConfirmPanelWithMessage:…`, which is private
API, so the Apple apps reloaded without asking.

Reload is offered by a pane that failed to open, so the edits at risk
belong to the notebook open before it: its pane is gone, and its last
save (the teardown's `handOff`) may still be running. `reloadPage` in
`lib/reload.ts` now waits for every such save (`pendingHandoffs()` in
`lib/rename.ts`), and also saves through a guard each open notebook
registers. If a save fails, or a notebook is locked or deleted on disk,
it asks with `confirm`, which the apps do show
(`runJavaScriptConfirmPanelWithMessage`), and the question starts with
why each closed notebook's save failed, since that notice would go with
the page. An open notebook's failed save leaves its notice (or the lock,
on a change on disk) on the pane, as autosave does.

In a browser, the `beforeunload` prompt still fires after a reload the
page started when a save failed and the user chose to reload anyway.
