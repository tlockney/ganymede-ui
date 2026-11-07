## 2026-11-07, download the XCFramework from a ganymede release (#359)

`apple/scripts/bootstrap.sh` built ganymede-ffi from a checkout of
tlockney/ganymede on every run: 10.3 of macos-app's 24 min, and 25 and
18 min of the v0.5.0 release's macos and ios jobs, for a ref that hadn't
changed. ganymede's releases now carry `GanymedeFFI.xcframework.zip`
and its `.sha256` (tlockney/ganymede#456), built by the same script.

With `GANYMEDE_REF` set to a release tag and no `GANYMEDE_DIR`,
bootstrap downloads that zip, checks it against the `.sha256`, and
unpacks the framework; a missing asset or a mismatch fails. A commit
SHA, or a local `GANYMEDE_DIR`, still builds from source. ci.yml's
macos-app and release.yml's macos and ios jobs check out ganymede and
install Rust only when `GANYMEDE_REF` isn't a `v` tag.

The pin is a commit today (#356 needs ganymede main), so CI keeps
building until it moves to the first ganymede release after v0.7.0;
v0.7.0 itself has no XCFramework asset.
