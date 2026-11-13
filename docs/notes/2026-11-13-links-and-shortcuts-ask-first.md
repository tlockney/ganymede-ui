## 2026-11-13, links and Shortcuts ask first (#586)

From the 2026-11-13 security read (ganymede#746, finding 6).

- `run` links asked only after checking the file exists, so any page
  could probe for files through `x-error`. The yes now comes first; a
  missing file is reported only after it.
- `new` links wrote a notebook into any folder, copying any notebook,
  without asking. They now ask, naming both, unless the folder and the
  template are under Settings › General › Spotlight's folders
  (`AppURL.newNeedsConfirmation`).
- Run Notebook, Run Notebook with Parameters and Run Cell from Shortcuts
  ran with no yes. They now share links' prompt (`confirmRun`), with
  "Always allow" kept in `URLRunPermissions` under the destination
  "Shortcuts actions", which no link destination (`scheme://host`) can
  equal. An NSAlert, not `requestConfirmation`, since that has no
  "Always allow".
- `open` still answers whether a file exists; it only shows a window.
