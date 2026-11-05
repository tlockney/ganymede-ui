## 2026-11-05, kernel memory in the Running list (#241)

The web sidebar's Running list shows each kernel's resident memory from
`GET /api/metrics/v1/kernel_usage/get_usage/{id}` (ganymede#361, the
jupyter-resource-usage shape). `src/lib/kernel-usage.ts` reads
`content.kernel_memory` and treats anything else, a 404 from an older
server or an in-page kernel's id, `"reason": "no_process"`, or a network
error, as no value, so nothing shows rather than an error.

- It polls every 5 s, only while the sidebar is open and the page is
  visible, and not at all for a backend whose kernels all run in the page.
- The Mac and iPad apps' native Running lists and the kernel popover from
  the mockups aren't covered: the native list reads `PageState.running`,
  which would need a memory field and a way for the page to know the
  native list is showing.
