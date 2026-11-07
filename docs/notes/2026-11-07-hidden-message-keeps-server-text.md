## 2026-11-07, keep the server's message for a hidden path (#390)

#386 replaced any "not found" under a dot-folder with "is in the hidden
folder …, and Ganymede doesn't open hidden files or folders". Ganymede's
server already tells the two cases apart (ganymede #445): "hidden path:
…" for a hidden file that exists, "no such file or directory" for one
that doesn't. So a notebook that was really gone read as hidden.

`openFailure` now shows a message that already says "hidden" as it is.
For a plain "not found" under a hidden part, which a `jupyter_server`
gives in both cases, it keeps the server's message and adds that the
server may be refusing the file because of the hidden folder.
