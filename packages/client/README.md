# client

Protocol plumbing for a Jupyter UI talking to Ganymede, with no UI
framework: the module seams described in Ganymede's
[`docs/ui.md`](https://github.com/tlockney/ganymede/blob/main/docs/ui.md)
and [`docs/architecture.md`](https://github.com/tlockney/ganymede/blob/main/docs/architecture.md).
It began as Ganymede's `frontend/` package and moved here with its history.
There is no editor, no widget implementation, and no UI framework here.

## Two protocol stacks today

The app at the repository root does not use this package. It talks to
servers through `@jupyterlab/services` and renders with JupyterLab's
packages directly. This package is the base for the in-page transport to a
Web Worker kernel and for the iPad bridge, which carries the server API to
an in-process core without HTTP. Until one of those lands, the two stacks
exist side by side.

## Usage

Start a kernel on a Jupyter or Ganymede server, run a cell, and wait for
the reply:

```ts
import {
  KernelConnection,
  RestClient,
  makeSettings,
  type StreamContent,
} from '@ganymede-ui/client';

const settings = makeSettings({ baseUrl: 'http://localhost:8888/', token: 'secret' });
const rest = new RestClient(settings);

const { default: name } = await rest.listKernelspecs();
const kernel = await rest.startKernel(name);

const kc = new KernelConnection(settings, kernel.id);
const future = kc.execute('print(6 * 7)');
future.onIOPub(msg => {
  if (msg.header.msg_type === 'stream') console.log((msg.content as StreamContent).text);
});
const reply = await future.done; // execute_reply, after the kernel goes idle
console.log(reply.content.status, reply.content.execution_count);

kc.dispose();
await rest.shutdownKernel(kernel.id);
```

`makeSettings` takes the browser's `fetch` and `WebSocket` unless you pass
your own, and every request and socket goes through the ones in the
settings. The iPad bridge uses this: it passes a `fetch` and a `WebSocket`
constructor (anything matching `WebSocketLike`) that carry the same JSON
and v1 frames to the in-process core:

```ts
const settings = makeSettings({ baseUrl, fetch: bridgeFetch, WebSocket: BridgeWebSocket });
```

The tests use the same seam with a fake socket.

## Run

```
npm install                         # at the repository root (npm workspaces)
npm test -w packages/client         # tsc, then node --test over dist/**/*.test.js
npm run check -w packages/client    # tsc --noEmit
```

Node 22 or later; CI runs it on Node 24. The only dependency is `typescript` (dev). Node's built-in test
runner is used; `src/node-shims.d.ts` declares the few `node:test` /
`node:assert` shapes the tests need so `@types/node` is not required.

## Modules

| Path                                  | Status                  | What it is                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/protocol/messages.ts`            | sketched                | Message envelope (header, parent_header, metadata, content, buffers), `Channel`, typed content for the shell/iopub/stdin/comm messages a notebook needs, `createMessage`. Every content type has an index signature so unknown fields (e.g. a capability manifest in `kernel_info_reply`) survive.                                                                                                      |
| `src/protocol/websocket-v1.ts`        | sketched, tested        | Encoder/decoder for the `v1.kernel.websocket.jupyter.org` binary framing, byte-for-byte as jupyter_server's `serialize_msg_to_ws_v1`. Legacy JSON codec (`channel` key at top level; buffers unsupported, throws).                                                                                                                                                                                      |
| `src/connection/server-connection.ts` | sketched, tested        | `ServerConnection` settings (`baseUrl`, `wsUrl`, `token?`, `fetch`, `WebSocket`) with `makeSettings` defaulting to globals, so the iPad bridge can inject its own `fetch` and `WebSocket`. `RestClient` over `/api/kernelspecs`, `/api/kernels`, `/api/kernels/{id}/{interrupt,restart}`, `/api/sessions`, `/api/contents/{path}` with the `Authorization: token <t>` header. Response types are loose. |
| `src/connection/kernel-connection.ts` | sketched, tested        | `KernelConnection` over `/api/kernels/{id}/channels`: `send`, `onMessage`, `requestReply` (match on parent `msg_id`), `execute` (iopub listener plus a `done` that waits for both `execute_reply` and the matching `status: idle`), `inputReply` for stdin, busy/idle tracking, `onError` for dropped frames and throwing listeners. Reconnect is a TODO.                                               |
| `src/renderers/registry.ts`           | sketched, tested        | `MimeRenderer` and `RendererRegistry` with `preferredMimeType` by rank. Default order: widget view, text/html, image/svg+xml, image/png, image/jpeg, text/markdown, text/latex, application/json, text/plain.                                                                                                                                                                                           |
| `src/renderers/ansi.ts`               | sketched, tested        | Pure ANSI SGR parser to `{text, classes}` spans with `\r` overwrite and `\b` delete semantics.                                                                                                                                                                                                                                                                                                          |
| `src/renderers/stream.ts`             | sketched, tested        | `StreamBuffer`: merges consecutive chunks of the same stream and applies `\r`/`\b` incrementally. Keeps the raw text too, for `parseAnsi` and for the notebook file.                                                                                                                                                                                                                                    |
| `src/renderers/basic.ts`              | stubbed, untested (DOM) | text/plain (pre with ANSI spans), image/png and image/jpeg (data URL), image/svg+xml, text/html. HTML and inline SVG only go into the document when `trusted`; otherwise HTML is shown as text and SVG goes through `<img>`. Sanitizing is a TODO (DOMPurify).                                                                                                                                          |
| `src/widgets/manager.ts`              | interfaces only         | `WidgetManager` seam for the `jupyter.widget` comm target, with notes on the two planned implementations: [anywidget](https://github.com/manzt/anywidget)-only and full ipywidgets.                                                                                                                                                                                                                     |
| `src/index.ts`                        |                         | Re-exports the public surface.                                                                                                                                                                                                                                                                                                                                                                          |

Not started: `editor/` (CodeMirror 6, mode from `language_info.codemirror_mode`),
`app/` (cell list, output area, kernel picker, file browser), markdown and
LaTeX renderers, `clear_output(wait)` and `update_display_data` handling,
output truncation and iopub rate limiting, the widget managers.

## Protocol details worth knowing

- v1 frame: `offset_number` (u64 LE), then that many u64 LE offsets, then the
  channel name, then header/parent_header/metadata/content JSON, then each
  buffer. `offsets[0] = 8 * (1 + offset_number)` is where the channel starts;
  `offsets[1]` is where the first part starts; the last offset equals the
  frame length. All lengths are in UTF-8 bytes (tests cover non-ASCII).
- The token goes in the websocket URL as `?token=` because browsers cannot
  set handshake headers; `session_id` is also a query parameter, as
  `@jupyterlab/services` does it.
- If the server answers with text frames (no subprotocol negotiated) the
  connection switches to the legacy JSON codec for sending as well.
- `\b` deletes the previous character rather than just moving the cursor,
  following JupyterLab's `fixBackspace`, since that is what notebook users
  expect from tqdm-style output.
- Untrusted `text/html` is displayed as text, not sanitized. That is the
  conservative placeholder until DOMPurify is wired in.
