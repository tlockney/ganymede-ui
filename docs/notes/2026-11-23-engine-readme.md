## 2026-11-23, apple/README after the engine decision (#780)

`apple/README.md`'s "Engine benchmark" section still read as if the engine
question were open: "If V8 isn't chosen, a follow-up drops it." The
decision on 2026-11-20 kept the in-app kernel on WebKit's Worker, and
ganymede `main` has since dropped the `v8-bench` feature (ganymede#921).
The section now says so, and that #765 removes V8, the benchmark and the
entitlement once a ganymede release without them is pinned. Found by the
docs freshness check.
