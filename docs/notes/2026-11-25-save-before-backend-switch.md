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
  pane's notice says why), or one that doesn't answer within
  `SERVER_TIMEOUT_MS` (the sheet says so, as the pane can't), stops the
  switch, and the sheet asks, with its choices and fields disabled so
  the switch goes where Connect was asked to: Keep Editing, Download a
  Copy (the controller's `download`, edits included), or Switch Without
  Saving (the controller's `discard`, so the teardown doesn't save
  either). `discard` is called on the controller the save failed on,
  whatever controller the pane has handed over since: the pane rebuilds
  it on every change of state, and its controllers share the flag
  `discard` sets. Cancel during the save drops the switch; a counter
  (`switchTry`) makes a save that ends after it stale.
- The old backend is disposed from an effect on `backend`, once
  `pendingHandoffs()` settle or `SERVER_TIMEOUT_MS` passes, instead of
  in the `setBackend` updater. The cleanup runs after the commit that
  showed the new backend, after the closed panes handed off their
  saves; it skips unmount and StrictMode's second run, where the
  backend is still the current one.
- On a phone the three choices wrap inside the sheet
  (`.sheet-unsaved .sheet-buttons`), and the fieldset that disables the
  fields draws no border (`.connect-fields`).
- Tests. `App.test.tsx`: saves first, and the sheet reopened after the
  switch connects; connects at once when clean; a failed save blocks
  with the choice; Keep Editing; Download a Copy, then Switch Without
  Saving, and the sheet reopened after asks nothing; `discard` after
  the pane rebuilt its controller; cancel mid-save, and the sheet
  reopened after; a save that times out (fake timers); a stale
  controller after a data file opened; dispose after the handed-off
  save, and after `SERVER_TIMEOUT_MS` for one that never ends; the live
  backend kept through StrictMode and unmount. `ConnectSheet.test.tsx`:
  the choice with its fields disabled, the timeout's reason, Saving…,
  and a submit ignored while asking, saving or connecting.
  `e2e/switch-backend.spec.ts`, through the contents API with rooms
  turned away: an edit just before switching is on disk; a save the
  server fails stops the switch, the choices sit inside the sheet on
  one line each at 375px with no fieldset border, Keep Editing keeps
  the edit, and the next switch saves it. Each test fails with its part
  of the change reverted (the layout check without the wrap rule or with
  a fieldset border), except "connects at once when clean", which holds
  on `main` too, and the first e2e test, which passes on `main` because
  the teardown save beats the dispose over loopback (as does a run in a
  room, which holds the edit live). The timers' `clearTimeout` and the
  disabled fields' opacity have no test.

Not in this change, from the issue, and moved to #808: the iPad and
iPhone place switch, WebKit process replacement and backgrounding
(Swift, `ContentView` `switchPlace` and `WebView`), the local recovery
copy, and the document states (Saved, Saving, Offline edits, Save needs
attention, Save unconfirmed), whose placement waits on the notebook
header redesign, and the apps' Settings › Kernels switch.
