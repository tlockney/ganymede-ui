## 2026-11-08, Kernel Log follows with the scroll geometry APIs (#372)

With the apps on macOS 26 and iOS 26, the Kernel Log drops its macOS 13
workaround: a one-point marker after the last line, tracked with
`onAppear`/`onDisappear`, and `ScrollViewReader.scrollTo`. It now keeps a
`ScrollPosition` (opening at the bottom edge) and reads "at the end" from
`onScrollGeometryChange`: the visible rect's bottom within 16 points of the
content's.

The open question from #358 was ordering: new lines grow the content
before `onChange(of: log.after)` runs, so a geometry callback could report
"not at the end" first and stop the log following. The view sidesteps it
by updating `atEnd` only when the scroll offset changes. Content growth
and the error bar's top inset change the content or container size, not
the offset, so they leave `atEnd` alone; a user's scroll, or the view's own
`scrollTo(edge: .bottom)`, sets it. A new kernel resets both.

Checked by hand only: CI builds the apps but can't scroll them. The checks
are in #399 (Mac) and #273 (iPad).
