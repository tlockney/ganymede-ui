# Ganymede Notebooks for Obsidian

A read-only [Obsidian](https://obsidian.md) plugin that opens `.ipynb`
notebooks in a vault, on desktop and mobile (iPad, iPhone). The vault
becomes a notebook library; Ganymede stays the runtime. This is a spike
for [#636](https://github.com/tlockney/ganymede-ui/issues/636). It is not
published to Obsidian's plugin directory and is not part of the app or
the page.

## Build

```sh
npm ci
npm run build -w @ganymede-ui/obsidian
```

This writes `packages/obsidian/dist/` with `main.js`, `manifest.json` and
`styles.css`.

## Install

Copy those three files into `<vault>/.obsidian/plugins/ganymede-notebooks/`
and enable **Ganymede Notebooks** under Settings › Community plugins.

With Obsidian Sync, turn on syncing of installed community plugins so the
plugin reaches your other devices, and under Selective syncing turn on
**Sync all other types** so `.ipynb` files sync. Check Obsidian Sync's file
size limit for your plan: notebooks with large outputs can exceed it.

## What it shows

- Markdown cells, rendered by the plugin (see Security) and styled by Obsidian's reading-view CSS.
- Code cells folded under a `Code [n]` summary (a header action shows or hides all code), syntax-highlighted with Obsidian's Prism when it knows the language (plain text otherwise). The language is used only as a class and a Prism lookup, and only if it is a plain token.
- Outputs: streams, errors (ANSI colors removed), plain text, JSON,
  Markdown, images (PNG, JPEG, GIF, WebP, SVG) and HTML. SVG from kernels that omit the `xmlns` attribute (Observable Plot's) gets it added, as Ganymede's HTML exporter does, so it draws. Ganymede's named
  results (`application/vnd.ganymede.result+json`) show as `name = value`.
  When an output has several representations, one is chosen: Ganymede
  result (with a non-empty name), SVG, bitmap, HTML, Markdown, JSON, plain text: the same relative order as Ganymede's HTML export for the types both show. Empty HTML, Markdown and SVG, and bitmaps whose data isn't base64, are skipped for the next type. Consecutive outputs of one stream are merged and carriage returns overwrite (progress bars). An error shows its traceback, or `name: value` without one. Images in Markdown cells given as `attachment:` names show for PNG, JPEG, GIF and WebP. Code cells you expanded stay expanded when the file changes (matched by cell id, else position); a change re-renders after 300 ms of quiet. Math (`$…$`, `$$…$$`) shows as its source, not typeset.
- Changes that arrive while a notebook is open, such as from Obsidian
  Sync, re-render it. A notebook that can't be read shows why in the
  view.
- On macOS desktop, an **Open in Ganymede** action in the view's header
  opens `ganymede://open?path=<absolute path>`, which the Mac app handles. It isn't offered on iPad
  or iPhone yet. The Ganymede app there opens
  `ganymede://open?folder=<name>&file=<path in that folder>` links into a
  folder you granted in Settings › Link Folders (a build of `main`; see
  [the apps docs](../../docs/apps.md#links)), and the plugin's action for it is
  planned in [obsidian-notebook-library#8](https://github.com/tlockney/obsidian-notebook-library/issues/8).

## What it does not do

No running, no editing, no widgets (they show their plain-text fallback or
an "unsupported output" note), no LaTeX or JavaScript outputs, no search of
outputs yet. Only nbformat 4 is read.

## Security

Obsidian's desktop app is Electron with Node access, so a script that
ran from a notebook output would run with the person's privileges. The
viewer therefore:

- renders HTML outputs only in an `<iframe sandbox="">` (no scripts, no
  same-origin access), `referrerpolicy="no-referrer"`, whose document
  carries a Content-Security-Policy of
  `default-src 'none'; img-src data:; style-src 'unsafe-inline'`. A link
  clicked inside an HTML output can still navigate the frame (no script
  runs there);
- shows SVG only as an `<img>` data URL, never inline, and bitmaps only
  for the listed image types;
- puts text, stream and error output in `<pre>` through `textContent`;
- never sets `innerHTML` with notebook content.

Markdown cells and Markdown outputs are untrusted too, and Obsidian's own
renderer would run other plugins' processors on them (Dataview JS, inline
`$=` queries) and pass raw HTML through. So the plugin renders them itself:
`marked` (bundled, the plugin's only runtime dependency) parses them, the
HTML is read with `DOMParser` (inert), and only allowlisted elements and
attributes are copied into the page. Scripts, frames, objects, SVG and
styles are dropped; links keep only `http:`, `https:`, `mailto:` and `#`;
images keep only `data:` PNG, JPEG, GIF and WebP, and any other image
shows its alt text. Trade-off: no wikilinks, embeds or callouts in
notebook Markdown. Code cells don't go through Obsidian's Markdown renderer
either, since every plugin's post-processors would see them: the plugin
builds `<pre><code>` with `textContent` and only then asks Prism to
highlight it, for a plain-token language. External links open in a new
window with `rel="noopener noreferrer"`.
