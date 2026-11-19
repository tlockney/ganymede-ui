## 2026-11-19, type errors as you type (#669)

Item 1 of #663, app side. `src/lib/type-errors.ts` opens a comm to
`cdp-kernel.diagnostics.v1` (cdp-kernel#514, in `docs/notebooks.md`,
"Type errors for frontends") for each notebook whose kernel's
`language_info` is TypeScript or JavaScript, and shows the answers as
`@codemirror/lint` marks, with the message and `TS<code>` as the source on
hover. `NotebookPane` attaches it beside code collapse; it follows
`session.session.kernel`.

Lifecycle:

- The comm opens once the kernel is idle or busy, and `kernel.info` names
  a language. A kernel that closes it (an unknown target, or
  `--no-language-service`) or another language sets `closed` for that
  kernel; nothing is sent until a restart or a kernel change.
- A restart disposes the comm without closing it, so `restarting`,
  `autorestarting` and `dead` drop it, clear the marks and the pending
  requests, and reset `closed`; the next idle opens it again. A kernel
  change does the same.
- Each code cell's source changes arm a 400 ms timer; it sends
  `{ request, code }` with a counter as `request`. An answer applies only
  when it is the cell's latest request and the cell still has the sent
  text; otherwise it is dropped, and the edit that changed the text has its
  own check coming. `diagnostics: null` changes nothing. An empty list
  clears the cell's marks.
- Offsets are code points, converted with `Text.charIndexToJsIndex`
  (clamped); an empty range widens to the character at it.
- A cell that changes type is a new cell model, so the watcher for the old
  one goes and its marks with the old editor.
- The switch ("Show Type Errors", the page command `toggle-type-errors`,
  also in `PAGE_COMMANDS`) is in `localStorage` (`ganymede-ui:type-errors`,
  `off` when off), on by default, shared by every open notebook through a
  signal. Off closes the comm and clears the marks; on opens it again.
  When local storage throws, the choice holds for the page.

`@codemirror/lint` is now a direct dependency, pinned to 6.9.7, the version
already in the lock file as a dependency of `@jupyterlab/codemirror`; it
adds no package.

Left out: the Mac View menu item (it needs Swift and a menu state, and
the Swift can't be built here; the page command is there for it), and a
check of every cell when a comm opens (only the active cell is checked,
then each cell as it's edited). A check waits behind a running cell, as
cdp-kernel says; the app doesn't use a subshell yet.

An end-to-end test needs a cdp-kernel newer than 0.12.3, which the e2e job
installs from npm (`CDP_KERNEL_VERSION` in `ci.yml`); until one is
released it is checked by hand: with a cdp-kernel built from `main`, open a
notebook on its TypeScript kernel, run a cell, type `const n: string = 1`
in the next one, and see `1` underlined after a pause, with the message and
`TS2322` on hover. Turning Show Type Errors off clears it.
