#!/usr/bin/env bash
# Opt-in macOS verification script for Ganymede Shortcuts (`shortcuts run`) and
# `ganymede://` / `ganymede://x-callback-url/...` automation flows (#302, #303, #472, #586).
#
# Safety:
# - Opt-in only; not run in CI.
# - Operates solely inside a freshly created temporary directory (`mktemp -d`),
#   never modifying user notebooks.
# - Targets an explicit `.app` bundle via `--app` / `GANYMEDE_APP` (defaulting to
#   `apple/build/DerivedData/Build/Products/Debug/Ganymede.app`), rather than
#   blindly launching `/Applications/Ganymede.app`.
# - Supports `--dry-run` to inspect every URL, fixture, and command without
#   launching Ganymede or invoking `shortcuts run`.
set -euo pipefail

repo=$(cd "$(dirname "$0")/../.." && pwd)
default_app="$repo/apple/build/DerivedData/Build/Products/Debug/Ganymede.app"

app_path=${GANYMEDE_APP:-$default_app}
dry_run=0
keep_temp=0
non_interactive=0
run_urls=1
run_shortcuts=1
callback_scheme="ganymede-verify"
shortcut_run="Ganymede Verify Run"
shortcut_params="Ganymede Verify Params"
shortcut_new="Ganymede Verify New"
shortcut_kernel="Ganymede Verify Kernel"

usage() {
  cat <<'EOF'
Usage: apple/scripts/verify-automation.sh [options]

Opt-in manual/semi-automated macOS verification for Ganymede `ganymede://`
x-callback-url links (#303, #586) and `shortcuts run` AppIntents (#302, #472).

Prerequisites (for live execution; not required for --dry-run):
  1. macOS 26+ GUI session with a built Ganymede.app:
       GANYMEDE_REF=v0.17.0 apple/scripts/bootstrap.sh
       xcodebuild build -project apple/Ganymede.xcodeproj -scheme Ganymede \
         -destination platform=macOS -derivedDataPath apple/build/DerivedData \
         -skipPackagePluginValidation -onlyUsePackageVersionsFromResolvedFile \
         CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=
  2. For `shortcuts run`, create matching shortcuts in Shortcuts.app backed by
     Ganymede's AppIntents (Run Notebook, Run Notebook with Parameters,
     New Notebook, Control Notebook Kernel), or pass --skip-shortcuts.
  3. Because URL/Shortcut runs trigger macOS confirmation dialogs on first run
     (#586), live mode pauses between steps unless --non-interactive is set.

Options:
  --app <path>              Target Ganymede.app bundle (env: GANYMEDE_APP)
                            Default: apple/build/DerivedData/Build/Products/Debug/Ganymede.app
  -n, --dry-run             Print fixtures, URLs, and commands without running them
  --skip-shortcuts          Run only `ganymede://` URL checks
  --only-shortcuts          Run only `shortcuts run` checks
  --callback-scheme <name>  URL scheme used for x-success/x-error/x-cancel
                            (default: ganymede-verify)
  --shortcut-run <name>     Shortcut name for Run Notebook (default: "Ganymede Verify Run")
  --shortcut-params <name>  Shortcut name for Run Notebook with Parameters
                            (default: "Ganymede Verify Params")
  --shortcut-new <name>     Shortcut name for New Notebook (default: "Ganymede Verify New")
  --shortcut-kernel <name>  Shortcut name for Control Notebook Kernel
                            (default: "Ganymede Verify Kernel")
  --non-interactive         Do not wait for Enter between steps
  --keep-temp               Keep the temporary fixture directory on exit
  -h, --help                Show this help and exit

Examples:
  apple/scripts/verify-automation.sh --dry-run
  apple/scripts/verify-automation.sh --skip-shortcuts --app /tmp/Ganymede.app
  apple/scripts/verify-automation.sh --app apple/build/DerivedData/Build/Products/Debug/Ganymede.app
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      [[ $# -ge 2 ]] || { echo "error: --app requires a path" >&2; exit 2; }
      app_path=$2
      shift 2
      ;;
    -n|--dry-run)
      dry_run=1
      shift
      ;;
    --skip-shortcuts)
      run_shortcuts=0
      shift
      ;;
    --only-shortcuts)
      run_urls=0
      shift
      ;;
    --callback-scheme)
      [[ $# -ge 2 ]] || { echo "error: --callback-scheme requires a value" >&2; exit 2; }
      callback_scheme=$2
      shift 2
      ;;
    --shortcut-run)
      [[ $# -ge 2 ]] || { echo "error: --shortcut-run requires a name" >&2; exit 2; }
      shortcut_run=$2
      shift 2
      ;;
    --shortcut-params)
      [[ $# -ge 2 ]] || { echo "error: --shortcut-params requires a name" >&2; exit 2; }
      shortcut_params=$2
      shift 2
      ;;
    --shortcut-new)
      [[ $# -ge 2 ]] || { echo "error: --shortcut-new requires a name" >&2; exit 2; }
      shortcut_new=$2
      shift 2
      ;;
    --shortcut-kernel)
      [[ $# -ge 2 ]] || { echo "error: --shortcut-kernel requires a name" >&2; exit 2; }
      shortcut_kernel=$2
      shift 2
      ;;
    --non-interactive)
      non_interactive=1
      shift
      ;;
    --keep-temp)
      keep_temp=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$run_urls" -eq 0 && "$run_shortcuts" -eq 0 ]]; then
  echo "error: cannot combine --skip-shortcuts and --only-shortcuts" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" && "$dry_run" -eq 0 ]]; then
  echo "error: live verification requires macOS (use --dry-run elsewhere)" >&2
  exit 1
fi

if [[ "$dry_run" -eq 0 && ! -d "$app_path" ]]; then
  echo "error: target app bundle not found at: $app_path" >&2
  echo "hint: build Ganymede.app or pass --app <path/to/Ganymede.app> (or --dry-run)" >&2
  exit 1
fi

url_encode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/ganymede-verify.XXXXXX")
cleanup() {
  if [[ "$keep_temp" -eq 1 ]]; then
    echo "Temporary directory preserved: $tmpdir"
  else
    rm -rf "$tmpdir"
  fi
}
trap cleanup EXIT

mkdir -p "$tmpdir/created"

cat > "$tmpdir/smoke.ipynb" <<'EOF'
{
  "cells": [
    {
      "cell_type": "code",
      "id": "smoke-cell",
      "metadata": {"tags": ["smoke"]},
      "execution_count": null,
      "outputs": [],
      "source": ["console.log('verify-automation-ok')"]
    }
  ],
  "metadata": {
    "kernelspec": {
      "display_name": "TypeScript (cdp-kernel, node)",
      "language": "typescript",
      "name": "cdp-node"
    }
  },
  "nbformat": 4,
  "nbformat_minor": 5
}
EOF

cat > "$tmpdir/params.ipynb" <<'EOF'
{
  "cells": [
    {
      "cell_type": "code",
      "id": "params-cell",
      "metadata": {},
      "execution_count": null,
      "outputs": [],
      "source": ["const raw = process.env.GANYMEDE_PARAMS ?? '{}';\nconsole.log(raw);"]
    }
  ],
  "metadata": {
    "kernelspec": {
      "display_name": "TypeScript (cdp-kernel, node)",
      "language": "typescript",
      "name": "cdp-node"
    }
  },
  "nbformat": 4,
  "nbformat_minor": 5
}
EOF

cp "$tmpdir/smoke.ipynb" "$tmpdir/template.ipynb"

pause_step() {
  local prompt=$1
  if [[ "$dry_run" -eq 1 || "$non_interactive" -eq 1 ]]; then
    return 0
  fi
  printf '%s [Press Enter to continue] ' "$prompt"
  read -r _
}

run_cmd() {
  printf '+ '
  printf '%q ' "$@"
  printf '\n'
  if [[ "$dry_run" -eq 0 ]]; then
    "$@"
  fi
}

echo "Target app: $app_path"
echo "Temp workspace: $tmpdir"

if [[ "$run_urls" -eq 1 ]]; then
  enc_success=$(url_encode "${callback_scheme}://x-callback-url/success")
  enc_error=$(url_encode "${callback_scheme}://x-callback-url/error")
  enc_cancel=$(url_encode "${callback_scheme}://x-callback-url/cancel")

  missing_path="$tmpdir/does-not-exist.ipynb"
  enc_missing=$(url_encode "$missing_path")
  enc_dir=$(url_encode "$tmpdir/created")
  enc_template=$(url_encode "$tmpdir/template.ipynb")
  enc_smoke=$(url_encode "$tmpdir/smoke.ipynb")
  enc_params=$(url_encode "$tmpdir/params.ipynb")
  enc_json_params=$(url_encode '{"env":"verify"}')

  echo ""
  echo "=== 1. Launch target Ganymede.app ==="
  run_cmd open -a "$app_path"

  echo ""
  echo "=== 2. #586 missing-file prompt/cancel flow (must prompt BEFORE existence check) ==="
  echo "Expected: dialog asks to run 'does-not-exist.ipynb'; clicking Cancel opens x-cancel,"
  echo "          clicking Run opens x-error (errorCode=1, Nothing is at ...)."
  run_cmd open -a "$app_path" \
    "ganymede://x-callback-url/run?path=${enc_missing}&x-success=${enc_success}&x-error=${enc_error}&x-cancel=${enc_cancel}"
  pause_step "Respond to the missing-file confirmation dialog."

  echo ""
  echo "=== 3. ganymede://new?dir=... (direct + x-callback-url with template) ==="
  echo "Expected: confirmation prompt outside Spotlight folders (#586), creates and opens notebook."
  run_cmd open -a "$app_path" "ganymede://new?dir=${enc_dir}&name=DirectNew"
  pause_step "Confirm DirectNew creation dialog."
  run_cmd open -a "$app_path" \
    "ganymede://x-callback-url/new?dir=${enc_dir}&name=FromTemplate&template=${enc_template}&x-success=${enc_success}&x-error=${enc_error}&x-cancel=${enc_cancel}"
  pause_step "Confirm FromTemplate creation dialog."

  echo ""
  echo "=== 4. ganymede://run?... (full notebook + cell tag callback) ==="
  echo "Expected: confirmation prompt on first run; x-success receives status=ok and output."
  run_cmd open -a "$app_path" \
    "ganymede://x-callback-url/run?path=${enc_smoke}&restart=1&timeout=60&x-success=${enc_success}&x-error=${enc_error}&x-cancel=${enc_cancel}"
  pause_step "Approve smoke.ipynb run dialog."
  run_cmd open -a "$app_path" \
    "ganymede://run?path=${enc_smoke}&cell=smoke&restart=0"
  pause_step "Observe cell-tag run in Ganymede."

  echo ""
  echo "=== 5. Parameter callback URL (separate +params permission prompt) ==="
  echo "Expected: prompts separately for parameterized run even if smoke.ipynb was allowed;"
  echo "          x-success receives status=ok and results JSON."
  run_cmd open -a "$app_path" \
    "ganymede://x-callback-url/run?path=${enc_params}&params=${enc_json_params}&p.day=2026-11-28&p.count=3&timeout=60&x-success=${enc_success}&x-error=${enc_error}&x-cancel=${enc_cancel}"
  pause_step "Approve parameterized run dialog."
fi

if [[ "$run_shortcuts" -eq 1 ]]; then
  echo ""
  echo "=== 6. shortcuts run AppIntents checks ==="
  if [[ "$dry_run" -eq 1 ]]; then
    available_shortcuts=""
  else
    available_shortcuts=$(shortcuts list 2>/dev/null || true)
  fi

  run_shortcut_if_present() {
    local name=$1
    shift
    if [[ "$dry_run" -eq 0 ]] && ! printf '%s\n' "$available_shortcuts" | grep -Fxq "$name"; then
      echo "skip: shortcut '$name' not found in Shortcuts.app (run 'shortcuts list' to inspect)"
      return 0
    fi
    run_cmd shortcuts run "$name" "$@"
  }

  run_shortcut_if_present "$shortcut_run" --input-path "$tmpdir/smoke.ipynb"
  run_shortcut_if_present "$shortcut_params" --input-path "$tmpdir/params.ipynb"
  run_shortcut_if_present "$shortcut_new" --input-path "$tmpdir/created"
  run_shortcut_if_present "$shortcut_kernel" --input-path "$tmpdir/smoke.ipynb"
fi

echo ""
echo "Verification sequence complete."
