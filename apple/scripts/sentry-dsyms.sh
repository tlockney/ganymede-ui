#!/usr/bin/env bash
# Uploads an archive's dSYMs to Sentry's ganymede-apple project (#318),
# so crash reports show Swift and Rust functions, files and lines. The
# app's dSYM carries ganymede-ffi's line tables: its build-xcframework.sh
# keeps them in the static library (tlockney/ganymede#389).
#   apple/scripts/sentry-dsyms.sh apple/build/Ganymede.xcarchive
# Without SENTRY_AUTH_TOKEN (a fork, a local build) it does nothing.
set -euo pipefail
archive=${1:?usage: sentry-dsyms.sh <xcarchive>}
dsyms="$archive/dSYMs"
[ -d "$dsyms" ] || { echo "error: no $dsyms" >&2; exit 1; }

# Warn, not fail: a release without Rust lines still ships. grep -c, not
# -q: it reads to the end, so dwarfdump gets no SIGPIPE under pipefail.
app_dsym="$dsyms/Ganymede.app.dSYM"
if [ -d "$app_dsym" ] && ! dwarfdump --debug-line "$app_dsym" 2>/dev/null | grep -c 'ganymede-ffi/src/lib.rs' >/dev/null; then
  echo "::warning::$app_dsym has no line tables for ganymede-ffi; Rust frames will show without files and lines"
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo "SENTRY_AUTH_TOKEN isn't set: not uploading dSYMs." >&2
  exit 0
fi
npx --yes @sentry/cli@3.8.2 debug-files upload \
  --org "${SENTRY_ORG:-lockney-technologies}" --project "${SENTRY_PROJECT:-ganymede-apple}" \
  "$dsyms"
