## 2026-11-13, tables page and sort through the kernel (#604)

A table output that the cap cut names the kernel's copy of the table as
`ganymede.page` (cdp-kernel#489). The renderer now asks the kernel for the
rows past the embedded ones over the `ganymede.table.v1` comm, 50 at a
time, and sorts through it, so a sort covers the whole table. Unsorted
pages within the embedded rows still come from the output, with no
request. The footer reads "Rows 1,001–1,050 of 52,410", and "Loading…"
while a page is on its way.

It only does this for a trusted output with a kernel running when it
renders. An untrusted file's output doesn't get to open comms. If the
kernel no longer has the table (it restarted, or keeps only its last 16),
or doesn't know the comm target (a cdp-kernel before #489, or another
kernel), the comm closes and the table goes back to the embedded rows,
with the footer it had before.

The kernel comes from the notebook's session through
`installTableOutput(rendermime, () => session.session?.kernel)`, set
up in NotebookPane next to the widgets. Unit tests use a fake kernel. An
e2e test against a real kernel passed with cdp-kernel's #489 branch built
into `node_modules`. It goes into `e2e/` with the pin to the cdp-kernel
release that has #489.
