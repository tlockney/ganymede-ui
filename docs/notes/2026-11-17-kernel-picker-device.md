## 2026-11-17, kernel picker marks kernels with `device` (#648)

The toolbar's kernel picker (and its overflow-menu form) now puts a `◆`
after a kernel whose kernelspec declares `metadata.capabilities.device:
true`, the shape `AppKernels.spec` registers for the app's in-process
kernel. The option also gets an `aria-label` ("..., offers the device
API"); the overflow menu has no per-item label, so there the mark is part
of the text. `offersDevice` in `src/lib/kernel-device.ts` is the mapping:
it is strict (only `true`) and returns false for missing or odd
`metadata`, so servers that don't send the field see no change. The Mac
menu bar's kernel list (`PageState.kernels`, built in Swift) and the
command palette are not marked; that is left for a follow-up.

Checked: `npm run check`, `npm test`, `npm run build`.
