## 2026-10-19, downloads in the Apple apps (#48)

WKWebView drops a download unless the navigation delegate turns it into
a `WKDownload`: with every policy `.allow`, `<a download>` links (the
blob: and data: URLs outputs make for files) did nothing. The coordinator
now returns `.download` when `shouldPerformDownload` is set, and for
responses WebKit can't show or that carry `Content-Disposition:
attachment`. On the Mac a save panel asks where (a sheet on the window,
starting in Downloads); it removes an existing file first, since
`WKDownload` won't overwrite. iOS has no save panel, so the file goes to
a temporary folder and the share sheet offers it (Save to Files). A
cancelled panel also reports `didFailWithError` (`URLError.cancelled`),
which is not shown as a failure.
