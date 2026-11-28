## 2026-11-28, local recovery copy (#808)

Adds bounded per-origin IndexedDB local recovery snapshots so unsaved
notebook edits survive failed saves, offline reloads, and WebKit
content-process termination across the browser PWA and Apple apps:

- **Bounded IndexedDB store (`src/lib/local-recovery.ts`):**
  - Stores one latest snapshot per `(backendScope, path)` (using
    `recentsKey(backend.config)`) in `ganymede-ui:local-recovery`
    (`snapshots` object store) with a serialized mutation queue so
    concurrent writes and clears never race.
  - Enforces a 10 MiB per-notebook limit (skipping oversized notebooks
    cleanly without disrupting editing) and a 50 MiB origin-wide total
    cap with oldest-first eviction (`selectEvictions`).
  - Degrades cleanly when IndexedDB is unavailable or throws
    `SecurityError` / `QuotaExceededError` (retrying once after evicting
    older entries on quota errors).
  - Provides `hasLocalRecoveryChanges` (via `diffRecoveryNotebook`) to
    suppress false-positive banners when disk already matches the local
    snapshot or when a server recovery copy already holds identical
    content.
- **Snapshot capture, clearing, and restore (`src/components/NotebookPane.tsx`, `src/App.tsx`):**
  - Captures debounced snapshots (~1.5 s) while a notebook is dirty, and
    flushes immediately on failed saves (explicit save, autosave, reload
    guard, teardown save, room `save === 'failed'`), offline edits /
    disconnect, `visibilitychange` to hidden, `pagehide`, and server room
    restarts with unsaved edits.
  - Clears the notebook's local copy automatically once a save succeeds,
    when restored or discarded, or when the user confirms reloading or
    choosing **Switch Without Saving** (`controller.discard()`, with
    `undo()` re-capturing if a guarded switch fails). Follows notebook
    and folder renames/deletes via `moveUnder` / `removeUnder`.
  - On reopen (including after `WKWebView` `webViewWebContentProcessDidTerminate`
    reloads the page on the same origin), offers the local copy via a
    non-blocking banner and restores over the notebook (updating the open
    model and accepting the saved `last_modified` in non-room mode) before
    clearing the snapshot.
- **Unified recovery UI (`src/components/RecoveryBanner.tsx`, `src/components/RecoverySheet.tsx`, `src/styles/app.css`):**
  - Reuses `RecoveryBanner` and `RecoverySheet` to show **Local unsaved
    copy** (with diff, **Restore Copy**, **Download Copy**, and
    **Discard**), while keeping `#831` server recovery copies intact and
    cleanly distinct in the sheet's copy picker whenever both exist and
    differ.
- **Tests:** Added `src/lib/local-recovery.test.ts`, expanded
  `src/components/RecoverySheet.test.tsx`,
  `src/components/NotebookPane.test.tsx`, and `src/App.test.tsx`, and
  added Playwright e2e coverage in `e2e/local-recovery.spec.ts`.
