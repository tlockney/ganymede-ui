#!/usr/bin/env bash
# Builds the Mac app for a release: an arm64 Release archive signed with
# a Developer ID Application certificate, notarized by Apple, stapled, and
# zipped as apple/build/Ganymede-macOS-$VERSION.zip (Ganymede-macOS.zip
# with MAIN_BUILD=1, below). Run after
# bootstrap.sh. release.yml runs it; it also runs on a Mac with the same
# variables set.
#
#   VERSION                     the app's version (CFBundleShortVersionString)
#   BUILD_NUMBER                CFBundleVersion (default 1; required with
#                               MAIN_BUILD=1)
#   APPLE_TEAM_ID               the Developer ID team
#   MACOS_CERTIFICATE_P12       the certificate and private key, base64; when
#   MACOS_CERTIFICATE_PASSWORD  unset, the login keychain must hold it
#   APPSTORE_API_KEY_P8         App Store Connect API key for notarytool, base64
#   APPSTORE_API_KEY_ID
#   APPSTORE_API_ISSUER_ID
#   SPARKLE_ED_PRIVATE_KEY      the key updates are signed with (#411): the
#                               base64 seed from Sparkle's generate_keys -x
#   GITHUB_REPOSITORY           where releases are published (default
#                               tlockney/ganymede-ui), for the update feed
#   MAIN_BUILD                  1 for a build of main (main-build.yml, #539):
#                               the zip is Ganymede-macOS.zip and no feed
#                               is written, so it signs no update and takes
#   SPARKLE_PUBLIC_ED_KEY       the latest release's public key instead of
#                               SPARKLE_ED_PRIVATE_KEY
#
# Except with MAIN_BUILD=1, it also writes apple/build/appcast.xml, the update feed the app reads
# from the latest release, signed with the same key. A main build reads
# the same feed but publishes none, so releases never offer it.
set -euo pipefail
apple=$(cd "$(dirname "$0")/.." && pwd)
build="$apple/build"

missing=()
main_build=false
[[ "${MAIN_BUILD:-}" == 1 ]] && main_build=true
if $main_build; then update_key=SPARKLE_PUBLIC_ED_KEY; else update_key=SPARKLE_ED_PRIVATE_KEY; fi
required=(VERSION APPLE_TEAM_ID APPSTORE_API_KEY_P8 APPSTORE_API_KEY_ID APPSTORE_API_ISSUER_ID "$update_key")
# Below the latest release's, Sparkle would offer that release over it.
$main_build && required+=(BUILD_NUMBER)
for name in "${required[@]}"; do
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

# Updates (#411): the app reads the feed attached to the latest release
# and accepts only updates signed with this key.
repo="${GITHUB_REPOSITORY:-tlockney/ganymede-ui}"
feed_url="https://github.com/$repo/releases/latest/download/appcast.xml"
sparkle_key() { xcrun swift "$apple/scripts/sparkle-key.swift" "$@"; }
if $main_build; then
  public_key=$SPARKLE_PUBLIC_ED_KEY
else
  public_key=$(sparkle_key public-key)
fi
echo "update signing public key: $public_key"

# Archive. Hardened runtime and the entitlements come from project.yml;
# a secure timestamp is required for notarization.
archive="$build/Ganymede.xcarchive"
rm -rf "$archive"
xcodebuild archive -project "$apple/Ganymede.xcodeproj" -scheme Ganymede \
  -configuration Release -destination 'generic/platform=macOS' \
  -archivePath "$archive" -derivedDataPath "$build/DerivedData" \
  -skipPackagePluginValidation -onlyUsePackageVersionsFromResolvedFile \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$identity" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  OTHER_CODE_SIGN_FLAGS="--timestamp" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="${BUILD_NUMBER:-1}" \
  SPARKLE_FEED_URL="$feed_url" SPARKLE_PUBLIC_ED_KEY="$public_key"
app="$work/Ganymede.app"
ditto "$archive/Products/Applications/Ganymede.app" "$app"
# What the bundle must carry (file types, extensions, Quick Look's page),
# as CI checks the Debug build (#549).
"$apple/scripts/check-app-bundle.sh" "$app"

# Sparkle's helpers come signed by Sparkle, not with this identity and the
# timestamp notarization requires: sign them, innermost first, then the
# framework and the app again, keeping their entitlements (Sparkle's
# documentation, "Code signing").
sparkle="$app/Contents/Frameworks/Sparkle.framework"
[[ -d "$sparkle" ]] || {
  echo "::error::Sparkle.framework is not in the app" >&2
  exit 1
}
sign() {
  codesign --force --sign "$identity" --options runtime --timestamp \
    --preserve-metadata=entitlements "$@"
}
for helper in "$sparkle"/Versions/B/XPCServices/*.xpc "$sparkle/Versions/B/Autoupdate" "$sparkle/Versions/B/Updater.app"; do
  if [[ -e "$helper" ]]; then sign "$helper"; fi
done
sign "$sparkle"
sign "$app"
# Symbols for crash reports (#318).
"$apple/scripts/sentry-dsyms.sh" "$archive"

# What notarization requires, checked here so a failure names it.
fail() {
  echo "::error::$*" >&2
  exit 1
}
plist="$app/Contents/Info.plist"
shown=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")
[[ "$shown" == "$VERSION" ]] || fail "CFBundleShortVersionString is $shown, not $VERSION"
build_number=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist")
minimum_macos=$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")
[[ "$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$plist")" == "$feed_url" ]] || fail "SUFeedURL is not $feed_url"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$plist")" == "$public_key" ]] || fail "SUPublicEDKey is not the signing key's"
codesign --verify --deep --strict --verbose=2 "$app"
details=$(codesign -dvv "$app" 2>&1)
echo "$details"
grep -q "TeamIdentifier=$APPLE_TEAM_ID" <<< "$details" || fail "not signed by team APPLE_TEAM_ID"
grep -q 'flags=.*runtime' <<< "$details" || fail "hardened runtime is off"
grep -q '^Timestamp=' <<< "$details" || fail "the signature has no secure timestamp"
if codesign -d --entitlements - --xml "$app" 2>/dev/null | grep -q get-task-allow; then
  fail "the app has the get-task-allow entitlement, which notarization rejects"
fi
archs=$(lipo -archs "$app/Contents/MacOS/Ganymede")
[[ "$archs" == arm64 ]] || fail "the app is built for $archs, not arm64 only"

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

if $main_build; then
  zip="$build/Ganymede-macOS.zip"
else
  zip="$build/Ganymede-macOS-$VERSION.zip"
fi
rm -f "$zip"
ditto -c -k --keepParent "$app" "$zip"
(cd "$build" && shasum -a 256 "$(basename "$zip")" | tee SHA256SUMS-macOS)
if $main_build; then
  echo "main build: $zip (no update feed)"
  exit 0
fi

# The update feed (#411): this release, its notes, and the zip's EdDSA
# signature; then the feed itself is signed (SURequireSignedFeed).
# sign_update comes with Sparkle's package, which the archive resolved.
sign_update=$(find "$build/DerivedData/SourcePackages/artifacts" -path '*/bin/sign_update' -type f | head -n 1)
[[ -n "$sign_update" && -x "$sign_update" ]] || fail "sign_update is not in Sparkle's package"
signature=$(printf '%s' "$SPARKLE_ED_PRIVATE_KEY" | "$sign_update" --ed-key-file - -p "$zip")
# The key built into the app accepts it.
sparkle_key verify "$zip" "$signature"
length=$(stat -f %z "$zip")
# The version's CHANGELOG.md section, as release.yml takes it.
notes=$(awk -v v="$VERSION" '/^## /{p = index($0, "## [" v "]") == 1; next} p' "$apple/../CHANGELOG.md" | sed 's/]]>/]]]]><![CDATA[>/g')
[[ -n "$notes" ]] || notes="See the [release notes](https://github.com/$repo/releases/tag/v$VERSION)."
appcast="$build/appcast.xml"
cat > "$appcast" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Ganymede</title>
    <link>https://github.com/$repo/releases</link>
    <item>
      <title>Ganymede $VERSION</title>
      <pubDate>$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S +0000')</pubDate>
      <link>https://github.com/$repo/releases/tag/v$VERSION</link>
      <sparkle:version>$build_number</sparkle:version>
      <sparkle:shortVersionString>$VERSION</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>$minimum_macos</sparkle:minimumSystemVersion>
      <sparkle:hardwareRequirements>arm64</sparkle:hardwareRequirements>
      <description sparkle:format="markdown"><![CDATA[
$notes
]]></description>
      <enclosure url="https://github.com/$repo/releases/download/v$VERSION/$(basename "$zip")"
        length="$length" type="application/octet-stream" sparkle:edSignature="$signature"/>
    </item>
  </channel>
</rss>
EOF
printf '%s' "$SPARKLE_ED_PRIVATE_KEY" | "$sign_update" --ed-key-file - "$appcast"
printf '%s' "$SPARKLE_ED_PRIVATE_KEY" | "$sign_update" --verify --ed-key-file - "$appcast"
echo "update feed: $appcast"
