## 2026-11-11, parameters on ganymede://run and in Shortcuts (#303)

The second step of #303. Parameters reach a kernel only when it starts
(`GANYMEDE_PARAMS`, ganymede#650), so a run with them can't use the
kernel of a notebook a window has open. It goes to the server's
`POST /api/notebooks/run` (ganymede#652), which starts a fresh kernel,
runs the notebook and answers with its named results; this is why
`GANYMEDE_REF` moved. A run without parameters still runs into the
notebook's room as before, so a window sees the outputs.

Links read `p.NAME=VALUE` as `ganymede execute -p` does (JSON if it
parses, else a string) and `params=` as a whole object; parameter names
keep their case, and `p.`/`params` are matched without it. The prompt
before a run shows the parameters. Shortcuts gets a separate action, Run
Notebook with Parameters, returning the results as JSON text: its output
is named results, not cells, so it doesn't fit Run Notebook's return
type, and Shortcuts' Get Dictionary from Input reads the text.

A failed run with parameters reports the server's error string; the
named results published before the failure are dropped there, which a
caller that needs them can get from the endpoint itself.
