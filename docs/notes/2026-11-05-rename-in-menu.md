## 2026-11-05, Rename in the iPad and iPhone ⋯ menu (#209)

- The notebook's ⋯ menu on the iPad and iPhone has Rename…, the last
  item #209 listed for it. It asks for a name in an alert and runs the
  page's `rename` command, as the sidebar's Rename does for the open
  notebook: the page saves edits first, keeps the kernel and adds
  `.ipynb`. The toolbar takes the action as a closure, since the alert's
  state lives in `ContentView`, beside the title it starts from.
- Two nits from PR #259's review: `takesText` counts a `<select>` as
  holding the keyboard, since an iPhone shows its picker where the
  keyboard goes, and `KeyboardBar.tsx`'s imports are in order again.
