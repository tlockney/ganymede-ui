## 2026-11-26, icon palette tokens (#845)

Thomas found the UI bland: system blue and grey say nothing about what
Ganymede is. This is the first step of #844, bringing the app icon's
palette — the navy sky, the cream moon, its orange orbit — into the
tokens and the rules that read them. No layout, spacing or new
components.

- `src/styles/app.css` (`:root` and its dark block). `--accent` is the
  icon's orange (`#b86a00` light, `#f9a03f` dark), for icons and
  indicators only, where 3:1 is enough. `--accent-fill` is the orange
  under the new `--on-accent` (`#2a1600`), which replaces white text on
  every filled rule: the primary button, the Run button, notice actions
  and their picker, highlighted menu and palette rows, the keyboard
  bar's primary key and the journal's follow button. White on `#f9a03f`
  is 2.07:1; `--on-accent` on it is 8.35:1. The palette's shortcut keys,
  white at 80%, dim `--on-accent` the same way. `--accent-text` is the
  orange for text. Surfaces take the cream and the navy (`--window-bg`,
  `--sidebar-*`, `--toolbar-bg`, `--sheet-bg`), the body's two gradients
  are navy and orange, and `--brand-*` name the icon's four colors for
  later steps. `--ready` (`#3d6fd6` light, `#8fb3ff` dark) is the
  sidebar's idle dot, which was green — green stays the journal's
  executed-cell dot — and the journal's note dot, which sat so close to
  the recorded cell's `--orange` that it stopped reading as its own
  color.
- `--accent-text` light is `#924900` rather than `#9a4d00`: at the insert
  row's quiet 0.85 opacity, `#9a4d00` reads 4.31:1 on the page, and this
  is the least darkening that passes (4.58:1). `--accent` light is
  `#b86a00`, not `#e8890f`: it draws focus rings, the drop line, the
  active-cell bar and the sidebar's source tint, which need 3:1 as
  non-text indicators, and `#e8890f` read 2.49:1 on the page and 2.11:1
  on the sidebar, against `#b86a00`'s 3.92:1 and 3.31:1. Fills keep the
  bright `--accent-fill`: no rule puts text directly on `--accent`, and
  the ones whose fill is a parent's — the Run button and its menu on
  `.run-group`, the palette's shortcut keys on an active row — keep
  `--on-accent`. `--text-2` on the new sidebar reads 4.22:1 (4.34:1 on
  the old one): it did not pass there before either, and no test covers
  it. `--separator` and `--hover` are unchanged.
- `src/styles/jupyter.css`: `.notebook-page`'s cells are white cards on
  the cream page in light and `#232842` on the navy in dark, with borders
  tinted navy or white to match.
- `src/styles/contrast.test.ts` collects the filled rules by
  `var(--on-accent)` on a `var(--accent…)` background and checks the pair
  at 4.5:1 in both themes, as it checked white before, and a test fails
  any rule that still puts `#fff`, `#ffffff` or `white` text on one. That
  filter only sees a rule's own background, so a named list of
  [child, parent] pairs covers the fills a parent draws, with the child's
  `opacity` blended over the fill. `--accent` itself is checked at 3:1 on
  `--window-bg` and `--sidebar-solid`, as an indicator.
- `index.html` and `vite.config.ts`: the `theme-color` metas and the PWA
  manifest's `background_color` and `theme_color` take the window's
  colors (`#fbf9f5` light, `#181c2f` dark; the manifest has no dark pair).
- `apple/`: an `AccentColor` colorset in the Mac and iOS asset catalogs
  (`#A85F00` in both appearances), and
  `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: AccentColor` on both
  app targets, so the native controls follow the page. It is the darker
  orange in both appearances, so the system's white text on its own accent
  fills reads 4.88:1, at the cost of a dimmer tint on the dark window
  (3.45:1, enough for icons and indicators). A system-wide
  accent reaches the app only when the user's accent is Multicolor, the
  default: any other choice keeps the user's color.
  `AccentFill` (`#F9A03F`) and `OnAccent` (`#2A1600`) fill the Running
  count badge, which had white on `Color.accentColor` at 2:1, and
  `Ready` (`#3D6FD6` light, `#8FB3FF` dark) is the native kernel and
  connection dots, which were `Color.green` while the page's is blue.

Review of #847: the system draws its own fills in `AccentColor` (the
focused sidebar selection, an alert's default button) with white text
on top, so `AccentColor` stays `#A85F00` in dark mode too: white on it
is 4.88:1, and as a tint it is 3.45:1 on the navy window. `AccentFill`
keeps the bright orange for the badges the app draws itself. Machine
reachability dots use `Ready` for reachable and stay red for offline.
