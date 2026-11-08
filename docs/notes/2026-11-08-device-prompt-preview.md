## 2026-11-08, the device prompt previews what it copies (#389)

The browser's device prompt named the button ("Copy to clipboard") but
not the text going to the clipboard. ganymede-device now passes it in
`ClickRequest.detail` (tlockney/ganymede-device#74): the text for
`clipboard.writeText`, and the text or else the URL for `share`. The
lockfile moves to that commit. `previewText` folds the detail onto one
line and cuts it to 80 characters, counting characters rather than UTF-16
units so an emoji isn't split, and `DevicePrompt` shows it under the
message, quoted, or "(empty text)" for an empty copy. With the notebook
name from the earlier half of #389, the prompt now says who asks and
what for.
