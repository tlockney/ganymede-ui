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
#   cli/ganymede             the `ganymede` command line tool the Mac app
#                            bundles in Contents/Helpers and links from
#                            Settings (#686), from the first that applies:
#                              GANYMEDE_CLI=none      bundles none (iOS-only jobs)
#                              GANYMEDE_CLI=<binary>  copies it
#                              GANYMEDE_DIR=<checkout>  `cargo build
#                                --release -p ganymede-cli --target
#                                aarch64-apple-darwin` there, if its
#                                update.rs has the #883 guard
#                              GANYMEDE_REF=<tag>     downloads that
#                                release's ganymede-<version>-aarch64-apple-darwin.tar.gz
#                                and checks its SHA-256
#                            Only a release after v0.13.0 is bundled. Up
#                            to 0.13.0, `ganymede update` replaces the
#                            binary where it is, which would break the
#                            app's code signature (tlockney/ganymede#883),
#                            so for an older tag, or with only
#                            GANYMEDE_XCFRAMEWORK, this skips the CLI with
#                            a message and the app builds without it.
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

# The command line tool the Mac app bundles (#686): build/cli/ganymede,
# which project.yml's build phase copies into the app. A stale one from an
# earlier run is removed first, so a skipped step never bundles it.
cli_out="$apple/build/cli/ganymede"
rm -rf "$apple/build/cli"

# 0 when $1 (X.Y.Z, optionally with a leading v) is later than $2.
version_after() {
  local a=${1#v} b=${2#v} i x y
  a=${a%%-*}; b=${b%%-*}
  local -a pa pb
  IFS=. read -r -a pa <<< "$a"
  IFS=. read -r -a pb <<< "$b"
  for i in 0 1 2; do
    x=${pa[$i]:-0}; y=${pb[$i]:-0}
    case $x$y in *[!0-9]*) return 1 ;; esac
    if [ "$x" -gt "$y" ]; then return 0; fi
    if [ "$x" -lt "$y" ]; then return 1; fi
  done
  return 1
}

install_cli() {
  mkdir -p "$apple/build/cli" && cp "$1" "$cli_out" && chmod 755 "$cli_out" || {
    echo "error: couldn't copy the ganymede command line tool from $1" >&2
    return 1
  }
}

download_cli() {
  local version=${ref#v}
  local name="ganymede-$version-aarch64-apple-darwin"
  local url="https://github.com/tlockney/ganymede/releases/download/$ref/$name.tar.gz"
  local dl
  dl=$(mktemp -d)
  # Each step removes the temporary folder when it fails; set -e doesn't
  # reach a failure inside a || list.
  echo "Downloading the ganymede command line tool for $ref"
  curl -fsSL --retry 3 -o "$dl/$name.tar.gz" "$url" || {
    rm -rf "$dl"
    echo "error: ganymede release '$ref' has no $name.tar.gz" >&2
    return 1
  }
  curl -fsSL --retry 3 -o "$dl/$name.tar.gz.sha256" "$url.sha256" || {
    rm -rf "$dl"
    echo "error: ganymede release '$ref' has no $name.tar.gz.sha256" >&2
    return 1
  }
  (cd "$dl" && shasum -a 256 -c "$name.tar.gz.sha256") || { rm -rf "$dl"; return 1; }
  tar -xzf "$dl/$name.tar.gz" -C "$dl" || { rm -rf "$dl"; return 1; }
  install_cli "$dl/$name/ganymede" || { rm -rf "$dl"; return 1; }
  rm -rf "$dl"
}

skip_cli() {
  echo "note: not bundling the ganymede command line tool. Bundle one with GANYMEDE_CLI=<binary>, a GANYMEDE_DIR checkout with the #883 guard in crates/ganymede-cli/src/update.rs, or a GANYMEDE_REF later than v0.13.0: releases up to 0.13.0 have a \`ganymede update\` that would overwrite the bundled copy and break the app's signature (tlockney/ganymede#883)." >&2
}

if [ "${GANYMEDE_CLI:-}" = none ]; then
  echo "not bundling the ganymede command line tool (GANYMEDE_CLI=none)"
elif [ -n "${GANYMEDE_CLI:-}" ]; then
  [ -f "$GANYMEDE_CLI" ] && [ -x "$GANYMEDE_CLI" ] || {
    echo "error: GANYMEDE_CLI=$GANYMEDE_CLI is not an executable file" >&2
    exit 1
  }
  install_cli "$GANYMEDE_CLI"
elif [ -n "$ganymede" ]; then
  # A checkout from before ganymede#883 has an `update` that would
  # replace the bundled copy.
  if grep -q 'comes with the Ganymede app' "$ganymede/crates/ganymede-cli/src/update.rs" 2>/dev/null; then
    rustup target add aarch64-apple-darwin
    (cd "$ganymede" && cargo build --release -p ganymede-cli --target aarch64-apple-darwin)
    install_cli "$ganymede/target/aarch64-apple-darwin/release/ganymede"
  else
    skip_cli
  fi
elif [ -n "$ref" ] && version_after "$ref" v0.13.0; then
  download_cli
else
  skip_cli
fi
if [ -f "$cli_out" ]; then echo "bundling the ganymede command line tool: $("$cli_out" --version 2>&1 | head -n 1)"; fi

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
