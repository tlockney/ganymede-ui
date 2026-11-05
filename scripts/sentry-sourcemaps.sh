#!/usr/bin/env bash
# Uploads the web build's source maps to Sentry's ganymede-web project
# (#319), then deletes them so they don't ship. Run after a build made with
# SENTRY_SOURCEMAPS=1:
#   SENTRY_SOURCEMAPS=1 npm run build && scripts/sentry-sourcemaps.sh dist
# `sentry-cli sourcemaps inject` writes a debug ID into each bundle and its
# map, and Sentry matches reports to maps by it, whatever the page's URL.
# Without SENTRY_AUTH_TOKEN (a fork, a local build) it only deletes the maps.
set -euo pipefail
dir=${1:?usage: sentry-sourcemaps.sh <build dir>}
assets="$dir/assets"
[ -d "$assets" ] || { echo "error: no $assets" >&2; exit 1; }

if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
  cli=(npx --yes @sentry/cli@3.8.2)
  export SENTRY_ORG=${SENTRY_ORG:-lockney-technologies}
  export SENTRY_PROJECT=${SENTRY_PROJECT:-ganymede-web}
  "${cli[@]}" sourcemaps inject "$assets"
  "${cli[@]}" sourcemaps upload "$assets"
else
  echo "SENTRY_AUTH_TOKEN isn't set: deleting the source maps without uploading them." >&2
fi
find "$dir" -name '*.map' -delete
