## 2026-11-09, project read: unused code and small fixes (#447)

A read of the four repositories for what is broken, inconsistent,
inefficient or no longer needed. The codebase came out clean: `tsc`,
ESLint and the tests pass, every npm dependency and CSS class is used,
and every relative link resolves. What it found here, and fixed:

- `PlusIcon` and `GearIcon` (`Icons.tsx`) and `PageState.isCode` had no
  caller. A scan for exports and Swift declarations named once found
  them; TypeScript's `noUnusedLocals` doesn't look at exports.
- CI's `build` job was the only one with no `timeout-minutes` and with a
  checkout that kept the token.
- `release-ios.sh` documents `BUILD_NUMBER` as optional and defaults it
  for `xcodebuild`, but its last line read it bare, so under `set -u` a
  local run without it failed after the upload had succeeded.
- CONTRIBUTING's "What's next" still listed file rename and delete, a
  command palette and menus.

What needs a decision (the unused `packages/client`, the agent's
bundle-size spike, four unreferenced screenshots, the cdp-kernel pin) is
in a list for Thomas, not changed here.
