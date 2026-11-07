#!/usr/bin/env bash
# Fills apple/build/ with what the Xcode project links and bundles, then
# generates Ganymede.xcodeproj:
#   GanymedeFFI.xcframework  from a checkout of tlockney/ganymede
#   web/                     this repo's `npm run build`
#   quicklook/               its `npm run build:quicklook` (#135)
# Needs macOS with Xcode, Rust (rustup), Node, and XcodeGen.
#   GANYMEDE_DIR=~/src/ganymede apple/scripts/bootstrap.sh
set -euo pipefail
apple=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$apple/.." && pwd)
ganymede=${GANYMEDE_DIR:?set GANYMEDE_DIR to a checkout of tlockney/ganymede}
mkdir -p "$apple/build"

# The XCFramework's iOS slices need Xcode's iOS SDKs (#186). Without them
# the build fails much later, in a crate's build script, with no hint.
for sdk in iphoneos iphonesimulator; do
  if ! xcrun --sdk "$sdk" --show-sdk-path >/dev/null 2>&1; then
    echo "error: the $sdk SDK isn't available." >&2
    developer=$(xcode-select -p 2>/dev/null || true)
    case "$developer" in
      *.app/Contents/Developer)
        echo "Install Xcode's iOS platform: xcodebuild -downloadPlatform iOS" >&2
        echo "(or Xcode > Settings > Components), then run this again." >&2 ;;
      *)
        echo "xcode-select points at '${developer:-nothing}', not Xcode. Run:" >&2
        echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2 ;;
    esac
    exit 1
  fi
done

rustup target add aarch64-apple-darwin aarch64-apple-ios aarch64-apple-ios-sim
(cd "$ganymede" && scripts/build-xcframework.sh)
rm -rf "$apple/build/GanymedeFFI.xcframework"
cp -R "$ganymede/target/xcframework/GanymedeFFI.xcframework" "$apple/build/"

(cd "$repo" && { [ -d node_modules ] || npm ci; } && npm run build)
# Release builds (SENTRY_SOURCEMAPS=1): the web UI's source maps go to
# Sentry, not into the app (#319).
if [ "${SENTRY_SOURCEMAPS:-}" = 1 ]; then "$repo/scripts/sentry-sourcemaps.sh" "$repo/dist"; fi
rm -rf "$apple/build/web"
cp -R "$repo/dist" "$apple/build/web"
(cd "$repo" && npm run build:quicklook)
rm -rf "$apple/build/quicklook"
cp -R "$repo/dist-quicklook" "$apple/build/quicklook"

(cd "$apple" && xcodegen generate)
# The packages' exact commits (#122): builds use only these
# (-onlyUsePackageVersionsFromResolvedFile); scripts/update-packages.sh
# changes them.
swiftpm="$apple/Ganymede.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
mkdir -p "$swiftpm"
cp "$apple/Package.resolved" "$swiftpm/Package.resolved"
echo "open $apple/Ganymede.xcodeproj"
