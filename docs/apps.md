# The Mac, iPad and iPhone apps

Ganymede for Mac, iPad and iPhone runs the Ganymede server inside the app
and shows the notebook in a window of its own, with a native sidebar,
toolbar and menus. Notebooks stay on your device. This page is the user
guide; [apple/README.md](../apple/README.md) covers how the app is built.

## Install

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release: the apps require macOS 26 or iOS 26, and the Mac
> app runs on Apple silicon only. The latest release runs on macOS 13 and
> iOS 16, and its Mac app is universal (Apple silicon and Intel).

- **Mac** (macOS 26 or later, Apple silicon): each
  [release](https://github.com/tlockney/ganymede-ui/releases) since 0.3.0
  attaches `Ganymede-macOS-<version>.zip`, an app signed with a
  Developer ID and notarized. Unzip it, move `Ganymede.app` to
  Applications, and open it.
- **iPad and iPhone** (iOS 26 or later): on TestFlight, for the team's
  internal testers only. Members of the internal testing group install it
  with the TestFlight app. A TestFlight build expires after 90 days; the
  next upload replaces it.

On first launch the app asks once whether to send crash reports
(see [Crash reports](#crash-reports)).

## Mac

### Opening notebooks

- Double-click an `.ipynb` file in the Finder (or Open With > Ganymede)
  to open it in a new tab; opening it again brings that tab to the front.
  File > Open… (⌘O) opens notebooks, File > Open Folder… (⇧⌘O) a folder,
  each in a new tab. A new window (⌥⌘N) shows the last folder opened, your
  home folder at first. File > Open Recent lists the notebooks opened
  lately.
- To open notebooks here by default, choose Ganymede > Make Default App
  for Notebooks, or in the Finder choose File > Get Info on a notebook,
  pick Ganymede under Open with, and click Change All.
- Notebooks get a Quick Look preview (select one in the Finder and press
  Space) and a Finder thumbnail of their first cells. The preview renders
  the notebook as the app does, read-only, with outputs untrusted, and
  without a server or kernel.

### Windows and tabs

- A notebook window behaves like a document window. Its title bar has the
  file's icon (drag it, or ⌘-click it for the folders above) and a dot
  while there are unsaved edits. File > Save (⌘S) saves. Closing the
  window or quitting with unsaved edits asks Save, Don't Save or Cancel.
- Notebook, text file and terminal windows open as tabs of the front
  window, with the system's window tabs: drag a tab out to make it a
  window, or choose Window > Merge All Windows to bring windows back
  together. Each tab keeps its own toolbar, and a notebook's tab shows a
  dot while its kernel is running. Ganymede uses tabs whatever System
  Settings > Desktop & Dock > "Prefer tabs when opening documents" says;
  windows restored at launch come back as they were.
- File > New Notebook (⌘N) makes a notebook in the window's folder, New
  Tab (⌘T) opens another tab, New Window (⌥⌘N) a window of its own, and
  Rename… renames the open notebook (saving it first; its kernel keeps
  running).
- Downloads from the page (links with a `download` attribute, files an
  output offers) ask where to save, starting in Downloads.
- Quitting shuts every kernel down.

### Sidebar

The sidebar has five tabs (⌘1 to ⌘5). Each window keeps its sidebar
shown or hidden, its tab and its expanded folders across launches.

- **Files** lists the window's folder as a tree. Right-click an item to
  open it in a new tab, show it in the Finder, make a notebook or folder
  there, or move it to the Trash. A dot marks notebooks whose kernel is
  running.
- **Search** finds file and folder names under the window's folder and,
  with "Search notebook contents" ticked, the text of its notebooks,
  showing the matching line.
- **Running** lists running kernels, each with its memory when the server
  reports it (a Ganymede server does), and the terminals open in any
  window. Click a terminal to bring it to the front, or right-click a
  kernel or terminal to shut it down (or choose Kernel > Shut Down Other
  Kernels). The foot of the sidebar shows where kernels run and how many
  kernels and terminals there are.
- **Recents** lists the notebooks opened lately.
- **Outline** lists the open notebook's headings; click one to go to its
  cell.

### Toolbar and menus

- The toolbar saves, runs cells, interrupts and restarts the kernel,
  inserts cells, sets the cell type and trusts the notebook. Its kernel
  button opens a popover with the kernel's state and memory, Interrupt,
  Restart, Kernel Log and the kernels to change to.
- The Cell menu runs, inserts, moves and deletes cells and opens Find; the
  Kernel menu interrupts (⌘.), restarts, changes and trusts.
- View > Command Palette… (⇧⌘P) finds and runs the notebook, cell and
  kernel commands by name. [Keyboard shortcuts](shortcuts.md) lists the
  rest.

### Kernels

- Kernels come from the kernelspecs installed on the Mac, as with
  `ganymede serve`. Opened from the Finder, the app takes `PATH` from your
  login shell, so kernelspecs that run `node`, `deno` or `python3` start.
- The kernel menu also lists "TypeScript (cdp-kernel, in app)": cdp-kernel
  running inside the app, as on the iPad. Its cells get the
  [device API](device.md); kernels in their own process can't reach the
  app.
- Kernels can run on a remote server instead: see [Settings](#settings).

### Terminals and the kernel log

- Terminals open in the window's bottom panel, as tabs under the
  notebook. View > Show Terminal Panel (`` ⌃` ``) or the toolbar button
  shows it, starting a shell in the window's folder (its notebook's
  folder, or the folder it shows) if it has none; drag its top edge to
  resize it. Hiding the panel keeps its shells running; closing a tab
  ends that one. Since `` ⌃` `` toggles the panel, programs in a panel
  terminal don't receive it (a terminal in a tab of its own still does).
- File > New Terminal (`` ⌃⇧` ``) adds a shell to the panel. File > New
  Terminal On, or the panel's + menu, opens one on a remote's server, if
  it has terminals (Ganymede with terminals, or `jupyter server`), or
  over SSH with `/usr/bin/ssh`, so `~/.ssh/config`, the SSH agent and
  known_hosts apply. File > New Terminal Tab opens a shell in a tab of its
  own.
- The panel's first tab, Kernel Log, follows the open notebook kernel's
  stdout and stderr (outside its cell output) and the server's lines
  about its process, such as why it died. It needs a Ganymede server with
  the kernel log route; a kernel on a gateway has no log there.

### Inspector

The inspector on the window's right, shown with View > Show Inspector
(⌥⌘0) or the toolbar button, has two tabs: Outline, the open notebook's
headings, and Variables, what its cells defined (name, type and a short
value; objects expand a level at a time), read again after each run from
a kernel that speaks the debugger protocol. Drag its left edge to resize
it. The window keeps whether it shows, its tab and its width.

### Filling the window

Any of the notebook, the bottom panel and the inspector can fill the
window: the arrows button in the panel's or inspector's header, or View >
Fill Window (⇧⌘↩), which fills it with the panel when a panel terminal
has the keyboard and with the notebook otherwise. The other areas fold
into thin strips at the window's edges; clicking one, the same button,
⇧⌘↩, or showing the sidebar, panel or inspector brings the layout back.

### Text files

Other files in the sidebar (not notebooks) open in a text editor window:
the system text view with syntax highlighting for Python, JavaScript,
TypeScript, JSON, Markdown, shell, YAML and TOML, line numbers,
auto-indent, and paired brackets and quotes. ⌘S saves. When the file
changes on disk the editor reloads it, or, with unsaved edits, asks which
version to keep.

### Shortcuts

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

The Shortcuts app, Spotlight and Siri get these Ganymede actions:

| Action | What it does |
|---|---|
| Open Notebook | Opens a notebook in a window. |
| New Notebook | Creates a notebook in a folder, empty or a copy of a template notebook, and returns it. |
| Run Notebook | Runs every code cell in order, after restarting the kernel unless turned off, and returns the outputs. |
| Run Cell | Runs the cell with an id, or every cell with a tag, and returns its outputs. |
| Get Notebook Outputs | Returns the saved outputs of a notebook or one cell, without running anything. |
| Control Notebook Kernel | Starts, interrupts, restarts or shuts down a notebook's kernel. |
| List Notebooks | Returns the notebooks in a folder. |

Each output is a Cell Output with its cell id, kind (stream, result,
display or error), text, image and JSON, so the next action can take any
of them; used as text, it is its text. A cell that fails, a missing file
or a run that outlasts its time limit stops the shortcut with the error.

The actions use the app's own server, and start it if no window has.
Runs go through the server, as an agent's do: a window showing the
notebook sees the outputs arrive, and they are saved with it. They use
the notebook's kernel from its kernelspec, on this Mac or the remote
kernels run on, never the in-app TypeScript kernel, which only a window
reaches. The actions are on the Mac only for now.

### Settings

Settings (⌘,) is one window with tabs. General makes Ganymede the
default app for notebooks and turns crash reports on or off. Appearance
sets the code font (below). Kernels
picks where kernels run, this Mac or, as on iPadOS, one remote's server,
and lists the kernels installed there. Remotes keeps a list of remotes:
Jupyter or Ganymede servers, SSH hosts, or both; tokens are kept in the
keychain. Agent turns the optional agent on and picks its provider, model
and API key, with a test. Shortcuts lists the notebook's keyboard
shortcuts and rebinds them.

#### Code font

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

Settings > Appearance sets the code font: notebook cells and text
outputs, the text editor and the terminal take it at once. Pick the
system's monospace font or one of the bundled fonts (JetBrains Mono, Fira
Code, Cascadia Code, the five Monaspace faces, Iosevka), the size, and,
for fonts that have them, ligatures and the font's stylistic sets and
character variants, each listed with the characters it changes. View >
Bigger Code Font (⌘+), Smaller Code Font (⌘−) and Actual Code Font Size
(⌘0) change the size from any window.

Ganymede > Agent Settings… (⌥⌘,), Help > Keyboard Shortcuts and Kernel >
Where Kernels Run… open those Settings tabs, as do the command palette's
Settings…, Keyboard Shortcuts and Connect to a Server…. The agent's API
keys are kept in the keychain too.

## iPad and iPhone

### Notebooks and kernels

- Notebooks live in the app's Documents folder, shown in the Files app
  under On My iPad, or in a folder picked with the folder button (an
  iCloud Drive or SMB folder works); the app keeps a bookmark to it.
- iOS does not let an app start kernel processes, so the app runs its
  own kernel: cdp-kernel's TypeScript kernel, inside the app. Its cells
  get the [device API](device.md). For other kernels, add a remote in
  Settings with the URL and token of another Jupyter or Ganymede server
  (for example `ganymede serve --ip 0.0.0.0` on your Mac; see its
  [Security](https://ganymede-server.com/docs/security) page for reaching
  it safely). Either way, notebooks stay on the device.

### iPad

- The sidebar, toolbar and key commands are the app's own, as on the
  Mac; the page shows just the notebook. The sidebar hides in portrait
  and comes back with a swipe from the edge. It has the Mac's navigator
  tabs (⌘1 to ⌘5 with a keyboard): Files, Search, Running (kernels and
  the panel's terminals), Outline and Recents.
- Files lists the notebook folder as a tree; long-press an item to
  rename, duplicate or delete it, or make a notebook or folder in it. A
  dot marks notebooks whose kernel is running. Search finds files by name
  in the folder and below it (and, switched on, in what notebooks say).
  In Running, swipe or long-press a kernel to shut it down.
- The navigation bar runs cells and interrupts the kernel, and its ⋯ menu
  inserts cells, sets the cell type, restarts or changes the kernel, shuts
  down other kernels, saves, renames, downloads and trusts. With a
  keyboard, hold ⌘ to see the commands: New Notebook ⌘N, Save ⌘S, Run All
  ⇧⌘↩, Interrupt ⌘., Find ⌘F.
- A text file opens over the notebook, one at a time; Close (which asks to
  save) or opening a notebook from the sidebar goes back to it, saving
  edits on the way.
- Terminals open in a bottom panel under the notebook, as tabs: drag its
  handle to resize it, use its arrows to have it fill the screen and
  back, and hide it with its chevron, the toolbar's panel button or
  `` ⌃` ``; hidden, its shells keep running. The toolbar's Fill the
  Screen hides the sidebar and panel until it is tapped again.
- Outline lists the open notebook's headings, indented by level; tap one
  to go to its cell. In portrait the sidebar then gets out of the way.

  > [!NOTE]
  > **Unreleased.** Available only from a build of `main` (HEAD), not in
  > the latest release. In 0.5.0 the Outline tab is empty.

- The Mac's inspector (Outline and Variables) isn't on the iPad yet
  ([#249](https://github.com/tlockney/ganymede-ui/issues/249)).

### iPhone

The first screen lists the notebook folder, with the same long-press
actions and Running section as the iPad's sidebar, and the terminal,
Settings and folder buttons. Tapping a notebook opens it; swipe from the
left edge or tap Back to return to the list. The notebook's run controls
and its ⋯ menu are in the bottom toolbar. Terminals and text files cover
the screen. The bottom toolbar's Outline menu lists the notebook's
headings; pick one to go to its cell.

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

### On both

- **Settings** (the gear button, ⌘, with a keyboard, or Settings in the ⋯
  menu) is one screen: where kernels run, the remotes, the SSH key, the
  optional agent (on or off, provider, model, API key and a test), and,
  with a keyboard attached, the notebook's keyboard shortcuts, listed and
  rebound in place. The API key goes to the Keychain. The page's own
  Settings, Keyboard Shortcuts and Connect open this screen.
- **Code font**: Settings > Appearance, with the same fonts and choices
  as on the Mac. With a keyboard, ⌘+, ⌘− and ⌘0 change the size. On a touch
  screen a cell being edited stays at 16 points or more, so iOS doesn't
  zoom the page.

  > [!NOTE]
  > **Unreleased.** Available only from a build of `main` (HEAD), not in
  > the latest release.

- **Terminals**: the terminal button opens a shell on a remote, over SSH
  or on its server's terminals. SSH signs in with an ed25519 key the app
  generates or imports (Settings > SSH key; copy the public key into
  `~/.ssh/authorized_keys` on the remote) and trusts the host key the
  first time, refusing it if it changes later. iOS drops the connection
  soon after the app goes to the background; the terminal then offers to
  reconnect.
- **Text files** open in an editor with the same highlighting, line
  numbers, auto-indent and pairing as on the Mac. Edits are saved when
  the app goes to the background, since iOS may close the editor there.
- **Downloads** open the share sheet, where Save to Files keeps them.
- In the background iOS may stop the app's server; back in the
  foreground the app restarts it if it stopped answering.

## Crash reports

Off until you say yes. On first launch the app asks once whether to send
crash reports ("Don't Send" is the default); Settings > General on the
Mac, or Settings on iPad and iPhone, changes it. When on, crashes in the
app and in its embedded server go to Ganymede's Sentry with the stack,
the app's version, the OS and the device model. Breadcrumbs,
screenshots, sessions, the device name, paths under your home folder and
notebook content are left out in the app before anything is sent. The
page's own error reports follow the same choice. Settings has test
buttons (an error, a Swift crash, a Rust panic) while it's on.
Ganymede's [privacy page](https://ganymede-server.com/docs/privacy) has
the rules.
