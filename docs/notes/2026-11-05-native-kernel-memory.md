## 2026-11-05, Kernel memory in the Mac Running list (#241)

- The Mac app's Running tab shows each kernel's memory beside its
  name. The page reads it, as its own sidebar does (#270): it has the
  backend's server settings, which may be a remote's, where the app only
  knows its own server. The app sends `watch-memory on` while the list
  shows (and again when a reloaded page is ready) and `off` when it goes,
  and the page runs `useKernelMemory` for it and posts each kernel's
  bytes in `RunningSession.memory`.
- Nothing is asked for a backend whose kernels all run in the page, or
  for a server without the metrics endpoint: those sessions post `null`
  and the row shows no value.
- The app formats bytes with `ByteCountFormatter`'s memory style, as
  Activity Monitor does.
- Still open on #241: the kernel popover from the window subtitle, which
  the Mac app doesn't have yet.
