## 2026-11-01, Rendering notebooks made elsewhere (#133)

Part of making the Mac app the default app for `.ipynb` files (#128).

- New fixtures in `e2e/fixtures/reading`, written for this repo and run
  with a real Python kernel by `scripts/make-reading-fixtures.py`:
  - pandas tables (plain, `describe()`, wide with `...`, MultiIndex columns).
  - matplotlib PNG, SVG and a wide PNG.
  - 300 lines of stdout, stderr with a warning, and an ANSI traceback.
  - Markdown with LaTeX, a table, a blockquote, a task list, a code block
    and a PNG attachment.
  - ipywidgets with saved state.
  - An nbformat 4.0 file with no cell ids and a collapsed cell.

  `e2e/reading.spec.ts` opens each one from `?open=` (as the Mac app
  opens a Finder file) and screenshots it in light and dark, scrolling a
  window at a time.

- What the screenshots showed, and the fixes:
  - **SVG plots showed as `<Figure size 500x300 with 1 Axes>`.**
    JupyterLab's SVG renderer is unsafe and refuses untrusted SVG, and a
    file from elsewhere is always untrusted. SVG renders as an `<img>`
    from a data URL, where scripts don't run and nothing else loads, so
    `ImageSVG` renders it trusted or not (`output-frames.ts`).
  - **Long streams pushed the rest of the notebook away.** 300 printed
    lines were 300 lines tall. Stream and error outputs now scroll inside
    a box 32em high.
  - **Columns of numbers didn't line up** in the proportional UI font.
    Table cells use `font-variant-numeric: tabular-nums`.
- Looked right already: pandas tables in both appearances, LaTeX (inline,
  display, and `Math` output), Markdown tables, attachments, ANSI colors
  in both appearances, PNG sizing (wide figures shrink to the cell), and
  the nbformat 4.0 file.
- Left as they are:
  - ipywidgets with no kernel show their text repr, as in JupyterLab. The
    manager is per kernel (`widgets.ts`), and rendering saved state needs a
    kernel-less manager. Follow-up: #150.
  - Plots keep matplotlib's white background in dark mode, as in
    JupyterLab and VS Code. Inverting them would change their colors.
  - "Hide prompts" and a content-width setting are left for later.
- A Markdown attachment stored as SVG text, not base64, renders broken:
  JupyterLab builds `data:<mime>;base64,<data>`. Jupyter writes pasted
  images as base64, so the fixture uses a PNG.
