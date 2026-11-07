## 2026-11-07, Ganymede's app docs at release (#397)

- Ganymede's landing page and docs describe the apps, but nothing tied
  them to this repo's release. The macOS 26 / Apple silicon floor (#356)
  left the landing page's "macOS 13 or later, Apple silicon or Intel"
  to be changed by memory when the next release ships.
- Ganymede now marks such text `**Unreleased in ganymede-ui.**`
  (tlockney/ganymede#502), in a note or an HTML comment.
  `scripts/release.sh` reads those from Ganymede's `main` with a sparse,
  shallow clone, lists them in its output and the release PR, and with
  `--execute` and gh opens "Update docs for ganymede-ui vX.Y.Z" in
  tlockney/ganymede. The issue outlives the release PR, so the change is
  tracked rather than remembered.
- If the clone fails the script warns and goes on: a release shouldn't
  wait on reading another repo.
