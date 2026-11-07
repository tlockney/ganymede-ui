## 2026-11-07, Code font in outputs, feature labels, font cache (#370)

Three gaps found in review after #355 merged:

- Text outputs and inline code in Markdown set their own
  `font-family: var(--font-mono)` (and outputs 12.5px) in `jupyter.css`,
  so the code font setting reached cells but not outputs. They now read
  `--jp-code-font-family` and `--jp-code-font-size`, which the setting
  drives, and take its ligature and alternate features.
- `scripts/fonts.py` looked up contextual rules under the wrong attribute
  names for class-based rule sets, and labelled features whose glyphs
  have no code point (Monaspace's cv32, which changes the `greater_equal`
  ligature) with their tag. It now uses fontTools' names and reads an
  unencoded glyph's characters from its name's parts. Fonts are loaded
  with `recalcTimestamp=False`, so rebuilding writes the same bytes.
- Font files were cached by the service worker at fixed URLs, so a
  rebuilt font would never reach a browser that had the old one. Each
  file's catalog entry carries a hash, and the page asks for
  `file.woff2?v=<hash>`.
