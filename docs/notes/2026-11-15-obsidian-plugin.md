## 2026-11-15, Obsidian notebook viewer (#636)

Step 1 of the Obsidian notebook library spike: `packages/obsidian`, a
read-only Obsidian plugin that opens `.ipynb` files in a vault on desktop
and mobile. The vault syncs through Obsidian Sync, so notebooks reach
the iPad and iPhone without Ganymede's help, and Ganymede stays the
runtime. It is installed by copying `dist/` into
`<vault>/.obsidian/plugins/ganymede-notebooks/`, not through Obsidian's
directory.

`src/notebook.ts` parses nbformat 4 into a model (no DOM, no Obsidian):
source as a string or a list, missing fields, unknown cell types as raw,
ANSI removed from streams and tracebacks, and one representation chosen
per output by MIME preference (Ganymede's named result, HTML, SVG,
bitmaps, Markdown, JSON, plain text). `src/render.ts` builds the DOM from
it and takes Obsidian's Markdown renderer as a callback, so it is tested
under jsdom. `src/view.ts` is the `FileView`; it re-renders on the vault's
modify event, which is how Sync updates arrive.

Security: Obsidian desktop is Electron with Node access, so an output
that ran script would be code execution. HTML outputs go in an iframe
with an empty `sandbox` and a CSP meta (`default-src 'none'`); SVG only
as an `<img>` data URL; bitmaps only for a fixed list of types; text
through `textContent`; no `innerHTML` with notebook content. The
iframe has a fixed, resizable height because no script can report one.

"Open in Ganymede" (`ganymede://open?path=`) is added only on macOS
desktop with a file-system vault; on iPad and iPhone Ganymede can't read
Obsidian's sandbox. The action uses the `ganymede://open` URL the Mac
app already handles (`AppURL.swift`, `AppURLHandler.swift`, #471), so
the apps need no change for it.

`npm run check` type-checks and builds the package; the build job always
runs, so `scripts/ci-changes.sh` skips the app jobs for changes only
under `packages/obsidian/`. The `obsidian` typings package (1.14.4) is
the only new dependency; it pins `@codemirror/view` 6.43.13 as a peer, so
npm installs a second, types-only copy under `packages/obsidian`.

Not verified here: the plugin hasn't been loaded in a real Obsidian;
`MarkdownRenderer.render` and `minAppVersion` 1.5.0 come from the typings
and memory, not a run. Next: step 2, pointing the journal plugin and the
Mac app at a vault folder and using it for a while (check Obsidian Sync's
"Sync all other types" setting and its file size limit); step 3, search
inside notebooks (a plugin index or Markdown summaries).
