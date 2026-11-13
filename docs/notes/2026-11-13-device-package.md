## 2026-11-13, ganymede-device moves into packages/device (#560)

tlockney/ganymede-device is now `packages/device/`, an npm workspace
still named `@tlockney/ganymede-device`, and a local Swift package the
apps take by path (`apple/project.yml`). The four places that pinned its
commit (package.json, package-lock.json, project.yml, Package.resolved)
no longer do, so a change to the `device` API and the app side that
uses it is one PR.

Its history came along: the import rewrote ganymede-device's commits
into `packages/device/` (`git filter-branch --index-filter`, the same
move `git filter-repo --to-subdirectory-filter` makes) and merged them,
so `git log` and `git blame` there show its commits. The pull request
has to be merged with a merge commit; a squash would drop them.

The import and the switch are one PR, not two: with `packages/*` as
workspaces, npm can't hold a workspace named `@tlockney/ganymede-device`
and a git dependency of that name at once.

- Its imported commits end in "(#N)" for ganymede-device's PRs and were
  committed by GitHub, so git-cliff would list all of them in the next
  release as this repo's PRs. `.cliffignore` names them by SHA.
- ESLint and Prettier skip `packages/device`, which keeps its own style
  (double quotes) and its own `tsc` and `node --test` runs.
- CI: a `device` job (type check, unit tests, build, the Chromium
  browser test against a cdp-kernel v0.9.0 checkout) and `device-swift`
  (`swift test`, an iOS build). ci-changes.sh gains `device` and
  `device_swift`; a change to the package's `src/` also runs e2e and
  the app jobs, and its Swift sources the app jobs, since the apps
  bundle both.
- Bare `#N` in the package's code and docs stay ganymede-device's; its
  README says so.
