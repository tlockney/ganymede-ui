#!/usr/bin/env bash
# Re-resolves the Swift packages after a change to project.yml's
# `packages`, and records the result in apple/Package.resolved, which
# builds then use as is. Run after bootstrap.sh; review the diff.
#   apple/scripts/update-packages.sh
set -euo pipefail
apple=$(cd "$(dirname "$0")/.." && pwd)
swiftpm="$apple/Ganymede.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
(cd "$apple" && xcodegen generate)
rm -f "$swiftpm/Package.resolved"
xcodebuild -resolvePackageDependencies -project "$apple/Ganymede.xcodeproj" -scheme Ganymede
cp "$swiftpm/Package.resolved" "$apple/Package.resolved"
git -C "$apple" diff --stat -- Package.resolved
