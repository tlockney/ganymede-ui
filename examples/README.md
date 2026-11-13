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
cell that fails, unless its fence says `error`, is saved with its error,
the rest still run, and the script exits with an error.

`node scripts/examples.mjs` without `--run` rebuilds the notebooks from
the sources, keeping the outputs of the cells whose source is unchanged.
`src/lib/examples.test.ts` fails when a notebook doesn't match its source
or a cell that runs has no outputs.

## Other kernels

The examples also run on cdp-kernel's Node, Deno and Bun kernels, the
ones Ganymede starts outside the apps (#558). Where the browser and those
runtimes differ, a cell picks its way at run time: DuckDB uses its
WebAssembly build in the apps and its native build, `@duckdb/node-api`,
elsewhere; Generative Art draws on `OffscreenCanvas` in the apps and on
`@napi-rs/canvas` where that has no 2D context. Device is for the apps
only: all its cells are `no-run`.

To check them, with `ganymede` on `PATH` and the kernelspecs installed
(`cdp-kernel install --runtime node`, and `deno`, `bun`):

```sh
node scripts/examples-kernels.mjs                  # every notebook on every kernel
node scripts/examples-kernels.mjs -k cdp-deno 04   # one kernel, those with "04"
```

Each example runs top to bottom on a fresh kernel with `ganymede run`,
skipping `no-run` cells; any cell whose result isn't the one its fence
asks for fails the run. It doesn't change the notebooks. Set `GANYMEDE`
to use another binary. The Examples workflow (`.github/workflows/examples.yml`)
runs this and `examples.mjs --run` when a change touches the examples or
these scripts, and from the Actions tab. It isn't part of CI: the
examples depend on public APIs and CDNs.

## Kernelspec

The notebooks ask for the `cdp-browser` kernel; the app asks for a
TypeScript kernel the backend has when it copies them, and marks every
code cell trusted so a server signs them.
