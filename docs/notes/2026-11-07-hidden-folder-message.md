## 2026-11-07, say a notebook in a hidden folder can't open (#337)

Opening `~/x/.work/nb/Orbits.ipynb` in the Mac app said "no such file or
directory". The app's server is rooted at `/`, so `.work` is a hidden
folder under the root. Since ganymede #445, Ganymede's server answers an
existing hidden path with "hidden path: …", but a `jupyter_server`
answers 404 for anything hidden, with the same message as a missing file.
The server has no `allow_hidden` setting, and `jupyter_server`'s would
also list hidden files, which the issue rules out.

So the notebook pane explains it: when opening fails with "not found"
(`notFound`) and a part of the path starts with `.` (`hiddenPart`), the
message names the hidden folder (or file). #390 changed this to keep the
server's message and add the hidden part as a possible reason. Listings are unchanged.
Opening such a file for real would need the server to allow hidden paths
that are named explicitly but not listed.
