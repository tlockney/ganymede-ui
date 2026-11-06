## 2026-11-06, Skip CI jobs a pull request can't affect (#344)

The 0.4.1 release PR (#343) changed the version, CHANGELOG.md and docs,
and still waited on `macos-app`, the slowest job. A `changes` job now
runs `scripts/ci-changes.sh`, which diffs the PR's merge commit against
its first parent and says whether `e2e` and `macos-app` are needed.
Docs, Markdown, and a `package.json`/`package-lock.json` diff that only
touches `"version"` lines need neither; `apple/` alone skips e2e;
`e2e/` alone skips the app. Anything else runs both.

The ruleset requires `build`, `e2e` and `macos-app` by name. A job
skipped by its `if` reports success, so a skip doesn't block the PR. The
`if` is `!cancelled() && output != 'false'`, so if `changes` itself
fails, its outputs are empty and both jobs run. Pushes to `main` and
`release.yml`'s call of `ci.yml` aren't pull requests and run
everything. `build` always runs: it's fast and checks the docs.
