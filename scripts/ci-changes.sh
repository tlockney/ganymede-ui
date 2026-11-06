#!/bin/sh
# Which expensive CI jobs a pull request needs (ci.yml, #344). Prints
# `e2e=true|false` and `macos=true|false`, for $GITHUB_OUTPUT.
#
# On a pull request, actions/checkout checks out the merge commit, so
# HEAD^1 is the base and `git diff HEAD^1 HEAD` is what the PR changes.
# Any other event (a push to main, release.yml's call on a tag) runs
# everything. When in doubt a job runs: an unknown path counts as code.
set -eu

if [ "${GITHUB_EVENT_NAME:-}" != pull_request ]; then
  echo e2e=true
  echo macos=true
  exit 0
fi

e2e=false
macos=false
files=$(git diff --name-only HEAD^1 HEAD)

# package.json and package-lock.json count as release metadata when only
# their "version" lines change (a release PR's bump).
version_only() {
  ! git diff -U0 HEAD^1 HEAD -- "$1" | grep -E '^[+-]' | grep -Ev '^(\+\+\+|---) ' \
    | grep -Ev '^[+-][[:space:]]*"version": "[^"]*",?$' | grep -q .
}

while IFS= read -r f; do
  [ -n "$f" ] || continue
  case $f in
    *.md | docs/* | screenshots/* | LICENSE | cliff.toml | scripts/release.sh) ;;
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
