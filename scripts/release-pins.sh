#!/usr/bin/env bash
# Moves the pins on other projects' releases to their latest release, so a
# release picks them up in its own commit instead of in separate pull
# requests (#489). scripts/release.sh runs it; it can also run alone.
#
#   cdp-kernel  npm's latest @tlockney/cdp-kernel: package.json and
#               package-lock.json (the apps bundle it), and
#               CDP_KERNEL_VERSION in ci.yml's e2e job
#   ganymede    its latest GitHub release: GANYMEDE_VERSION in ci.yml's
#               e2e job, and GANYMEDE_REF in its macos-app job, which
#               release.yml reads too. A tag downloads that release's
#               GanymedeFFI.xcframework instead of building it. When
#               GANYMEDE_REF is a commit, the tag must contain it: a commit
#               the tag lacks means Ganymede needs a release first.
#
#   scripts/release-pins.sh           # writes the new pins, prints each one
#   scripts/release-pins.sh --check   # prints them, changes nothing
#
# Fails if a latest release is older than the pin already on main.
# GANYMEDE_NPM_URL and GANYMEDE_GITHUB_API point it at other servers.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

check=false
case "${1:-}" in
  "") ;;
  --check) check=true ;;
  *) echo "usage: scripts/release-pins.sh [--check]" >&2; exit 2 ;;
esac
npm_url=${GANYMEDE_NPM_URL:-https://registry.npmjs.org}
api=${GANYMEDE_GITHUB_API:-https://api.github.com}
ci=.github/workflows/ci.yml
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Whether version $1 is older than $2. A prerelease is older than its own
# release (0.11.0-rc.1 < 0.11.0), which sort -V alone gets backwards.
older() {
  local a=${1%%-*} b=${2%%-*}
  if [[ "$a" == "$b" ]]; then
    [[ "$1" != "$2" && "$1" == *-* && ( "$2" != *-* || "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n 1)" == "$1" ) ]]
  else
    [[ "$(printf '%s\n%s\n' "$a" "$b" | sort -V | head -n 1)" == "$a" ]]
  fi
}

# The value of the one `      NAME: value` line in ci.yml; fails unless
# there is exactly one.
ci_value() {
  local n
  n=$(grep -c "^ *$1: " "$ci" || true)
  if [[ "$n" != 1 ]]; then
    echo "error: expected one $1 line in $ci, found $n" >&2
    exit 1
  fi
  sed -n "s/^ *$1: *//p" "$ci"
}

# Sets ci.yml's $1 to $2, keeping the line's indent.
set_ci_value() {
  NAME=$1 VALUE=$2 awk '
    match($0, "^ *" ENVIRON["NAME"] ": ") { print substr($0, 1, RLENGTH) ENVIRON["VALUE"]; next }
    { print }' "$ci" > "$tmp/ci.yml"
  cat "$tmp/ci.yml" > "$ci"
}

# Every lookup and check runs first, so a failure changes nothing.

# cdp-kernel
cdp_pin=$(node -p 'require("./package.json").dependencies["@tlockney/cdp-kernel"]')
cdp_ci=$(ci_value CDP_KERNEL_VERSION)
cdp_latest=$(curl -fsSL "$npm_url/@tlockney%2fcdp-kernel/latest" | jq -r .version)
if [[ -z "$cdp_latest" || "$cdp_latest" == null || ! "$cdp_pin" =~ ^[0-9] ]]; then
  echo "error: couldn't read npm's latest cdp-kernel ($cdp_latest), or package.json's pin isn't a version ($cdp_pin)" >&2
  exit 1
fi
for pin in "$cdp_pin" "$cdp_ci"; do
  if older "$cdp_latest" "$pin"; then
    echo "error: npm's latest cdp-kernel $cdp_latest is older than the pin $pin" >&2
    exit 1
  fi
done

# ganymede
version_pin=$(ci_value GANYMEDE_VERSION)
ref_pin=$(ci_value GANYMEDE_REF)
tag=$(curl -fsSL "$api/repos/tlockney/ganymede/releases/latest" | jq -r .tag_name)
latest=${tag#v}
if [[ -z "$latest" || "$tag" == null ]]; then
  echo "error: couldn't read ganymede's latest release" >&2
  exit 1
fi
if older "$latest" "$version_pin"; then
  echo "error: ganymede's latest release $latest is older than GANYMEDE_VERSION $version_pin" >&2
  exit 1
fi
if [[ "$ref_pin" == v* ]]; then
  if older "$latest" "${ref_pin#v}"; then
    echo "error: ganymede's latest release $tag is older than GANYMEDE_REF $ref_pin" >&2
    exit 1
  fi
elif [[ "$ref_pin" =~ ^[0-9a-f]{40}$ ]]; then
  # behind or identical: the tag contains the commit.
  status=$(curl -fsSL "$api/repos/tlockney/ganymede/compare/$tag...$ref_pin" | jq -r .status)
  if [[ "$status" != behind && "$status" != identical ]]; then
    echo "error: GANYMEDE_REF ${ref_pin:0:12} is not in ganymede $tag ($status); release Ganymede first" >&2
    exit 1
  fi
else
  echo "error: GANYMEDE_REF in $ci is neither a v* tag nor a commit SHA: $ref_pin" >&2
  exit 1
fi

# Report, then write.
if [[ "$cdp_pin" == "$cdp_latest" && "$cdp_ci" == "$cdp_latest" ]]; then
  echo "cdp-kernel $cdp_latest: latest"
else
  echo "cdp-kernel $cdp_pin (CI $cdp_ci) -> $cdp_latest"
  if ! $check; then
    npm install --quiet --save-exact --ignore-scripts --no-audit --no-fund "@tlockney/cdp-kernel@$cdp_latest" > /dev/null
    set_ci_value CDP_KERNEL_VERSION "$cdp_latest"
  fi
fi
if [[ "$version_pin" == "$latest" && "$ref_pin" == "$tag" ]]; then
  echo "ganymede $latest: latest"
else
  echo "ganymede $version_pin (GANYMEDE_REF ${ref_pin:0:12}) -> $latest ($tag)"
  if ! $check; then
    set_ci_value GANYMEDE_VERSION "$latest"
    set_ci_value GANYMEDE_REF "$tag"
    # A commit pin has comment lines saying why; a tag needs none. They sit
    # between the "A tag downloads ..." line and GANYMEDE_REF. If that line
    # is reworded, this keeps them; update the pattern with it.
    if [[ "$ref_pin" != v* ]]; then
      awk '
        /# A tag downloads the release.s XCFramework; a commit builds it\./ { print; skip = 1; next }
        skip && /^ *GANYMEDE_REF: / { skip = 0 }
        skip && /^ *#/ { next }
        { skip = 0; print }' "$ci" > "$tmp/ci.yml"
      cat "$tmp/ci.yml" > "$ci"
    fi
  fi
fi
