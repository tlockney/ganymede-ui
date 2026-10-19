#!/usr/bin/env bash
# Fills apple/build/ with what the Xcode project links and bundles, then
# generates Ganymede.xcodeproj:
#   GanymedeFFI.xcframework  from a checkout of tlockney/ganymede
#   web/                     this repo's `npm run build`
# Needs macOS with Xcode, Rust (rustup), Node, and XcodeGen.
#   GANYMEDE_DIR=~/src/ganymede apple/scripts/bootstrap.sh
set -euo pipefail
apple=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$apple/.." && pwd)
ganymede=${GANYMEDE_DIR:?set GANYMEDE_DIR to a checkout of tlockney/ganymede}
mkdir -p "$apple/build"

rustup target add aarch64-apple-darwin x86_64-apple-darwin aarch64-apple-ios aarch64-apple-ios-sim
(cd "$ganymede" && scripts/build-xcframework.sh)
rm -rf "$apple/build/GanymedeFFI.xcframework"
cp -R "$ganymede/target/xcframework/GanymedeFFI.xcframework" "$apple/build/"

(cd "$repo" && { [ -d node_modules ] || npm ci; } && npm run build)
rm -rf "$apple/build/web"
cp -R "$repo/dist" "$apple/build/web"

(cd "$apple" && xcodegen generate)
echo "open $apple/Ganymede.xcodeproj"
