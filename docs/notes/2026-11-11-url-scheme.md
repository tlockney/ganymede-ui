## 2026-11-11, ganymede:// links (#303)

The Mac app registers the `ganymede` scheme and takes the Get URL Apple
Event itself, installed beside the Open Documents handler in
`applicationWillFinishLaunching`, so a link that launches the app is not
lost to SwiftUI's own handler (the problem #228 had with files). `AppURL`
parses a link into a command and its x-callback answers; it is plain
Foundation so the tests cover every route and bad link. `AppURLHandler`
does the command with the Shortcuts action layer (`NotebookActions`, #302),
so links, Shortcuts and agents share one set of operations and runs go
into the notebook's room.

`run` asks before it first runs a notebook, since any page can open a
link; "Always allow" is kept per file path (symlinks resolved) in user
defaults, listed in Settings › General with Revoke. The review found that
an allowance by path alone let any page run an allowed notebook and read
its output at an `https://` x-success, so a run with a reply is allowed
per destination (scheme and host of x-success and x-error), and the
prompt names it. A plain `run` opens
the notebook so its window shows the outputs, since nothing else would;
an x-callback `run` answers the caller instead and opens nothing.

Parameters (`p.NAME=VALUE`, `params=`) are refused for now with an error.
They are set when a kernel starts (`GANYMEDE_PARAMS`, ganymede#650), so a
parameterized run needs a fresh kernel, not the open notebook's: that
comes with the server's run endpoint (ganymede#652), and its own PR here.
