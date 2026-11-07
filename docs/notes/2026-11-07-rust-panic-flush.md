## 2026-11-07, flush the Rust panic report (#318)

The hand test on the Mac sent a test error, a Swift crash and a Rust
panic from a Debug build. All three reached Sentry's `ganymede-apple`
project, but the Rust panic arrived only as its SIGABRT crash: the
"Rust panic: …" message was missing, though a run the day before sent
it. `ganymede_debug_panic` (like any panic that reaches the FFI
boundary) aborts as soon as the panic callback returns, and
`SentrySDK.capture` hands the event to a background queue, so the abort
can win. The callback now calls `SentrySDK.flush(timeout: 2)` after the
capture. A panic in a server task that doesn't abort waits up to two
seconds on that thread, only while reports are on.
