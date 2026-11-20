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
  inserts cells, sets the cell type and trusts the notebook. Its Share
  button downloads, exports or publishes the notebook. Its kernel
  button opens a popover with the kernel's state and memory, Interrupt,
  Restart, Kernel Log and the kernels to change to.
- The Cell menu runs, runs with parameters, inserts, moves and deletes
  cells, clears all outputs, collapses and expands code, goes to a definition and renames a symbol (see
  [Signatures, definitions and renames](#signatures-definitions-and-renames)), and opens Find; the Kernel menu interrupts (⌘.),
  restarts, changes and trusts. A code cell's chevron, left of its
  prompt, collapses its code to the first line, as on the web page
  (README, "Collapsing code"); the iPad's Cell menu has Collapse All Code
  and Expand All Code.
- View > Command Palette… (⇧⌘P) finds and runs the notebook, cell and
  kernel commands by name. [Keyboard shortcuts](shortcuts.md) lists the
  rest.
- Help > Ganymede Website, Ganymede Documentation and Apps Guide open
  ganymede-server.com, its docs and this page in the browser.

### Kernels

- Kernels come from the kernelspecs installed on the Mac, as with
  `ganymede serve`. Opened from the Finder, the app takes `PATH` from your
  login shell, so kernelspecs that run `node`, `deno` or `python3` start.
- Settings > Kernels lists the installed kernels, on the iPad and iPhone
  as well as the Mac, from the server kernels run on. Click a kernel's row
  to open its details: the display name, name and language, then what the
  server reports of the interrupt mode, protocol version, kernelspec
  folder, the command that starts it (with a Copy button), `env` and
  `metadata`. A field the server leaves out or sends empty is not shown.
  The folder needs Ganymede 0.14.0 or later
  ([tlockney/ganymede#890](https://github.com/tlockney/ganymede/issues/890));
  kernels on a remote, listed through the gateway, don't report it.

- The kernel menu also lists "TypeScript (cdp-kernel, in app)": cdp-kernel
  running inside the app, as on the iPad. Its cells get the
  [device API](device.md); kernels in their own process can't reach the
  app.

  The Mac's kernel popover and Kernel > Change Kernel, the iPad's kernel
  menu and the browser's kernel pickers mark kernels that offer the
  device API with a ◆, and the items carry an accessibility label,
  "offers the device API".

  The running kernel's implementation and version, from its
  `kernel_info_reply`, show as a line such as "cdp-kernel 0.14.0 ·
  node 24.11.0" (the name and version the kernel reports, and the
  runtime when its banner names one; "ipython 8.20.0" for IPython): at
  the top of the Mac's Kernel menu, in the kernel popover and the
  button's help tag, in the iPad's kernel menu, and as the tooltip of
  the browser toolbar's kernel label and picker. Nothing shows while no
  kernel runs or before it has replied.

- Kernels can run on a remote server instead. Add the remote in
  Settings > Remotes (its editor can switch kernels to it), then pick
  where kernels run from the kernel button in the toolbar or Kernel >
  Advanced > Run Kernels On. The sidebar's foot names where they run now
  ("This Mac" or the remote); its menu is where you open a terminal on
  a remote. The choice is app-wide, and switching shuts down running
  kernels, so the Mac asks first while any run. To work on another
  machine's own notebooks, connect it instead
  ([Connected machines](#connected-machines)).

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
- A terminal moves between the panel and a tab of its own without ending
  its shell: right-click its panel tab and choose Move to Tab, or click
  Move to Panel in a terminal tab's toolbar, which moves it into the
  panel of a notebook tab in the same window, else of the frontmost
  notebook window. Its screen and scrollback move with it.

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

Other files in the sidebar (not notebooks, and not the [data files](#data-files) below) open in a text editor window:
the system text view with syntax highlighting for Python, JavaScript,
TypeScript, JSON, Markdown, shell, YAML and TOML, line numbers,
auto-indent, and paired brackets and quotes. ⌘S saves. When the file
changes on disk the editor reloads it, or, with unsaved edits, asks which
version to keep.

### Data files

CSV, TSV, JSON and Parquet files open in the notebook's place, in the
window's page, on the Mac, iPad and iPhone and in a browser, read-only:

- **CSV and TSV** show a table you sort by a column (numbers sort as
  numbers; column types are guessed from the values), page through 50 rows
  at a time and filter with the Filter rows box, which keeps the rows with
  that text in any cell. Quoted fields, line breaks inside them, a byte
  order mark and rows of uneven length are read as spreadsheets read them.
- **JSON** shows a tree you fold and search.
- **Parquet** shows the rows as a table, with its schema under Schema,
  read by DuckDB in the app. The first Parquet file you open fetches
  DuckDB (36 MB, once, then kept) as SQL in a notebook does.

Large files are read in part so a phone doesn't run out of memory: a CSV
or TSV shows its first 10,000 rows (the bar says so; the page reads at most
the first 8 MB), and a Parquet file shows its first 10,000 rows. Before
reading, the view asks the file's size and refuses a CSV or TSV over 256 MB,
a JSON file over 16 MB and a Parquet file over 64 MB, because the server
reads a whole file into memory to send any of it. For those, New Notebook
from File queries the file with DuckDB, and Open as Text shows a JSON file.
Text is read as UTF-8, or UTF-16 when the file starts with a byte order
mark; a file in another encoding (Latin-1, Windows-1252) shows replacement
characters where its text doesn't fit.

**Open as Text** opens the file in the editor above (the apps; a browser has
no editor), and **New Notebook from File** writes a notebook beside the
file, named for it, with a cell that loads it with `jupyter.sql.load` and
one that shows its first rows, then opens it. A notebook on a kernel that
doesn't run in the file's folder can't find the file by name there: the
kernel in the browser, and the in-app kernel the iPad and iPhone apps use.
On those, run the notebook on a server's kernel, or load the file another
way. Open Recent and the Recents list keep to
notebooks. Renaming or deleting the open data file from the sidebar works as
for any file, and the page follows the rename or closes it.

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

Run Notebook, Run Notebook with Parameters and Run Cell ask the first
time they run a notebook, as [links](#links) do, with "Always allow"
kept per notebook and listed under Settings › General › Links. A run
with parameters asks on its own. The question is a dialog on the Mac, so a
Shortcut run by an automation waits for an answer the first time: run it
once by hand and choose "Always allow" before automating it.

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
`run` asks before it looks for the file, so a link to a missing file
and one you cancel get the same answer. `open` doesn't ask: it only
shows a notebook, though its reply tells the caller whether a file
exists. `new` asks, naming the folder and the template, unless it
writes into a folder under Settings › General › Spotlight and copies a
template from one. In those folders its reply, like `open`'s, tells
the caller whether a name is taken or a template exists.

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

The iPad and iPhone app opens `ganymede://open` links too, in two forms:
`ganymede://open?path=…` and
`ganymede://open?folder=<name>&file=<path in that folder>`, where `name`
is the folder's own name (for an Obsidian vault, the vault's folder) and
`file` is relative to it. If a link has `path` it is used, and `folder`
and `file` are ignored. A relative `path` is relative to the folder
Ganymede has open; `~/` paths don't work there, since the apps have no
home folder. A link opens notebooks (`.ipynb`) only, not folders. The
notebook opens only if it is in the folder Ganymede has open or in a
folder you granted. A link that names a file anywhere else gets
"Ganymede can't open this file" with a **Grant Access…** button, which
asks you to pick the folder and then tries the link again; the message is
the same whether or not the file exists. A `folder` link whose file
leaves that folder (by `..` or a symlink) is refused with no button, since
granting wouldn't help. Settings › Link Folders lists the granted folders,
adds more, and revokes them (swipe a folder, or Edit). Revoking stops
links into that folder, unless it is the folder Ganymede has open, and
doesn't close an open folder. If two folders Ganymede can use have the
same name, a `folder` link asks you to use `path`, open another folder,
or revoke one. A file in iCloud Drive that isn't on the device yet starts
downloading, and the link says so: open it again in a moment.

A notebook in a granted folder other than the open one asks first:
Ganymede switches to that folder, which restarts its server and stops the
kernels running in the folder it leaves. It doesn't switch while a text
file is open for editing in any window, since the editor would save into the new
folder: close the file first. `run` and `new` links work only on the Mac.
The apps never open an `x-success`, `x-error` or `x-cancel` address, so a
link to `x-callback-url/open` still opens the notebook and nothing is
sent back; a link whose callback isn't a valid URL (a `file:` address,
say) is refused, as on the Mac. The Mac takes `path` links only.

A link opens in the window that is showing, and closes nothing: a link
can come from any web page, and a terminal, an SSH session or an edit in
Settings would be lost. Its question or error shows over Settings, a
terminal or the editor, whichever is up. On the iPhone the notebook opens
behind them, and is there when you close them.

### The command line tool

The Mac app carries the [`ganymede` command](https://ganymede-server.com)
inside it, and Settings › General › Command Line Tool (or Ganymede ›
Install Command Line Tool…) links it into `~/.local/bin`, the folder
Ganymede's install script uses. **Install** creates `~/.local/bin` if it
is missing and makes `~/.local/bin/ganymede`, a link to the copy in the
app: no administrator password, no copy, and updating Ganymede updates
it. **Uninstall** removes the link. The section shows whether the link is
in place, and is absent from a build that has no tool to link.

Ganymede changes only a link into a Ganymede app
(`….app/Contents/Helpers/ganymede`). If you moved or replaced the app, the
link is stale and **Update Link** points it at this copy. Anything else at
`~/.local/bin/ganymede`, such as a `ganymede` from the install script or
Homebrew, is left alone and shown with what it is. **Replace…** asks
first, then moves it to the Trash (the file or link itself, never what a
link points at) and installs; if the Trash refuses, it stays. The link breaks if you move or delete the app, and Ganymede
won't install it while the app runs from the temporary place macOS uses
for an app opened straight from a download: move it to Applications and
open it again.

Ganymede takes its PATH from your login shell (`$SHELL -l`). If that
lacks `~/.local/bin`, Settings shows the line to add, with Copy:
`export PATH="$HOME/.local/bin:$PATH"`. Put it in `~/.zprofile` (with
zsh; otherwise your login shell's profile): a line in `~/.zshrc` reaches
your terminals but not Ganymede or Claude Desktop. If another `ganymede`
is on your PATH, Settings names it with its version, whether or not the
link is installed, and when it comes before the link, terminals run that
one. Claude Desktop's MCP config uses the bundled tool's full path when
Ganymede finds no `ganymede` on its PATH.

### Agents over MCP

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

Claude Code's command needs the [`ganymede` command](https://ganymede-server.com)
on its PATH, which [The command line tool](#the-command-line-tool)
installs from the app; Claude Desktop's config uses the bundled tool's
full path when no `ganymede` is on Ganymede's PATH. While MCP is on, the app writes a
[server info file](https://ganymede-server.com/docs/reference#server-info-file),
so `ganymede mcp` uses the app's server while Ganymede runs, and a server
of its own when it doesn't. The agent keeps the server it found for the
whole session, so start the agent after Ganymede to work in the app's
windows. Relative paths start in the agent's folder from `ganymede` 0.11.0
on; earlier versions start them at `/`.
The app writes the file in `~/Library/Jupyter/runtime`, or where
`JUPYTER_RUNTIME_DIR` or `JUPYTER_DATA_DIR` point in its own environment;
a value set only in your shell's startup files doesn't reach the app, and
then `ganymede mcp` won't find it.

The server listens on this Mac only and needs the token. Agents get a
token that opens `/mcp` and nothing else (the server's `mcp_token`), both
in the HTTP config and in the server info file `ganymede mcp` reads, so
an agent can't write files, start kernels or change grants over the REST
API, and the mode limits what it does over MCP. That holds only while the
agent can't run code: a cell can read the server's own token, and an
agent reads any output that shows it. Other readers of the server info
file, such as `jupyter server list`, get a URL the server refuses. While MCP is on, the token is kept
in the keychain and the port is the one the server had last time, so the
HTTP config, and an agent session already running, keep working after
Ganymede restarts.
Should that port be taken, Settings shows the new one. Reset Token makes a
new token, after which HTTP agents need the new config and running
`ganymede mcp` agents need restarting (`ganymede mcp watch` finds the
server again on its own). Changing these
settings restarts Ganymede's server, which restarts its kernels; turning
MCP off ends agents' sessions and revokes the token, so turning it on
again makes a new one.

A notebook can be edited on one server at a time: if an agent's own
`ganymede mcp` server has it open, Ganymede shows it read-only.

The Mac app gives its own server your account's full name with each
notebook it opens, so an agent working there is told who changed a
cell: `changed by "Thomas"` rather than `by "a person"`. The name goes
only to the app's server on this Mac, and to the other clients with
that notebook open (such as an agent, or JupyterLab), never to a remote
server. iPad and iPhone send no name.

### Sharing on your tailnet

With [Tailscale](https://tailscale.com) on the Mac, Settings › General ›
Tailnet opens Ganymede to your other devices at the Mac's tailnet name,
such as `https://box.tail1234.ts.net/`. List the Tailscale logins to let
in (yours, such as `you@example.com`), then turn on **Share on my
tailnet**. Those logins open the address in a browser without a token;
no one else gets in, since the server's token stays with the app. The
toggle stays off until a login is listed; Settings says so, and a
**Use Mine** button beside the field fills in the login the Mac is signed in
to Tailscale as.

The app runs `tailscale serve` for you, pointing HTTPS on the tailnet
name at its server on this Mac, and Settings shows the address. It won't
replace a `tailscale serve` setting on port 443 that it didn't make; it
says so instead. Turning sharing off removes its setting. The setting
outlives the app: while Ganymede isn't running, the address answers with
an error, and the next launch points it at the server again. The first time,
Tailscale may ask you to turn on HTTPS for your tailnet in its admin
console; Settings shows the message. Sharing restarts Ganymede's server
and its kernels.

The server believes the login Tailscale sends only on connections from
this Mac, so any program on the Mac could send one too: share only from a
Mac you alone use. MCP still needs its token. The details are in
Ganymede's [security notes](https://ganymede-server.com/docs/security#tailnet-identity).

### Remotes on your tailnet

A remote can leave its token empty when it is a Ganymede server that lets
you in by your tailnet login, such as another Mac sharing Ganymede as
above, or `ganymede serve` set up as in Ganymede's
[security notes](https://ganymede-server.com/docs/security#tailnet-identity).
The apps send that server a `Ganymede-Client` header, which marks their
requests as an app's rather than a web page's, on iPad and iPhone too.
On the Mac, the remote editor's **Tailnet Device** menu lists the other
devices on your tailnet and fills in `https://<device>.<tailnet>.ts.net/`;
picking a different device clears the token.

### Settings

Settings (⌘,) is one window with tabs. General makes Ganymede the
default app for notebooks, sets how it updates ([Updates](#updates)),
turns crash reports on or off, installs the command line tool
([The command line tool](#the-command-line-tool)), lists the notebooks links may run
([Links](#links)), turns on MCP for agents
([Agents over MCP](#agents-over-mcp)), and shares Ganymede on your
tailnet ([Sharing on your tailnet](#sharing-on-your-tailnet)). Appearance
sets the code font (below). Kernels
picks where kernels run, this Mac or, as on iPadOS, one remote's server,
and lists the kernels installed there. Remotes keeps a list of remotes:
Jupyter or Ganymede servers, SSH hosts, or both; tokens are kept in the
keychain. Agent turns the optional agent on and picks its provider, model
and API key, with a test. Shortcuts lists the notebook's keyboard
shortcuts and rebinds them.

Developer settings stay hidden until General's **Show Developer
Settings** is on ([Developer settings](#developer-settings)).

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
for fonts that have them, ligatures and a style: Standard, or a few named
sets of the font's alternates. View > Bigger Code Font (⌘+), Smaller Code
Font (⌘−) and Actual Code Font Size (⌘0) change the size from any window.

The Markdown Font beside it sets the font of text cells: System, Serif
(the font of pages from `ganymede nb publish`), or Monospace (the code
font).

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
  inserts cells, sets the cell type, runs with parameters, clears all
  outputs, restarts or
  changes the kernel, shuts down other kernels, saves, renames,
  downloads, exports and trusts. With a
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
- **Links**: other apps can open a notebook with a `ganymede://open`
  link, in the folder Ganymede has open or one you granted in
  Settings › Link Folders; see [Links](#links).

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
  reconnect. Hosts running Tailscale SSH need no key; see
  [Tailscale SSH](#tailscale-ssh).
- **Data files** (CSV, TSV, JSON, Parquet) open in the page, as on the
  Mac ([Data files](#data-files)); Open as Text opens the editor.
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
  changes only when a run publishes again. Tapping the widget opens
  that notebook. The switch applies at once, including to notebooks
  already open: while it is off, `device.widget.update` fails
  `unavailable`.

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

  On the Mac, where the app's server serves the whole disk, the default
  for reads is the folders under Settings › General › Spotlight: with
  none there, a notebook may read only itself. Adding or removing a
  folder restarts the server and its kernels. On the iPad and iPhone
  the default is the notebook folder.

- **Downloads** open the share sheet, where Save to Files keeps them.
- In the background iOS may stop the app's server; back in the
  foreground the app restarts it if it stopped answering.

### Tailscale SSH

On iPad and iPhone, a host running
[Tailscale SSH](https://tailscale.com/kb/1193/tailscale-ssh) signs you in
by your tailnet login, with no key: the app asks for that first, then
offers its key. If the host refuses, check the tailnet's SSH policy as
well as `authorized_keys`.

In Tailscale SSH's check mode, the terminal shows Tailscale's message and
link. Tap the link, approve in the browser, and the sign-in goes on; the
app waits up to 5 minutes. Approving on the same iPhone or iPad sends the
app to the background, which can drop the connection: if the terminal
says it disconnected, reconnect, and Tailscale lets you in without
asking again for its check period.

## Connected machines

A connected machine is another computer running `ganymede serve`: a Mac
mini, a laptop, a cloud box where an agent keeps a journal. Its files, its
live notebooks and its kernels open in the app next to this device's. Each
remote in Settings > Remotes that has a server URL is a machine; a remote
with only SSH stays in Settings for shells.

- **Places.** On the Mac and iPad the top of the sidebar names the place
  you are in, with a dot for reachable or offline, and lists the others.
  On the iPhone the folder list starts with a Places section. Picking a
  machine opens it in its own window (a new tab on the Mac); windows are
  independent, so one can show the Mac mini while another shows this Mac.
  On the iPad and iPhone the scene shows one place at a time: the
  machine's sidebar has the switcher back to this device.
- **A machine's window** has Files, Journals, Running and Search tabs. Its
  tab and title carry the machine's name ("Orbits · m4mini"). A notebook
  opens live in the machine's room, on the machine's kernels, and saves
  there; Running lists the machine's kernels. Recents are the machine's
  own: the same path on this device and on a machine stay apart.
- **Journals** lists the notebooks an agent is in on that machine now, or
  last changed: the agent's name, "running" while it is there, otherwise
  when it last wrote. Picking one opens the notebook. It needs a machine
  whose Ganymede lists open rooms (ganymede#893); an older one says so.
- **When a machine stops answering,** its open notebooks turn read-only
  and a banner reads "_machine_ went offline · Reconnecting…". They are
  editable again when it is back. There is no offline editing.
- **What a machine's window doesn't get.** The device API, Notebook
  Access, the Shortcuts bridge, the app's editor for text files, the
  Agent's keys, your name in the notebook's presence and `ganymede://`
  links are for this device's windows only. Neither Spotlight, File > Open
  Recent nor the Recents list in the app's sidebar include a machine's
  notebooks. A machine window's page has no native toolbar: it draws its
  own, as the web app does.

The app reaches a machine through its own server, which forwards a fixed
list of routes to the machine with the machine's token, so no token is
handed to a page.

## Type errors

> [!NOTE]
> Needs cdp-kernel 0.13.0 or later: an older kernel doesn't answer, and
> nothing is underlined.

Code cells of a TypeScript or JavaScript kernel underline type errors as
you type, in the Mac, iPad and iPhone apps and in the browser. Pause for
a moment after an edit and the kernel's language service checks the cell
against the cells that ran; hover a mark to see the message and its
TypeScript error number (`TS2322`). Each cell is checked with what the
cells that ran declared, so a name an earlier cell declares is not an
error, nor is importing a package no cell has run yet.

cdp-kernel's kernels answer: Node, Deno and Bun, and the in-app kernel
and the kernel in the browser, with
[the TypeScript the app ships](#typescript-in-the-in-app-kernel). Other
kernels show nothing: other languages, and a cdp-kernel started with
`--no-language-service`. A kernel that can't tell yet (TypeScript is
still loading, or the check took too long) leaves the cell's marks as
they were, and the cell is asked again a few times over the next half
minute, so the marks show once TypeScript has loaded. Marks go when the
kernel restarts or changes, and when the cell becomes Markdown or raw.

**Show or Hide Type Errors** in the Command Palette turns this on or off.
It is on by default, and the app remembers the choice; other windows of
the app follow it. There is no View menu item
for it yet.

## Signatures, definitions and renames

> [!NOTE]
> Needs cdp-kernel 0.14.0 or later: an older kernel doesn't answer, and
> none of this does anything.

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release. Rebinding F12 and F2 in the Shortcuts sheet is
> new; the keys themselves already work in the latest release.

Code cells of a TypeScript or JavaScript kernel get three more things from
the kernel's language service, in the Mac, iPad and iPhone apps and in the
browser:

- **Signature help.** Typing `(` or `,` inside a call shows the call's
  signature above the cursor, with the argument you are on marked and its
  documentation. It follows the cursor, and closes on Esc, when the cursor
  leaves the call, or when the cell loses focus.
- **Go to definition.** ⌘-click (Ctrl-click off the Mac) on a name, or F12
  with the cursor in it (by default; you can rebind it in the Shortcuts
  sheet), jumps to where the notebook declares it and
  selects the name there. A name declared outside the notebook, in a
  package or in the runtime, does nothing. In a code cell whose kernel
  answers, ⌘-click (Ctrl-click elsewhere) goes to the definition instead
  of adding a cursor, CodeMirror's usual meaning of it; Alt-drag still
  makes a rectangular selection. Other cells, and the other mouse
  buttons, keep the usual clicks.
- **Rename symbol.** F2 (by default; you can rebind it in the Shortcuts
  sheet) with the cursor in a name asks for the new name;
  Enter renames it, Esc cancels. The declaration and its uses change in
  every cell they are in, as one change per cell, so ⌘Z in a cell takes
  back that cell's part. A rename the kernel refuses (a keyword, a package
  export or global such as `process`, a name no cell declares, a name that
  isn't a valid name) shows the reason in a notice and changes nothing. A
  name that a later cell declares again is a separate variable: rename it
  from that cell.

**Go to Definition** and **Rename Symbol…** are also in the Command
Palette (the second asks for the name there), and in the Mac's and iPad's
Cell menu. They act on the cursor of the active cell.

These work only against a cdp-kernel that answers, the in-app kernel and
the kernel in the browser included; against another kernel, or a
cdp-kernel started with `--no-language-service`, nothing shows and the
keys do nothing. They need no setting: nothing runs
until you press a key or click. A kernel that can't tell yet (TypeScript is
still loading, or the kernel's own time budget for the request ran out)
shows no signature and moves nowhere; a rename then says the service
can't tell. A kernel that doesn't answer at all within 10 seconds is
treated as not answering: the request is dropped, and a rename does
nothing, with no notice. If a cell changes
while the kernel is answering, the answer is dropped, so a rename never
lands on text it wasn't made for.

## TypeScript in the in-app kernel

The in-app kernel (iPad, iPhone, and the Mac's in-app kernel) and the
kernel in the browser get typed completion and tooltips (declared types,
not only runtime values), [type errors](#type-errors), and
[signature help, go to definition and rename](#signatures-definitions-and-renames)
from TypeScript 6, which the app ships for them: TypeScript's own
`typescript.js` and its ES library declarations, 9.7 MB (1.8 MB
compressed). It loads in a Worker of its own the first time a notebook
asks for typed help, which takes a second or so on a Mac (not yet
measured on an iPhone); until then completion offers runtime values.
It works offline, and a browser keeps it after the first load.

What it checks against: the ES libraries and what a cell in a Worker
reaches for (`console`, timers, `fetch`, `URL` and so on), and `jupyter`'s
own types. The DOM's types aren't loaded, since cells run in a Worker. An
imported package is `any`: its types aren't fetched. TypeScript 6 is the
last version that runs in a web page, so syntax or library types newer
than it are unknown here, while the Mac's Node kernels may use a newer
TypeScript.

## Live Markdown preview

A Markdown cell can render as you type, the way Obsidian's live preview
does, in the Mac, iPad and iPhone apps and in the browser. Headings,
bold and italic, strikethrough, inline code, links, bullet lists, block
quotes, fenced code and horizontal rules show as they will read, with the
Markdown that makes them hidden. The line or element the cursor or
selection is in shows its raw Markdown again, so you can edit it:

- bold, italic, strikethrough, inline code and links show raw while the
  cursor is in them or touches them;
- a heading, a list item, a quote line or a rule shows raw while the
  cursor is on its line;
- a fenced code block shows its fences while the cursor is on any line of it.

The text of the cell doesn't change, so undo, copy, selection and saving
work on the Markdown as written. Running the cell gives the full render,
as before. Tables, math, images, task-list boxes and HTML stay raw for
now, and code in a fenced block isn't highlighted by its language yet.
The prose follows the Markdown font in Settings, code the code font, and
it follows dark mode.

This is an experiment, off by default. **Show or Hide Live Markdown
Preview** in the Command Palette turns it on or off for every Markdown
cell; the app remembers the choice, and other windows of the app follow
it. There is no View menu item for it yet.

## Journal view

A notebook a Claude session keeps through `ganymede mcp` reads better as a
journal than as cells. **View as Journal** shows the open notebook that
way: the toolbar's journal button, View › View as Journal in the Mac app,
the notebook's More menu on the iPad and iPhone, or the Command Palette.
**Open as Notebook** goes back to full editing, in the same live room and on the same kernel.
A notebook with cells an agent wrote opens as a journal; any other opens as
a notebook. Your choice for a file holds until you close the app or page,
including when the file is reopened after a Reload or a server restart,
and it goes with the file when you rename or move it.
While the journal shows, the notebook's run, insert, cell-type and edit
commands (toolbar, Command Palette and keys) are off, because they would act
on cells you can't see. It works in the browser and in the Mac, iPad and iPhone apps,
on a Ganymede server, and there is no setting for it.

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release. In 0.14.0 the Mac app's toolbar and menus and the
> iPad and iPhone menu have no View as Journal (use the Command Palette),
> the status line doesn't list agents, and the composer has no line
> about who is in the room.

- **The header** comes first: the notebook's title (its metadata title, else
  the file name), then its kernel, who started it and when (the first agent
  that wrote a cell, and the earliest time an agent did), and the cell count.
- **Who wrote each cell** is in a left column: _Agent ran it_ (with its
  execution count), _Recorded step_, _Agent note_, or _Person_ for a cell
  without agent metadata, with the author and time where the cell has
  them. A cell the agent revised in place has a **rev N** chip; hover it,
  or tap it, to read the earlier sources.
- **Code is folded**, as `▸ first line · N lines`, with its outputs shown;
  click or tap to unfold. Markdown cells are rendered, with their attached
  images. Outputs render
  as in the notebook, from the cell's trust: an HTML output of a cell
  that isn't trusted is sanitized.
- **Following along**: new cells at the end scroll into view. Scroll up
  and it stops, and a **N new cells · Follow** button brings you back.
- **The status line** names who is in the room ("Only you are here" when
  no one else is) and how long ago someone else last changed the
  notebook; your own edits don't count. It lists the people with
  presence in the room, and the agents working through `ganymede mcp`
  that the server's rooms list names (a server older than 0.14.0
  can't say). When a client marks a cell as running (JupyterLab
  does; Ganymede's own runs don't yet), it adds "name is running cell N".
- **Writing**: the box at the bottom adds your text as a Markdown cell at
  the end (**Add Note**), or as an `@agent` request (**Ask the agent**),
  which `ganymede mcp watch` reports to the agent once the text has
  stayed the same for a few seconds. Above the buttons, a line names the
  agents in the room, or says none is. A request is saved in the notebook
  either way. While the notebook stays open, an agent running `ganymede
mcp watch` on its folder is told about it, in the room or not; after
  that it waits until an agent reads the notebook. Everything else is
  read-only.
- **Reconnecting…**: when the connection to the server drops, the journal
  is read-only until it is back.

## DuckDB console

A DuckDB prompt that opens in the window's page, where a notebook would,
in the Mac, iPad and iPhone apps and in a browser. Open it with **New
DuckDB Console** in the Command Palette, File > New DuckDB Console on the
Mac, or File > New DuckDB Console on the iPad. Opening a notebook or file
closes it, as it closes any page; the notebook menus are disabled while it
shows.

Type SQL in the box at the bottom. **Enter** runs it when it ends with a
`;` (a `;` inside a string or a comment doesn't count), and otherwise adds
a line; **Shift-Enter** runs it whatever it ends with. Several statements
pasted together run in order, and stop at the first error. **↑** and **↓**
walk what you entered, an input at a time, when the cursor is on the first or last line.
Each statement is kept above the box with its result: the rows as a table
you sort, page and filter as in a notebook (the first 10,000 rows of a
bigger result), or the row count, `OK`, or DuckDB's error, with the time
it took. An error stays in the scrollback and the console goes on.
Lists, structs, maps, intervals, blobs, timestamps and decimals too wide for a
double show as the text DuckDB writes for them. `.tables` shows the tables,
and `.schema <table>` describes one; a dot command takes its line and may
come between statements. An input entered while another still runs waits for it.

The box and the statements above it are highlighted as DuckDB SQL, in
the notebook's editor colors (light and dark). In a notebook, the text of a
template string tagged `sql` (`` jupyter.sql`select …` ``, `` sql`…` ``) in a
JavaScript or TypeScript cell is highlighted as DuckDB SQL too, with `${…}`
left as JavaScript, and a Markdown fence marked `duckdb` is highlighted the
same way.

DuckDB wasm is the build SQL in a notebook uses, in a worker of its own: the
first console fetches it (36 MB, once, then kept), and later ones run offline.
There is one DuckDB for as long as the console is open, so the tables you
create stay between statements, and its worker ends when the console
closes. Nothing is saved when it closes.

A quoted path in a statement that names a CSV, TSV, JSON or Parquet file in
the window's folder (`select * from 'data/moons.csv'`) reads the file
through the server and gives it to DuckDB before the statement runs, the
first time a statement names it. A path is relative to the window's folder,
and `..` can't leave it; a URL or an absolute path is left to DuckDB, and
only `'single quoted'` strings count. Any such string is read, wherever it
is in the statement (`where src = 'big.parquet'` reads `big.parquet` too). A file is read in full, up to what
the [data view](#data-files) holds in memory: 8 MB for a CSV or TSV, 16 MB
for JSON and 64 MB for Parquet. A bigger file is refused with a note, since
a query over part of a file would answer wrongly; a notebook on a kernel can
query it. A file read once is not read again while the console is open, so
a change on disk shows after you open a new console (**New DuckDB Console**
again). Renaming or moving the folder, in the app or in the page's
sidebar, keeps the console and what it has read; deleting it closes the
console. A file that isn't there is DuckDB's error. The console can't write to the folder: `copy ... to`
makes a file DuckDB holds in memory only (rerun in an exported notebook on a
kernel, it writes a real file there).

**Export to Notebook** writes `duckdb-console.ipynb` in the folder (a number
after the name when it is taken) and opens it, which closes the console. It
has a `jupyter.sql.load` cell for each file the console read, loading it as a
table named for the file with `_file` after it (and `_2`, `_3` for files of
one name in different folders), then one `jupyter.sql` cell
for each statement that ran without an error, in order. The statements read
files by the paths you typed, relative to the notebook's folder, so a
TypeScript kernel that runs in the folder reruns the session. The kernel in
the browser and the in-app kernel on iPad and iPhone can't find files by
name, as for New Notebook from File.

## Publishing a notebook

**Publish as Web Page…** (File menu and the toolbar's Share button on
the Mac, the ⋯ menu on the iPad
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
0.10.0. An older Ganymede ignores the options, so the sheet says so and
nothing is downloaded (unsaved edits are still saved). It isn't offered
with no Ganymede server; on a connection to a Jupyter server, whose
export replaces nothing, the sheet refuses its page the same way.

## Running with parameters

**Run with Parameters…** (Cell menu on the Mac, the ⋯ menu on the iPad
and iPhone, the Command Palette in the browser, and its toolbar's More
menu in a narrow window) runs the notebook as a program, the way `ganymede execute -p
--results` does ([Programs](https://ganymede-server.com/docs/programs)):
top to bottom in a new kernel on the server, with the parameters you
type (a JSON object, such as `{"day": "mon"}`) in `jupyter.params`. The
sheet shows the results the notebook names with `jupyter.result`, or
where it failed. The notebook in the window doesn't change. The server
runs the notebook as this window shows it, unsaved edits included, while
the window is connected to it live; otherwise it runs the saved file. The field starts with the
parameters you last ran it with here, or else those `ganymede execute
-p` recorded in the notebook. **Save the executed notebook** keeps the run's outputs as a copy
under `runs/` (Ganymede 0.10 or later). Stop (or Esc) ends the run and
its kernel. It needs a Ganymede server, 0.8 or later; a Jupyter server
has no such run.

## Exporting a notebook

**Export As › Markdown** and **Script** (File menu and the toolbar's
Share button on the Mac, the ⋯ menu
on the iPad and iPhone, the Command Palette and the toolbar's More menu
in the browser) save the notebook as a Markdown file or as its code in
the kernel's language (`.ts`, `.py`, …), as JupyterLab's Save and Export
Notebook As does. Markdown with images arrives as a zip of the text and
the images. The server makes the file from the saved notebook, so
unsaved edits are saved first. Unlike a published page, nothing is
replaced: like Download Notebook, the file holds what the notebook does.
Export needs a server connection, Ganymede or Jupyter.

## Spotlight

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
page's own error reports follow the same choice. Ganymede's
[privacy page](https://ganymede-server.com/docs/privacy) has the rules.

The test buttons (an error, a Swift crash, a Rust panic) are in
[Developer settings](#developer-settings), and work only while crash
reports are on.

## Developer settings

Settings has a Developer tab on the Mac, and a Developer row on iPad and
iPhone, that stays hidden until **Show Developer Settings** is turned on
at the bottom of General (on iPad and iPhone, in Settings, above Help).
It is off by default, and turning it off hides the tab again. It holds:

- **Engine Benchmark.** **Run Benchmark** runs the workloads of the
  engine benchmark (ganymede's `spikes/v8-engine`: a start, CPU work,
  TypeScript stripping, large output and memory) on the V8 inside the app
  (jitless) and on WebKit's Workers, the engine of today's in-app kernel.
  It takes under a minute: keep that screen open and the app in front until it's
  done; the results say if you left. Each
  workload shows cold and steady times in milliseconds for each engine,
  the device, the OS and the app's peak memory footprint. V8 starts once
  per process, so quit and relaunch the app between runs for steady
  numbers. A build whose library has no V8 says so and runs only the
  WebKit half. **Share Results** shares a
  `results-<time>.json` file, and **Copy Results** copies its text; `node
bench/report.mjs` in that folder turns the file into tables.
- **Crash Report Tests.** Buttons that send a test error or crash the app
  with a Swift crash or a Rust panic, to check what a real failure sends.
  They are off while crash reports are, and the report of a crash goes out
  the next time the app launches. They were in General's crash report
  section.
