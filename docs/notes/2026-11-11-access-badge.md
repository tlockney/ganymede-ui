## 2026-11-11, Notebook Access in the toolbar (#504)

A notebook's `metadata.ganymede.host.wants` was only visible inside the
Notebook Access sheet. Now the page checks it against the notebook's
grant when the notebook opens (and again when the sheet closes):
`missingWants` takes the notebook's own keys, else the server's `[host]`
defaults, and keeps what they don't give. Read methods need a non-empty
read list, `notebooks.run` a non-empty run list, `self.*` `edit_self`.
A method the server doesn't have is left out, so a typo in `wants`
doesn't leave a button that no grant can clear.

The page shows the result as a toolbar button in the browser and posts
it to the app as `accessWanted`; the Mac and iPad toolbars show the same
button from it. The check costs one `GET /api/host/grants` per opened
notebook that has `wants`, and none for the rest.
