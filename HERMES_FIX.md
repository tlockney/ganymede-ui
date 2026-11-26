# Fix round for #845 (branch claude/project-thread-lsz12d)

A review found the problems below. Fix all of them, in this branch, as one commit
"Address review of the icon palette (#845)". Do not push. Delete this file in the same commit.
Run `npm run check` and `npx vitest run src/styles/contrast.test.ts` and make both pass.

1. Light `--accent` is too light (2.49:1 on --window-bg, 2.11:1 on --sidebar-solid). It draws
   focus rings, the active-cell bar, the drop line and the sidebar source tint.
   - In `src/styles/app.css` light theme set `--accent: #b86a00` (3.92:1 on #fbf9f5, 3.31:1 on #ece6da).
     Leave `--accent-fill` (#f9a03f) and `--on-accent` (#2a1600) as they are: fills keep the bright orange.
   - Check every rule that used `var(--accent)` as a *background* with `var(--on-accent)` text: if any
     now uses `--accent` as a fill, switch it to `--accent-fill` (dark text on #b86a00 is only 4.2:1).
   - In `contrast.test.ts` add a test: light and dark `--accent` against `--window-bg` and `--sidebar-solid`
     at >= 3:1 (non-text indicator).
2. The "no white text on an accent fill" test misses rules whose fill is on a parent.
   In `contrast.test.ts` add a list of [child, parent] pairs, at least
   `['.run-button', '.run-group']`, `['.run-menu-button', '.run-group']` and
   `['.palette-item.active .palette-keys', '.palette-item.active']`. For each pair, read the child's
   `color` (apply its `opacity` if set, blended over the parent fill) and the parent's background, check
   >= 4.5:1 in both themes, and include the children in the no-white check. Prove it: temporarily set
   `.run-button` color to #fff and confirm the test fails, then restore.
3. Native apps put white text on `Color.accentColor` (now orange, ~2:1).
   - Add colorsets `AccentFill` (#F9A03F, any and dark) and `OnAccent` (#2A1600, any and dark) to both
     asset catalogs next to `AccentColor` (same folder layout and Contents.json format).
   - Set `AccentColor` light (any) to #A85F00 so tinted text passes 4.5:1 on white (4.88:1); keep dark #F9A03F.
     Update the matching line in the dev log.
   - `apple/Sources/Ganymede/IPadChrome.swift` ~258-259 and `apple/Sources/Ganymede/NavigatorSidebar.swift`
     ~65-66: the Running count badge fills `Capsule()` with `Color("AccentFill")` and uses
     `.foregroundStyle(Color("OnAccent"))` instead of accentColor + white. Search `apple/Sources` for any
     other `.white` on `Color.accentColor` / `.tint` fill and fix it the same way.
4. Journal dots: `.journal-note .journal-dot` (app.css ~2554) uses `--accent`, which is now nearly the same
   as `--orange` used by `.journal-recorded`. Change the note dot to `var(--ready)`.
5. `index.html` theme-color metas (lines ~8-9) and `vite.config.ts` manifest `background_color`/`theme_color`
   (~124-125): use the new window colors, light #fbf9f5, dark #181c2f (manifest takes the light one).
6. Native kernel and connection dots are `Color.green` (`NativeChrome.swift` ~329 and ~547,
   `IPadChrome.swift` ~352 and ~948) while the page's idle dot is `--ready` blue. Add a `Ready` colorset
   (light #3D6FD6, dark #8FB3FF) and use `Color("Ready")` for idle/connected dots there. Keep any
   busy/error colors as they are.
7. Dev log `docs/notes/2026-11-26-icon-palette.md`: reword two claims. `--text-2` on the new sidebar is
   4.22:1 (was 4.34:1 before; never passed there, not tested), and the macOS global accent applies only
   when the user's system accent is Multicolor (default). Mention items 1-6 briefly.
