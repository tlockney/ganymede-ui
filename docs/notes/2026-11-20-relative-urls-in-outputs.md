## 2026-11-20, relative URLs in outputs (#704)

An untrusted HTML output with a relative URL, such as `<img src="x">`,
threw `process is not defined` in the built app. The notebook view hit
the error, and the journal fell back to showing the raw HTML as text.

- Cause: JupyterLab's `UrlResolver.resolveUrl` calls `PathExt.resolve`.
  That is path-browserify's `posix.resolve`, which reads `process.cwd()`
  when the path isn't absolute, and Jupyter paths are relative
  (`folder/nb.ipynb`). JupyterLab's webpack build provides
  `process/browser`, where `cwd()` is '/'. This app is built with Vite,
  which provides no `process`.
- Fix: `UrlResolver` in `src/lib/jupyterlab.ts` extends the upstream class
  and overrides only `resolveUrl`. A local URL is joined onto '/' and
  normalized, which never touches `process` and gives what upstream returns
  with a cwd of '/', `..` clamped at the root included. Other URLs are
  returned unchanged. `createRendermime` uses it. No global `process` shim.
- Checked: a unit test in `src/lib/jupyterlab.test.ts` makes
  `process.cwd` throw, and fails with the override removed. A second case
  compares our result with upstream's, with `cwd` returning '/', for
  relative, `..`, spaced-folder, absolute, `https:` and `data:` URLs.
  An e2e test in `e2e/journal.spec.ts` renders an output with
  `<img src="x">` in the journal and the notebook view and expects no
  `process is not defined` page error.
