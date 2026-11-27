# Fix brief: reviewer round 1 on PR #874 (#868)

Branch `claude/project-thread-fneunc` (head 1fb1d92 + this file). Fix
the three items, delete this file in your commit, commit once, do not
push. Cite `(#868)` in comments.

1. Notebook Access with the mount's 404 (docs/apps.md ~963, reviewer
   thread on PR #874): today a 404 probe makes `hostGrants` false, which
   disables every way into the sheet, so the person never sees why.
   Change it: in a machine's window, Notebook Access is dimmed only
   while the probe is pending (or after a non-404 failure). When the
   probe answers the mount's 404, `hostGrants` becomes true, so the menu
   item, the iPad/iPhone item and the palette entry open the sheet, and
   the sheet shows `answer()`'s machine message ("Notebook access on a
   connected machine needs a newer version of this app."). The padlock
   stays quiet on 404 as now. Make sure the sheet's load path shows that
   error (it calls `loadHostGrants`). Update the App tests: 404 →
   `hostGrants` true and opening the sheet shows the machine message;
   pending → false; success → true. Fix docs/apps.md and the dev log to
   say exactly this (no "if it is opened").
2. Palette test (src/App.tsx ~1399, the palette context's `hostGrants`):
   add an App test that opens the command palette in a `?machine=…`
   window with the probe pending and expects the Notebook Access entry
   disabled, then enabled after the probe resolves. Confirm it fails
   when that line is reverted to `hostGrants: hostGrantsAvailable(backend)`.
3. Dev log docs/notes/2026-11-26-machine-access-links.md ~40: drop
   "`createWebViewWith` is unchanged". Say that `createWebViewWith`
   (⌘-click, `target=_blank`, `window.open`) also routes a machine's
   app link through `machineLink`, gated by WebKit's user-gesture rule
   (`javaScriptCanOpenWindowsAutomatically` is false by default) rather
   than `linkActivated`.
4. Edit the #399 comment (issuecomment-7206047571) and #273
   (issuecomment-7206048014) via `gh api -X PATCH
   repos/tlockney/ganymede-ui/issues/comments/<id> -f body=...`, keeping
   the footer: with the current bundled server, Notebook Access in a
   machine's window opens and says the app needs a newer version (no
   padlock error); it is dimmed only briefly while the app checks.

Checks: `npm run check`, `npx vitest run`. No Swift changes are
expected; if you change Swift, also run the macOS unit tests and an
iOS build. Report counts.
