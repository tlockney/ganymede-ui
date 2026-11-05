## 2026-11-05, Mac kernel popover (#241)

- The toolbar's kernel button opens a popover instead of a menu. It
  shows the kernel's name, state and memory, has Interrupt, Restart and
  Kernel Log (which shows the bottom panel on that tab), and a picker
  with the kernels to change to. The issue placed it on the window
  subtitle, but SwiftUI gives no way to attach a popover to the subtitle,
  and the kernel button sits right beside it.
- Memory comes from the page, as for the Running list (#313). Both views
  now ask through `PageModel.watchMemory`, which counts watchers
  (`MemoryWatch`): the page hears `watch-memory on` when the first view
  shows and `off` when the last goes, so closing the popover doesn't stop
  a Running list that still shows. A page loaded again gets `on` with
  its first commands when anyone watches.
- Still open on #241: the "kernel died" notice naming out-of-memory
  (#213).
