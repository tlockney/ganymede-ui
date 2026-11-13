## 2026-11-13, Run with Parameters follow-ups (#599)

Findings from the reviewer's look at #593 after it merged.

- A rename or move from the iPad sidebar (`file-moved`, then `open` of
  the moved notebook) now moves the Run with Parameters sheet and the
  remembered parameters, as the web and Mac rename already did, so a run
  keeps going. A move of a folder the notebook is in counts too.
- The remembered parameters are cleared when the page connects to
  another server: paths are the server's.
- A failed run whose answer has no `error` reads "The run failed."
- The app sends `file-moved` and `open` as separate tasks, so
  `file-moved` moves the open path too: a render between them would
  otherwise see the sheet on another path and close it. The test waits
  between the two.
