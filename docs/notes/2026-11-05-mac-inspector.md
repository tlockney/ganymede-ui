## 2026-11-05, Mac right inspector (#249)

- The Mac notebook window has a right inspector beside the notebook and
  its bottom panel: View > Show Inspector (⌥⌘0) or a toolbar button. A
  segmented control picks Outline or Variables. The Agent tab waits for
  the built-in agent's panel (#123). `InspectorController` holds whether
  it shows, its tab and its width, which the window keeps in
  `@SceneStorage` as the bottom panel's are. Its left edge resizes it,
  between 220 and 520 points, leaving the notebook 360.
- Outline reuses the navigator's Outline list (#212).
- Variables are read by the page, which has the kernel connection. The
  app sends `inspect-variables on` while the inspector shows the tab
  (and again when a reloaded page posts `variables: null`), and `off`
  otherwise, so nothing is read with the inspector hidden. The page runs
  the same `useVariables` hook as its own Variables view (#242) and
  posts its rows flattened, members under their object, as
  `PageState.variables`. A row's chevron sends `toggle-variable` with the
  row's path as JSON.
- The page's own Variables view stays reachable in the Mac app from the
  command palette. Sending that entry to the inspector instead needs a
  page-to-app message and is left for a follow-up.
