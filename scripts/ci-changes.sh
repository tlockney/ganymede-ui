#!/bin/sh
# Which expensive CI jobs a pull request needs (ci.yml, #344). Prints
# `e2e=true|false`, `macos=true|false`, `device=true|false` and
# `device_swift=true|false`, for $GITHUB_OUTPUT. `macos` gates both app
# jobs, macos-app and ios-app (#543); `device` the device package's
# tests and `device_swift` its Swift package tests (packages/device,
# #560).
# main-build.yml builds the Mac app on a push to main when `macos` is
# true (#539).
#
# On a pull request, actions/checkout checks out the merge commit, so
# HEAD^1 is the base and `git diff HEAD^1 HEAD` is what the PR changes.
# A push to main diffs against the commit main was at before it
# (BASE_SHA, github.event.before; HEAD^1 without it) with the same rules
# (#360). Any other event (release.yml's call on a tag), and a push whose
# base can't be found or diffed, runs everything. When in doubt a job
# runs: an unknown path counts as code.
set -eu

everything() {
  echo e2e=true
  echo macos=true
  echo device=true
  echo device_swift=true
  exit 0
}

case ${GITHUB_EVENT_NAME:-} in
  pull_request) base=HEAD^1 ;;
  push)
    # Only a push to main is diffed; a tag push runs everything.
    [ "${GITHUB_REF:-}" = refs/heads/main ] || everything
    base=${BASE_SHA:-HEAD^1}
    case $base in *[!0]*) ;; *) everything ;; esac
    if ! git cat-file -e "$base^{commit}" 2> /dev/null; then
      git fetch -q --no-tags --depth=1 origin "$base" 2> /dev/null || everything
    fi
    ;;
  *) everything ;;
esac

e2e=false
macos=false
device=false
device_swift=false
files=$(git diff --no-renames --name-only "$base" HEAD) || everything

# package.json and package-lock.json count as release metadata when only
# their "version" lines change (a release PR's bump).
version_only() {
  ! git diff -U0 "$base" HEAD -- "$1" | grep -E '^[+-]' | grep -Ev '^(\+\+\+|---) ' \
    | grep -Ev '^[+-][[:space:]]*"version": "[^"]*",?$' | grep -q .
}

while IFS= read -r f; do
  [ -n "$f" ] || continue
  case $f in
    # The device package (#560). Its reference is generated from src/ and
    # checked by its tests; its docs need nothing; its tests only its own
    # jobs; its sources ship in the apps and the page.
    packages/device/docs/reference.md) device=true ;;
    packages/device/*.md | packages/device/docs/* | packages/device/LICENSE) ;;
    packages/device/test/* | packages/device/scripts/reference.ts) device=true ;;
    packages/device/swift/Tests/*) device_swift=true ;;
    packages/device/Package.swift | packages/device/swift/*) device_swift=true; macos=true ;;
    packages/device/*) device=true; e2e=true; macos=true ;;
    # The example notebooks' Markdown sources are code (#414).
    examples/src/*) e2e=true; macos=true ;;
    *.md | docs/* | screenshots/* | LICENSE | cliff.toml | .cliffignore | scripts/release.sh | scripts/release-pins.sh) ;;
    # Used only by release.yml; its unit tests run in every build job.
    scripts/testflight-notes.mjs | scripts/testflight-notes.test.mjs) ;;
    package.json | package-lock.json)
      if ! version_only "$f"; then e2e=true; macos=true; device=true; fi ;;
    apple/*) macos=true ;;
    e2e/* | playwright.config.ts) e2e=true ;;
    # CI itself can break any job.
    .github/* | scripts/ci-changes.sh) e2e=true; macos=true; device=true; device_swift=true ;;
    *) e2e=true; macos=true ;;
  esac
done <<EOF2
$files
EOF2

echo "e2e=$e2e"
echo "macos=$macos"
echo "device=$device"
echo "device_swift=$device_swift"
