## 2026-11-03, bootstrap.sh checks the iOS SDK (#186)

- With `xcode-select` on the Command Line Tools, or Xcode without its iOS
  platform (a separate download since Xcode 15), `xcrun --sdk iphoneos`
  fails. bootstrap.sh used to get as far as `ring`'s build script inside
  the XCFramework build and stop there with
  `SDK "iphoneos" cannot be located`. It now checks both iOS SDKs first
  and prints the fix: `xcode-select -s` when the developer directory
  isn't an Xcode app, otherwise `xcodebuild -downloadPlatform iOS`.
