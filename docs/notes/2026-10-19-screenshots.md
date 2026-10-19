## 2026-10-19, screenshots from the e2e run, dark-theme fixes (#84)

From the docs review (#84, #85, #86, #87). The README's screenshots were
older than the e2e screenshot spec: an ipykernel notebook taken by hand,
with an error cell cut off at the bottom and "Edited" in the title. They
now come from `npm run e2e` like its comment always said. A new fixture,
`e2e/fixtures/Orbits.ipynb`, fits stream output, a result, Markdown with
math, HTML and a full error in one 1280×820 window on cdp-kernel's
TypeScript kernel (no Python in CI). The spec restarts the kernel so both
shots count from 1, saves before the shot, and drops the unused empty-state
frame. The browser-kernel shot runs a second cell showing it ran in a
`DedicatedWorkerGlobalScope`, is cropped to 520 pixels, and has a dark
twin; the README shows it with `<picture>` and captions every shot.

Dark-theme fixes in `src/styles/jupyter.css`: prompts use `--text-2`
instead of the 36% `--text-3`; numbers get their own color in both themes
(JupyterLab colors them the same green as keywords); and the active cell
gets one accent bar down the whole cell from a `::before` on `.jp-Cell`,
instead of JupyterLab's separate input and output collapser bars. The
"This browser" labels now say kernels run in the page with no server,
instead of "JavaScript in a Web Worker" (the default kernel is TypeScript).

Left as is: the green idle dot (green means ready across the shell, as in
macOS), and window traffic lights, which a browser screenshot doesn't have.
