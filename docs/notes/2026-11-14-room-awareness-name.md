## 2026-11-14, the person's name in room awareness (#606)

Part of ganymede#763. Ganymede's server credits each cell edit made
through a room to the name in the client's awareness state
(`user.display_name` or `user.name`), and tells an agent who changed a
cell. The apps sent no awareness state, so their edits read "by a
person". `NotebookRoom` now sets `user` (the fields JupyterLab's own
client sends: `username`, `name`, `display_name`, `initials`, `color`)
when it has a name: `RoomOptions.person`, by default `pageUserName`,
the `window.ganymedeUser.name` the Mac app sets before the page loads
from `NSFullUserName()` (`PersonName.swift`). Since the name is personal
data, it reaches only the person's own server: the script sets it only
on a page from the in-app server's exact origin, and the page
uses it only for a room on its own origin, so a remote server never gets
it, and a site the web view is redirected to can't read it. iPad and
iPhone have no account name, and a browser has none, so nothing changes
there. The README's "Where your data lives" says so, and Ganymede's
privacy page does from ganymede#786.
