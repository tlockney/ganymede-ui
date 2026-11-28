## 2026-11-28, menu bar kernel controls and recent executions (#953)

Extends the Mac menu bar extra (#924) for tlockney/ganymede#965 §5 so
running kernels can be controlled without a window open and recent
executions from `GET /api/executions` (tlockney/ganymede#1006) appear at
a glance.

- **Kernel controls.** Each `MenuBarKernel` carries the `ServerEndpoint`
  it was discovered from, and `MenuBarMenu` turns each running kernel row
  into a submenu with **Interrupt** (`POST /api/kernels/{id}/interrupt`),
  **Restart** (`POST /api/kernels/{id}/restart`), and **Shut Down**
  (`DELETE /api/kernels/{id}`). `MenuBarKernelAction.request(for:kernelID:on:)`
  validates the kernel id and sends the endpoint's `Authorization: token`
  header. `MenuBarController.perform(_:on:)` refreshes immediately on
  success and surfaces any HTTP or transport error in `actionError` (never
  dropped with `try?`).
- **Recent executions and 404 fallback.** `MenuBarExecution` decodes the
  `GET /api/executions?limit=10` array (`execution_id`, `kernel_id`,
  `notebook`, `cell_id`, `run_by`, `started_at`, `finished_at`, `status`)
  using `URLComponents` query items and formats concise rows with notebook
  title, status (`Running`, `OK`, `Error`, `Aborted`), `run_by` when
  present, and short elapsed duration (`210ms`, `1.5s`, `2m 5s`).
  `MenuBarController.loadExecutions` treats HTTP 404 from older servers
  predating `tlockney/ganymede#1006` as `.unsupported`, hiding the Recent
  Executions section cleanly with no error while still surfacing non-404
  failures.
- **Tests.** Added unit tests in `MenuBarTests` covering all three kernel
  action requests and error surfacing, execution decoding/formatting
  (including microsecond ISO-8601 timestamps), and HTTP 404 / 200 / 500
  handling. Everything stays gated `#if os(macOS)` so iOS builds cleanly.
