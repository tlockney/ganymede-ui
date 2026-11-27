# Brief: Mac toolbar matches the Chosen mockup (ganymede-ui #892)

Read issue #892's text below, then make the change on this branch. Commit
with clear messages. Do not push.

## Hard rules
- Do NOT launch, open, quit or script any app (no `open`, no `osascript`,
  no running Ganymede.app), do not take screenshots, do not run `defaults`,
  do not change the system appearance. A Claude session does the by-hand
  checks and screenshots afterwards.
- Do not edit HERMES_BRIEF.md and do not commit it in your commits' changes
  (it is already committed; leave it).
- Build and test only with:
  `xcodebuild test -project apple/Ganymede.xcodeproj -scheme Ganymede -destination platform=macOS -skipPackagePluginValidation -onlyUsePackageVersionsFromResolvedFile CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=`
  (run `apple/scripts/bootstrap.sh` first only if `apple/Ganymede.xcodeproj` is missing; after editing `apple/project.yml`, run `cd apple && xcodegen`).
  Also `npm run check` and `npx vitest run` if you change anything under `src/`.
- Follow the repo's CLAUDE.md and CONTRIBUTING.md. Comments explain why, in
  plain sentences, citing the issue number (#892), like the code around them.

## The task (issue #892)
Step 3 follow-up of #844. Make the Mac notebook window's toolbar match the
mockup:

1. **Run.** In `RunCellMenu` (`apple/Sources/Ganymede/RunMenu.swift`, used by
   the Mac toolbar `NotebookToolbar` in `NativeChrome.swift`): visible label
   "Run" with `play.fill`; accessibility label stays "Run Cell" and help stays
   "Run the selected cell and select the next (⇧↩)". The primary segment is
   filled orange `#f9a03f` with text and icon `#2a1600` in light and dark: add
   a `RunFill` colorset (and `OnRunFill` #2a1600) under
   `apple/Resources/macOS/Assets.xcassets/` like `SidebarTint.colorset`. If
   iOS also uses `RunCellMenu`, keep iOS unchanged (gate with `#if os(macOS)`
   or a parameter). Only Run is orange; the arrow and Interrupt stay neutral.
2. **Run group.** Run, its menu arrow and Interrupt draw as ONE glass capsule
   (today `ToolbarItemGroup` draws Interrupt as a separate piece). Try a
   `ControlGroup` inside one `ToolbarItem`. Interrupt is icon-only
   (`stop.fill`, accessibility label "Interrupt"), enabled only while busy.
3. **Right group.** Share, More and Show/Hide Inspector in ONE capsule, in that
   order, trailing. The Terminal Panel toggle (`ContentView.swift` ~line 183)
   leaves the toolbar; it stays in View menu (⌃`) and add "Show Terminal Panel"
   / "Hide Terminal Panel" to the More menu (pass what it needs). Keep
   `UpdateAvailableButton` as is. The inspector button is today in
   `ContentView`'s toolbar; move it so it groups with Share and More (e.g. pass
   the inspector toggle into `NotebookToolbar`).
4. **One surface.** A notebook window's toolbar background is the page's
   window colour: light `#fbf9f5`, dark `#181c2f` (`--window-bg` in
   `src/styles/app.css`). Add a `WindowBackground` colorset and use
   `.toolbarBackground(Color("WindowBackground"), for: .windowToolbar)` +
   `.toolbarBackgroundVisibility(.visible, for: .windowToolbar)` for notebook
   windows only (`showsNotebook`); consoles, folders, machine windows keep the
   system toolbar.
5. Keep: title, kernel chip, Notebook | Journal, Trust and Access (only while
   they apply). No control may move as state changes (#812). iPad/iPhone
   unchanged.

Tests: add unit tests for anything with logic (for example a small pure
helper listing the More menu's items or the toolbar's groups per window kind,
if you extract one), in `apple/Tests/GanymedeTests`, listing any new source
file in BOTH test targets in `apple/project.yml` if the tests need it.

Docs: in `docs/apps.md`, the Mac toolbar section says what the toolbar holds
now, with this note right under that section's heading:

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

Dev log: `docs/notes/2026-11-27-mac-toolbar-mockup.md` starting
`## 2026-11-27, Mac toolbar matches the mockup (#892)`, a few bullets on what
changed and why. Run `node scripts/check-notes.mjs` and
`npx prettier --check docs` after.

When done, report the test counts and what you couldn't do.
