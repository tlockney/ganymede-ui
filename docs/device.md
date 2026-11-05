# Device API

TypeScript cells in the iPad and iPhone app can use native features of
the device through a global named `device`. A cell calls a method, and
the app answers it from Swift:

```ts
await device?.clipboard.writeText('hello from a cell');
```

The API comes from
[ganymede-device](https://github.com/tlockney/ganymede-device), which has
the TypeScript package, the app's Swift side, and the
[design and phases](https://github.com/tlockney/ganymede-device/blob/main/docs/plan.md).
It is early: today it has device details, the clipboard (text and
images), haptics, opening URLs, dialogs, share, Quick Look, file and
photo pickers, saving files, and sounds.

## Where `device` exists

`device` exists only in a kernel that the app runs itself: cdp-kernel's
TypeScript kernel, which the app runs in a hidden web view. In practice
that means:

- **iPad and iPhone.** With no kernel server set, it is the only kernel.
  With one set, it is listed beside the server's kernels as "TypeScript
  (cdp-kernel, in app)".
- **Mac.** Pick "TypeScript (cdp-kernel, in app)" in the kernel menu. The
  Mac's own kernelspecs run as processes and can't reach the app.
- **Not on a remote kernel, not in a Mac process kernel, and not in a
  browser.** All are planned; see [Methods](#methods).

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release. In ganymede-ui 0.3.0, `device` exists only on the
> iPad and iPhone with no kernel server set.

Everywhere else, `device` is `undefined`, so check for it before using
it. `device.has()` says whether this app answers a method:

```ts
if (device?.has('clipboard.readText')) {
  const text = await device.clipboard.readText();
}
```

For editor types, add this line once to a cell or a project file:

```ts
/// <reference types="@tlockney/ganymede-device/globals" />
```

## Methods

<!-- device-table:start (generated: node scripts/device-table.mjs --write) -->

| Method                                                                    | Returns                                                    | In the app | Remote kernel | Browser                |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------- | ------------- | ---------------------- |
| `device.info()`                                                           | platform, version, methods, and the device's current state | yes        | planned       | planned                |
| `device.clipboard.readText()`                                             | `string`, or `null`                                        | yes        | planned       | planned, after a click |
| `device.clipboard.writeText(text)`                                        | nothing                                                    | yes        | planned       | planned, after a click |
| `device.clipboard.readImage()`                                            | PNG bytes, or `null`                                       | yes        | planned       | planned, after a click |
| `device.clipboard.writeImage(image)`                                      | nothing                                                    | yes        | planned       | planned, after a click |
| `device.haptics.impact(style)`                                            | nothing                                                    | iPhone     | planned       | no                     |
| `device.haptics.notification(type)`                                       | nothing                                                    | iPhone     | planned       | no                     |
| `device.haptics.selection()`                                              | nothing                                                    | iPhone     | planned       | no                     |
| `device.openURL(url, { inApp })`                                          | nothing                                                    | yes        | planned       | planned, after a click |
| `device.ui.alert(message, { title })`                                     | nothing, once closed                                       | yes        | planned       | planned                |
| `device.ui.confirm(message, { title, destructive, okLabel })`             | `boolean`                                                  | yes        | planned       | planned                |
| `device.ui.prompt(message, { title, placeholder, defaultValue, secure })` | `string`, or `null`                                        | yes        | planned       | planned                |
| `device.ui.actionSheet(title, options, { message, cancel, destructive })` | the option's index, or `null`                              | yes        | planned       | planned                |
| `device.ui.pickDate({ mode, title, value, min, max })`                    | `Date`, or `null`                                          | yes        | planned       | planned                |
| `device.share({ text, url, files })`                                      | `true` when sent, `false` when dismissed                   | yes        | planned       | planned, after a click |
| `device.preview(files)`                                                   | nothing, once closed                                       | yes        | planned       | no                     |
| `device.files.pick({ types, multiple })`                                  | `File[]`, `[]` when cancelled                              | yes        | planned       | planned, after a click |
| `device.files.export(data, { name })`                                     | `true` when saved, `false` when cancelled                  | yes        | planned       | planned                |
| `device.sound.play(data, { volume })`                                     | nothing, once it starts                                    | yes        | planned       | planned, after a click |
| `device.sound.player(data)`                                               | a `SoundPlayer`                                            | yes        | no            | planned                |
| `device.photos.pick({ limit })`                                           | `File[]`, `[]` when cancelled                              | yes        | planned       | planned, after a click |

- `device.info()`: A browser has no model or battery.
- `device.clipboard.readText()`: iPadOS shows its paste prompt; a browser needs a click for the Clipboard API.
- `device.clipboard.writeText(text)`: A browser needs a click for the Clipboard API.
- `device.clipboard.readImage()`: PNG. iPadOS shows its paste prompt; a browser needs a click for the Clipboard API.
- `device.clipboard.writeImage(image)`: A browser needs a click for the Clipboard API, and takes PNG only.
- `device.haptics.impact(style)`: iPhone only: iPads and Macs have no Taptic Engine. A browser has no haptics API Safari supports.
- `device.haptics.notification(type)`: iPhone only: iPads and Macs have no Taptic Engine.
- `device.haptics.selection()`: iPhone only: iPads and Macs have no Taptic Engine.
- `device.openURL(url, { inApp })`: http, https and mailto only. `inApp` works on iPhone and iPad, not the Mac; a browser opens a tab after a click.
- `device.ui.alert(message, { title })`: A sheet on the Mac, an alert on iPhone and iPad; a browser will show it in the cell's output.
- `device.share({ text, url, files })`: The share sheet; `NSSharingServicePicker` on the Mac. A browser will use the Web Share API, after a click.
- `device.preview(files)`: Quick Look, which picks the viewer from each file name's extension. A browser has no Quick Look.
- `device.files.pick({ types, multiple })`: The open panel on the Mac, the document picker on iPad and iPhone. Files are copied in; no access to where they came from is kept.
- `device.files.export(data, { name })`: The save panel on the Mac, the document picker on iPad and iPhone. A browser will download the file.
- `device.sound.player(data)`: Play, pause, stop, seek and volume; close it, or hold it with `await using`. Remote kernels: a handle wouldn't survive a disconnect.
- `device.photos.pick({ limit })`: The system photo picker, which needs no photo library permission. A browser will show a file picker for images.

<!-- device-table:end -->

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release, which has only `info`, `has` and the text
> clipboard.

`writeImage` takes PNG, JPEG, GIF, HEIC or TIFF bytes (a `Uint8Array`,
`ArrayBuffer` or `Blob`). Haptics are there only on an iPhone: iPads and
Macs have no Taptic Engine, so `device.has('haptics.impact')` is false
on them. `impact` takes `light`, `medium` (the default), `heavy`,
`soft` or `rigid`; `notification` takes `success`, `warning` or
`error`. `openURL` opens `http`, `https` and `mailto` URLs only; with
`inApp: true` an iPhone or iPad shows a web page in a Safari view
instead of switching to Safari, and a Mac ignores it.

A browser lets a page use the clipboard only after a click, so there the
page will show a prompt to click first. On iPadOS, reading the clipboard
can show the system's paste prompt (Settings › Ganymede › Paste from
Other Apps sets whether it asks).

`device.info()` returns the app's answer from when the kernel started:

```ts
await device.info();
// { platform: "ipados", appVersion: "0.3.0", osVersion: "26.1.0", capabilities: ["clipboard.readText", "clipboard.writeText"] }
```

`platform` is `"ipados"` on an iPad and `"ios"` on an iPhone.

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

`info()` also reads the device's state when it is called: the hardware
`model` (such as `"iPad13,4"`), `isPad`, `screen` (`width` and `height`
in points, and `scale`), `battery` (`level` from 0 to 1, or `null` when
unknown, and `charging`; absent on a Mac without one), `darkMode` and
`locale` (such as `"en-US"`).

The `ui` dialogs (alert, confirm, prompt, action sheet, date picker)
show as a sheet over the notebook on the Mac and as an alert on iPhone
and iPad. One shows at a time; a second call waits for the first to
close. Dismissing one is not an error: it returns `null` or `false`.
Interrupting the kernel closes it and rejects `cancelled`.

```ts
if (await device?.ui.confirm('Delete the scratch files?', { destructive: true })) {
  // ...
}
```

Share, Quick Look and the file and photo pickers take turns with the
dialogs the same way, and an interrupt closes them. Picked files come in
by value, as `File`s, with no access kept to where they came from;
together they are at most 16 MiB. `share` takes `http`, `https` and
`mailto` URLs only. A sound player stays open until it is closed (or
leaves an `await using` block) or its kernel restarts or shuts down; a
kernel has at most 32 open.

```ts
const [file] = await device.files.pick({ types: ['audio/*'] });
if (file) {
  await using player = await device.sound.player(file);
  await player.play();
  // Leaving the block closes the player, which stops it: wait for the end.
  await new Promise(done => setTimeout(done, player.duration * 1000));
}
```

Next come methods behind a system permission, such as location and
notifications. The
[phases](https://github.com/tlockney/ganymede-device/blob/main/docs/plan.md#phases)
list them.

## Errors

A call that fails rejects with a `DeviceError` whose `code` says why:

| `code`         | Meaning                                                   |
| -------------- | --------------------------------------------------------- |
| `unavailable`  | This app or platform doesn't have the method.             |
| `denied`       | You or the system refused permission.                     |
| `cancelled`    | The cell was interrupted, or its `signal` aborted, first. |
| `timeout`      | The call took too long.                                   |
| `failed`       | Anything else; the message says what.                     |
| `disconnected` | The other end went away mid-call.                         |

Every method takes an optional `{ signal }` (an `AbortSignal`) to cancel
it. Interrupting the kernel cancels pending calls too.

If the bridge answers `hello` with an error or a malformed reply, the
kernel starts without `device` and prints one line on stderr saying why.
If it doesn't answer at all, `device` is just `undefined`.

## Safety

Only cells can call `device`. The app gives the bridge to the hidden web
view that runs kernels, never to the one that shows the notebook, and
HTML outputs render in sandboxed frames. So an HTML or JavaScript output
in a notebook you open can't use your clipboard or anything added later.
[Architecture](architecture.md) has the details.
