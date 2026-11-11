## 2026-11-11, choose a remote from the window (#473)

A remote saved in Settings › Remotes showed nowhere in the notebook
window: the only ways to use it were Settings › Kernels and the terminal
panel's + menu, and the sidebar's foot said "Ganymede" (the page's backend
label) wherever kernels ran. The foot now names the location itself
("This Mac" or the remote's title, from `KernelLocations`) and is a menu:
run kernels on this Mac or a remote with a server, open a terminal on a
remote in the window's panel, manage remotes. The kernel popover in the
toolbar and the Kernel menu carry the same picker
(`KernelLocationPicker`), as does the iPad and iPhone ⋯ menu once a
remote has a server, and the remote editor has "Run kernels on this
remote".

The choice stays app-wide (one server, one `gateway_url`), so switching
still restarts the server and shuts down every kernel. Settings never
asked first; a menu item is easier to hit by accident, so the Mac asks
while kernels run. iOS doesn't ask, as its Settings picker doesn't.

`KernelLocations` is plain Foundation so the tests cover the list:
this device first, then only remotes with a server, and a chosen id that
isn't one of those reads as this device. Browsing a remote's notebooks,
quick connect and tailnet discovery are ideas in #474 (`later`).
