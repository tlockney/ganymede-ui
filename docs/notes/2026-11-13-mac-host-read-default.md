## 2026-11-13, Mac host read default (#585)

From the 2026-11-13 security read (ganymede#746, finding 5). The Mac
app's server root is `/`, and the server's default `[host] read` is the
root, so every notebook's code could read every notebook on the disk.
The default was chosen on the premise that the apps' root is their own
documents, which holds on iOS only.

- The Mac app passes `[host] read` as the folders under Settings ›
  General › Spotlight, as API paths (`HostDefaults`). With none, a
  notebook reads only itself. A notebook's own grant still replaces the
  default.
- Adding or removing a folder restarts the server, as an MCP change
  does, since the server reads `[host]` at start.
- The folder list now shows with Spotlight off too: it is also the
  default read grant.
