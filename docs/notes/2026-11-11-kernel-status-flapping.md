## 2026-11-11, kernel status flapping with the Variables view open (#485)

In the Mac app 0.6.0, after a run, the kernel's status flipped between Idle
and Running without end, and Interrupt couldn't be clicked. The Variables
view reads the variables each time the kernel goes idle, with
`debug_request`s. cdp-kernel wraps every control request in busy and idle
statuses (cdp-kernel #124), and JupyterLab's kernel connection takes every
status as the kernel's unless its parent's type is in PageConfig's
`untracked_message_types`. Jupyter Server and Ganymede's lab page set that;
this app didn't. So each read made the kernel busy and idle again, which
started the next read, about every 150 ms. Interrupt is enabled only while
busy, so it flickered.

`main.tsx` now sets `untracked_message_types` before any kernel connects
(`src/lib/kernel-status.ts`): Jupyter Server's request types less
`kernel_info_request`, which a frontend sends while a kernel starts. The
Variables e2e test counts debug requests in the 3 seconds after the view
fills: 19 before the fix, at most 2 allowed.

The lesson: a page that uses JupyterLab's services outside JupyterLab
inherits defaults that JupyterLab's server page normally sets. Ganymede's
`lab.rs` lists the options it sets; compare against it when a kernel
behaves differently here than in Ganymede's lab.
