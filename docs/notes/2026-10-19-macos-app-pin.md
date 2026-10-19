## 2026-10-19, pin the ganymede commit for the macOS app (#40)

The macos-app job checked out tlockney/ganymede at the branch of
tlockney/ganymede#162, which goes away after the merge. It now pins the
merge commit; move it to a release tag once one ships the XCFramework.
