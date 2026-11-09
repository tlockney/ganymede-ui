## 2026-11-09, anywidget views in sandboxed frames (#417)

cdp-kernel's `jupyter.widget` opens anywidget models, which the app's
widget manager didn't know, so they showed as text. `anywidget.ts`
registers `AnyModel` and `AnyView` with the managers the app already
runs for ipywidgets, so comms, `request_states`, saved state and Trust
work the same way.

The view's module (`_esm`) runs in a sandboxed frame from
`output-frames.ts`, never in the app's page, where it could read the
token or reach the Apple apps' message handlers. The frame says it is
ready; the view answers with the module, the CSS, a structured-clone copy
of the state and a `MessageChannel` port. A model stand-in in the frame
turns `get`, `set`, `save_changes`, `on`/`off` and `send` into messages;
the view applies them to the real model, which syncs with the kernel and
other views. A change the frame made isn't sent back to it. Binary values
cross as `DataView`s.

Limits: `initialize` runs once per view, not once per model, since each
view has its own frame, and `widget_manager.get_model` rejects. The
saved-state path needed buffers: `scripts/examples.mjs` now saves widget
buffers as base64 in `metadata.widgets`.
