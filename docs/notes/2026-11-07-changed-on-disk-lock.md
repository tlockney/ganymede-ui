## 2026-11-07, lock and reload a notebook that changed on disk (#367)

Thomas had a notebook open in the Mac app while a Claude session wrote
to it through the Ganymede Journal plugin. The pane only found out when
autosave ran on a dirty notebook: it said so and turned autosave off,
but had no way to load the new version, and ⌘S only asked before
overwriting. He wanted a locked mode that has to be unlocked before a
save can write.

- `NotebookSaver.changedOnDisk()` runs the `last_modified` check in the
  save queue, so a check during our own save waits for it and isn't
  fooled by the new mtime.
- The pane checks every 5 s while the page shows, and on `focus` and
  `visibilitychange`, clean or dirty. WKWebView doesn't reliably fire
  `focus` on app activation (#350), so the interval does the work in
  the Mac app; no Swift change was needed, since the notice and ⌘S are
  the page's.
- A change, or a save that meets one (check or 409), locks: autosave,
  ⌘S, the toolbar's Save and the save before another file opens all
  skip writing. ⌘S while locked shows the notice again instead of the
  old overwrite `confirm`. The title says "Locked".
- Reload asks first if there are edits, then reruns the load effect.
  The teardown skips its save and leaves the kernel; the new session
  rejoins it by path.
- Unlock (`NotebookSaver.accept`) takes the version on disk that locked
  the pane as the saver's base, rather than turning the check off: saves,
  including the one before another file opens, write over that version,
  and the checks go on, so a newer change locks again. The review caught
  the first version, which overwrote until a save succeeded: unlocking a
  clean notebook stopped the checks, and a later agent write could be
  overwritten silently.

The reload goes through the contents API, not the server's yrs room:
the UI doesn't use rooms yet (ganymede#183). Once it does, the server's
own reload on an external change can reach the page directly and the
poll can go.
