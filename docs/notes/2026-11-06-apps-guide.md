## 2026-11-06, The apps' user guide (#340)

The apps' user guide lived in apple/README.md, next to build and signing
steps, and the site renders only `docs/*.md`, so it wasn't on
ganymede-server.com. It moved to `docs/apps.md`, grouped by platform and
then by part of the window (sidebar, toolbar, kernels, terminals,
inspector, settings) instead of one long list. apple/README.md keeps how
the app works and how to build, sign and ship it.

When a change adds or changes something a user of the apps sees, update
`docs/apps.md`; apple/README.md only when the build or internals change.
