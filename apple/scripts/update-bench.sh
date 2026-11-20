#!/usr/bin/env bash
# Refreshes the engine benchmark's vendored files (Resources/Bench, #698)
# from a ganymede checkout's spikes/v8-engine: the workloads, their
# manifest, the Worker's script, and dist/strip-bundle.js, which it builds
# there (sucrase and acorn as one script, for the ts-strip workload), and
# dist/LICENSES.txt, the notices of the packages in that bundle.
# Resources/Bench/web/index.html and bench.js are this repo's own (the
# spike's page minus its kernel-start step); they are not copied.
#   apple/scripts/update-bench.sh [path to a ganymede checkout]
# Needs Node and network access for `npm ci`. Review the diff.
set -euo pipefail
apple=$(cd "$(dirname "$0")/.." && pwd)
ganymede=${1:-$apple/../../ganymede}
spike=$ganymede/spikes/v8-engine/bench
if [ ! -f "$spike/build.mjs" ]; then
  echo "error: no $spike/build.mjs: pass the path to a ganymede checkout" >&2
  exit 1
fi
dest=$apple/Resources/Bench
(cd "$spike" && npm ci && npm run build)
mkdir -p "$dest/workloads" "$dest/dist" "$dest/web"
rm -f "$dest"/workloads/*
cp "$spike"/workloads/manifest.json "$spike"/workloads/*.js "$dest/workloads/"
cp "$spike/dist/strip-bundle.js" "$dest/dist/strip-bundle.js"
cp "$spike/web/worker.js" "$dest/web/worker.js"
# The bundled packages' license notices travel with the bundle.
node "$apple/scripts/bench-licenses.mjs" "$spike" > "$dest/dist/LICENSES.txt"
# Where they came from, in the folder's README.
commit=$(git -C "$ganymede" rev-parse --short HEAD 2> /dev/null || echo unknown)
cat > "$dest/README.md" <<README
Vendored files of the engine benchmark in Settings > Developer (#698).
\`workloads/\`, \`dist/strip-bundle.js\` and \`web/worker.js\` come from
ganymede's \`spikes/v8-engine/bench\`; \`apple/scripts/update-bench.sh\`
refreshes them (taken from ganymede commit $commit). \`web/index.html\` and
\`web/bench.js\` are this repo's: the spike's page without its
\`kernel-start\` step. The app's Mac and iOS targets copy this folder into
the bundle (not the widget).

\`dist/strip-bundle.js\` bundles npm packages: sucrase and acorn, for the
ts-strip workload, and their dependencies. \`dist/LICENSES.txt\` lists them
with their versions and license texts (MIT, and Apache-2.0 for
ts-interface-checker); \`apple/scripts/bench-licenses.mjs\` writes it.
README
git -C "$apple" diff --stat -- Resources/Bench
