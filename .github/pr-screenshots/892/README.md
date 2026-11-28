# #892 toolbar: after the pre-push review

Screenshots of the Debug build of `claude/project-thread-ic3hoj`, taken
with `screencapture -x -l <window id>` (full window) and
`screencapture -x -R 0,30,1440,64` (the toolbar band), on 27 Nov 2026.
The window is 1440 × 894 points at origin (0, 30). Each launch is a build
of this worktree's `apple/build/DerivedData/Build/Products/Debug/Ganymede.app`,
started by full path with `open -n` and quit by its own PID only.

The notebook is `/tmp/ganymede-892/2026-11-09-fremont-bridge.ipynb`, a copy
of `e2e/fixtures/journal/Fremont Bridge.ipynb` whose journal metadata
(`metadata.ganymede` on the notebook and its cells) was removed in the
copy, so it opens in Notebook view. It has no `metadata.title`, so its
display title is its first level-1 heading —
"Have bike commutes over the Fremont Bridge come back since 2019?" — while
the sidebar and its tooltip keep the file's name.

| File | What it shows |
| --- | --- |
| `before-dark.png` | The toolbar before this branch (from `runs/ui892-toolbar-2/shots/`), dark. "Run Cell", Interrupt and the trailing controls each in a capsule of their own, the title in the system's titlebar. |
| `before-light.png` | The same, light. |
| `after-dark.png` | The window now, dark (`-AppleInterfaceStyle Dark`): the title in the toolbar in `TitleText` (moon cream) on the `WindowBackground` band, kernel chip beside it, then a flexible gap, then Trust (the notebook isn't trusted), Notebook \| Journal, the Run capsule (orange Run, its menu's chevron, Interrupt), and Share \| ⋯ \| inspector, all ending at the right edge. Sidebar: the file's name. Title: the first heading. |
| `after-light.png` | The same, light (`-NSRequiresAquaSystemAppearance YES`): near-black title on the cream band, Run filled `AccentFill` with `OnAccent` lettering. |
| `toolbar-dark.png` | The dark toolbar band alone at 1440 wide, for the group order and the trailing edge. |
| `toolbar-light.png` | The same, light. |

## The checks these prove

- **Group placement (#892 item 6).** The groups sit at the trailing edge;
  the flexible space is between the kernel's chip and Notebook \| Journal.
  Measured on `toolbar-dark.png`: the chip ends at 745 pt, the trailing
  capsule at 1378 pt. A probe item added last also stopped ~56 pt short of
  the window's edge, so that remaining margin is the toolbar's own, not
  the layout's.
- **One capsule for the run group (#892 item 5).** A 2x crop of the group
  shows one capsule over the toolbar's surface around the orange Run, its
  chevron and the grey Interrupt square — no second, darker rounded
  rectangle nested inside it. The item hides the toolbar's shared
  background (`.sharedBackgroundVisibility(.hidden)`), so the hand-drawn
  capsule isn't drawn over the system's.
- **The display title (#892 items 1 and 3).** The window's title, its tab
  and its traffic-light title area read the first level-1 heading, not the
  file's name; the sidebar row still reads
  `2026-11-09-fremont-bri…`.
