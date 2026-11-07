#!/usr/bin/env bash
# Prepare a release: bump the version in package.json and package-lock.json,
# regenerate CHANGELOG.md from the merged pull requests, and commit
# "Release X.Y.Z" on a release/vX.Y.Z branch. With --execute it pushes the
# branch and, with gh, opens an issue and a PR for it. Merging the PR tags
# vX.Y.Z (tag-release.yml), which publishes the build (release.yml).
#
#   scripts/release.sh minor            # dry run: shows the bump and changelog
#   scripts/release.sh minor --execute  # commits, pushes release/vX.Y.Z, opens the PR
#
# The level is patch, minor, major, or an explicit version (0.2.0-rc.1).
# Uses git-cliff from PATH if installed, otherwise runs it with npx.
set -euo pipefail

if [[ $# -lt 1 || "$1" == -h || "$1" == --help ]]; then
  sed -n '2,12s/^# \{0,1\}//p' "$0"
  exit 2
fi

level=$1
shift
execute=false
for arg in "$@"; do
  case "$arg" in
    -x | --execute) execute=true ;;
    *)
      echo "error: unknown argument $arg" >&2
      exit 2
      ;;
  esac
done

if command -v git-cliff > /dev/null; then
  cliff=(git-cliff)
else
  cliff=(npx --yes git-cliff@2.14.2)
fi

cd "$(git rev-parse --show-toplevel)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: the working tree has changes; commit or remove them first" >&2
  exit 1
fi
# git-cliff rebuilds CHANGELOG.md from history. A shallow clone can't reach
# older releases' merges, and their entries would drop out (ganymede-ui#179).
if [[ "$(git rev-parse --is-shallow-repository)" == true ]]; then
  echo "Shallow clone: fetching the full history for the changelog" >&2
  git fetch --quiet --unshallow --tags origin main
fi
git fetch --quiet --tags origin main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "error: release from an up-to-date main (HEAD is not origin/main)" >&2
  exit 1
fi

# Ganymede's docs and landing page describe the apps. Text there that
# changes with this release says "Unreleased in ganymede-ui." (ganymede's
# CLAUDE.md, ganymede-ui#397); list it, read from Ganymede's main. "<" is
# escaped so a marker in an HTML comment shows in the issue and PR body.
ganymede_notes() {
  local dir
  dir=$(mktemp -d)
  if GIT_TERMINAL_PROMPT=0 git clone --quiet --depth 1 --filter=blob:none --sparse \
      https://github.com/tlockney/ganymede "$dir" 2> /dev/null &&
    git -C "$dir" sparse-checkout set --no-cone /README.md '/docs/*.md' /site/index.html 2> /dev/null; then
    (cd "$dir" && grep -n '\*\*Unreleased in ganymede-ui\.\*\*' README.md docs/*.md site/index.html 2> /dev/null || true) |
      sed -E -e 's/</\&lt;/g' \
        -e 's#^([^:]+):([0-9]+):[[:space:]]*#https://github.com/tlockney/ganymede/blob/main/\1\#L\2  #'
  else
    echo "warning: couldn't read tlockney/ganymede; check its \"Unreleased in ganymede-ui.\" notes by hand" >&2
  fi
  rm -rf "$dir"
}
ganymede=$(ganymede_notes)
if [[ -n "$ganymede" ]]; then
  echo "Ganymede docs to update once this release is out:"
  echo "$ganymede"
  echo
fi

current=$(node -p 'require("./package.json").version')
# npm version rewrites package.json and package-lock.json; a dry run puts
# them back when it exits. --allow-same-version lets the first release be
# the version already in package.json.
$execute || trap 'git checkout --quiet -- package.json package-lock.json' EXIT
npm version "$level" --no-git-tag-version --allow-same-version > /dev/null
version=$(node -p 'require("./package.json").version')
if git rev-parse --quiet --verify "refs/tags/v$version" > /dev/null; then
  echo "error: v$version is already tagged" >&2
  exit 1
fi
echo "Version: $current -> $version"

if ! $execute; then
  echo
  "${cliff[@]}" --tag "v$version" --unreleased --strip header
  echo
  echo "Dry run. Rerun with --execute to commit, push, and open the PR."
  exit 0
fi

"${cliff[@]}" --tag "v$version" --output CHANGELOG.md
branch="release/v$version"
git switch --quiet -c "$branch"
git add package.json package-lock.json CHANGELOG.md
git commit --quiet -m "Release $version"
git push --quiet -u origin "$branch"

# Docs for features not yet released say "Unreleased." (CLAUDE.md). The
# ones this release ships come out on $branch before it merges.
unreleased=$(grep -rn 'Unreleased\.' README.md apple/README.md docs/*.md || true)
if [[ -n "$unreleased" ]]; then
  echo "Unreleased notes; remove those this release ships on $branch:"
  echo "$unreleased"
  unreleased_body="

Before merging, remove the \"Unreleased\" notes for features this release ships:

\`\`\`
$unreleased
\`\`\`"
fi

if [[ -n "$ganymede" ]]; then
  ganymede_body="These \"Unreleased in ganymede-ui.\" notes in Ganymede's docs describe ganymede-ui v$version. Once it is released, update the text they mark and remove the notes:

$ganymede"
  unreleased_body="${unreleased_body:-}

Once released, Ganymede's docs need updating (an issue in tlockney/ganymede tracks it):

$ganymede"
fi

if ! command -v gh > /dev/null; then
  echo "Pushed $branch. Open an issue \"Release v$version\" and a PR from $branch that closes it."
  if [[ -n "$ganymede" ]]; then
    echo "Open an issue in tlockney/ganymede, \"Update docs for ganymede-ui v$version\", listing the notes above."
  fi
  exit 0
fi
issue=$(gh issue create --title "Release v$version" \
  --body "Publish v$version: the built app as archives and the CHANGELOG.md section as notes.")
gh pr create --base main --head "$branch" --title "Release v$version" \
  --body "Closes #${issue##*/}

Bumps package.json to $version and updates CHANGELOG.md. Merging tags v$version, which publishes the release.${unreleased_body:-}"
if [[ -n "$ganymede" ]]; then
  gh issue create --repo tlockney/ganymede --title "Update docs for ganymede-ui v$version" \
    --body "$ganymede_body"
fi
