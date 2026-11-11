## 2026-11-11, say "ran out of memory" when a kernel dies near the limit (#241)

The "kernel stopped" notice (#213) said a kernel "may have crashed or run
out of memory". The server reports no per-kernel limit: `kernel_usage`
gives the kernel's RSS and the host's `host_virtual_memory` (`total`,
`available`), and a kill shows in the kernel log only as "killed by
signal 9", which other things send too. Thomas agreed the rule on the
issue: name out-of-memory when the last reading within a poll interval of
the death had the host under 5% available or the kernel over 90% of
`total`; otherwise keep the old wording.

The pane now polls its own kernel's usage every `MEMORY_POLL_MS` while it
is shown (and the page visible), keeping the last good reading in a ref so
a reading doesn't re-render the pane. An ask that gets nothing (the kernel
just died, so the server answers 404 or `no_process`) leaves the last
reading in place. A reading counts up to the poll interval plus 2 s old,
because each ask waits the interval after the previous answer and an ask
can take a moment. Backends whose kernels run in the page are not polled,
as the Running list already does.

`kernelMemory` is now a thin wrapper over `kernelUsage`, which also reads
the host's memory; the Running list is unchanged.
