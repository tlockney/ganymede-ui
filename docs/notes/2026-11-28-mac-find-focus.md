## 2026-11-28, Mac Find tab initial ⌘⇧F focus (#890)

Follow-up for #881 (#890). On a fresh launch with Find already restored as
the active sidebar tab, the first `⌘⇧F` could report `@FocusState` true and
even `firstResponder is NSText` while typed keys still went to the notebook
and the field showed no focus ring.

- **Direct AppKit responder ownership (`FindField`):** Replaced SwiftUI's
  `TextField` + `@FocusState` in `FindNavigator` with `FindField`
  (`NSViewRepresentable` wrapping `FindNSTextField` in `FindFocus.swift`).
  Instead of trusting SwiftUI `@FocusState` or checking `firstResponder is NSText`
  (which matches any field editor in the window), `FindFocusOwnership.ownsEditor`
  checks `window.firstResponder === textField.currentEditor()` while visible.
- **Request token and hold confirmation (`FindFocusRequest`, `FindFocusTracker`):**
  Replaced the boolean `@State private var findFocus` toggle with
  `FindFocusRequest(pending: Bool, sequence: Int)`. `⌘⇧F` increments `sequence`
  and sets `pending = true`, while tab switches (`⌘1`–`⌘6`, capsule clicks) and
  `onDisappear` clear `pending` so switching back via `⌘2`/`⌘4` never focuses
  the field. `FindFocusTracker` requires editor ownership to hold across one
  confirmation tick (`FindFocus.interval`, 50 ms) and re-claims if the loading
  web view or launch focus transition takes the responder back.
- **Verification note:** Unit tests in `FindFocusTests` cover `FindFocusRequest`,
  `FindFocusTracker` transitions (collapsed wait, claim/confirm, web-view steal
  re-claim, cleared-request tab switches), AppKit `FindFocusOwnership`
  distinguishing `FindNSTextField.currentEditor()` from another field's `NSText`
  editor, and Escape clearing (`cancelOperation`). The live interactive check
  from #890 (5 of 5 fresh desktop launches with screenshot verification) requires
  running on an unlocked desktop session.

Checked with `npm run check`, `npm test`, `xcodebuild test` (`Ganymede` on
macOS, including `FindFocusTests`), `check-app-bundle.sh`, `xcodebuild build`
for `Ganymede-iOS`, and `FindFocusTests` in `GanymedeTests-iOS` on iPad simulator.
