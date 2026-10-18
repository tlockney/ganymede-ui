## 2026-10-18, release pipeline (#4)

Releases follow tlockney/ganymede's flow, adapted for npm.
`scripts/release.sh <level>` bumps `package.json` (and the lockfile)
with `npm version`, regenerates `CHANGELOG.md` with git-cliff, and with
`--execute` opens a `release/vX.Y.Z` pull request. Merging it lets
`tag-release.yml` tag the commit and start `release.yml`, which runs CI,
builds, and publishes `ganymede-ui-X.Y.Z.tar.gz` and `.zip` with
`SHA256SUMS` and a build provenance attestation. See
[Releasing](../releasing.md).

Differences from ganymede, and why:

- `tag-release.yml` also triggers on `CHANGELOG.md`. A first release of
  the version already in `package.json` changes only the changelog.
- `release.yml`'s concurrency group is `release-<ref>`, not the workflow
  name: it calls `ci.yml` (now `workflow_call`), and a called workflow
  that computes the same group waits on its caller forever.
- `cliff.toml` skips the "Release vX.Y.Z" pull request itself, so it
  doesn't appear as a change in the next regenerated changelog.

The artifact is the static app, so Ganymede can serve the unpacked
directory, and a later `ganymede ui install` can fetch it. Not run yet:
`--execute` and both workflows on GitHub; the first release exercises
them.
