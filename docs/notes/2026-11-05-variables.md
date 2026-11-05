## 2026-11-05, Variables view (#242)

- Variables come from the Jupyter debugger protocol on the control
  channel. `inspectVariables` lists the cells' variables and
  `variables { variablesReference }` lists an object's members. Neither
  kernel needs a debug session started: ipykernel treats
  `inspectVariables` as a static request, and cdp-kernel answers both
  from its CDP channel.
- The view asks `kernel_info_reply.debugger` first. cdp-kernel's browser
  kernel ("This browser") says false: its cells run in a Worker with no
  CDP target. So it shows "This kernel can't list variables"; the Node and
  Deno kernels on a server list them. The e2e test runs against
  `cdp-node`.
- A run changes object references, so expanded rows are remembered by
  their path of names, not by reference. After each refresh their
  members are read again top-down.
- Refresh is 150 ms after the kernel reports idle, and only while the
  view shows. Replies for an older refresh are dropped by a generation
  counter.
- The web view is a right-hand panel inside the page. The Mac app's
  inspector (#249) will host the same view.
