## 2026-11-26, Mac sidebar look (#873)

The Mac's sidebar was a row of six icon buttons over a list, with a foot
that said where kernels run and how many ran. Neither said what the
window was: the buttons were unlabelled, and the folder the Files
navigator lists was named only in the list's own section header. The
foot's words ("This Mac", "2 kernels, 1 terminal") are in the kernel
button and the Running tab already. Step 4 of the Mac redesign (#844);
the Find tab, which joins Search and Outline, is a separate change.

- The column is navy glass: `SidebarTint`, a colorset in the macOS
  assets, is #2B3A67 at 8% in the light and at 55% in the dark, laid
  behind the whole column (`ContentView`'s `sidebar`) and so over the
  system's sidebar material. Against typical material greys (#E9E9E9
  light, #2A2A2C dark), primary labels read about 11.5:1 and 9.6:1. The
  system's secondary labels (black at about 50%, white at about 55%) read
  about 3.7:1 in the light, where the untinted sidebar gives them about
  3.8:1, and about 5.0:1 in the dark. These are estimates, not read from
  a running window; the PR's screenshots are measured. The color stays
  translucent, because an opaque fill would take away the material's
  vibrancy.
- The lists in the column hide their own scroll background
  (`.scrollContentBackground(.hidden)`), so the tint is behind their rows
  and not only around them. `OutlineNavigator` is also the inspector's
  outline, where the list now shows the inspector's background through it.
- Above the tabs is the app's mark, `NSApp.applicationIconImage` at 24pt,
  and "Ganymede" in `.title3.weight(.bold)`. The image is hidden from
  VoiceOver and reads with the name as a heading.
- The tabs share one capsule (a 3pt-padded container with a faint
  `Color.primary` fill and a hairline border). The tab on show draws its
  symbol with `.fill` and its name on a raised fill and takes the width
  the other icons leave; the others draw the symbol alone. When the
  capsule is too narrow for the name (at the sidebar's 180pt it gives the
  shown tab about 28pt), the name gives way to the symbol alone
  (`ViewThatFits`) rather than truncating. The Running badge is an
  overlay, as it was, so no segment's width changes when it appears.
- The badge is hidden from VoiceOver, and the Running tab's
  `accessibilityValue` says "2 running" instead
  (`NavigatorTab.runningValue`, empty while nothing runs). The tooltip's
  words are a property (`NavigatorTab.help`, "Files (⌘1)"), so both are
  tested without a window. The capsule is one element with the tab bar
  trait (`.isTabBar`, its segments contained), so VoiceOver reads the
  segments as tabs.
- Selection is quiet: the Files list takes `SidebarSelection` as its
  tint, an opaque grey (#6E6E73 light, #5A5A5E dark) that keeps the white
  text of a focused selection at about 5.1:1 and 7:1; `.secondary`, which
  is translucent, would put white text on a pale grey. The tint greys the
  rows' icons too. The open notebook's row is `Color.primary` at 8%
  instead of the accent at 18%. Keyboard behaviour is untouched:
  `SidebarKeys` and the list's selection binding are as they were.
- The foot is the project: `ProjectLine` replaces `ServerLine`, with the
  folder symbol, the folder's name in `.callout` and, in `.caption`
  secondary, the folder it is in and the place: "~/notes · This Mac".
  The home folder is shortened to "~" for this Mac's windows; a
  machine's keep the path its server reports and take the machine's name.
  The help tag is the whole path. The menu keeps "New Terminal On" and
  the remotes item and adds Show in Finder for this Mac's windows; the
  count of kernels and terminals and "Kernels run on" are gone, with
  `OpenTerminals.summary` and its test. A root (a machine's window opens
  on its root) reads "/" over the place alone: Foundation's
  `deletingLastPathComponent()` makes a root's parent "/..", so the
  parent comes from the path string. Recents' folder line uses the same
  `abbreviate`, which, unlike the `replacingOccurrences` it replaces, leaves
  "/Users/x2" alone for a home of "/Users/x".
- `ProjectLineText.lines` is the words alone, in its own file listed in
  both test targets (`project.yml`), which compile the sources they need
  rather than the app.

Checked with `npm run check`, `xcodebuild test` for the `Ganymede` scheme
on macOS (721 tests), a Debug build, and `build-for-testing` for
`Ganymede-iOS`.
