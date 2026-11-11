## 2026-11-11, releases pick up the latest dependencies (#489)

Each release round had pin pull requests on both sides of this repo's
release: cdp-kernel before it, and `GANYMEDE_REF` back to a Ganymede tag
after Ganymede's release. Between releases the pin was always a
Ganymede commit, so the release built ganymede-ffi from source in both
the `macos` and `ios` jobs (8 and 15 minutes of bootstrap on v0.6.0)
and the XCFramework download (#359) never applied.

The order is now cdp-kernel, Ganymede, ganymede-ui (ganymede#673), and
`scripts/release.sh` writes the latest cdp-kernel and Ganymede releases
into the release commit through `scripts/release-pins.sh`. A
`GANYMEDE_REF` commit is moved to the latest tag only when GitHub's
compare says the tag contains it; otherwise the script stops and says to
release Ganymede first, so a release can't quietly link an older
ganymede-ffi than main tested. When it moves to a tag it drops the
comment lines explaining why a commit was pinned.

The script does every lookup and check before it writes, so a stop
leaves the tree as it was, and it rejects arguments other than
`--check`. A dry run of `scripts/release.sh` warns about a pin that
would stop `--execute` and still prints the changelog preview.

Before moving `GANYMEDE_REF`, the script also checks that the tag's
release carries `GanymedeFFI.xcframework.zip`. Ganymede releases before
v0.8.0 don't, and without it the app builds fall back to building
ganymede-ffi from source, which the move is meant to avoid.
