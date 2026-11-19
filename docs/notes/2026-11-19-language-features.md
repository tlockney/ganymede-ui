## 2026-11-19, Signature help, definition and rename (#676)

Item 1 of #663, app side of cdp-kernel#522 (PR cdp-kernel#523, `docs/notebooks.md`,
"Signatures, definitions and renames for frontends"). Three requests on one
comm, `cdp-kernel.language.v1`, each with `request` (echoed) and `op`:
`signature` (`{ code, cursor }`), `definition` (`{ cells, cell, cursor }`)
and `rename` (`{ cells, cell, cursor, newName }`). Every offset is in code
points. `cells` is the notebook's code cells in order, with their current
text; `cell` is an index in it, so a code cell's index is not its index in
the notebook when Markdown cells sit between.

Shared lifecycle. The comm lifecycle of type errors moved out of
`type-errors.ts` into `src/lib/kernel-comm.ts` (`attachKernelComm`), and
`type-errors.ts` now uses it; its tests are unchanged and pass. It keeps
the rules of #669: open once the kernel is idle or busy and its `language_info`
is TypeScript or JavaScript; wait for `subshellStarted` when the kernel
supports subshells; a close before any answer is a refusal for that kernel;
a close after an answer reopens at the next idle; `restarting`,
`autorestarting` and `dead` drop the comm; a kernel change starts afresh;
an epoch counter makes an open that was waiting give up when the comm is
dropped. `isOpen` is true only after the comm's open was sent, so a request
never goes on a comm still waiting for its subshell. The switch is a
callback (`enabled`, `refresh()`), which only type errors uses: these
features have no setting.
`codePointToOffset` moved to `src/lib/code-points.ts` with its inverse
(`offsetToCodePoint`, for the cursor sent) and `codePointLength`;
`type-errors.ts` still exports it.

`src/lib/language-service.ts` holds the requests. A request waits for its
answer by `request` id; the answers still waiting are resolved with null when
the comm drops, and after 10 s. `definition` and `rename` snapshot the
cells' text when they ask; an answer is dropped when any code cell's text
differs from the snapshot when it comes (the offsets are for the text sent).
Answers are read strictly: `toRenameAnswer` returns null (the kernel can't
tell) if any edit is malformed, out of its cell, or overlaps another in the
cell, so a rename is applied whole or not at all. `{ error }` becomes a
notice ("Can't rename: ..."); `{ edits: null }` also gets a notice, since
the person pressed a key for it; a definition with no location or null does
nothing. A definition outside the notebook is `[]` from the kernel. The
first location is used.

Edits are applied per cell with one `view.dispatch({ changes })` of all that
cell's edits (positions are in the text before), so the cell's editor
history gets one entry and undo works per cell; a cell without an editor
view gets one `sharedModel.transact`.

`src/lib/language-editor.ts` is the CodeMirror side, injected into each
code cell's editor with `injectExtension` once its `ready` resolves (new
cells are picked up on the model's `cells.changed`, which the notebook
handles first, so the widget is there; a model set after the features were
attached is picked up when the active cell changes):

- Signature help is a `showTooltip` field. A user-typed insert starting with
  `(` or `,` asks; while a tooltip shows (or a request is out) every
  selection or text change asks again, and the answer replaces the tooltip or
  closes it (null: the cursor left the call). A counter drops answers to an
  earlier request, and the tooltip's position is mapped through edits made
  while it shows. Esc, losing focus, and the pane going close it. The label is
  built with DOM text nodes, the active parameter in `<strong>` found by
  looking for each parameter label in turn after the one before it.
- Esc with a tooltip open closed the tooltip but also left edit mode (found
  against a real kernel): the app runs `commands.processKeydownEvent` in the
  capture phase, before CodeMirror's keymap, and `command-mode` is bound to
  Esc. The editor has the class `gm-mod-signature-help` while the tooltip
  shows, and `jupyterlab.ts` binds Esc on `#id .gm-mod-signature-help` to
  `signature-help:dismiss`, which sends a `closeSignature` effect (the
  listener bumps the counter, so a later answer doesn't reopen it). Tested
  through the same capture-phase listener and the real commands.
- F12 and Cmd-click (Ctrl-click off a Mac) go to the definition; F2 renames.
  The keys are not consumed when the kernel doesn't answer. F2 opens its
  input in a `setTimeout`: the notebook's own `keydown` handler calls
  `_ensureFocus(true)` as the event bubbles, which puts the focus back in the
  editor and closed the input at once (found by the test).
- Enter in the name input renamed nothing (found against a real kernel): the
  notebook's capture-phase handler moved the focus first, and the blur
  cancelled before the form's submit. The blur is judged after the task
  (`setTimeout`) and cancels only if the focus is not on the input then. The
  input stops its keydowns from reaching the notebook's shortcuts.
- The name input is a small `position: fixed` form next to the cursor
  (`askNameNear`), as there is no prompt component in the app but the
  palette's, and that one is used when the palette runs the command: the
  palette entry `rename-symbol` has `prompt: 'New name'`, so the name comes as
  the command's argument.

App wiring: `NotebookController.goToDefinition()` and `renameSymbol(name?)`,
the page commands `go-to-definition` and `rename-symbol` (in `PAGE_COMMANDS`
and `App.tsx`), palette entries in the Cell group with F12 and F2 shown, and
the Mac and iPad Cell menus (`NativeChrome.swift`, `IPadChrome.swift`). The
keys are not menu key equivalents: the page binds them, and a menu key
equivalent would fire while typing. The Swift only adds two buttons that run
page commands, as `Find in Notebook…` does; it has no logic to test and was
not compiled here.

`@codemirror/view` and `@codemirror/state`, needed for the tooltip, key map
and transactions, were already direct dependencies (#674); nothing is added.

Left out: the signature opening on `(` typed by paste or by completion
(only a typed `(` or `,` opens it, then it follows), multiple definitions
(the kernel's first is used), a Code menu (the commands are in the Cell
menu). Not run against a real kernel here: by hand, in #399 and #273, with
a cdp-kernel built from `main` or from cdp-kernel#523: type a call to a
function an earlier cell declared and see the signature with the argument
marked; ⌘-click and F12 a name used in a later cell; F2 it, rename, check
every cell changed, and ⌘Z in one cell undoes only that cell; try F2 on
`process` and see the notice; try the keys with the in-app kernel and see
nothing.
