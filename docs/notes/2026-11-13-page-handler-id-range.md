## 2026-11-13, the kernel page's handler refuses other ranges (#573)

The bridge keeps three id spaces apart: the kernel page's (0 and up),
the remote handler's (negative, above -2^40) and engine contexts' (below
-2^40). The remote handler already refused ids and owners outside its
range (ganymede-device#107). The kernel page's handler took any number,
so script on that page could post `{ owner: -(2^40 + 1), release: true }`
and close an engine context's dialogs, sounds, handles and streams, or
use a small negative owner to reach the remote handler's.
`userContentController` now goes through `respondPage`, which answers
`failed` unless `id` and `owner` are integers from 0 to 2^40 - 1.
`respond(to:)` stays unchecked: the remote handler and engine contexts
call it with their own (negative) ids after checking them.
