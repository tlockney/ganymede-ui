## 2026-11-25, Connection sheet keyboard and focus (#797)

From the UX review of 2026-11-24: in a fresh browser the "Where should
kernels run?" sheet left focus on the page body, six Tab presses went
through the dimmed page behind it before reaching the first choice, the
arrow keys didn't change the kind, and the sheet had no accessible name.

`ConnectSheet` is now a modal dialog (`role="dialog"`, `aria-modal`,
labelled by its heading), following the WAI-ARIA dialog and radio group
patterns:

- Focus starts on the chosen kind.
- The kinds are one Tab stop (roving `tabIndex`). Arrow keys move and
  select, wrapping, and Home and End go to the first and last.
- Tab and Shift+Tab wrap inside the sheet. A Tab from outside it, such as
  from the body after Chrome drops focus from Connect when it is disabled
  while connecting, comes back in. A click on the dimmed backdrop keeps
  focus where it was.
- Escape cancels when Cancel is offered (there is a backend to go back
  to), and does nothing on the first connection.
- On close, focus goes back to the control that opened the sheet, if it
  is still in the page and nothing else has taken focus.
- A connection error is a `role="alert"`, so a screen reader announces it.

The focus handling is `useModalFocus` and `containTab` in
`src/lib/modal-focus.ts`, so the other sheets can use them; they keep
their own focus code for now.

Tests: `ConnectSheet.test.tsx` covers the dialog name, initial focus,
arrows, the single Tab stop, Tab wrapping with controls behind the sheet,
re-entry from the body past a disabled Connect, Escape with and without
Cancel, and focus return (all fail on the old component).
`modal-focus.test.ts` covers which elements count as Tab stops and the
wrap. `e2e/connect-sheet-keyboard.spec.ts` does the issue's scenario with
the keyboard only: from clean storage, ArrowRight to **This browser**,
Tab round the sheet checking focus never leaves it, Connect, a notebook
from the command palette, then opens the sheet from the backend chip and
closes it with Escape and with Cancel, checking focus is back on the chip.
