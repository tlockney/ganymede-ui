## 2026-11-05, generate the device method table (ganymede-device#25)

docs/device.md's method table is now `supportTable()` from
ganymede-device's `src/support.ts`, between two markers, formatted with
Prettier. `scripts/device-table.mjs` checks it in `npm run check` and
rewrites it with `--write`, so the table can't drift from what the
package says it supports. After bumping ganymede-device, run the script
with `--write`. The bump here (to ganymede-device main, `515b1eb`) adds
the `ui` dialogs and the support matrix.

The pin lives in three places that must agree: `package-lock.json`
(the web side), and `apple/project.yml` and `apple/Package.resolved`
(the Swift package). A plain `npm update` of the git dependency also
rewrote unrelated `libc` fields with this container's npm, so the lock
change here is the one `resolved` line, edited by hand.
