## 2026-10-20, client keeps dispatching past bad frames (#63)

`KernelConnection.handleFrame` ran in the websocket's `onmessage`, so a
frame `decodeV1` or `decodeLegacy` rejected threw there, and one throwing
message listener stopped the loop for every listener after it. Now a bad
frame is dropped, each listener call is caught, and both are reported to
`onError` listeners, or `console.warn` when there are none. Status
tracking still runs before the listeners, so `status` follows the kernel
even when a listener fails. The legacy fallback (`sendFormat = 'legacy'`)
is set only after a text frame decodes, so a stray bad text frame doesn't
switch the send format.
