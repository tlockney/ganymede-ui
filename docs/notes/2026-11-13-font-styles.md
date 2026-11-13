## 2026-11-13, Font styles and a Markdown font (#565)

The code font's Alternates listed every stylistic set and character
variant as its own switch: 43 for Fira Code, 25 for JetBrains Mono.
Thomas found it too hard to navigate and asked for a few sensible
combinations instead, and for a font setting for rendered Markdown.

- `scripts/fonts.py` gives each font a few named styles (`STYLES`),
  written to `catalog.json`. They were picked by rendering every feature
  of every bundled font and keeping the sets that change something people
  notice:
  - JetBrains Mono: Slashed zero (its zero is dotted), Classic (`ss01`),
    Closed (`ss02`).
  - Fira Code: Dotted zero (its zero is slashed, so `zero` dots it), and
    Alternate a, r, & and @ (`cv01 ss01 ss03 ss05`).
  - Cascadia Code: Slashed zero.
  - Iosevka: Menlo, Pragmata Pro, Source Code Pro and JetBrains Mono
    styles, of its 19 "looks like another font" sets.
  - Monaspace: none. Its zero is already slashed (`cv01` takes the slash
    away), and its other sets are its ligatures.
- Monaspace keeps its code ligatures in `ss01`-`ss10`, so before this
  the Ligatures switch did nothing for it (its `calt` is texture
  healing). `ligatureFeatures` in the catalog lists them; the switch turns
  them on, and off leaves `calt` alone.
- The setting keeps `style` in place of `features`. A saved setting with
  `features` (page and app) becomes the style with exactly those, or
  Standard.
- The Markdown font is `markdown` in the same setting: `system` (the UI
  font, as before), `serif` (the stack of `ganymede nb publish`'s pages,
  `--serif` in ganymede-nbformat's `html.rs`) or `mono` (the code font).
  The page sets `--markdown-font`, which `.jp-MarkdownOutput` reads.
  Settings on the page, the Mac and the iPad/iPhone show it under the
  code font.

Not checked by hand on a Mac or iPad yet: ganymede-ui#399 and #273.
