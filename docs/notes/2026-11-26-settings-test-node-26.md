## 2026-11-26, Agent key test on Node 26 (#848)

`BrowserCredentialStore`'s "rejects a key when storage is blocked" test
failed on Node 26 (also reported as #861) and passed on Node 24. The test built the store with
`new BrowserCredentialStore(undefined, undefined)` to mean "no storage",
but `undefined` takes a default parameter, so the constructor read the real
storage globals. Node 25 and later define `sessionStorage` (in memory, and
`localStorage` only with `--localstorage-file`), so the session write
succeeded and the expected "blocks storage" error never came.
`loadAgentSettings(undefined)` and `saveAgentSettings(…, undefined)` in the
"work without storage" test had the same flaw and passed only because no
`localStorage` global exists without that flag.

`storage()` now returns `null` for blocked storage, and the store and the
settings functions take `Storage | null`, so callers and tests say "no
storage" with `null`, which a default parameter leaves alone. Checked with
Node 22, 24 and 26.13.1: the test fails on 26 before the change and passes
on all three after it.

CI didn't catch it because every job pins Node 24, which has neither web
storage global. No Node 26 job was added: the tests no longer depend on which Node
defines those globals, and another job costs a CI run per push.
