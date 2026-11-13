# The Mac, iPad and iPhone apps

Ganymede for Mac, iPad and iPhone runs the Ganymede server inside the app
and shows the notebook in a window of its own, with a native sidebar,
toolbar and menus. Notebooks stay on your device. This page is the user
guide; [apple/README.md](../apple/README.md) covers how the app is built.

## Install

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
  dot while its kernel is running. File > Close (⌘W) closes the active
  tab; closing the last one leaves the app running and opens a new window
  on its folder, with New Notebook. Closing that window leaves the app
  with no window; click its Dock icon or choose File > New Tab for one. Ganymede uses tabs whatever System
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
- Help > Ganymede Website, Ganymede Documentation and Apps Guide open
  ganymede-server.com, its docs and this page in the browser.

### Kernels

- Kernels come from the kernelspecs installed on the Mac, as with
  `ganymede serve`. Opened from the Finder, the app takes `PATH` from your
  login shell, so kernelspecs that run `node`, `deno` or `python3` start.
- The kernel menu also lists "TypeScript (cdp-kernel, in app)": cdp-kernel
  running inside the app, as on the iPad. Its cells get the
  [device API](device.md); kernels in their own process can't reach the
  app.
- Kernels can run on a remote server instead. Add the remote in
  Settings > Remotes (its editor can switch kernels to it), then pick
  where kernels run from the foot of the sidebar, the kernel button in
  the toolbar, or Kernel > Run Kernels On. The sidebar's foot names where
  they run now ("This Mac" or the remote), and its menu also opens a
  terminal on a remote. The choice is app-wide, and switching shuts down
  running kernels, so the Mac asks first while any run.

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

The Shortcuts app, Spotlight and Siri get these Ganymede actions:

| Action                       | What it does                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Open Notebook                | Opens a notebook in a window.                                                                          |
| New Notebook                 | Creates a notebook in a folder, empty or a copy of a template notebook, and returns it.                |
| Run Notebook                 | Runs every code cell in order, after restarting the kernel unless turned off, and returns the outputs. |
| Run Cell                     | Runs the cell with an id, or every cell with a tag, and returns its outputs.                           |
| Run Notebook with Parameters | Runs a notebook in a new kernel with parameters (a JSON object) and returns its named results as JSON. |
| Get Notebook Outputs         | Returns the saved outputs of a notebook or one cell, without running anything.                         |
| Control Notebook Kernel      | Starts, interrupts, restarts or shuts down a notebook's kernel.                                        |
| List Notebooks               | Returns the notebooks in a folder.                                                                     |

Each output is a Cell Output with its cell id, kind (stream, result,
display or error), text, image and JSON, so the next action can take any
of them; used as text, it is its text. A cell that fails, a missing file
or a run that outlasts its time limit stops the shortcut with the error.

The actions use the app's own server, and start it if no window has.
Runs go through the server, as an agent's do: a window showing the
notebook sees the outputs arrive, and they are saved with it. They use
the notebook's kernel from its kernelspec, on this Mac or the remote
kernels run on, never the in-app TypeScript kernel, which only a window
reaches. Run Notebook with Parameters is the exception: it runs the
notebook in a new kernel of its own, so a window shows nothing of it and
nothing is saved. That kernel can be the in-app TypeScript kernel, whose
cells read the parameters as `jupyter.params`, but only while a Ganymede
window is open. The actions are on the Mac only for now.

### Links

The Mac app opens `ganymede://` links, so launchers, Markdown links,
`open` in a terminal and other apps can open, create and run notebooks:

| Link                                                     | What it does                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ganymede://open?path=…`                                 | Opens a notebook or folder in a window.                                                                     |
| `ganymede://new?dir=…[&name=…][&template=…]`             | Creates a notebook in a folder, empty or a copy of `template`, and opens it.                                |
| `ganymede://run?path=…[&cell=…][&restart=0][&timeout=…]` | Runs every code cell, after restarting the kernel unless `restart=0`, or the cell with an id or tag `cell`. |

Paths are absolute, start with `~/`, or are relative to the folder the
app serves; encode them as URL query values (a space is `%20`).
`timeout` is in seconds, 600 unless given, at most 3600.

`run` takes [parameters](https://github.com/tlockney/ganymede/blob/main/docs/reference.md#parameters-and-named-results)
as `p.NAME=VALUE`, each value JSON if it parses and else a string, as
`ganymede execute -p` reads them, or all at once as `params=` and a JSON
object: `ganymede://run?path=~/reports/daily.ipynb&p.day=2026-11-10`.
A run with parameters runs the whole notebook in a new kernel, so a
window showing the notebook and its kernel are left as they are, and
nothing is saved. Its named results come back instead of the outputs:
in an alert for a plain link, or as `results` (a JSON object) in
`x-success`. `cell` can't be combined with parameters. A run with
parameters asks on its own, even for a notebook already allowed without
them, and its "Always allow" covers any parameters.

A link run opens the notebook, so its window shows the outputs arrive;
an error shows in an alert. Any app or web page can open a link, so the
first time a link runs a notebook, Ganymede asks, and says where the
output will be sent when the link has an x-callback reply. "Always allow"
skips the question from then on for that notebook and that destination
(the reply's scheme and host) only, so a notebook allowed for Shortcuts
still asks when a web page links to it with its own reply address.
Settings › General › Links lists those notebooks, each with Revoke.
`open` and `new` don't ask: they only show or create a notebook, though
their reply tells the caller whether a file exists.

For a reply, put the route under `x-callback-url/` and add
[x-callback-url](https://x-callback-url.com) answers:

```text
ganymede://x-callback-url/run?path=~/reports/daily.ipynb&x-success=…&x-error=…&x-cancel=…
```

`x-success` gets `path` (the new notebook) for `new`, and `status=ok` and
`output` (the cells' text output) for `run`, or `results` for a run with
parameters; `run` then opens no window.
`x-error` gets `errorCode` (1 for the notebook or server, 2 for a bad
link, 3 cancelled) and `errorMessage`, and `x-cancel` is opened when
you answer Cancel. In Shortcuts, the Open X-Callback URL action does
this and gives the answer to the next action.

### Agents over MCP

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

Agents outside the app, such as Claude Code and Claude Desktop, can read,
edit and run the notebooks open in Ganymede over
[MCP](https://modelcontextprotocol.io), and each change shows in the
window as it lands. Turn it on in Settings › General › MCP, which offers
**Read only**, **Edit, don't run**, and **Edit and run**, plus whether
images in outputs go to the model. It is off by default.

With MCP on, Settings shows what to give the agent, with Copy:

- **Claude Code**: `claude mcp add --scope user ganymede -- ganymede mcp`.
- **Claude Desktop**: an `mcpServers` entry for
  `claude_desktop_config.json` that runs `ganymede mcp`, by its full path
  when Ganymede finds it, since Claude Desktop doesn't use your shell's
  PATH.
- **Claude Code, without the ganymede command**: a
  `claude mcp add --transport http` command with the app's URL and
  token.

The first two need the [`ganymede` command](https://ganymede-server.com)
on the agent's PATH. While MCP is on, the app writes a
[server info file](https://ganymede-server.com/docs/reference#server-info-file),
so `ganymede mcp` uses the app's server while Ganymede runs, and a server
of its own when it doesn't. The agent keeps the server it found for the
whole session, so start the agent after Ganymede to work in the app's
windows. Relative paths start in the agent's folder from a `ganymede`
build of `main` (ganymede#730); earlier versions start them at `/`.
The app writes the file in `~/Library/Jupyter/runtime`, or where
`JUPYTER_RUNTIME_DIR` or `JUPYTER_DATA_DIR` point in its own environment;
a value set only in your shell's startup files doesn't reach the app, and
then `ganymede mcp` won't find it.

The server listens on this Mac only and needs the token. The token opens
all of Ganymede's server, as `ganymede serve`'s does: the mode limits what
agents do over MCP, not what the token's holder can do. While MCP is on,
the token is kept in the keychain and the port is the one the server had
last time, so the HTTP config keeps working after Ganymede restarts.
Should that port be taken, Settings shows the new one. Reset Token makes a
new token, after which HTTP agents need the new config. Changing these
settings restarts Ganymede's server, which restarts its kernels; turning
MCP off ends agents' sessions and revokes the token, so turning it on
again makes a new one.

A notebook can be edited on one server at a time: if an agent's own
`ganymede mcp` server has it open, Ganymede shows it read-only.

### Settings

Settings (⌘,) is one window with tabs. General makes Ganymede the
default app for notebooks, sets how it updates ([Updates](#updates)),
turns crash reports on or off, lists the notebooks links may run
([Links](#links)), and turns on MCP for agents
([Agents over MCP](#agents-over-mcp)). Appearance
sets the code font (below). Kernels
picks where kernels run, this Mac or, as on iPadOS, one remote's server,
and lists the kernels installed there. Remotes keeps a list of remotes:
Jupyter or Ganymede servers, SSH hosts, or both; tokens are kept in the
keychain. Agent turns the optional agent on and picks its provider, model
and API key, with a test. Shortcuts lists the notebook's keyboard
shortcuts and rebinds them.

#### Updates

Release builds check GitHub for a newer release once a day. When one is
found, the Dock icon gets a badge and an **Update Available** button
appears in the window's toolbar. The button opens the release notes with
Install Update, Skip This Version and Remind Me Later. Installing downloads the release, checks its signature,
replaces the app and opens it again. Ganymede > Check for Updates…
checks now.

Settings > General turns the daily check off, or makes updates download
and install on their own (they install when you quit). The first release
with updates has to be installed by hand; later ones install themselves.
Builds made from source don't update
themselves. The `main-build` download (a build of `main`) takes the
next release's update and never newer main builds. The check downloads
the release feed from GitHub (its release asset host serves the file) and sends nothing about you or your
notebooks; the download carries your IP address and the app's version,
as any download does.

#### Code font

Settings > Appearance sets the code font: notebook cells and text
outputs, the text editor and the terminal take it at once. Pick the
system's monospace font or one of the bundled fonts (JetBrains Mono, Fira
Code, Cascadia Code, the five Monaspace faces, Iosevka), the size, and,
for fonts that have them, ligatures and the font's stylistic sets and
character variants, each listed with the characters it changes. View >
Bigger Code Font (⌘+), Smaller Code Font (⌘−) and Actual Code Font Size
(⌘0) change the size from any window.

Ganymede > Agent Settings… (⌥⌘,), Help > Keyboard Shortcuts and Kernel >
Manage Remotes… open those Settings tabs, as do the command palette's
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
- Once a remote has a server, the ⋯ menu also picks where kernels run,
  as Settings does.

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
- **Help**: Settings > Help, and the iPad menu bar's Help menu,
  open ganymede-server.com, its docs and this page in Safari.
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
- **Example notebooks**: Open Example Notebooks, in the folder list's +
  menu (and the File menu with a keyboard), copies TypeScript notebooks that show
  APIs, charts, DuckDB, generative art, widgets, UI frameworks and the `device`
  API into a new `Examples` folder. The Mac has it in the File menu too.
  The app's own folder (On My iPhone or On My iPad › Ganymede) gets a copy
  on first launch, or the first launch after updating, so the examples are
  in the sidebar from the start; not a folder you picked, and a deleted
  `Examples` folder stays deleted.

- **Run Script on Device** (Shortcuts, Mac too; experimental, off until
  Settings › Device › Run Scripts from Shortcuts): runs a `.ts` or `.js`
  file, or an `.ipynb` notebook's code cells, on this device with no
  window and no kernel, on JavaScriptCore. The action's text, link and
  files are `device.input`; it returns the text or link the script hands
  to `device.output()`, or else its top-level `return` value. It can't
  show a prompt, so a `device` call that needs a permission works only if
  that notebook was allowed with Always; a file Shortcuts passes as a copy,
  with no location, gets no permissions. No imports. The time limit (30
  seconds by default, 60 at most) stops waiting for the script, but a loop
  that never yields isn't stopped and holds up the app until it ends.

- **Run a Notebook** (the share sheet, Mac too; experimental, off until
  Settings › Device › Run Notebooks from the Share Sheet): runs one of the
  notebooks added under that switch on what you share, with no window:
  the first text and link, and files up to 16 MiB together, as
  `device.input`. It shows what the notebook hands to `device.output()`
  (or its `return` value) and hands that back to the app you shared from.
  It runs a copy taken when the notebook was added; add it again to
  update it. As with Run Script on Device, it can't show a prompt, so a
  permissioned call works only if the notebook was allowed with Always;
  location, motion, contacts and reminders are the namespaces it has. The
  time limit is 20 seconds.

- **Notebook widgets** (home screen and desktop, Mac too;
  experimental, off until Settings › Device › Notebook Widgets): a cell
  publishes what a widget shows with
  `device.widget.update(kind, { title, rows, tint, sparkline })`, and
  the Ganymede widget, edited to pick that notebook and kind, shows the
  last content published. A widget can't run the notebook itself, so it
  changes only when a run publishes again. Notebooks opened after the
  switch is turned on can publish.

  > [!NOTE]
  > **Unreleased.** Available only from a build of `main` (HEAD), not in
  > the latest release.

- **Notebook Access…** (Kernel menu on the Mac, the ⋯ menu on the iPad
  and iPhone, and the Command Palette) sets what a notebook's cells may
  ask the server for through `jupyter.host()`: the notebooks they may
  read, whether they may edit their own cells, and the notebooks they
  may run. Each follows the server's default until you set it for this
  notebook. A notebook that lists what it wants in its metadata
  (`ganymede.host.wants`) shows that at the top; asking grants nothing.
  It needs a Ganymede server with `/api/host/grants`.

  While a notebook asks for something its grant doesn't give, the
  toolbar shows Notebook Access (a padlock), naming what it asks
  for; the button goes once the grant covers it.

- **Downloads** open the share sheet, where Save to Files keeps them.
- In the background iOS may stop the app's server; back in the
  foreground the app restarts it if it stopped answering.

## Publishing a notebook

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

**Publish as Web Page…** (File menu on the Mac, the ⋯ menu on the iPad
and iPhone, the toolbar and the Command Palette in the browser) saves
the notebook as one self-contained `.html` page to read and share: the
page `ganymede nb publish` writes, with prose, charts and tables, light
and dark. It asks how code shows (folded under each result, shown or
hidden), the line under the title (today's date unless you change it),
and whether the page has a Download notebook button. The button is on
unless the code is hidden, since the copy holds the code.

The server makes the page from the saved file, so unsaved edits are
saved first. It runs no notebook code and loads nothing from the
network, and the server's folder, your home folder and the server's
token are replaced (`.`, `~`, `[token]`) wherever they appear; the
notebook copy behind the button gets the same replacements and leaves
out the notebook's metadata and recorded parameters. Read the page
before you share it: anything else a cell printed is in it.

The page arrives as a download: a save panel on the Mac, the share
sheet on the iPad and iPhone. It needs a Ganymede server newer than
0.10.0, the app's own or a remote one. An older Ganymede ignores the
options, and a Jupyter server's export replaces nothing, so with either
the sheet says so and nothing is downloaded (unsaved edits are still
saved). The menu item is hidden only in the browser with no server.

## Spotlight

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

On the Mac, iPad and iPhone, a Spotlight search finds notebooks by their
title, headings and Markdown text, and choosing one opens it in
Ganymede. The notebooks indexed are the ones opened lately, and on the
Mac also those in folders added under Settings › General › Spotlight.
Outputs are never indexed, and code only with **Include code**. Files
over 5 MB are left out. A notebook's entry is updated when it is saved,
and the index is checked when the app comes to the front, so moved and
deleted notebooks leave it. Turning **Show notebooks in Spotlight** off
removes every entry. The index stays on the device.

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
