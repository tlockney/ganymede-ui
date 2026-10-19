## 2026-10-19, client package README (#78)

The [client package README](../../packages/client/README.md) still said
the app renders through jupyter-react, which was dropped in #15. Its intro
now says what the root README and [architecture](../architecture.md) say:
the app uses `@jupyterlab/services` and JupyterLab's packages directly, and
this package is the base for the in-page Worker transport and the iPad
bridge. A short "two protocol stacks today" section says the split is the
plan for now.

For #79 the README gains a usage example: `makeSettings`, `RestClient` to
list kernelspecs and start a kernel, `KernelConnection.execute`, and
awaiting `done`. It was type-checked by putting it in a scratch file under
`packages/client/src` and running `npm run check -w packages/client`. A
note shows how the iPad bridge passes its own `fetch` and `WebSocket` to
`makeSettings`.

The module table's mangled header code span now reads
`Authorization: token <t>`, as `RestClient.request` sends it.
