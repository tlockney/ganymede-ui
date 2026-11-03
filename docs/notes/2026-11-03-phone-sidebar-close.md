## 2026-11-03, Closing the sidebar on a phone (#197)

Under 720px the sidebar floats over the notebook (`position: fixed`,
z-index 20) and covered the toolbar's toggle, so on an iPhone it could be
opened but not closed.

- `useNarrow()` follows `matchMedia('(max-width: 720px)')` live, since an
  iPad split view can cross it. It replaces the one-off
  `window.innerWidth > 720` check for the starting state.
- While the sidebar floats, it gets its own Hide Sidebar button where the
  toolbar's toggle sits, a scrim over the notebook that closes it on a
  tap, and Esc. Opening a notebook or file, or New Notebook, closes it:
  on a phone the sidebar is a picker, not a pane.
- `.sidebar-collapsed .toolbar` kept 80px of left padding for the Mac
  traffic lights on phones too, because it outranks the narrow rule's
  `.toolbar`. The narrow rule now names both.
- The narrow breakpoint is now `max-width: 719.98px`, in app.css and
  `NARROW_QUERY`: the Mac window's minimum width is 720px, and at
  exactly 720 the narrow rule dropped the traffic lights' toolbar padding.
- Esc leaves the sidebar alone while a sheet is up (the Connect sheet has
  no Esc of its own), and New Notebook closes the sidebar only once the
  notebook exists, so a failure doesn't hide it.
