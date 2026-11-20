## 2026-11-20, DuckDB console as a tab; inspector only on notebook tabs (#729)

On the Mac the DuckDB console was the page's content, so File > New DuckDB
Console replaced the open notebook, and the inspector showed beside a
console with nothing to list. It is now a tab, and the inspector follows
the tab.

**Console tab.** `WindowTarget.console(folder:id:)` is a window of the
`WindowGroup(for: WindowTarget.self)`, so it is a tab like any notebook
window (`WorkspaceTabs.join`). The `id` makes each one a different value:
opening by value brings forward a window that has the value, and a new
console must not. File > New DuckDB Console opens `.console(folder:id:)`
directly (`NewCommands`), so it no longer needs a page; it is still
disabled without a window folder (see below). The page loads with `dir=<folder>&console=duckdb`; `console`
stays in the URL (it is not a `LAUNCH_PARAMS` entry), so a reload keeps the
console. With the backend connected the page sets its console folder to
`dir`. A restored console tab decodes its saved target, so it comes back on
the same folder, and the page makes a new engine.

`WindowTarget(page:)` reads a console page back as a console, but the page
doesn't know the tab's id, so it gets a new one. `follow(_:)` in
`ContentView` therefore compares with `WindowTarget.shows(_:)`, which
treats a console as the console of that folder whatever its id, and keeps
the tab's own target. Plain `==` would replace the target (and, through
`onChange(of: target)`, the saved scene state) with a console nobody
opened.

**`openTab` message.** The Mac's web view registers an `openTab` handler
(only where it registers `openFile`, so not for a machine window, and not on
iOS). The body is `{ path }` for a notebook or data file, or `{ console:
"duckdb", folder }`, server paths as `openFile` takes them; `TabRequest`
parses it (main frame only) and `target(root:)` makes the window to open.
A file goes through `WindowTarget(opening:)`, as the sidebar's Open in New
Tab does. The page asks for a tab in two cases, both only when the handler
exists: `new-duckdb-console` (the Command Palette entry, or a page that
isn't the console's) posts a new console, leaving its own content, and a
console tab's `open` command and its console's export post `{ path }`
instead of opening in the page. Without the handler (a browser, the iPad
app) both work as before. `close` returns false in a console tab: the
console lives until its tab does.

**Inspector.** `InspectorController.available` is whether the tab shows a
notebook; `isVisible` is `isShown && available`. `isShown` is the person's
choice and is what `@SceneStorage("inspector.shown")` keeps, so a console
tab never overwrites it: it is not changed while the inspector is
unavailable (the toolbar button is not drawn and ⌥⌘0 is disabled). The
workspace draws the inspector, and the strip that stands for it when
another area fills the window, only with a notebook;
an inspector filling the window that goes away gives the layout back
(`InspectorAvailability`). `wantsVariables` follows `isVisible`, so the
page stops reading variables on a console tab. "Shows a notebook" is
`PageState.hasNotebook` once the page is `ready` (has posted a state with a
backend); until then a `.file` target that isn't a data file counts, so
opening a notebook doesn't flash the inspector away and back
(`InspectorController.showsNotebook`).

Known limitations: a console tab's folder doesn't follow a native rename or
move of its folder (as a `.folder` window's doesn't today). File > New DuckDB
Console is disabled without a `windowFolder`, which every notebook window
sets (the start screen included) and a machine window doesn't.

A console tab opens every notebook in a tab of its own (`openNotebook` in
`App.tsx`: New Notebook, Open Example Notebooks, a dropped file, the
console's export), so `open` never joins `console` in its URL; if it did,
`WindowTarget(page:)` reads `open` first, as `readLaunch` does.

Not changed: the iPad (`#if os(iOS)` paths) keeps the console in the page,
and has no inspector. A machine window uses the page's own chrome.

Swift wasn't compiled here (Linux): CI is the first compile of the
`WindowTarget`, `TabRequest`, `InspectorController`, `WebView` and
`ContentView` changes. Tests: `WindowTargetTests` (page URL, reading it
back, `shows`, saved round trip, title, `TabRequest`),
`InspectorControllerTests`; in the page, `App.test.tsx`, `launch.test.ts`
and `native.test.ts`.
