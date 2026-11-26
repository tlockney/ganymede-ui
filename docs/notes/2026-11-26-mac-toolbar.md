## 2026-11-26, Mac toolbar (#867)

The Mac's toolbar had nine controls, and two of them said things the rest
of the window could say. The first was a New Notebook button, though File >
New Notebook (⌘N) makes one in the window's folder and the sidebar's New
Notebook Here makes one where the reader is. The kernel was a button
reading only its name ("TypeScript"), while the status line under the
title carried the rest — "Saved on This Mac · Runs on This Mac ·
TypeScript · Running" — a sentence in a place that has room for a few
words.

- The status line under the title now says only where the notebook is
  saved: `HeaderStatus.save`, as "Saved on This Mac", "Edited" or
  "Locked: changed on disk". `WindowTarget.subtitle` passes that through,
  and a machine's window with no notebook open still says "on _machine_".
- Where it runs, the kernel and what it is doing are a chip beside the
  title: "TypeScript · This Mac · Idle". `HeaderStatus.chipLead` gives the
  kernel's name and its place (no place while the kernel is missing);
  `chipState` gives `stateText`, or "Idle" while the kernel waits or there
  is none. A kernel that isn't installed gives "julia not installed ·
  Choose Kernel" beside a warning triangle in place of the dot, and no
  state, since there is nothing for it to do.
- The words are computed on `HeaderStatus`, not in the view, so
  `HeaderStatusTests` covers them without a window: `chipText`,
  `chipLead`, `chipState`, and `chipDot` and `dotLabel` for the dot.
- The dot is `Color("Ready")` while the kernel waits, a new `KernelBusy`
  colorset (#8fb3ff, the same in light and dark, beside `Ready` in the
  macOS and iOS catalogs) while it starts, runs or restarts, and
  `.secondary` once it has stopped. A colorset of its own rather than an
  existing blue: `AccentFill` follows the system accent, which the reader
  can set to anything, and the busy dot has to read as blue. VoiceOver
  says "Kernel idle", "Kernel busy", "Kernel starting" or "Kernel
  stopped" of the dot, and the button's label is the chip's whole text.
- The state part holds its width, so idle → busy → idle leaves the items
  after the chip where they were: a hidden `Text` in a `ZStack` reserves
  the widest state word's width in whatever font the toolbar draws, with
  no size of its own. The issue guessed "Restarting" is the longest word;
  measured in the system font at 13pt, "Connecting" is wider (69.7pt
  against 62.1pt), so "Connecting" is what the chip reserves.
- Hovering the chip shows the whole status line (`HeaderStatus.full`), as
  the popover's first line does. The popover is otherwise unchanged.
- The order is now: the chip (`.navigation`, beside the title); Trust and
  Notebook Access, while they apply; Notebook | Journal; Run Cell with its
  run menu and Interrupt, in one `ToolbarItemGroup`, so the pair reads as
  one control; Share; More. New Notebook's item is gone, and
  `NotebookToolbar` takes no `folder` for it. File > New Notebook already
  had ⌘N.
- Removing the button removes only a duplicate: the menu item, the
  sidebar's New Notebook and New Notebook Here, and the empty window's
  button all still make notebooks.

Checked with `npm run check`, `xcodebuild test` for the `Ganymede` scheme
on macOS (`HeaderStatusTests` and `PlaceTests`; the app target builds
`NativeChrome`, `ContentView` and `WindowTarget` with them), and
`xcodebuild build -scheme Ganymede -configuration Debug` for the Mac app.

Left undone: the chip's popover still opens only by clicking, and the
width is held for the state word alone: changing the kernel, or where its
kernels run, still moves the items after the chip. That is a change the
reader asked for, unlike the kernel starting and stopping.
