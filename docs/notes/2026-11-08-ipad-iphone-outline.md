## 2026-11-08, Outline on the iPad and iPhone (#288)

The page already posted the notebook's headings as `PageState.outline`
and ran `go-to-cell`; only the iPad's Outline tab ("No outline yet") and
the iPhone were missing. `OutlineNavigator` is Mac-only (its file is
`#if os(macOS)` and it builds its own `List`), so the iPad gets
`IPadOutlineRows`, rows for the sidebar's existing `List` with the same
indent-from-top-level rule. A tap also calls the sidebar's `opened`, so in
portrait the sidebar gets out of the way of the notebook, as opening one
does.

The iPhone's sidebar is its root screen, under the notebook, so a tab
there would be a screen away. It gets a `Menu` in the notebook's bottom
toolbar instead (`PhoneOutlineMenu`). Menu items take no padding, so
levels are indented with figure spaces.
