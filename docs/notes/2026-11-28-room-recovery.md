## 2026-11-28, Room recovery copies (#831)

Offers the server's document-room save status and recovery copies in the notebook UI and native header status:

- **Room save state and HTTP client (`src/lib/room-recovery.ts`):** Watches the room's `YNotebook` shared `ystate` for `save` (`"saved"` / `"failed"`), `save_error`, and `recovery` (`{id, at, reason, cells}`), and integrates with `/api/collaboration/recovery`:
  - `GET /api/collaboration/recovery?path=<api path>` (returns `'unsupported'` on `404` for older or remote servers without recovery endpoints).
  - `GET /api/collaboration/recovery/<id>` (on `404`, re-reads the list endpoint and clears stale local `recovery` pointers).
  - `DELETE /api/collaboration/recovery/<id>` to discard a copy.
  - `restoreRecoveryCopy` writes the copy over the notebook via the contents API first and discards the recovery copy only after `contents.save` succeeds.
  - `diffRecoveryNotebook` and `computeLineDiff` pair cells by cell ID (with positional fallback when neither cell has an ID), flag `merge_conflict` cell IDs, and summarize source, output, order, and metadata differences.
- **Pane banner, review sheet, and toolbar (`src/components/RecoveryBanner.tsx`, `src/components/RecoverySheet.tsx`, `src/components/Toolbar.tsx`, `src/components/NotebookPane.tsx`, `src/lib/header-status.ts`):**
  - Displays a persistent **Save needs attention** banner with `save_error` or the recovery copy's reason (naming conflicting cells on `merge_conflict`) while `save === "failed"` or a recovery copy is pending, along with **Review Copy…**, **Retry Save**, and **Download Copy**.
  - `RecoverySheet` lets the user switch among copies, inspect conflicting cell IDs and line diffs against the open notebook, download a copy, **Restore Copy**, or **Discard Copy**.
  - Header status (`saveText`, `shortStatusText`, `Toolbar` status menu) surfaces `Save needs attention` and offers **Review Recovery Copies…**.
- **Native Apple header status (`apple/Sources/Ganymede/PageState.swift`, `HeaderStatus.swift`, `NativeChrome.swift`, `IPadChrome.swift`):**
  - Added optional `saveAttention` to `PageState` and `HeaderStatus`, reflected in `saveNote`, `short`, `needsAttention` (red status highlight), and a **Review Recovery Copies…** button in the Mac popover and iPad/iPhone status menu calling `page.run("review-recovery")`.
- **Tests:** Added unit tests in `src/lib/room-recovery.test.ts`, `src/components/RecoverySheet.test.tsx`, `src/lib/header-status.test.ts`, `src/components/Toolbar.test.tsx`, `src/lib/native.test.ts`, `src/components/NotebookPane.test.tsx`, `src/App.test.tsx`, Swift tests in `apple/Tests/GanymedeTests/HeaderStatusTests.swift` and `PageStateTests.swift`, and Playwright e2e coverage in `e2e/recovery.spec.ts`.
