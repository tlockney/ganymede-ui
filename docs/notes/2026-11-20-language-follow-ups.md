## 2026-11-20, Language features follow-ups (#682)

Review follow-ups from #677 (signature help, go to definition, rename), and a
stale module header.

F12 and F2 are now rows of the shortcuts table (`go-to-definition`,
`rename-symbol`, in Edit mode), so the Shortcuts sheet, `docs/shortcuts.md`
(checked by `shortcuts-doc.test.ts`) and the palette's keys list them. That
made them rebindable, so `language-editor.ts` no longer has them in a fixed
CodeMirror keymap: a `keydown` handler asks `matches(event, id)` at each key,
and a rebinding applies at once. The palette keeps its own two entries (the
rename one has a prompt) and leaves the generic ones out; their keys now come
from the table instead of being typed in. The test's `press` helper needed key
codes for F2 and F12: Lumino reads `keyCode`, which jsdom leaves at 0.

`IS_MAC` is exported from `shortcuts.ts` (false without `navigator`) and
`language-editor.ts` imports it instead of its own copy; `shortcuts.ts` imports
only Lumino, so there is no cycle.

`docs/apps.md` now says what ⌘-click does in a cell the kernel answers for: it
goes to the definition instead of adding a cursor, and Alt-drag still makes a
rectangular selection (JupyterLab's `rectangularSelection` setting is on by
default and the app doesn't change it; the handler ignores clicks without
⌘/Ctrl). It also separates the two ways a rename can fail to get an answer: the
kernel's own time budget (the rename says the service can't tell) and the app's
10 s wait (`LANGUAGE_TIMEOUT_MS`), after which the request is dropped and the
rename does nothing, with no notice.

The Escape handler's check on the signature tooltip has its own test: Escape is
consumed while the tooltip shows and left alone otherwise. With the check
removed (`hide` always returning true) it failed on the no-tooltip assertion;
restored, it passes. The two guards in `kernel-comm.ts` and
`language-service.ts` stay, with comments saying they are defensive.

Also #685: the `type-errors.ts` header listed the in-app kernel among those that
don't answer the type-errors comm; since #684 the in-app and browser kernels
answer it from the TypeScript they load. `language-service.ts`, `docs/apps.md`
and the other module headers already said the right thing.
