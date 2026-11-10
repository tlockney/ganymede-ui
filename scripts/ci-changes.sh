#!/bin/sh
# Which expensive CI jobs a pull request needs (ci.yml, #344). Prints
# `e2e=true|false` and `macos=true|false`, for $GITHUB_OUTPUT.
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
    # The example notebooks' Markdown sources are code (#414).
    examples/src/*) e2e=true; macos=true ;;
    *.md | docs/* | screenshots/* | LICENSE | cliff.toml | scripts/release.sh) ;;
    # Used only by release.yml; its unit tests run in every build job.
    scripts/testflight-notes.mjs | scripts/testflight-notes.test.mjs) ;;
    package.json | package-lock.json)
      if ! version_only "$f"; then e2e=true; macos=true; fi ;;
    apple/*) macos=true ;;
    e2e/* | playwright.config.ts) e2e=true ;;
    *) e2e=true; macos=true ;;
  esac
done <<EOF2
$files
EOF2

echo "e2e=$e2e"
echo "macos=$macos"
