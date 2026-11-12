## 2026-11-11, quiet reload of a changed notebook (#508)

While a Claude session journaled into a notebook open in the Mac app,
the Reload / Unlock notice (#367) came back every few seconds. Thomas
asked whether installing `jupyter-docprovider` and
`jupyter-collaboration-ui` with `ganymede lab extension install` would
turn Rooms on. It wouldn't: those are plugins for stock JupyterLab
(`ganymede lab`). The app uses JupyterLab's notebook widgets as a
library, with no plugin system, and loads and saves through the contents
API. The server's rooms are always there; the app's editor doesn't join
them. That is #183, which comes next.

Until then, a change on disk is taken in place when nothing here can be
lost: no unsaved edit and no code cell running. `NotebookSaver.pull`
runs in the save queue, so it can't race a save, and checks the dirty
flag before and after the fetch, so an edit typed meanwhile wins and the
pane locks as before. Loading goes through `model.fromJSON` on the
existing model rather than the Reload path, which rebuilds the notebook
and session: that would flash the pane on every agent edit. The scroll
position and active cell are put back by hand, since `fromJSON` replaces
every cell widget.

Running a cell marks the notebook dirty (outputs change), so after you
run something the next agent edit still locks until autosave (120 s) or
⌘S clears it. #183 removes that case.
