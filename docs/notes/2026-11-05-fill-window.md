## 2026-11-05, Any area fills the Mac window (#250)

- `WindowLayout` holds which area fills the window: the notebook, the
  bottom panel or the inspector. It never changes whether the sidebar,
  panel or inspector show; the window draws from both, so restoring is
  setting it back to none, and the `@SceneStorage` layout is never
  overwritten by a fill. A fill isn't kept across launches.
- The panel and inspector headers have a fill button. View > Fill
  Window (⇧⌘↩) fills with the area that has the keyboard: the panel when
  a panel terminal is first responder, the notebook otherwise. The
  inspector rarely takes the keyboard, so it fills only from its button.
- Folded areas become strips: a leading icon column (sidebar, and the
  notebook when it is folded), a trailing one for the inspector's tabs,
  a row under a filled notebook for the terminal panel, and a row over a
  filled panel for the notebook. Each restores the layout and shows its
  area.
- The notebook's web view and the panel's terminals stay in the view
  tree throughout: a filled panel leaves the notebook a strip's height,
  and a filled inspector draws over the notebook rather than taking its
  width, so the page doesn't reflow to zero width.
- Showing or hiding the panel, inspector or sidebar any other way
  restores the layout, so the change shows.
- Esc doesn't restore, though the issue asked for it: the notebook uses
  Esc for command mode and terminals pass it to programs, so a window-wide
  Esc would take it from both.
