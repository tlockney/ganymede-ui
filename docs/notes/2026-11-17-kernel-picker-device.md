## 2026-11-17, kernel pickers mark kernels with `device` (#648)

A kernelspec that declares `metadata.capabilities.device: true` (the shape
`AppKernels.spec` registers for the app's in-process kernel) is marked
with a `◆` after its name and read as "<name>, offers the device API".
`offersDevice` and `pickerLabel` in `src/lib/kernel-device.ts` are the
mapping: strict (only `true`), and false for missing or odd `metadata`, so
servers that don't send the field see no change.

The apps never show the web toolbar (`chrome=native`), and the only
`device` kernelspec is the apps' own, so the pickers that matter are
native: the Mac kernel popover and Kernel > Change Kernel, and the iPad
kernel menu. They are built from `PageState.kernels`, which `postState`
now sends as `{ name, displayName, device }`; `PageState.Kernel` decodes
`device` as an optional (a page from before this sends none) and
`pickerName` and `pickerLabel` give the marked name and the accessible
label. The web pickers (the toolbar's `<select>` and its overflow menu,
and the missing-kernel notice's picker) use the same mapping; `MenuItem`
gained an optional `ariaLabel`, and a marked `<option>` has a `title`. The
command palette's kernel list is not marked.

Checked: `npm run check`, `npm test`, `npm run build`. The Swift changes
and tests (`PageStateTests`) were not built here.
