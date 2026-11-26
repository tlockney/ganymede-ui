## 2026-11-26, Settings reads a server's answer as the remote it was started for (#854)

Settings › "Where Kernels Run" shows "B isn't answering: …" under the
picker, and Settings › Installed labels a remote's kernels "Python 3 · B",
from the in-app server's `/api/kernelspecs` `gateway` object (#832). Both
named the answer after the remote chosen now, `kernelRemoteID`, which
changes as soon as a switch is asked for. After a switch from A to B while
A's start was still queued, A's start brought A's server up again, and its
answer read as B's until B's start ran.

The fix keys the answer to the server, not to the choice.
`AppModel.servedKernels` (a `ServedKernels`, in `Remote.swift`) holds the
remote the running server was started for. Each start takes a ticket when
it is asked for (the remote's id, its server URL, and a count of edits to
its URL or token), commits it when its server listens, and the ticket is
cleared wherever `servedRoot` is. The URL and the count are there because
editing a remote's URL or token restarts the server too, and a start with
the old values can still be queued.
`Remote.notAnswering(in:chosen:served:)` and
`Remote.kernelsLabel(in:chosen:served:)` use the app's name for the remote
only when the running server is the chosen remote's as it is now. Otherwise
Where Kernels Run shows no line, and Installed uses the server's own name
for its remote. Installed's "No kernels listed yet." and its second fetch
for a gateway's late list also follow the running server's remote, not the
chosen one.

An earlier draft matched the answer's `gateway.name` against the chosen
remote's URL host. It was dropped because two remotes on one host can't be
told apart that way, and the server's host form (IPv6 compression, IPv4
shorthand) differs from Foundation's.

`KernelSpecsTests` runs the tickets through the queued switch and through
an edited URL. The SwiftUI views and `AppModel` aren't in the test target;
the switch is a by-hand check on #399.
