## 2026-11-28, Mac sidebar tint, glass and caption contrast (#896)

Follow-up polish for the Mac sidebar from #896 and #878 (part of Step 4
of #844). Side-by-side inspection against `boards/S4-Sidebar.png` and
`boards/E-Mac.png` turned up three issues: the column painted an unclipped
SwiftUI background over the system's glass, light mode darkened to plain grey
(`#D2D4DA`) under the 14% `#2B3A67` tint, and list captions in `.secondary`
dropped under 4.5:1 in light mode.

- **Tinting the system's sidebar glass (`SidebarGlassTint`):** Replaced
  `.background(Color("SidebarTint").ignoresSafeArea())` in `ContentView` with
  `SidebarGlassTint`, which locates the enclosing `NSGlassEffectView` created
  by `NavigationSplitView` and assigns its `tintColor` (`NSGlassEffectView.h`,
  macOS 26+). The full-bleed SwiftUI background painted inside `contentView`
  over any rounded corner clip on macOS 26 and covered the top
  `NSScrollPocket` on macOS 27. `SidebarGlassTint` tracks the resolved
  `effectiveAppearance` and enclosing `NSGlassEffectView` so dynamic light/dark
  switches update without redundant assignments during view updates.
- **macOS 27.2.1 (`26B131`) `NSSplitViewItem` observation:** Runtime checks
  and disassembly against AppKit on macOS 27.2.1 (`BuildVersion: 26B131`)
  show `-[NSSplitViewItem _hasFloatingAppearance]` and
  `-[NSSplitViewItem wantsFloatingAppearance]` return `NO` (`mov w0, #0; ret`),
  `setWantsFloatingAppearance:` is a no-op (`ret`), and `_NSSplitViewItemViewWrapper`
  constrains its `NSGlassEffectView` (`_variant = 18`) flush (`edgeInsets = {0,0,0,0}`,
  `cornerRadius = 0`) even in a plain `NavigationSplitView` or AppKit
  `NSSplitViewController(sidebarWithViewController:)`. Removing the unclipped
  SwiftUI background lets macOS 26 keep its floating inset sidebar while
  preserving macOS 27's native flush sidebar glass without hiding or replacing
  `NSSplitView` internals.
- **Light-mode cream/navy treatment (`SidebarTint`, `SidebarBrand`, `SidebarInk`):**
  Replaced light `SidebarTint` (`#2B3A67` at 14%, which mixed to neutral grey
  `#D2D4DA`) with warm cream `#F3EFE6` at 75% alpha (`dark` keeps `#2B3A67` at
  55%). Added `SidebarBrand` (`#1B2036` navy in light mode, `#F4E9D8` moon cream
  in dark mode) on the `"Ganymede"` wordmark and `SidebarInk` (`#1B2036` navy in
  light mode, `Color.primary` in dark mode) on non-list controls (`capsule` and
  `ProjectLine`'s title). Selectable rows in `FolderSidebar` keep `Color.primary`
  so AppKit's emphasis rules still invert labels to white over `AccentColor`
  (`#A85F00`).
- **Shared `SidebarCaption` contrast (#878):** Replaced every `.foregroundStyle(.secondary)`
  in `NavigatorSidebar`, `FolderSidebar`, `FolderContents`, `RunningList`,
  `KernelRow`, `ProjectLine` (which previously used 72% `Color.primary`), and
  `ThisMacBadge` with `SidebarCaption` (`#3E4663` navy-slate in light mode,
  `#B8BDD1` cool slate in dark mode). Calculated WCAG 2.1 contrast ratios from
  the `SidebarTint` sRGB values:
  - Light `SidebarCaption` (`#3E4663`) over `#F3EFE6` at 75%: **8.38:1** on
    `#FFFFFF`, **8.27:1** on `#FBF9F5` (`WindowBackground`), **8.04:1** on
    system light `#ECECEE`, **6.23:1** on mid-grey `#808080`, and **4.83:1**
    even over a `#1E1E1E` dark backdrop; **6.43:1** inside `ThisMacBadge`
    over light glass; **9.29:1** on Inspector light `.background` (`#FFFFFF`).
  - Dark `SidebarCaption` (`#B8BDD1`) over `#2B3A67` at 55%: **7.27:1** on
    `#181C2F` (`WindowBackground`), **6.79:1** on system dark `#28282A`, and
    **8.63:1** on `#000000`; **5.33:1** inside `ThisMacBadge` over dark glass;
    **8.92:1** on Inspector dark `.background` (`#1E1E1E`).
  - Brand/ink contrast on default glass: **13.91:1** light (`#1B2036`),
    **11.31:1** dark (`#F4E9D8` over `#181C2F` backdrop) and **10.57:1** over
    system dark (`#28282A`).
  - Note on iPad (#878): `IPadChrome` renders on the untinted system iPad
    sidebar and keeps its `.secondary` captions until Step 7 of #844 (only
    shared `ThisMacBadge` adopts `SidebarCaption`).
- **Kernel badges (#896):** `FolderEntry` (`url`, `isDirectory`) and
  `FileSource` (`LocalFileSource`, `MachineFileSource`) do not read `.ipynb`
  metadata during directory listing, and per #896 no extra per-row file reads
  were added; notebook and file rows keep their existing `book.pages` /
  `doc.text` icons.

Checked with `npm run check`, `npm test`, `xcodebuild test` (`Ganymede` on
macOS, including `SidebarStyleTests`), `check-app-bundle.sh`,
`xcodebuild build` for `Ganymede-iOS`, and `SidebarStyleTests` in
`GanymedeTests-iOS` on iPad simulator.
