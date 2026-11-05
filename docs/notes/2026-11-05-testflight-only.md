## 2026-11-05, TestFlight-only Release runs (#188)

`release.yml` takes a `testflight_only` input on manual runs. It skips the
`build` (web archives) and `macos` jobs, so a run on `main` puts the
current code on TestFlight without a release or a notarized Mac app.

- `version` and CI still run first: the `ios` job needs it, and a skipped `needs` job
  would skip `ios` too.
- On tag pushes `inputs` is empty, so `!inputs.testflight_only` is true
  and releases run every job as before.
- `version` fails a `testflight_only` run on a tag: it would skip the
  `release` job and end green without publishing anything.
