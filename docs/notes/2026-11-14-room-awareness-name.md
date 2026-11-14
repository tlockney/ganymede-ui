## 2026-11-14, the person's name in room awareness (#606)

Part of ganymede#763. Ganymede's server credits each cell edit made
through a room to the name in the client's awareness state
(`user.display_name` or `user.name`), and tells an agent who changed a
cell. The apps sent no awareness state, so their edits read "by a
person". `NotebookRoom` now sets `user` (the fields JupyterLab's own
client sends: `username`, `name`, `display_name`, `initials`, `color`)
when it has a name: `RoomOptions.person`, by default
`window.ganymedeUser.name`, which the Mac app sets before the page loads
from `NSFullUserName()` (`PersonName.swift`). iPad and iPhone have no
account name to give, and a browser has none, so nothing changes there.
The name reaches the notebook's server, remote ones included, and other
clients in the room, as JupyterLab's does; apps.md says so.
