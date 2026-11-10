## 2026-11-10, release.sh and tag-release resume after a partial failure (#457)

`scripts/release.sh --execute` could not be finished once it failed. A
failure after its commit left it on `release/vX.Y.Z`, where a rerun
refused because HEAD was not `main`. A failure before the commit, such
as git-cliff's, left `package.json` and `package-lock.json` bumped, and
every later run then stopped on "the working tree has changes". This
ports the resume path Ganymede's script got in tlockney/ganymede#572.

Run from a `release/vX.Y.Z` branch whose head is "Release X.Y.Z", with
`--execute`, the script now skips the bump, pushes, and opens what is
missing: the release issue (an open one with that title is reused), the
pull request (skipped when one is open), and the Ganymede docs issue
(skipped when one with that title exists, open or closed). An open pull
request no longer ends the run, because here the docs issue comes after
it. Before the commit, an exit trap puts the three files back and, if
the branch was already made, returns to where the run started and
deletes it. It restores from `HEAD`, not from the index: by the time a
commit fails the files are staged, and a plain `git checkout -- file`
would restore the bump. A fresh run that finds the branch, here or on
origin, stops before git-cliff runs and says to resume from it.

A resume stops when the version is tagged on origin or the branch's
pull request has merged (the review's finding). Without that it pushed
the branch back after the merge deleted it, found no open pull request
and no open release issue, and so opened a second issue and tried to
open a second pull request. A pull request closed without merging
doesn't stop it: the open issue is reused and a new pull request opens.

`tag-release.yml` exited as soon as the tag existed, so a run that
pushed the tag and then failed to start `release.yml` could not be
finished by a rerun. As in Ganymede, it now starts the release when the
tag is on this commit and there is neither a release nor a `release.yml`
run for the tag.

Tested in a scratch repository with stub `git-cliff` and `gh`, and
Ganymede's notes read from a local repository through `url.insteadOf`.
With the old script, a git-cliff failure leaves both files changed and
blocks every later run. With the new one: a dry run, a git-cliff
failure, a failing commit hook and an already tagged version each leave
the tree clean on `main` with no new branch; failures at the release
issue, the pull request and the docs issue are each finished by a rerun,
with one of each at the end; a further rerun opens nothing; a rerun
after the pull request merged, or with the tag on origin, stops before
the push and opens nothing; a rerun after the pull request was closed
unmerged opens a new one on the same issue. The
workflow's step, taken from the YAML and run with a stub `gh`: it tags
and starts the release when there is no tag; starts it when the tag is
on the commit and nothing has run (a lightweight or an annotated tag);
and does nothing when a run or a release exists or the tag is on
another commit.
