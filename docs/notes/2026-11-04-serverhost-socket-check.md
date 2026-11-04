## 2026-11-04, ServerHost test checks the port, not a request (#175)

- The 2 s request timeout from the last fix didn't hold. In a failing
  run on #253 the post-stop request logged its timeout (`-1001`) 2 s
  after the refused connect, but its completion handler only ran 13 s
  later (`-1004`), after the test's 10 s wait had run out. So the delay
  is in when the iOS simulator's URLSession calls back, which no request
  setting bounds.
- The test now checks the port after `host.stop()` with a plain
  `connect` to 127.0.0.1, which fails at once with `ECONNREFUSED` when
  nothing listens. `ganymede_server_stop` joins the server's thread, so
  the listener is closed by the time `stop()` returns, and the check
  needs no retry. A server still listening after `stop()` still fails
  the test.
