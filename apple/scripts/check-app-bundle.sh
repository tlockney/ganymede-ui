#!/usr/bin/env bash
# Checks what the Mac app bundle must carry, whatever its configuration:
# ci.yml runs it on the Debug build its tests ran, and release-app.sh on
# the archived Release build before re-signing and notarizing it
# (main-build.yml and release.yml, #549). PlistBuddy's own errors stay
# on stderr, so a failure says whether the file or the key is missing.
#
#   apple/scripts/check-app-bundle.sh path/to/Ganymede.app
set -euo pipefail
app=${1:?usage: check-app-bundle.sh path/to/Ganymede.app}
fail() {
  echo "::error::$app: $*" >&2
  exit 1
}
[[ -d "$app" ]] || fail "no app bundle"
plist() { /usr/libexec/PlistBuddy -c "Print :$2" "$1" || true; }

# Finder can open notebooks with it (#130).
[[ "$(plist "$app/Contents/Info.plist" UTImportedTypeDeclarations:0:UTTypeIdentifier)" == org.jupyter.ipynb ]] ||
  fail "UTImportedTypeDeclarations doesn't declare org.jupyter.ipynb"
# Quick Look preview and thumbnails (#135), the share sheet's Run a
# Notebook (#449) and the notebook widget (#436).
plugins=$app/Contents/PlugIns
for ext in GanymedeQuickLook:com.apple.quicklook.preview GanymedeThumbnail:com.apple.quicklook.thumbnail GanymedeShare:com.apple.share-services GanymedeWidgets:com.apple.widgetkit-extension; do
  name=${ext%%:*}
  point=${ext#*:}
  [[ "$(plist "$plugins/$name.appex/Contents/Info.plist" NSExtension:NSExtensionPointIdentifier)" == "$point" ]] ||
    fail "$name.appex is missing or isn't a $point extension"
done
# The Quick Look preview's page (#135).
[[ -f "$plugins/GanymedeQuickLook.appex/Contents/Resources/quicklook/preview.html" ]] ||
  fail "GanymedeQuickLook.appex has no quicklook/preview.html"
# Settings > Developer's engine benchmark files, with the bundled packages' notices (#698).
for file in web/index.html web/bench.js web/worker.js workloads/manifest.json dist/strip-bundle.js dist/LICENSES.txt; do
  [[ -f "$app/Contents/Resources/Bench/$file" ]] || fail "no Resources/Bench/$file (the engine benchmark's files)"
done
# The command line tool Settings links (#686), bundled only when
# bootstrap.sh had one: then it must run.
cli=$app/Contents/Helpers/ganymede
if [[ -e "$cli" ]]; then
  [[ -x "$cli" ]] || fail "Contents/Helpers/ganymede isn't executable"
  "$cli" --version > /dev/null || fail "Contents/Helpers/ganymede --version fails"
fi
echo "app bundle checks passed: $app"
