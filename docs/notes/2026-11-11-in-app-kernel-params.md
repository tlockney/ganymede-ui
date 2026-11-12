## 2026-11-11, parameters for the in-app TypeScript kernel (#502)

A run with parameters (`ganymede://run?p.…`, Run Notebook with
Parameters) starts a kernel through `POST /api/notebooks/run`, which sets
`GANYMEDE_PARAMS` in the launch env. Kernels that are processes read it;
the app's own TypeScript kernel runs in a web view and never saw it, so
`jupyter.params` was `{}` there.

`AppKernels` now reads `env.GANYMEDE_PARAMS` from the start's launch JSON
and sends it with the start; `kernel-host.ts` parses it (objects only)
and passes it as cdp-kernel's browser `params` option (0.10.0). The
kernel web view runs only while it sits in a window, so this works while
a Ganymede window is open, which docs/apps.md now says.
