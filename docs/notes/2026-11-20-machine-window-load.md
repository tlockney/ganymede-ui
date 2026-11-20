## 2026-11-20, Machine windows load their page (#720)

In v0.14.0, a connected machine's window was blank on the Mac, iPad and
iPhone. `WebViewCoordinator.startLoad` called
`page?.loadStarted(view.load(…), start:)`. Swift skips the arguments of
an optional-chained call when the receiver is nil, and a machine's window
(`MachineWindow`, `MachineScreen`) has no `PageModel`. So the web view
was made but never loaded. The call dates from #642, and #712 added the
first windows with no page.

`PageModel.startLoad(_:on:start:)` now runs the load and then tells the
page, if there is one. `PageModelTests` checks that it loads with no page.
That test lives with `PageModel` because `WebView.swift` isn't in the test
target. No other optional-chained call in `apple/Sources` has a side
effect in its arguments.

Found while checking: machine windows get no retry for a failed load
(#640), since that also goes through the page. Filed as #721.
By-hand checks are on #399 and #273.
