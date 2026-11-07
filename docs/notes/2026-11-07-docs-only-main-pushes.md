## 2026-11-07, docs-only pushes to main skip the slow jobs (#360)

`scripts/ci-changes.sh` ran e2e and the 24 min macos-app job for every
push to main, so merging a docs-only PR still took a macOS runner that
other PRs across the four repos were queued for. A push to main now
diffs against `github.event.before` with the PR rules, fetching that
commit if the shallow checkout lacks it. A tag push (release.yml calls
ci.yml with the tag's push event), a zero base, or a base that can't be
fetched or diffed runs everything.
