## 2026-11-11, notebooks in document rooms (#183)

The notebook pane joins the server's document room on a Ganymede server,
so a Claude session's edits (journal plugin, `ganymede mcp`, nb-cli) show
up as they happen instead of locking the notebook. Thomas hit the lock
every few seconds while Claude journaled; the quiet reload (#508) was the
stopgap.

The pane can't use `@jupyter/docprovider`: that is a JupyterLab plugin
package wired to the document manager, which the pane doesn't have. It
uses `y-websocket`'s `WebsocketProvider` directly (MIT; its own deps,
`lib0` and `y-protocols`, were already in the tree through
`@jupyter/ydoc`), with a handler for `jupyter-collaboration`'s raw
message type 2 for `save` and its answer. `NotebookModel` takes the
room's `YNotebook` as its shared model, so nothing else in the pane
changes: cells, outputs from this page's kernel, metadata and the dirty
flag all go through the shared document.

`RoomSaver` keeps `NotebookSaver`'s calls so the pane's save, rename and
teardown paths stay as they are; `live` tells the pane to skip the disk
check and the 120-second autosave. A server without rooms answers the
session request with an error, and the pane goes on with the contents
API, as it does for the browser backend.

Two server behaviours mattered. The room's websocket takes the token in
the query, like kernel sockets. After a server restart, the old session
id is refused with a 1003 close whose reason says `unknown_session`;
y-websocket would retry it forever. Reconnecting with a new session id
would not do either: the restarted server rebuilt the room from the file,
and this page's document can't merge into it (the same item ids with
other content). So the room stops and the pane opens the notebook again,
saying so if it had unsaved edits.

Trust took the most care. Setting `cell.trusted` as JupyterLab does is a
shared edit in a room (it writes `metadata.trusted` and rewrites the
outputs), which marked a freshly opened signed notebook edited for every
client and had the server save it again. `trustHere` sets trust with the
cell's own listeners off instead, so it stays in this page; a unit test
checks no update reaches the document, since this leans on
`CodeCellModel` internals. And because trust set here outlives the
outputs it was for, outputs another client writes into a cell
(`watchRemoteOutputs`) take its trust away until the server's file says
otherwise.

The e2e tests that checked the lock against `ganymede serve` now check
the live path instead: a change on disk merges into a notebook with
unsaved edits here, and a save through the contents API shows up without
a notice. The lock is still covered by the pane's unit tests.
