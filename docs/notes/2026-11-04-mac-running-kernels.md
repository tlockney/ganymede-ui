## 2026-11-04, Running kernels in the Mac app's sidebar (#225)

With `chrome=native` the page's sidebar, which held the only Running list
and Shut Down button, is hidden. Kernels outlive their notebook (closing
it, opening another, a rename that reopens it), so on the Mac they piled
up until the app quit.

- `PageState.running` lists the backend's sessions: id, path, the
  kernel's display name and its last reported `execution_state`.
  `runningSessions` builds it from `sessions.running()`; the page posts
  again on `runningChanged`. The state is what the server last listed,
  not live: the open notebook's own status stays in `status`.
- Two page commands: `shutdown-kernel` (a session id, or a notebook path
  as `open` takes it) and `shutdown-others` (all but the open notebook's).
- The Mac sidebar has a Running section (open, or Shut Down Kernel from
  its context menu), a dot on notebook rows whose kernel runs, and Kernel
  › Shut Down Other Kernels.
- Sessions are the server's, so every window lists the same ones, including
  other windows' notebooks. Shutting one down from here is the same as the
  page sidebar's Shut Down.
- Swift decodes `running` as optional, so a page from before this change
  still decodes.
