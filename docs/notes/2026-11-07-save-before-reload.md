## 2026-11-07, save before a reload the page starts (#375)

The notebook pane's Reload button (after a stale chunk, #364) reloads the
whole page. A browser asks first through `beforeunload` when another open
notebook has edits, but WKWebView only shows that prompt through
`_webView:runBeforeUnloadConfirmPanelWithMessage:…`, which is private
API, so the Apple apps reloaded without asking and lost up to two minutes
of edits.

Instead of the prompt, `lib/reload.ts` keeps a guard per open notebook:
`reloadPage` saves each dirty one, and only if one stays unsaved (a failed
save, a notebook locked or deleted on disk) asks with `confirm`, which the
apps do show (`runJavaScriptConfirmPanelWithMessage`). Every platform gets
the same behaviour, and in a browser the `beforeunload` prompt no longer
fires after a reload the page started, since nothing is dirty by then.
