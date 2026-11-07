## 2026-11-07, `device` from server kernels in a browser (#384)

In a browser the notebook page now answers a server kernel's
`connectDevice(jupyter.comm)` too, with ganymede-device's browser
fallback (`browserForward`, ganymede-device#70 and #72): web APIs for
the remote subset, and a prompt above the notebook for each call the
browser allows only after a click.

- `src/lib/device-remote.ts`: in the app, the bridge answers as before;
  outside it, `attachDevice` passes `answerDevice` a `browserForward`
  whose `click` is `promptClick`, which shows the prompt through the
  pane's state and runs the call from the button's click handler.
- `src/components/DevicePrompt.tsx`: the prompt, in the pane's notice
  style: the call's button ("Copy to clipboard", "Choose a file") and
  Dismiss.
- The e2e test now covers the browser: a cell copies and pastes
  through two prompts and dismisses a file picker, which answers `[]`.

Not yet: the `ui.*` dialogs in a browser, and a prompt that says which
server asked.
