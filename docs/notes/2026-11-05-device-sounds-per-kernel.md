## 2026-11-05, device sounds per kernel (#309)

ganymede-device#41 made sound players and playing sounds belong to the
kernel that opened them: each `webkitHost()` handler names an owner, and
Swift closes an owner's sounds when its Worker says `hello` again (a
restart). A shutdown sends no `hello`, so `src/kernel-host.ts` now keeps
each kernel's handler and calls its `release()` once `kernel.closed`
settles. This also bumps ganymede-device to take #41, so the limit of 32
players and 32 sounds is per kernel, not shared by every kernel in the
page.
