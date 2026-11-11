#!/usr/bin/env bash
# Fills apple/build/ with what the Xcode project links and bundles, then
# generates Ganymede.xcodeproj:
#   GanymedeFFI.xcframework  from tlockney/ganymede, one of:
#     GANYMEDE_DIR=<checkout>  builds it there (scripts/build-xcframework.sh);
#                              needs Rust (rustup) and Xcode's iOS SDKs
#     GANYMEDE_REF=<tag>       downloads that release's
#                              GanymedeFFI.xcframework.zip and checks its
#                              SHA-256 (#359); GANYMEDE_DIR wins if both
#     GANYMEDE_XCFRAMEWORK=<dir>  copies one built earlier, such as CI's
#                              cache for a pinned commit; wins over both
#   web/                     this repo's `npm run build`
#   quicklook/               its `npm run build:quicklook` (#135)
#   runner/                  its `npm run build:runner` (#69, a spike)
# Needs macOS with Xcode, Node, and XcodeGen.
#   GANYMEDE_DIR=~/src/ganymede apple/scripts/bootstrap.sh
#   GANYMEDE_REF=v0.8.0 apple/scripts/bootstrap.sh
set -euo pipefail
apple=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$apple/.." && pwd)
ganymede=${GANYMEDE_DIR:-}
ref=${GANYMEDE_REF:-}
prebuilt=${GANYMEDE_XCFRAMEWORK:-}
if [ -z "$ganymede" ] && [ -z "$ref" ] && [ -z "$prebuilt" ]; then
  echo "error: set GANYMEDE_DIR to a checkout of tlockney/ganymede, or GANYMEDE_REF to its release tag" >&2
  exit 1
fi
mkdir -p "$apple/build"

build_xcframework() {
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
}

# The release asset: GanymedeFFI.xcframework plus LICENSE and
# THIRD-PARTY-NOTICES, built by ganymede's release.yml with the same
# script. A missing asset or a checksum mismatch fails.
download_xcframework() {
  local url="https://github.com/tlockney/ganymede/releases/download/$ref/GanymedeFFI.xcframework.zip"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  echo "Downloading GanymedeFFI.xcframework for $ref"
  curl -fsSL --retry 3 -o "$tmp/GanymedeFFI.xcframework.zip" "$url" || {
    echo "error: ganymede release '$ref' has no GanymedeFFI.xcframework.zip. Releases after v0.7.0 carry it; for a commit, set GANYMEDE_DIR to a checkout to build it." >&2
    exit 1
  }
  curl -fsSL --retry 3 -o "$tmp/GanymedeFFI.xcframework.zip.sha256" "$url.sha256"
  (cd "$tmp" && shasum -a 256 -c GanymedeFFI.xcframework.zip.sha256)
  ditto -x -k "$tmp/GanymedeFFI.xcframework.zip" "$tmp/unzipped"
  rm -rf "$apple/build/GanymedeFFI.xcframework"
  mv "$tmp/unzipped/GanymedeFFI.xcframework" "$apple/build/"
}

copy_xcframework() {
  if [ ! -f "$prebuilt/Info.plist" ]; then
    echo "error: GANYMEDE_XCFRAMEWORK=$prebuilt is not an XCFramework" >&2
    exit 1
  fi
  rm -rf "$apple/build/GanymedeFFI.xcframework"
  cp -R "$prebuilt" "$apple/build/GanymedeFFI.xcframework"
}

if [ -n "$prebuilt" ]; then copy_xcframework
elif [ -n "$ganymede" ]; then build_xcframework
else download_xcframework; fi

(cd "$repo" && { [ -d node_modules ] || npm ci; } && npm run build)
# Release builds (SENTRY_SOURCEMAPS=1): the web UI's source maps go to
# Sentry, not into the app (#319).
if [ "${SENTRY_SOURCEMAPS:-}" = 1 ]; then "$repo/scripts/sentry-sourcemaps.sh" "$repo/dist"; fi
rm -rf "$apple/build/web"
cp -R "$repo/dist" "$apple/build/web"
(cd "$repo" && npm run build:quicklook)
rm -rf "$apple/build/quicklook"
cp -R "$repo/dist-quicklook" "$apple/build/quicklook"
(cd "$repo" && npm run build:runner)
rm -rf "$apple/build/runner"
cp -R "$repo/dist-runner" "$apple/build/runner"

(cd "$apple" && xcodegen generate)
# The packages' exact commits (#122): builds use only these
# (-onlyUsePackageVersionsFromResolvedFile); scripts/update-packages.sh
# changes them.
swiftpm="$apple/Ganymede.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
mkdir -p "$swiftpm"
cp "$apple/Package.resolved" "$swiftpm/Package.resolved"
echo "open $apple/Ganymede.xcodeproj"
