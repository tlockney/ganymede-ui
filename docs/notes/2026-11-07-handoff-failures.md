## 2026-11-07, a closed notebook's failed save waits to be shown (#393)

A notebook pane on its way out leaves its last save for the next pane on
that file (#224), and `reloadPage` waits for it (#375). But the save was
dropped from the map once it settled, failed or not, so a failure that
settled before Reload was clicked, or before the file reopened, was never
reported. Now a failed save stays until a pane or a reload shows it
(`shownHandoff`); a save that went through is still dropped when done.

The Reload button stayed enabled while `reloadPage` saved, so a second
click started a second run and could ask twice. `reloadPage` now returns
the run in progress instead.
