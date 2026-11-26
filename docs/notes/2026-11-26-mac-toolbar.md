## 2026-11-26, Mac toolbar (#867)

The Mac's toolbar had nine controls, and two of them said things the rest
of the window could say. The first was a New Notebook button, though File >
New Notebook (⌘N) makes one in the window's folder and the sidebar's New
Notebook Here makes one where the reader is. The kernel was a button
reading only its name ("TypeScript"), while the status line under the
title carried the rest — "Saved on This Mac · Runs on This Mac ·
TypeScript · Running" — a sentence in a place that has room for a few
words.

- A notebook's window no longer has the system's title or subtitle in its
  toolbar: `.toolbar(removing: .title)` takes them away (`ContentView`) and
  `.navigationTitle` stays, so the window's tab still gets the display
  title. One `.navigation` item draws the block in their place
  (`NotebookToolbar`): the notebook's display title in `.headline`, on one
  line, truncated in the middle, and under it, one point away, the save
  part when there is one. The kernel's chip is its own `.navigation`
  item beside the title, so a console's or a folder's window, which
  keeps the system title, has it in the same place.
- Under the title the save part shows only where "Saved on …" would say
  nothing new: `HeaderStatus.saveNote` gives "Edited", "Locked: changed
  on disk" or "Edited · Locked: changed on disk", in `.secondary` caption,
  and nothing while the file is saved. The whole status line
  (`HeaderStatus.full`) stays in the chip's help and in the popover.
  `HeaderStatus.save` remains `saveNote` or "Saved on <place>", so the
  subtitle of a machine's window with no notebook open still says
  "on _machine_".
- The chip is a toolbar button on the toolbar's own capsule, ending in a
  chevron that says it opens a menu. An earlier draft put it under the
  title as borderless caption words; in use, choosing a kernel there was
  hard to find and to hit, so it stands on its own. It opens the same
  popover, with the same accessibility label and value; the chevron is
  hidden from VoiceOver.
- The title block hides the toolbar's shared glass behind it
  (`.sharedBackgroundVisibility(.hidden)`), so it reads as a plain title,
  and keeps 8pt either side so the glass's edge doesn't clip its first
  letter.
- Where it runs, the language and what the kernel is doing are the chip,
  as "Python · This Mac · Idle": the notebook's language, its place and
  its state. `HeaderStatus.chipLead` gives the language and the place (no
  place while the kernel is missing); `chipState` gives `stateText`, or
  "Idle" while the kernel waits or there is none. A kernel that isn't
  installed gives "julia not installed · Choose Kernel" beside a warning
  triangle in place of the dot, and no state, since there is nothing for
  it to do.
- The chip calls the notebook by its language, not the kernel's display
  name: "Python" for a "Python 3" kernel, "TypeScript" for the in-app
  "TypeScript (in app)". The page reports `kernelLanguage`: the running
  kernel's kernelspec's `language`, else the file's
  `metadata.kernelspec.language`, else its `metadata.language_info.name`
  (`notebookLanguage` in `src/lib/journal.ts`, which the pane's controller
  carries to `postState`). `HeaderStatus.languageName` writes the names a
  language writes itself — "TypeScript", "JavaScript", "Python", "SQL",
  "R", "Julia", "Rust", "Go", "Bash" — and capitalizes any other's first
  letter. A page that names no language falls back to the kernel's
  display name, as it read before.
- The words are computed on `HeaderStatus`, not in the view, so
  `HeaderStatusTests` covers them without a window: `chipText`,
  `chipLead`, `chipState`, `saveNote`, `languageName`, and `chipKind` and
  `dotLabel` for the mark. `PageStateTests` covers the page's new
  `kernelLanguage`, and the page's own tests (`journal.test.ts`,
  `native.test.ts`, `App.test.tsx`) cover where it comes from.
- The mark is a solid 7pt dot in `Color("Ready")` while the kernel waits,
  and a small system spinner in the same 10pt frame (`ProgressView`,
  `.mini`) while it starts, runs or restarts: the shape says which, not
  the colour, and the words after it don't move. `.secondary` fills the
  dot once the kernel has stopped. The issue asked for the busy state to
  glow blue; the spinner says it instead, since `Ready` is already the
  blue the mark keeps (`#8fb3ff` in dark) and a second blue would say
  nothing. The spinner keeps the system's own colour: `.tint` has no
  effect on a macOS spinner. VoiceOver reads the chip as one control: its
  label is the chip's whole text, its value the mark's words, as
  "TypeScript · This Mac · Idle, Kernel idle, button", and the mark itself
  is hidden, so the state is neither lost nor read twice.
- The state part holds its width, so idle → busy → idle leaves the items
  after the chip where they were: a hidden `Text` in a `ZStack` reserves
  the widest state word's width in whatever font the toolbar draws, with
  no size of its own. That word is "Connecting", 69.7pt in the system
  font at 13pt: it is what the chip reserves.
- Hovering the chip shows the whole status line (`HeaderStatus.full`), as
  the popover's first line does. The popover is otherwise unchanged.
- The order is now: the title with its save part under it, then the
  kernel's chip (both `.navigation`, in the system title's place); Trust and Notebook
  Access, while they apply; Notebook | Journal; Run Cell with its run menu
  and Interrupt, in one `ToolbarItemGroup`, so the pair reads as one
  control; Share; More. New Notebook's item is gone, and `NotebookToolbar`
  takes no `folder` for it. File > New Notebook already had ⌘N.
- Removing the button removes only a duplicate: the menu item, the
  sidebar's New Notebook and New Notebook Here, and the empty window's
  button all still make notebooks.

Checked with `npm run check`, `npx vitest run` on `journal.test.ts`,
`native.test.ts`, `App.test.tsx` and `NotebookPane.test.tsx`, and
`xcodebuild test` for the `Ganymede` scheme on macOS
(`HeaderStatusTests`, `PageStateTests` and `PlaceTests`; the app target
builds `NativeChrome` and `ContentView` with them).

Left undone: the chip's popover still opens only by clicking, and the
width is held for the state word alone: changing the kernel, or where its
kernels run, still moves the items after the chip. That is a change the
reader asked for, unlike the kernel starting and stopping.
