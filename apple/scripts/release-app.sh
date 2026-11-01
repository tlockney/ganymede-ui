#!/usr/bin/env bash
# Builds the Mac app for a release: a universal Release archive signed with
# a Developer ID Application certificate, notarized by Apple, stapled, and
# zipped as apple/build/Ganymede-macOS-$VERSION.zip. Run after
# bootstrap.sh. release.yml runs it; it also runs on a Mac with the same
# variables set.
#
#   VERSION                     the app's version (CFBundleShortVersionString)
#   BUILD_NUMBER                CFBundleVersion (default 1)
#   APPLE_TEAM_ID               the Developer ID team
#   MACOS_CERTIFICATE_P12       the certificate and private key, base64; when
#   MACOS_CERTIFICATE_PASSWORD  unset, the login keychain must hold it
#   APPSTORE_API_KEY_P8         App Store Connect API key for notarytool, base64
#   APPSTORE_API_KEY_ID
#   APPSTORE_API_ISSUER_ID
set -euo pipefail
apple=$(cd "$(dirname "$0")/.." && pwd)
build="$apple/build"

missing=()
for name in VERSION APPLE_TEAM_ID APPSTORE_API_KEY_P8 APPSTORE_API_KEY_ID APPSTORE_API_ISSUER_ID; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
if [[ -n "${MACOS_CERTIFICATE_P12:-}" && -z "${MACOS_CERTIFICATE_PASSWORD:-}" ]]; then
  missing+=(MACOS_CERTIFICATE_PASSWORD)
fi
if ((${#missing[@]})); then
  echo "::error::not set: ${missing[*]} (repository secrets, docs/releasing.md)" >&2
  exit 1
fi

work=$(mktemp -d)
keychain="$work/signing.keychain-db"
cleanup() {
  [[ -f "$keychain" ]] && security delete-keychain "$keychain" || true
  rm -rf "$work"
}
trap cleanup EXIT

# The certificate goes into a keychain of its own, unlocked for this run
# and deleted at the end; codesign finds it through the search list.
if [[ -n "${MACOS_CERTIFICATE_P12:-}" ]]; then
  password=$(uuidgen)
  echo "$MACOS_CERTIFICATE_P12" | base64 --decode > "$work/cert.p12"
  security create-keychain -p "$password" "$keychain"
  security set-keychain-settings -lut 3600 "$keychain"
  security unlock-keychain -p "$password" "$keychain"
  security import "$work/cert.p12" -k "$keychain" -P "$MACOS_CERTIFICATE_PASSWORD" \
    -T /usr/bin/codesign -T /usr/bin/security
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain" > /dev/null
  # shellcheck disable=SC2046 # the existing list, one path per word
  security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
  rm "$work/cert.p12"
fi
identity="Developer ID Application"
security find-identity -v -p codesigning | grep -q "$identity" || {
  echo "::error::no \"$identity\" identity in the keychain" >&2
  exit 1
}

# Archive. Hardened runtime and the entitlements come from project.yml;
# a secure timestamp is required for notarization.
archive="$build/Ganymede.xcarchive"
rm -rf "$archive"
xcodebuild archive -project "$apple/Ganymede.xcodeproj" -scheme Ganymede \
  -configuration Release -destination 'generic/platform=macOS' \
  -archivePath "$archive" -derivedDataPath "$build/DerivedData" \
  -skipPackagePluginValidation \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$identity" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  OTHER_CODE_SIGN_FLAGS="--timestamp" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="${BUILD_NUMBER:-1}"
app="$work/Ganymede.app"
ditto "$archive/Products/Applications/Ganymede.app" "$app"

# What notarization requires, checked here so a failure names it.
fail() {
  echo "::error::$*" >&2
  exit 1
}
plist="$app/Contents/Info.plist"
shown=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")
[[ "$shown" == "$VERSION" ]] || fail "CFBundleShortVersionString is $shown, not $VERSION"
codesign --verify --deep --strict --verbose=2 "$app"
details=$(codesign -dvv "$app" 2>&1)
echo "$details"
grep -q "TeamIdentifier=$APPLE_TEAM_ID" <<< "$details" || fail "not signed by team APPLE_TEAM_ID"
grep -q 'flags=.*runtime' <<< "$details" || fail "hardened runtime is off"
grep -q '^Timestamp=' <<< "$details" || fail "the signature has no secure timestamp"
if codesign -d --entitlements - --xml "$app" 2>/dev/null | grep -q get-task-allow; then
  fail "the app has the get-task-allow entitlement, which notarization rejects"
fi
lipo -archs "$app/Contents/MacOS/Ganymede"

# Notarize. notarytool takes a zip; the ticket is then stapled to the app
# so Gatekeeper accepts it offline, and the stapled app is zipped again.
echo "$APPSTORE_API_KEY_P8" | base64 --decode > "$work/AuthKey.p8"
notary=(--key "$work/AuthKey.p8" --key-id "$APPSTORE_API_KEY_ID" --issuer "$APPSTORE_API_ISSUER_ID")
ditto -c -k --keepParent "$app" "$work/notarize.zip"
xcrun notarytool submit "$work/notarize.zip" "${notary[@]}" \
  --wait --timeout 45m --output-format json | tee "$work/submit.json"
id=$(plutil -extract id raw "$work/submit.json")
status=$(plutil -extract status raw "$work/submit.json")
xcrun notarytool log "$id" "${notary[@]}" || true
if [[ "$status" != Accepted ]]; then
  echo "::error::notarization $id: $status (the log above says why)" >&2
  exit 1
fi
xcrun stapler staple "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"

zip="$build/Ganymede-macOS-$VERSION.zip"
rm -f "$zip"
ditto -c -k --keepParent "$app" "$zip"
(cd "$build" && shasum -a 256 "$(basename "$zip")" | tee SHA256SUMS-macOS)
