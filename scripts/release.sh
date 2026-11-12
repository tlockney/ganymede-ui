#!/usr/bin/env bash
# Prepare a release: bump the version in package.json and package-lock.json,
# regenerate CHANGELOG.md from the merged pull requests, move the
# cdp-kernel and Ganymede pins to their latest releases
# (scripts/release-pins.sh), and commit "Release X.Y.Z" on a
# release/vX.Y.Z branch. With --execute it pushes the
# branch and, with gh, opens an issue and a PR for it. Merging the PR tags
# vX.Y.Z (tag-release.yml), which publishes the build (release.yml).
#
#   scripts/release.sh minor            # dry run: shows the bump and changelog
#   scripts/release.sh minor --execute  # commits, pushes release/vX.Y.Z, opens the PR
#
# If --execute fails after committing, run it again from release/vX.Y.Z:
# it pushes the branch and opens the issues and PR it hasn't opened yet.
#
# The level is patch, minor, major, or an explicit version (0.2.0-rc.1).
# Ganymede and ganymede-ui share their minor version (docs/releasing.md):
# minor and major take Ganymede's latest release's X.Y.0, and an explicit
# version must have its X.Y. A patch stays this repository's own.
# Uses git-cliff from PATH if installed, otherwise runs it with npx.
# Needs curl and jq.
set -euo pipefail

if [[ $# -lt 1 || "$1" == -h || "$1" == --help ]]; then
  sed -n '2,21s/^# \{0,1\}//p' "$0"
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

# A rerun on the branch an earlier --execute made: its commit is done,
# so only the steps after it (push, issues, PR) run again.
branch=$(git branch --show-current)
resume=false
if [[ "$branch" == release/v* ]]; then
  version=${branch#release/v}
  if ! $execute || [[ "$(git log -1 --format=%s)" != "Release $version" ]]; then
    echo "error: on $branch; to resume, run with --execute from its \"Release $version\" commit" >&2
    exit 1
  fi
  # Once the PR has merged, what is left is tag-release.yml's and
  # release.yml's. A push would only put the merged branch back.
  if git ls-remote --exit-code --tags origin "refs/tags/v$version" > /dev/null ||
    [[ "$(gh pr view "$branch" --json state --jq .state 2> /dev/null)" == MERGED ]]; then
    echo "error: v$version is tagged or the PR for $branch has merged; nothing is left to resume" >&2
    exit 1
  fi
  echo "Resuming the release of $version from $branch" >&2
  resume=true
else
  # git-cliff rebuilds CHANGELOG.md from history. A shallow clone can't
  # reach older releases' merges, and their entries would drop out
  # (ganymede-ui#179).
  if [[ "$(git rev-parse --is-shallow-repository)" == true ]]; then
    echo "Shallow clone: fetching the full history for the changelog" >&2
    git fetch --quiet --unshallow --tags origin main
  fi
  git fetch --quiet --tags origin main
  if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
    echo "error: release from an up-to-date main (HEAD is not origin/main)" >&2
    exit 1
  fi
  # This release takes the latest cdp-kernel and Ganymede releases. Checked
  # before anything changes: with --execute, a pin Ganymede hasn't released
  # yet stops here. A dry run warns and goes on to the preview.
  if ! scripts/release-pins.sh --check; then
    if $execute; then
      exit 1
    fi
    echo "warning: release-pins.sh --check failed (above); --execute would stop here" >&2
  fi
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

# Puts back what a run changed before it stopped: the files npm and
# git-cliff rewrote, and the branch it was on.
made_branch=false
pins_written=false
undo() {
  git checkout --quiet HEAD -- package.json package-lock.json CHANGELOG.md .github/workflows/ci.yml
  if $pins_written; then
    echo "note: release-pins.sh ran npm install; run npm ci to match the lockfile again" >&2
  fi
  if $made_branch; then
    git checkout --quiet - && git branch --quiet -D "$branch"
  fi
}

# Ganymede's latest release's X.Y. GANYMEDE_GITHUB_API points it at
# another server, as for release-pins.sh.
ganymede_minor() {
  local tag
  tag=$(curl -fsSL --retry 3 "${GANYMEDE_GITHUB_API:-https://api.github.com}/repos/tlockney/ganymede/releases/latest" |
    jq -r .tag_name) || return 1
  [[ "$tag" =~ ^v([0-9]+\.[0-9]+)\.[0-9]+$ ]] || return 1
  echo "${BASH_REMATCH[1]}"
}

# Turns $level into the version this release takes. Ganymede releases
# first in a round, so a minor or major release here takes the X.Y it
# just released (0.8.0 -> 0.10.0 when Ganymede is at 0.10.0).
shared_level() {
  local current=$1 minor
  if [[ "$level" == patch ]]; then
    return
  fi
  if ! minor=$(ganymede_minor); then
    echo "error: couldn't read Ganymede's latest release, which sets this release's X.Y" >&2
    exit 1
  fi
  case "$level" in
    minor | major)
      level=$minor.0
      # Newer: the final of a prerelease (0.10.0-rc.1 -> 0.10.0), or a
      # higher X.Y.Z. sort -V alone puts 0.10.0-rc.1 after 0.10.0.
      local base=${current%%-*}
      if ! [[ ( "$base" == "$level" && "$current" == *-* ) ||
        ( "$base" != "$level" && "$(printf '%s\n%s\n' "$base" "$level" | sort -V | tail -n 1)" == "$level" ) ]]; then
        echo "error: Ganymede's latest release is $minor.x, not newer than $current: release Ganymede first, or release a patch" >&2
        exit 1
      fi
      ;;
    *)
      if [[ "$level" != "$minor".* ]]; then
        echo "error: $level doesn't share Ganymede's latest release's $minor; a ganymede-ui version takes its X.Y" >&2
        exit 1
      fi
      ;;
  esac
}

# Bumps the version and commits it, with the changelog, on
# release/vX.Y.Z. A dry run stops after the preview.
bump() {
  local current
  current=$(node -p 'require("./package.json").version')
  shared_level "$current"
  # A dry run undoes the bump when it exits. So does a run that stops
  # before its commit, so that a rerun starts from the same place.
  trap undo EXIT
  # npm version rewrites package.json and package-lock.json.
  # --allow-same-version lets the first release be the version already
  # in package.json.
  npm version "$level" --no-git-tag-version --allow-same-version > /dev/null
  version=$(node -p 'require("./package.json").version')
  branch="release/v$version"
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

  if git show-ref --quiet --verify "refs/heads/$branch" ||
    git ls-remote --exit-code --heads origin "$branch" > /dev/null; then
    echo "error: $branch exists from an earlier run (here or on origin); switch to it and rerun with --execute, or delete it" >&2
    exit 1
  fi
  "${cliff[@]}" --tag "v$version" --output CHANGELOG.md
  pins_written=true
  pins=$(scripts/release-pins.sh)
  echo "$pins"
  git switch --quiet -c "$branch"
  made_branch=true
  git add package.json package-lock.json CHANGELOG.md .github/workflows/ci.yml
  # The pins go in the commit message, and from there into the PR.
  git commit --quiet -m "Release $version" -m "Pins:
$pins"
  trap - EXIT
}

if ! $resume; then
  bump
fi
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
  ganymede_title="Update docs for ganymede-ui v$version"
  ganymede_body="These \"Unreleased in ganymede-ui.\" notes in Ganymede's docs describe ganymede-ui v$version. Once it is released, update the text they mark and remove the notes:

$ganymede"
  unreleased_body="${unreleased_body:-}

Once released, Ganymede's docs need updating (an issue in tlockney/ganymede tracks it):

$ganymede"
fi

if ! command -v gh > /dev/null; then
  echo "Pushed $branch. Open an issue \"Release v$version\" and a PR from $branch that closes it."
  if [[ -n "$ganymede" ]]; then
    echo "Open an issue in tlockney/ganymede, \"$ganymede_title\", listing the notes above."
  fi
  exit 0
fi

# The number of the issue with this title, if an earlier run got as far
# as opening it. Arguments: the title, then flags for gh issue list.
issue_titled() {
  local title=$1
  shift
  gh issue list "$@" --search "\"$title\" in:title" --json number,title \
    --jq ".[] | select(.title == \"$title\") | .number" | head -n 1
}

if [[ "$(gh pr view "$branch" --json state --jq .state 2> /dev/null)" == OPEN ]]; then
  echo "The PR for $branch is already open: $(gh pr view "$branch" --json url --jq .url)"
else
  issue=$(issue_titled "Release v$version" --state open)
  if [[ -z "$issue" ]]; then
    issue=$(gh issue create --title "Release v$version" \
      --body "Publish v$version: the built app as archives and the CHANGELOG.md section as notes.")
  fi
  gh pr create --base main --head "$branch" --title "Release v$version" \
    --body "Closes #${issue##*/}

Bumps package.json to $version and updates CHANGELOG.md. Merging tags v$version, which publishes the release.

$(git log -1 --format=%b)${unreleased_body:-}"
fi
if [[ -n "$ganymede" ]]; then
  # Closed counts too: the docs may have been updated since.
  docs_issue=$(issue_titled "$ganymede_title" --repo tlockney/ganymede --state all)
  if [[ -n "$docs_issue" ]]; then
    echo "The Ganymede docs issue exists: tlockney/ganymede#$docs_issue"
  else
    gh issue create --repo tlockney/ganymede --title "$ganymede_title" \
      --body "$ganymede_body"
  fi
fi
