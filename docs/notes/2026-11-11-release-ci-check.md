## 2026-11-11, check the release PR's CI instead of rerunning it (#491)

`release.yml` ran `ci.yml` (build and e2e) on the tag before any app
build started, the third run on that tree after the release PR's and
main's. On a tag it now asks GitHub whether the tagged commit is the
merge of a pull request into main and whether that PR's last CI run
passed, and starts `build`, `macos` and `ios` at once. Manual runs on a
branch still call `ci.yml`: a branch may never have been a pull
request.

The check looks at the PR's head, not main's push run of the merge
commit, because main's run (with `macos-app`) is usually still going
when the tag is pushed. The gap it leaves, a PR that passed on a stale
base, is the one branch protection already leaves.
