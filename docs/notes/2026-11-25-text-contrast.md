## 2026-11-25, Text contrast on buttons, prompts and insert buttons (#799)

The UX review measured four text colors under WCAG AA's 4.5:1: white on
the primary button's blue (4.02:1 light, 3.65:1 dark), the execution
prompts, and the insert buttons under touch cells (Code, Markdown) in
dark mode.

- Two new tokens in `src/styles/app.css`. `--accent-fill` (`#0062cc`
  light, `#0068d9` dark) is the blue under white text: the primary
  buttons, notice actions, the notice picker, highlighted menu and
  palette rows, the keyboard bar's primary key and the journal's follow
  button all used `--accent` before. `--accent-text` (`#0058b8` light,
  `#5eacff` dark) is the blue as text: the insert buttons, Markdown
  links (rendered, `--jp-content-link-color`, and in the live preview's
  editor), the notice's Dismiss button on its `--accent-soft` fill and
  the journal's running label, which were 3.4 to 4.0:1 in light mode.
  `--accent` stays for the selection rail, focus rings, the drop line
  and icons (the sources list's tint, a selected choice's icon), where
  it isn't text.
- Prompts. The shell drew them in `--text-3` at 0.8 opacity, and
  JupyterLab's light theme overrides inactive cells' prompts with its own
  grey at 0.5 opacity, which is what the review measured (about 2.4:1).
  `.notebook-page` now sets the in, out and inactive prompt colors to a
  new `--prompt-color` and both prompt opacities to 1, and the prompt
  rule's own 0.8 is gone. `--prompt-color` is `--text-2` in dark and a
  little darker in light (`rgba(60, 60, 67, 0.78)`), because `--text-2`
  is 4.36:1 on the `--accent-soft` JupyterLab fills selected cells with
  in command mode. Prompts read 5.63:1 light and 6.82:1 dark on the
  page, 5.11:1 and 5.72:1 on a selected cell.
- Insert buttons. The row sat at 0.55 opacity until its cell was active,
  which faded the text with it. It is 0.85 now, still quieter than the
  active row, and the text is `--accent-text`.

`src/styles/contrast.test.ts` reads both stylesheets, resolves the tokens
for each theme, applies the rules' opacities and checks every pair at
4.5:1, so a later change to a token or an opacity fails it. It finds the
filled rules in both stylesheets by their declarations (white text on a
`var(--accent…)` background), so a new one that uses plain `--accent`
fails too, and it fails a new rule that colors text with plain
`--accent` rather than `--accent-text`. Against `main`'s stylesheets
nine of its eleven tests fail.

The machine banner's white on orange (`.machine-banner`) is also under
4.5:1; it wasn't in the issue and is #802.
