## 2026-11-09, Start window after the last tab (#416)

#408 opened a start window whenever the app's last window closed, which
made the start window itself impossible to close, and it judged "last"
from AppKit's window list. While the app is hidden, `isVisible` is false
for every window, so a terminal tab whose shell exited then opened a
start window beside the hidden ones.

`OpenWindows` now keeps the app's notebook, text file and terminal
windows itself: each is added as it joins the tabs and removed in
`willCloseNotification`. A notebook window notes its sidebar folder and
whether it shows the start screen, so the start window opens on that
folder, and closing the start screen leaves the app with no window, as
Mac document apps allow. A quit cancelled at the save prompt opens a
start window if the prompts closed the last one.

The start window still opens by scene id, not by value as
`OpenRequests.useFallback` does: by value, SwiftUI could bring back the
window that is closing, which shows the same folder.
