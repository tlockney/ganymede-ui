## 2026-11-07, renames in ci-changes.sh (tlockney/ganymede#464)

`scripts/ci-changes.sh` listed changed files with `git diff --name-only`,
which reports a rename by its new path only, so moving app or web code
to a docs path skipped e2e and the macOS app. `--no-renames` lists both
paths. CONTRIBUTING.md and the release comments now say a release skips
macos-app on the tag (#363) and that the last app change before the tag
passed it on main.
