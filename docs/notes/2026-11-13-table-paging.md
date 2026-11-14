## 2026-11-13, tables page and sort through the kernel (#604)

A table output that the cap cut names the kernel's copy of the table as
`ganymede.page` (cdp-kernel#489). The renderer now asks the kernel for the
rows past the embedded ones over the `ganymede.table.v1` comm, 50 at a
time, and sorts through it, so a sort covers the whole table. Unsorted
pages within the embedded rows still come from the output, with no
request. The footer reads "Rows 1,001–1,050 of 52,410", and "Loading…"
while a page is on its way.

It only does this for a trusted output. An untrusted file's output
doesn't get to open comms. The kernel is looked up when a page is
needed, so an output drawn before a reopened notebook rejoins its kernel
still pages. The table goes back to the embedded rows, with the footer
it had before, in these cases:

- there is no kernel;
- the kernel no longer has the table (it restarted, or keeps only its
  last 16);
- the kernel doesn't know the comm target (a cdp-kernel before #489, or
  another kernel), so the comm closes;
- the kernel restarts while a request is out;
- the kernel doesn't answer its first request within 30 seconds of
  being idle (a busy kernel answers after its cell).

With no kernel yet, or no answer, the next page or sort tries the kernel
again (ganymede-ui#612).

When the kernel refuses a single request, the table keeps paging. For
example, a sort over more than a million rows is refused: the sort is
undone and the footer says why. A table that embeds fewer than 50 rows
asks the kernel for the rest of the first page. A page already asked for
isn't asked for again. The kernel's row count in each reply wins over
the output's. Once it differs, the table changed in a later cell, and
every page comes from the kernel, not the embedded rows.

The kernel comes from the notebook's session through
`installTableOutput(rendermime, () => session.session?.kernel)`, set
up in NotebookPane next to the widgets. Unit tests use a fake kernel. An
e2e test against a real kernel passed with cdp-kernel's #489 branch built
into `node_modules`. It goes into `e2e/` with the pin to the cdp-kernel
release that has #489.
