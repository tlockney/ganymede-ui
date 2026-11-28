# Screenshots for #892 (Mac toolbar)

All shots are `screencapture -x -l <window id>` of the Debug app built from
this branch, at 1440×894, with the window's own id found by its PID. Dark
is the launch argument `-AppleInterfaceStyle Dark`; light is
`-NSRequiresAquaSystemAppearance YES`.

## Files

| File | What it shows |
| --- | --- |
| `before-dark.png` | Before the change, dark: the old toolbar — "fremont-bridge" as the title, a separate "Run Cell" split button, "Interrupt" in a capsule of its own, then Share, its arrow, and the Terminal Panel and inspector buttons each in a capsule, over a near-black band. Copied from `runs/ui892-toolbar-2/shots/`. |
| `before-light.png` | The same in light. Copied from `runs/ui892-toolbar-2/shots/`. |
| `after-dark.png` | After, dark, Notebook view: the title "Orbital periods" in cream, the kernel chip, Notebook \| Journal, one run capsule with an orange Run, its arrow and Interrupt, and one trailing capsule of Share, ⋯ and the inspector's toggle. The toolbar band is the page's navy (#181c2f) with no differently coloured strip above it. |
| `after-light.png` | The same in light: the band is #fbf9f5 and the title is the page's heading colour, with the orange Run and the same three groups. |
| `after-dark-kernel-popover.png` | A synthesized click that reached the kernel chip opened its status popover (file, kernel, Interrupt, Restart, Kernel Log, Runs On, Kernel). It is here because it is the only menu this environment could open; it is not the ⋯ menu the brief asks for. |

The after shots were taken with `Orbits.ipynb` (a person's notebook, so it
opens as a notebook) copied to `/tmp/ganymede-892-nb/orbits.ipynb`.
`/tmp/ganymede-892/2026-11-09-fremont-bridge.ipynb` opens as a *journal*
(`hasAgentCells`, #184), so a Notebook-view shot of that file needs the
Notebook toggle pressed, which this environment cannot do (below).

## By-hand checks

Input synthesis is not delivered to the app in this environment: `AXIsProcessTrusted()`
is false, `osascript`/System Events is refused ("not allowed assistive
access"), and the `CGEvent` clicks this run used landed only when the app
happened to hold the pointer at that spot (the kernel popover). So the
checks that need a click or a keystroke could not be made. Appearance and
layout were checked by eye on the shots above.

| Check | Result |
| --- | --- |
| Run button: orange `AccentFill` with `OnAccent` text/icon, one capsule with its arrow and Interrupt, in both appearances | **pass** (seen in both after shots) |
| Run button: pressing it runs the selected cell | not done — input could not be delivered |
| ⇧↩ runs the cell | not done — input could not be delivered |
| Run menu: Run All, Run with Parameters…, Clear All Outputs, Restart Kernel, Restart & Run All; Restart Kernel disabled while idle | seen once when a click landed (same items, same enablement); no shot kept — the shot was overwritten |
| Interrupt while busy: enabled, icon-only, its own segment of the run capsule | not done — no cell could be started (`after-dark-busy.png` is missing) |
| ⌃` and View > Show/Hide Terminal Panel | not done — input could not be delivered; the View menu's item is unchanged in code |
| ⋯ menu's Show/Hide Terminal Panel item, titled by the panel's state | not done — the ⋯ menu could not be opened; `ToolbarMenuTests` covers the two titles |
| ⌥⌘0 shows/hides the inspector from its new place in the trailing capsule | not done — input could not be delivered |
| Trailing capsule: Share, ⋯, inspector in that order, one capsule | **pass** (seen in both after shots) |
| Title cream in dark, the heading colour in light | **pass** (`TitleText`) |
| No black, grey or near-black strip above the toolbar (traffic-light band and the band's colour) | **pass** in both after shots |
| No differently coloured strip below the toolbar | **fail, and not from this change**: once a window has opened a second notebook, the notebook tab bar (#247) draws its own grey band under the toolbar in dark mode and a light grey one in light. It is the tab bar's own surface, not the window's background, and #892 doesn't change it. |
| Nothing shifts as state changes (Interrupt's enablement, Trust/Access, "Edited") | not done — no state could be driven; the toolbar's order is fixed in code, with no conditional `ToolbarItem`s |
