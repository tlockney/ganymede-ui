## 2026-11-10, TestFlight "What to Test" notes (#466)

`release.yml`'s `ios` job now sets each TestFlight build's "What to Test"
text after the upload (`scripts/testflight-notes.mjs`): the commit
subjects since the previous TestFlight build.

- No state outside App Store Connect: the notes end with `Built from
<commit>.`, and the next run reads that from the newest earlier build.
  A commit that isn't an ancestor of HEAD (a branch run) is skipped; with
  none, the list starts at the last `v*` tag before HEAD (described from
  `HEAD^`, so a release tag run doesn't start at its own tag). The `ios` checkout now
  fetches full history and tags for this.
- The script waits for processing to finish before writing the notes, as
  fastlane does; the job timeout went from 90 to 130 minutes for it.
- The JWT is signed with Node's `crypto` (ES256, `dsaEncoding:
'ieee-p1363'`) and the calls use `fetch`, so no new dependencies.
- The first build after this merges has no earlier build with the marker,
  so its notes start at v0.6.0.
