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
per output by MIME preference (Ganymede's named result, SVG, bitmaps,
HTML, Markdown, JSON, plain text: the same relative order as Ganymede's
HTML export for the types both show; empty HTML, Markdown and SVG, and
bitmaps that aren't base64, fall through to the next type). `src/render.ts` builds the DOM from
it and takes an optional highlighter callback, so it is tested under
jsdom; `src/viewlogic.ts` holds the view's decisions for the same reason. `src/view.ts` is the `FileView`; it re-renders on the vault's
modify event, which is how Sync updates arrive.

Security: Obsidian desktop is Electron with Node access, so an output
that ran script would be code execution. HTML outputs go in an iframe
with an empty `sandbox`, `referrerpolicy="no-referrer"` and a CSP meta
(`default-src 'none'`; a clicked link can still navigate the frame, and no
script runs); SVG only
as an `<img>` data URL; bitmaps only for a fixed list of types; text
through `textContent`; no `innerHTML` with notebook content. The
iframe has a fixed, resizable height because no script can report one.
Code cells never go through Obsidian's MarkdownRenderer, whose output
every plugin's post-processors see (Execute Code adds run buttons, for
one): the plugin builds `pre > code` with `textContent` and calls
Obsidian's Prism on it. The language is lowercased (`deno` maps to
`typescript`) and used only if it is a plain token (`[a-z0-9+#-]`), as a
class and a Prism lookup.

Markdown cells and outputs don't go through Obsidian's renderer, which
runs other plugins' processors (Dataview JS, inline `$=` queries) and
passes raw HTML through. `src/markdown.ts` parses with `marked`, reads
the HTML with `DOMParser`, and copies only allowlisted elements and
attributes (http, https, mailto and `#` links; `data:` PNG, JPEG, GIF
and WebP images). The trade-off is no wikilinks, embeds or callouts in
notebook Markdown. Math (`$…$`, `$$…$$`, not in code) is swapped for
placeholders before `marked` and restored as literal source in a
`ganymede-nb-math` span, so `*` and `_` in it survive; it isn't typeset.
`marked` 17.0.6, already in the lockfile through
JupyterLab, is bundled into `main.js`.

The notebook sits in Obsidian's reading-view root classes so the theme
styles it. Code cells are folded under a `Code [n]` summary, as in
Ganymede's published `code=folded`; a header action toggles them all. Expanded cells stay expanded across
a re-render, matched by cell id (else position); modify events re-render
after 300 ms of quiet, and Prism loads once per view.
Charts get a white background so they read in dark themes.

SVG outputs get the `xmlns` (and `xmlns:xlink`) that Observable Plot's
serializer leaves out, by the rule of Ganymede's HTML exporter, since an
`<img>` can't draw them without it.

"Open in Ganymede" (`ganymede://open?path=`) is added only on macOS
desktop with a file-system vault; on iPad and iPhone Ganymede can't read
Obsidian's sandbox. The action uses the `ganymede://open` URL the Mac
app already handles (`AppURL.swift`, `AppURLHandler.swift`, #471), so
the apps need no change for it.

`npm run check` type-checks and builds the package; the build job always
runs, so `scripts/ci-changes.sh` skips the app jobs for changes only
under `packages/obsidian/`. The `obsidian` typings package (1.14.4) and `marked` are
the only new dependencies; it pins `@codemirror/view` 6.43.13 as a peer, so
npm installs a second, types-only copy under `packages/obsidian`.

Not verified here: the plugin hasn't been loaded in a real Obsidian;
`MarkdownRenderer.render` and `minAppVersion` 1.5.0 come from the typings
and memory, not a run. Next: step 2, pointing the journal plugin and the
Mac app at a vault folder and using it for a while (check Obsidian Sync's
"Sync all other types" setting and its file size limit); step 3, search
inside notebooks (a plugin index or Markdown summaries).
