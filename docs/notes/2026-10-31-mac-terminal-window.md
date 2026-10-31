## 2026-10-31, Mac terminal window (#119)

File > New Terminal (⌃⇧`) opens a window with a shell from the app's own server, and File > New Terminal on Kernel Server opens one on the server set in Settings. Both go through Jupyter's `/api/terminals`(tlockney/ganymede#237):`JupyterTerminalTransport`creates the terminal with a`POST`, connects to `/terminals/websocket/{name}`with the token in the`Authorization`header, and deletes the terminal when the window closes. The same transport works against`jupyter server`, so the Mac needs no SSH to reach a remote that runs one.

CI now builds the app against a ganymede commit on `main` (`GANYMEDE_REF`) rather than v0.4.0, since no release has terminals yet. Move it back to a tag once one does.

Notes:

- A window keeps the terminal it opened. If the app's server restarts (another folder, the kernel server changed), the session ends and the window says so instead of silently attaching to a new shell.
- The size SwiftTerm reports before the websocket is open is kept and sent first, so the shell starts at the window's size.
- The tests run a real shell through the in-process server (`terminal_shell = ["/bin/sh"]`), and only on macOS: the iOS server has no terminals.
