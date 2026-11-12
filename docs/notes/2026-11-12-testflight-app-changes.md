## 2026-11-12, TestFlight notes list only changes to the app (#513)

The v0.8.0 TestFlight notes listed every pull request since v0.7.0, so
testers read about CI caches, release scripts and the notes script
itself. The notes now keep a pull request only when its diff against
main's previous commit touches files that ship in the iPad and iPhone
app (web sources and assets, bundled examples, dependencies, Swift
sources and resources), not counting tests. Dependency bumps, release
commits and `Mac:` changes are left out too.

The filter goes by files rather than by title prefixes: titles such as
"Pin ganymede v0.8.0" or "Release: pick up ..." don't say whether they
change the app, but their files do. A ganymede pin only in `ci.yml`
changes the bundled server, yet it is left out; the user-facing changes
that pin brings show up in ganymede's own release notes. For v0.7.0..HEAD
the notes go from twelve lines to five.
