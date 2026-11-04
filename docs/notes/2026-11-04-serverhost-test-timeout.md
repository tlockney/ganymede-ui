## 2026-11-04, ServerHost test's post-stop request (#175)

- `ServerHostTests.testServesTheWebAppAndStops` failed on the iOS
  simulator on several PRs in one day (#231, #234, #238), always at the
  request made after `host.stop()`. The socket is refused at once, but the
  simulator's URLSession reported the error about 10 s later, after the
  test's 10 s wait had run out.
- That request now carries `timeoutInterval = 2`, so URLSession ends it
  with a timeout well inside the wait. Refused or timed out both count as
  "not serving"; a response still fails the test, so a server that keeps
  answering after `stop()` is still caught.
