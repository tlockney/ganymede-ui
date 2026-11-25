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
- Tab and Shift+Tab move between the sheet's controls and wrap at the
  ends. The sheet moves focus itself on every Tab rather than leaving
  the middle ones to the browser: WebKit (Safari, the Mac and iPad apps)
  with default settings skips buttons and checkboxes, so its next stop
  from the Token field, or from the chosen kind, is the page behind. A
  Tab from outside the sheet, such as from the body after Chrome drops
  focus from Connect when it is disabled while connecting, comes back
  in. A click on the dimmed backdrop keeps focus where it was.
- Escape cancels when Cancel is offered (there is a backend to go back
  to), and does nothing on the first connection or while an input method
  is composing text. It stops there, so nothing behind the sheet also
  acts on it.
- On close, focus goes back to the control that opened the sheet, unless
  something else has taken focus while it was open.
- A connection error is a `role="alert"`, so a screen reader announces it.

The focus handling is `useModalFocus` and `containTab` in
`src/lib/modal-focus.ts`, so the other sheets can use them; they keep
their own focus code for now.

Tests: `ConnectSheet.test.tsx` covers the dialog name, initial focus,
arrows (taken from the page, and modified arrows left alone), the single
Tab stop, Tab wrapping with controls behind the sheet, re-entry from the
body past a disabled Connect, the backdrop mousedown, Escape with and
without Cancel, while composing, taken from the page and kept from
listeners behind, and focus return, including when something else took
focus. Each fails with its part of the change removed, except Escape
without Cancel, which checks that nothing changed.
`modal-focus.test.ts` covers which elements count
as Tab stops, moving from a middle stop both ways, the wrap, the stop
nearest a focused element that isn't one, entry from outside, modified
Tab left alone, and a sheet with no stops.
`e2e/connect-sheet-keyboard.spec.ts` does the issue's scenario with
the keyboard only: from clean storage, ArrowRight to **This browser**,
Tab round the sheet checking focus never leaves it, Connect, a notebook
from the command palette, then opens the sheet from the backend chip and
closes it with Escape and with Cancel, checking focus is back on the chip.
