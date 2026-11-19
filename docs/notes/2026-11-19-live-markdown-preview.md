## 2026-11-19, live Markdown preview (#672)

Item 4 of #663, a spike: off by default. `src/lib/markdown-preview.ts` is
a CodeMirror extension for Markdown cells' editors: a state field reads
the Markdown syntax tree and decorates it; the document is never touched.

Design:

- The extension is registered in `jupyterlab.ts` with the editor extension
  registry, and only for editors whose shared model is a Markdown cell. A
  cell that changes type gets a new editor, so a code cell never has it.
- The syntax tree: the app's Markdown cells have no language (their mime,
  `text/x-ipythongfm`, is not one the registry knows), so there was no
  tree to read. The extension brings `@codemirror/lang-markdown` (GFM, as
  the rendered cell is) in a compartment, only while the switch is on, so
  with it off a Markdown cell's editor is exactly as before. No fenced code
  language highlighting yet (`codeLanguages` needs the registry).
- Which places show raw: an inline element (emphasis, strikethrough, inline
  code, link) while a selection range touches it, the ends included; a
  heading, list item, quote line or rule while a range touches its line; a
  fenced block while a range touches any of its lines. Hidden syntax is an
  empty replace decoration. A bullet list's `-`, `*` or `+` is a bullet
  widget and a rule is a widget; ordered list numbers stay as written.
  Fence lines hide their text and shrink to a sliver.
- Left raw: images (nothing inside one is decorated), tables, math, task
  boxes, HTML, autolinks, a setext heading's underline (hiding it would
  leave a blank line). Heading size and weight still apply to setext text.
- The switch is `ganymede-ui:live-markdown` in local storage (`on`), off by
  default, shared by open editors through a signal, across windows through
  the `storage` event, kept for the page when storage throws. Each editor's
  view plugin connects to the signal and disconnects when destroyed.
  Palette command "Show or Hide Live Markdown Preview" and the page
  command `toggle-live-markdown` (`PAGE_COMMANDS`).
- Styles are in `jupyter.css` (`.cm-md-live`): the Markdown font setting
  for the prose, the code font for code, the app's colour variables for
  dark mode.

Dependencies: `@codemirror/view` 6.43.15, `@codemirror/state` 6.7.6,
`@codemirror/language` 6.13.1 and `@codemirror/lang-markdown` 6.5.2 are now
direct dependencies, each pinned to the version already in the lock file
as a dependency of `@jupyterlab/codemirror`; no package is added.

Left out: a Mac View menu item (Swift, can't be built here), tables, math,
images, task boxes, language highlighting in fenced code, hanging indents
for wrapped list items and quotes.
