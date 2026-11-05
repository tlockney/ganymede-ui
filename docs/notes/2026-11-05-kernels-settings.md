## 2026-11-05, Mac Settings › Kernels (#206)

#206 asked for one Settings window with General, Remotes, Kernels,
Agent and Shortcuts tabs. Kernels was the one still missing.

- The Kernels tab shows where kernels run (this Mac, or the remote picked
  in Remotes) and lists the kernelspecs installed there, marking the
  default.
- The list comes from the app's own server's `GET /api/kernelspecs`, sent
  with the server's token. When kernels run on a remote, the app's server
  forwards to it (`gateway_url`), so the same request lists the remote's
  kernels.
- It is read again when the server restarts (`model.url` changes), as it
  does when kernels move.
- The picker stays in Remotes, because the iPad's Settings shares that
  view. Kernels names the choice and points to Remotes.
- `KernelSpecs(json:)` parses the response, and has tests.
- Still open in #206: the customizable toolbar. It was left out because
  `.toolbar(id:)` crashed AppKit on Finder opens (#226).

Review follow-up:

- The tab now reloads on `serverURL` together with `model.error`, not on
  `url`. `start()` clears `serverURL` at once, so the reload doesn't ask a
  server that is being stopped, and a failed start shows its message.
- With kernels on a remote, an empty list reads "No kernels listed yet"
  and is read once more after 5 s. The gateway's kernelspec cache stays
  empty until it first reaches the remote.
