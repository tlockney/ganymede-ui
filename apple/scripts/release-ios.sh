#!/usr/bin/env bash
# Builds the iPad and iPhone app for TestFlight: a Release archive of the
# Ganymede-iOS scheme, signed for App Store distribution, exported as an
# .ipa and uploaded to App Store Connect for internal testing. Run after
# bootstrap.sh. release.yml runs it; it also runs on a Mac with the same
# variables set.
#
#   VERSION                     the app's version (CFBundleShortVersionString)
#   BUILD_NUMBER                CFBundleVersion (default 1); App Store Connect
#                               rejects a number it already has for VERSION
#   APPLE_TEAM_ID               the team
#   APPSTORE_API_KEY_P8         App Store Connect API key, base64
#   APPSTORE_API_KEY_ID
#   APPSTORE_API_ISSUER_ID
#   IOS_CERTIFICATE_P12         Apple Distribution certificate and private
#   IOS_CERTIFICATE_PASSWORD    key, base64, and its password
#   IOS_PROVISIONING_PROFILE    App Store profile for com.ganymede-server.Ganymede,
#                               base64
#   UPLOAD                      1 (default) uploads; 0 only exports the .ipa
#
# With the certificate and profile, signing is manual. Without them,
# Xcode signs automatically through the API key, which then needs the
# Admin role (it creates certificates and profiles).
set -euo pipefail
apple=$(cd "$(dirname "$0")/.." && pwd)
build="$apple/build"
upload=${UPLOAD:-1}

missing=()
for name in VERSION APPLE_TEAM_ID APPSTORE_API_KEY_P8 APPSTORE_API_KEY_ID APPSTORE_API_ISSUER_ID; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
manual=0
if [[ -n "${IOS_CERTIFICATE_P12:-}${IOS_PROVISIONING_PROFILE:-}" ]]; then
  manual=1
  for name in IOS_CERTIFICATE_P12 IOS_CERTIFICATE_PASSWORD IOS_PROVISIONING_PROFILE; do
    [[ -n "${!name:-}" ]] || missing+=("$name")
  done
fi
if ((${#missing[@]})); then
  echo "::error::not set: ${missing[*]} (repository secrets, docs/releasing.md)" >&2
  exit 1
fi

work=$(mktemp -d)
keychain="$work/signing.keychain-db"
profiles="$HOME/Library/MobileDevice/Provisioning Profiles"
installed=""
cleanup() {
  [[ -f "$keychain" ]] && security delete-keychain "$keychain" || true
  [[ -n "$installed" ]] && rm -f "$installed"
  rm -rf "$work"
}
trap cleanup EXIT

fail() {
  echo "::error::$*" >&2
  exit 1
}

key="$work/AuthKey_$APPSTORE_API_KEY_ID.p8"
echo "$APPSTORE_API_KEY_P8" | base64 --decode > "$key"
auth=(-authenticationKeyPath "$key" -authenticationKeyID "$APPSTORE_API_KEY_ID"
  -authenticationKeyIssuerID "$APPSTORE_API_ISSUER_ID")
bundle_id=com.ganymede-server.Ganymede

if ((manual)); then
  # The certificate goes into a keychain of its own, as in release-app.sh.
  password=$(uuidgen)
  echo "$IOS_CERTIFICATE_P12" | base64 --decode > "$work/cert.p12"
  security create-keychain -p "$password" "$keychain"
  security set-keychain-settings -lut 3600 "$keychain"
  security unlock-keychain -p "$password" "$keychain"
  security import "$work/cert.p12" -k "$keychain" -P "$IOS_CERTIFICATE_PASSWORD" \
    -T /usr/bin/codesign -T /usr/bin/security
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain" > /dev/null
  # shellcheck disable=SC2046 # the existing list, one path per word
  security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
  rm "$work/cert.p12"
  security find-identity -v -p codesigning "$keychain" | grep -q "Apple Distribution" ||
    fail "IOS_CERTIFICATE_P12 holds no \"Apple Distribution\" identity"

  # Xcode finds a profile by its UUID in this folder. Check what it is
  # for, so a wrong profile fails here and not deep in xcodebuild.
  echo "$IOS_PROVISIONING_PROFILE" | base64 --decode > "$work/profile.mobileprovision"
  security cms -D -i "$work/profile.mobileprovision" > "$work/profile.plist"
  uuid=$(plutil -extract UUID raw "$work/profile.plist")
  app_id=$(plutil -extract Entitlements.application-identifier raw "$work/profile.plist")
  [[ "$app_id" == "$APPLE_TEAM_ID.$bundle_id" ]] ||
    fail "IOS_PROVISIONING_PROFILE is for $app_id, not $APPLE_TEAM_ID.$bundle_id"
  if plutil -extract ProvisionedDevices raw "$work/profile.plist" > /dev/null 2>&1; then
    fail "IOS_PROVISIONING_PROFILE lists devices: it is a development or ad hoc profile, not App Store"
  fi
  expires=$(plutil -extract ExpirationDate raw "$work/profile.plist")
  echo "profile $uuid ($(plutil -extract Name raw "$work/profile.plist")), expires $expires"
  mkdir -p "$profiles"
  installed="$profiles/$uuid.mobileprovision"
  cp "$work/profile.mobileprovision" "$installed"

  signing=(CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="Apple Distribution" GANYMEDE_IOS_PROFILE="$uuid")
  export_signing="<key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict><key>$bundle_id</key><string>$uuid</string></dict>"
else
  echo "No IOS_CERTIFICATE_P12: signing automatically with the API key"
  signing=(CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates "${auth[@]}")
  export_signing="<key>signingStyle</key><string>automatic</string>"
fi

archive="$build/Ganymede-iOS.xcarchive"
rm -rf "$archive"
xcodebuild archive -project "$apple/Ganymede.xcodeproj" -scheme Ganymede-iOS \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$archive" -derivedDataPath "$build/DerivedData-iOS" \
  -skipPackagePluginValidation -onlyUsePackageVersionsFromResolvedFile \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" "${signing[@]}" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="${BUILD_NUMBER:-1}"

plist="$archive/Products/Applications/Ganymede.app/Info.plist"
shown=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")
[[ "$shown" == "$VERSION" ]] || fail "CFBundleShortVersionString is $shown, not $VERSION"
# actool records an iOS app icon under CFBundleIcons, not the top-level
# CFBundleIconName a Mac app has.
/usr/libexec/PlistBuddy -c 'Print :CFBundleIcons:CFBundlePrimaryIcon:CFBundleIconName' "$plist" > /dev/null ||
  fail "the app has no icon (CFBundleIcons), which App Store Connect rejects"

# Export re-signs for App Store distribution. With destination `upload`
# it also sends the build to App Store Connect, which processes it for
# TestFlight; internal testing only, since external testing needs App
# Review (#188).
if ((upload)); then destination=upload; else destination=export; fi
cat > "$work/ExportOptions.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$destination</string>
  <key>teamID</key><string>$APPLE_TEAM_ID</string>
  $export_signing
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>testFlightInternalTestingOnly</key><true/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
EOF
plutil -lint "$work/ExportOptions.plist"
export_dir="$build/Ganymede-iOS-export"
rm -rf "$export_dir"
xcodebuild -exportArchive -archivePath "$archive" -exportPath "$export_dir" \
  -exportOptionsPlist "$work/ExportOptions.plist" -allowProvisioningUpdates "${auth[@]}"

if ((upload)); then
  echo "Uploaded $VERSION ($BUILD_NUMBER). App Store Connect processes it for TestFlight in a few minutes."
else
  ipa="$build/Ganymede-iOS-$VERSION.ipa"
  mv "$export_dir/Ganymede.ipa" "$ipa"
  echo "Exported $ipa (not uploaded)"
fi
