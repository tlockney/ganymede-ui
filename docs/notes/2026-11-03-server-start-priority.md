## 2026-11-03, the app starts its server at Default priority (#192)

Run from Xcode, the app logged a Thread Performance Checker report: a
user-initiated thread waiting on a Default-QoS thread, with the backtrace
in `ganymede_server_start`. `AppModel.start` ran the blocking start (and
the stop of the old server) in `Task.detached(priority: .userInitiated)`,
and the server's Rust thread and tokio workers are plain threads, which
run at Default. The start now runs on a serial `DispatchQueue` at
`.default` QoS and returns through `withCheckedContinuation`.
`Task.detached(priority: .medium)` would not have been enough: the
main-actor task awaiting its `.value` escalates it to its own priority,
and the thread running it gets a QoS override to match. A continuation
doesn't escalate the queue's work.

Quitting still blocks the main thread in `ganymede_server_stop` until
the kernels are shut down. That wait is the point of the call (the
process ends right after), so it stays.

The report is easy to read as a hang, since its backtrace stops in a
channel `recv`. It is logged when the wait starts, whether or not the
wait ends. ganymede#332 also gives `ganymede_server_start` a 30-second
limit, so a start that never listens now shows "Ganymede could not
start" with the reason instead of a spinner.

The log that came with the report was from a Mac, not the iPhone it was
meant for: ViewBridge, launchservicesd and the TCC ListenEvent check are
macOS only. The `Ganymede` scheme builds only the Mac target, so Run
opens the Mac app whichever device is plugged in; `Ganymede-iOS` is the
phone and iPad scheme. The README says so now.
