# Releasing

How a release is cut, what it publishes, and what to do when it fails
partway through.

## The normal path

1. From an up-to-date `main`, `scripts/release.sh <level>` previews the
   version bump and the changelog. With `--execute` it bumps `package.json`
   and `package-lock.json`, regenerates `CHANGELOG.md`, commits them on
   `release/vX.Y.Z`, pushes, and opens an issue and a pull request. The
   level is `patch`, `minor`, `major`, or an explicit version; the first
   release can be the version already in `package.json`
   (`scripts/release.sh 0.0.1`).
2. Merging that pull request (with CI green; branch protection on `main`
   is what guarantees this, since `tag-release.yml` does not check CI
   itself) runs `tag-release.yml`. It sees a `package.json` version that
   has a `CHANGELOG.md` section and no tag, tags the merge commit
   `vX.Y.Z`, and starts `release.yml` on the tag.
3. `release.yml` checks that the tag matches `package.json`, runs CI
   (`ci.yml`) on the tag, builds the app, packages `dist/` as
   `ganymede-ui-X.Y.Z.tar.gz` and `ganymede-ui-X.Y.Z.zip` with a
   `SHA256SUMS` file, attests their build provenance, and publishes the
   GitHub Release with the changelog section as notes. A version with a
   hyphen (`0.2.0-rc.1`) is published as a prerelease.

The script needs `gh` to open the issue and pull request; without it, it
pushes the branch and says what to open by hand. It runs `git-cliff` from
`PATH` if installed, otherwise through `npx`.

Then check the result:

```sh
gh release view vX.Y.Z --repo tlockney/ganymede-ui
gh release download vX.Y.Z --repo tlockney/ganymede-ui
sha256sum -c SHA256SUMS
gh attestation verify ganymede-ui-X.Y.Z.tar.gz --repo tlockney/ganymede-ui
```

Each archive unpacks to `ganymede-ui-X.Y.Z/`, the built site with
`index.html` at its top. Serve that directory as static files.

## When it fails

Find the failed `release.yml` run under the tag in the Actions tab. The
tag already exists, so pushing to `main` or rerunning `tag-release.yml`
does nothing ("vX.Y.Z exists; nothing to do"). Recover from the release
workflow itself, depending on how far it got.

### A job failed and nothing was published

A flaky runner, a network error, or an npm download that timed out: the
code is fine. Rerun the failed jobs from the run's page, or start a fresh
run on the tag:

```sh
gh run rerun <run-id> --failed --repo tlockney/ganymede-ui
# or
gh workflow run release.yml --ref vX.Y.Z --repo tlockney/ganymede-ui
```

### The tagged commit cannot be released

CI, the build, or the version check fails for a reason that needs a code
change. If no GitHub Release exists for the tag, nobody can have
downloaded it, so move the tag:

1. Delete the tag: `git push origin :refs/tags/vX.Y.Z`.
2. Fix the problem in a pull request to `main`, as usual.
3. Retag the new head of `main` and start the release:
   `gh workflow run tag-release.yml --ref main --repo tlockney/ganymede-ui`.

The changelog section stays as `scripts/release.sh` wrote it; the fix
appears in the next release's notes.

### The release was published, but is wrong or incomplete

Once a release is public, someone may have downloaded or deployed it.
Don't replace its assets or move its tag. Fix the problem on `main` and
cut a patch release with `scripts/release.sh patch`. If the broken release
must not be used, mark it a prerelease, so `releases/latest` moves back to
the one before:

```sh
gh release edit vX.Y.Z --prerelease --repo tlockney/ganymede-ui
```

### Publishing failed after the release was created

If the `release` job created the GitHub Release and then failed to upload
part of it, a rerun fails because the release exists. Within minutes of
the failure, while it is plainly incomplete, delete the release but keep
the tag, then rerun the job:

```sh
gh release delete vX.Y.Z --yes --repo tlockney/ganymede-ui   # no --cleanup-tag
gh run rerun <run-id> --failed --repo tlockney/ganymede-ui
```

A rerun of only the failed job reuses the archives the build job already
uploaded, so it attests the same files again, which is harmless. A fresh
run rebuilds them, and the new archives get their own attestations.
