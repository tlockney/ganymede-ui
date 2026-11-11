## 2026-11-11, Notebook Access sheet (#478)

The last step of Ganymede's host API plan: a sheet that sets what a
notebook's cells may ask the server for through `jupyter.host()`. It
reads and writes ganymede's `/api/host/grants/{path}` (ganymede#669),
which answers the notebook's own grant and the server's `[host]`
defaults. Each of read, edit-own-cells and run is either the default or
set for this notebook; Save sends only the keys set here, so `{}` puts
the notebook back on the defaults.

The sheet is the page's, in the browser and the apps alike: Kernel >
Notebook Access… on the Mac (beside Trust Notebook…) and the ⋯ menu on
the iPad run the page's
`notebook-access` command. Paths are one per line, with `/` for every
notebook, since the server's root is `""`.

`metadata.ganymede.host.wants` shows at the top as what the notebook asks
for. It grants nothing, the way Trust Notebook works for outputs.

The sheet loads once when it opens. The app re-renders it with new
`load` and `save` closures on every state change, and loading again
would drop the edits.
