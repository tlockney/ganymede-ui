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

- Markdown cells, rendered by Obsidian.
- Code cells with an `In [n]:` label, highlighted by Obsidian.
- Outputs: streams, errors (ANSI colors removed), plain text, JSON,
  Markdown, images (PNG, JPEG, GIF, WebP, SVG) and HTML. Ganymede's named
  results (`application/vnd.ganymede.result+json`) show as `name = value`.
  When an output has several representations, one is chosen: Ganymede
  result, HTML, SVG, bitmap, Markdown, JSON, plain text.
- Changes that arrive while a notebook is open, such as from Obsidian
  Sync, re-render it. A notebook that can't be read shows why in the
  view.
- On macOS desktop, an **Open in Ganymede** action in the view's header
  opens `ganymede://open?path=<absolute path>`, which the Mac app handles. It isn't offered on iPad
  or iPhone, where Ganymede can't read Obsidian's sandbox.

## What it does not do

No running, no editing, no widgets (they show their plain-text fallback or
an "unsupported output" note), no LaTeX or JavaScript outputs, no search of
outputs yet. Only nbformat 4 is read.

## Security

Obsidian's desktop app is Electron with Node access, so a script that
ran from a notebook output would run with the person's privileges. The
viewer therefore:

- renders HTML outputs only in an `<iframe sandbox="">` (no scripts, no
  same-origin access) whose document carries a Content-Security-Policy
  of `default-src 'none'; img-src data:; style-src 'unsafe-inline'`;
- shows SVG only as an `<img>` data URL, never inline, and bitmaps only
  for the listed image types;
- puts text, stream and error output in `<pre>` through `textContent`;
- never sets `innerHTML` with notebook content.

Markdown cells and Markdown outputs go through Obsidian's own renderer,
as a note's Markdown does.
