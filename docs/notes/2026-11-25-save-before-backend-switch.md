## 2026-11-25, Save before switching backends (#792)

The architecture review found that switching backends in the browser
could lose the open notebook's last edits: the connect effect closed the
notebook, whose teardown started a save through the old backend's
contents manager, and the old `ServiceManager` was disposed as soon as
the new backend connected, whether or not that save was done. A save
that failed had nowhere to show, since the next pane is on another
backend.

- The connect sheet saves the open notebook (the controller's `save`)
  before it connects, and shows "Saving…" meanwhile. A failed save (the
  pane's notice says why) stops the switch, and the sheet asks: Keep
  Editing, Download a Copy (the controller's `download`, edits
  included), or Switch Without Saving (the controller's `discard`, so
  the teardown doesn't save either). Cancel during the save drops the
  switch; a counter (`switchTry`) makes a save that ends after it stale.
- The old backend is disposed from an effect on `backend`, once
  `pendingHandoffs()` settle, instead of in the `setBackend` updater.
  The cleanup runs after the commit that showed the new backend, after
  the closed panes handed off their saves; it skips unmount and
  StrictMode's second run, where the backend is still the current one.
- Tests: `App.test.tsx` (saves first, connects at once when clean, a
  failed save blocks with the choice, each choice, cancel mid-save,
  dispose after the handed-off save; five of the six fail on `main`),
  `ConnectSheet.test.tsx` (the choice and Saving…, and Enter doesn't
  connect meanwhile), and `e2e/switch-backend.spec.ts` through the
  contents API with rooms turned away (an edit just before switching is
  on disk; a save the server fails stops the switch, Keep Editing keeps
  the edit, and the next switch saves it). The second fails on `main`;
  the first passes there too, as the teardown save beats the dispose
  over loopback, and so does a run in a room, which holds the edit live.

Not in this change, from the issue: the iPad and iPhone place switch,
WebKit process replacement and backgrounding (Swift, `ContentView`
`switchPlace` and `WebView`), the local recovery copy, and the document
states (Saved, Saving, Offline edits, Save needs attention, Save
unconfirmed), whose placement waits on the notebook header redesign.
