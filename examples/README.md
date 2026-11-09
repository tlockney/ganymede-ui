# Example notebooks

The notebooks that **Open Example Notebooks** copies into a new folder
(#414). The app bundles the `.ipynb` files here, as one chunk loaded on
first use (`src/lib/example-notebooks.ts`).

Edit the sources in [`src/`](src/), not the notebooks. A source is
Markdown: each ` ```ts ` fence is a code cell and the text between fences
is a Markdown cell (`<!-- cell -->` splits one in two). A fence written
` ```ts no-run ` is saved without outputs, for cells that need the app,
such as `device` calls; ` ```ts error ` is meant to fail. The first
heading names the notebook: `01-start-here.md` with `# Start Here` is
`01 Start Here.ipynb`.

Then run the notebooks, which saves their outputs:

```sh
node scripts/examples.mjs --run       # every notebook
node scripts/examples.mjs --run 03    # those whose source name has "03"
```

Each runs top to bottom on cdp-kernel's browser kernel, the one the apps
run, in headless Chromium through Playwright, with network access. Set
`CHROMIUM` to a Chromium binary if Playwright's own isn't installed. A
cell that fails stops the script with an error, unless its fence says
`error`.

`node scripts/examples.mjs` without `--run` rebuilds the notebooks from
the sources, keeping the outputs of the cells whose source is unchanged.
`src/lib/examples.test.ts` fails when a notebook doesn't match its source
or a cell that runs has no outputs.

The notebooks ask for the `cdp-browser` kernel; the app asks for a
TypeScript kernel the backend has when it copies them, and marks every
code cell trusted so a server signs them.
