## 2026-11-03, in-app TypeScript kernel on the Mac (#185)

- The Mac app ran every kernel as a process through its server, so cells
  never reached `KernelHost`'s `DeviceBridge`. The app now opens pages
  with `kernels=both` (the iPad too, when a remote runs its kernels), and
  `src/lib/mixed.ts` lists the server's kernels and the page's in one
  service manager.
- JupyterLab's managers take injectable API clients (`kernelAPIClient`,
  `sessionAPIClient`, `kernelSpecAPIClient`), so the merge is three small
  routing clients, not a second manager tree. Kernels route by id: the
  page side knows its own ids (LiteKernelClient's private `_kernels`),
  everything else is the server's.
- One `serverSettings.WebSocket` serves every kernel connection, so it is a
  class whose constructor returns mock-socket's socket for a page kernel's
  channels URL and the browser's otherwise.
- A session connection keeps its id for life (`SessionConnection._patch`
  never takes a new one). Moving a notebook to a kernel on the other side
  restarts the session there, so the routing client keeps the UI's id and
  maps it to the new side's session.
- A page kernel spec whose name the server also has (`javascript` from
  IJavascript, say) is dropped; the server's keeps the name, and notebooks
  saved with it open there.
