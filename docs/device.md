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

The `device` global exists only in a kernel that the app runs itself:
cdp-kernel's TypeScript kernel, which the app runs in a hidden web view.
Other kernels in the app can ask for part of it. In practice that means:

- **iPad and iPhone.** With no kernel server set, it is the only kernel.
  With one set, it is listed beside the server's kernels as "TypeScript
  (cdp-kernel, in app)".
- **Mac.** Pick "TypeScript (cdp-kernel, in app)" in the kernel menu. The
  Mac's own kernelspecs run as processes, so they have no global `device`.
- **A server kernel, in the app.** A kernel the app's server runs, or a
  remote server's, gets the methods that need no permission, by asking
  for them; see [From a server kernel](#from-a-server-kernel).

- **A server kernel, in a browser.** The notebook page answers the same
  calls with the browser's own APIs, behind a click; see
  [In a browser](#in-a-browser).

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

## From a server kernel

A kernel that runs as a process, on the Mac or on a remote server, isn't
in the app, so it has no `device` global. A cell asks the notebook page
for one instead, over a Jupyter comm, and the app answers it for the
notebook window that ran the cell:

```ts
import { connectDevice } from 'https://raw.githubusercontent.com/tlockney/ganymede-device/main/src/comm.ts';
const device = await connectDevice(jupyter.comm);
await device.clipboard.writeText('from the server');
```

That import works in cdp-kernel on Deno; Node needs the published
package, which isn't out yet
([ganymede-device#24](https://github.com/tlockney/ganymede-device/issues/24)).

- It needs cdp-kernel 0.8.0 or later, which reads comm messages while a
  cell runs.
- Only the methods marked "yes" under "Remote kernel" below: those that
  need no permission, where the person sees and confirms the action or
  nothing goes back to the kernel. Anything picked or read goes to the
  machine the kernel runs on.
- Clipboard reads are the exception: iPadOS can show its paste prompt,
  but on the Mac a server kernel, a remote server's included, can read
  the clipboard with no dialog. Connect only to servers you trust.
- In JupyterLab nothing answers, and `connectDevice` gives a `device`
  whose calls fail `unavailable` after five seconds. Another client on
  the same kernel never answers for the one that ran the cell.
- An interrupt doesn't end a call by itself; pass the cell's signal:
  `device.ui.prompt('Name?', { signal: jupyter.signal })`.
- If the app goes away (the iPad suspends it, the window closes), calls
  in flight fail `disconnected`, and the next call asks again.

### In a browser

In a browser, the notebook page answers `connectDevice` itself, with web
APIs, and only for the methods marked "yes" under "Browser" below. A
browser lets a page use the clipboard, open a tab, share, pick or save
a file only right after a click, so the page shows a prompt above the
notebook, such as "Copy to clipboard", and runs the call when you click
it. The prompt names the notebook and kernel asking, such as "A cell in
Io.ipynb (Python 3) asks to use this device.", and for a clipboard copy
or a share it shows the text (or the shared URL) on one line, shortened
to 80 characters. Dismiss turns it down: the call answers as a cancel does in the app
(`[]` for a picker, `false` for share and export) or fails `cancelled`.
One prompt shows at a time. The `ui` dialogs aren't answered in a
browser yet.

## Methods

<!-- device-table:start (generated: node scripts/device-table.mjs --write) -->

| Method                                                                    | Returns                                                    | In the app   | Permission    | Remote kernel | Browser       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------ | ------------- | ------------- | ------------- |
| `device.info()`                                                           | platform, version, methods, and the device's current state | yes          | none          | yes           | yes           |
| `device.clipboard.readText()`                                             | `string`, or `null`                                        | yes          | none          | yes           | after a click |
| `device.clipboard.writeText(text)`                                        | nothing                                                    | yes          | none          | yes           | after a click |
| `device.clipboard.readImage()`                                            | PNG bytes, or `null`                                       | yes          | none          | yes           | after a click |
| `device.clipboard.writeImage(image)`                                      | nothing                                                    | yes          | none          | yes           | after a click |
| `device.haptics.impact(style)`                                            | nothing                                                    | iPhone       | none          | yes           | no            |
| `device.haptics.notification(type)`                                       | nothing                                                    | iPhone       | none          | yes           | no            |
| `device.haptics.selection()`                                              | nothing                                                    | iPhone       | none          | yes           | no            |
| `device.openURL(url, { inApp })`                                          | nothing                                                    | yes          | none          | yes           | after a click |
| `device.ui.alert(message, { title })`                                     | nothing, once closed                                       | yes          | none          | yes           | planned       |
| `device.ui.confirm(message, { title, destructive, okLabel })`             | `boolean`                                                  | yes          | none          | yes           | planned       |
| `device.ui.prompt(message, { title, placeholder, defaultValue, secure })` | `string`, or `null`                                        | yes          | none          | yes           | planned       |
| `device.ui.actionSheet(title, options, { message, cancel, destructive })` | the option's index, or `null`                              | yes          | none          | yes           | planned       |
| `device.ui.pickDate({ mode, title, value, min, max })`                    | `Date`, or `null`                                          | yes          | none          | yes           | planned       |
| `device.share({ text, url, files })`                                      | `true` when sent, `false` when dismissed                   | yes          | none          | yes           | after a click |
| `device.preview(files)`                                                   | nothing, once closed                                       | yes          | none          | yes           | no            |
| `device.files.pick({ types, multiple })`                                  | `File[]`, `[]` when cancelled                              | yes          | none          | yes           | after a click |
| `device.files.export(data, { name })`                                     | `true` when saved, `false` when cancelled                  | yes          | none          | yes           | after a click |
| `device.sound.play(data, { volume })`                                     | nothing, once it starts                                    | yes          | none          | yes           | after a click |
| `device.sound.player(data)`                                               | a `SoundPlayer`                                            | yes          | none          | no            | no            |
| `device.photos.pick({ limit })`                                           | `File[]`, `[]` when cancelled                              | yes          | none          | yes           | after a click |
| `device.photos.save(image)`                                               | nothing                                                    | yes          | photos        | no            | no            |
| `device.notifications.schedule(body, { delay, title })`                   | the notification's id                                      | yes          | notifications | no            | no            |
| `device.notifications.pending()`                                          | this notebook's `PendingNotification[]`                    | yes          | none          | no            | no            |
| `device.notifications.cancel(id)`                                         | nothing                                                    | yes          | none          | no            | no            |
| `device.notifications.cancelAll()`                                        | nothing                                                    | yes          | none          | no            | no            |
| `device.location.current({ accuracy })`                                   | a `LocationFix`                                            | yes          | location      | no            | no            |
| `device.location.watch({ accuracy })`                                     | a stream of `LocationFix`                                  | yes          | location      | no            | no            |
| `device.location.geocode(address)`                                        | `Place[]`                                                  | yes          | none          | no            | no            |
| `device.location.reverseGeocode({ latitude, longitude })`                 | `Place[]`                                                  | yes          | none          | no            | no            |
| `device.motion.watch({ interval })`                                       | a stream of `MotionSample`                                 | iPad, iPhone | motion        | no            | no            |
| `device.motion.latest()`                                                  | the newest `MotionSample`                                  | iPad, iPhone | motion        | no            | no            |
| `device.contacts.search(query)`                                           | `Contact[]`                                                | yes          | contacts      | no            | no            |
| `device.contacts.get(id)`                                                 | a `Contact`, or `null`                                     | yes          | contacts      | no            | no            |
| `device.contacts.all()`                                                   | `Contact[]`                                                | yes          | contacts      | no            | no            |
| `device.contacts.add(contact)`                                            | the new contact's id                                       | yes          | contacts      | no            | no            |
| `device.contacts.delete(id)`                                              | `true`, or `false` when there was none                     | yes          | contacts      | no            | no            |
| `device.camera.capture()`                                                 | JPEG bytes, or `null` when cancelled                       | iPad, iPhone | camera        | no            | no            |
| `device.reminders.calendars()`                                            | `ReminderCalendar[]`                                       | yes          | reminders     | no            | no            |
| `device.reminders.list({ calendar, completed })`                          | `Reminder[]`                                               | yes          | reminders     | no            | no            |
| `device.reminders.add(reminder)`                                          | the new reminder's id                                      | yes          | reminders     | no            | no            |
| `device.reminders.complete(id)`                                           | `true`, or `false` when there was none                     | yes          | reminders     | no            | no            |
| `device.reminders.uncomplete(id)`                                         | `true`, or `false` when there was none                     | yes          | reminders     | no            | no            |
| `device.reminders.delete(id)`                                             | `true`, or `false` when there was none                     | yes          | reminders     | no            | no            |
| `device.bluetooth.scan({ services, allowDuplicates })`                    | a stream of `Advertisement`s                               | yes          | bluetooth     | no            | no            |
| `device.bluetooth.known(ids)`                                             | `KnownPeripheral[]`                                        | yes          | bluetooth     | no            | no            |
| `device.bluetooth.connect(id, { timeout })`                               | a `Peripheral`                                             | yes          | bluetooth     | no            | no            |
| `device.folders.pick({ write })`                                          | a `Folder`, or `null` when cancelled                       | yes          | none          | no            | no            |
| `device.folders.list()`                                                   | `Folder[]`                                                 | yes          | none          | no            | no            |
| `device.on(event, handler)`                                               | a function that removes the handler                        | yes          | none          | no            | no            |

- `device.info()`: A browser has no model or battery.
- `device.clipboard.readText()`: iPadOS shows its paste prompt; a browser needs a click for the Clipboard API.
- `device.clipboard.writeText(text)`: A browser needs a click for the Clipboard API.
- `device.clipboard.readImage()`: PNG. iPadOS shows its paste prompt; a browser needs a click for the Clipboard API.
- `device.clipboard.writeImage(image)`: A browser needs a click for the Clipboard API, and takes PNG only.
- `device.haptics.impact(style)`: iPhone only: iPads and Macs have no Taptic Engine. A browser has no haptics API Safari supports.
- `device.haptics.notification(type)`: iPhone only: iPads and Macs have no Taptic Engine.
- `device.haptics.selection()`: iPhone only: iPads and Macs have no Taptic Engine.
- `device.openURL(url, { inApp })`: http, https and mailto only. `inApp` works on iPhone and iPad, not the Mac; a browser opens a tab after a click, and ignores `inApp`.
- `device.ui.alert(message, { title })`: A sheet on the Mac, an alert on iPhone and iPad; a browser will show it in the cell's output.
- `device.share({ text, url, files })`: The share sheet; `NSSharingServicePicker` on the Mac. A browser uses the Web Share API, after a click, and shares files only where it can.
- `device.preview(files)`: Quick Look, which picks the viewer from each file name's extension. A browser has no Quick Look.
- `device.files.pick({ types, multiple })`: The open panel on the Mac, the document picker on iPad and iPhone. Files are copied in; no access to where they came from is kept. A browser can't filter by a type identifier such as `public.json`, so with one it allows any file.
- `device.files.export(data, { name })`: The save panel on the Mac, the document picker on iPad and iPhone. A browser downloads it after a click, and answers `true` then, since it can't tell whether it was saved.
- `device.sound.play(data, { volume })`: A browser asks for a click only until the page has had one.
- `device.sound.player(data)`: Play, pause, stop, seek and volume; close it, or hold it with `await using`. Remote kernels and browsers: a handle wouldn't survive a disconnect.
- `device.photos.pick({ limit })`: The system photo picker, which needs no photo library permission. A browser shows a file picker for images, and keeps the first `limit` picked.
- `device.photos.save(image)`: Add-only access: the app may add photos, never read the library.
- `device.notifications.schedule(body, { delay, title })`: After `delay` seconds, even when the notebook is closed. iOS and iPadOS keep at most 64 per app.
- `device.notifications.pending()`: Only the calling notebook's.
- `device.notifications.cancel(id)`: Only the calling notebook's.
- `device.notifications.cancelAll()`: Only the calling notebook's.
- `device.location.current({ accuracy })`: While the app is in use only. With precise location off, within a few kilometres.
- `device.location.watch({ accuracy })`: Until the loop ends or the cell is interrupted; keeps the newest 16.
- `device.location.geocode(address)`: Needs the network, not the location permission.
- `device.location.reverseGeocode({ latitude, longitude })`: Needs the network, not the location permission.
- `device.motion.watch({ interval })`: Attitude, rotation rate, gravity and acceleration every `interval` seconds (0.01 to 1); keeps the newest 64. A Mac has no motion sensors.
- `device.motion.latest()`: Starts the sensors and keeps them running while calls keep coming; they stop about 10 seconds after the last.
- `device.contacts.search(query)`: By name, or by email or phone number when the query is one. With limited access, only the contacts shared with the app.
- `device.contacts.add(contact)`: To the default account; groups and accounts aren't wrapped.
- `device.camera.capture()`: The system camera screen. A Mac has none in the app; a browser would need its own camera view.
- `device.reminders.add(reminder)`: No recurrence or alarms.
- `device.bluetooth.scan({ services, allowDuplicates })`: Bluetooth LE only. A browser would need Web Bluetooth, which Safari doesn't have.
- `device.bluetooth.connect(id, { timeout })`: Services, read, write, notify and RSSI; close it, or hold it with `await using`. At most 8 per kernel.
- `device.folders.pick({ write })`: The system folder picker, which is the consent; the folder stays the notebook's until revoked in Settings. A browser would need the File System Access API, which Safari doesn't have.
- `device.folders.list()`: A `Folder` lists, reads, writes and removes inside the folder only; reads up to 16 MiB.
- `device.on(event, handler)`: Appearance, foreground, background, battery and locale changes; an interrupt doesn't remove a handler.

<!-- device-table:end -->

`writeImage` takes PNG, JPEG, GIF, HEIC or TIFF bytes (a `Uint8Array`,
`ArrayBuffer` or `Blob`). Haptics are there only on an iPhone: iPads and
Macs have no Taptic Engine, so `device.has('haptics.impact')` is false
on them. `impact` takes `light`, `medium` (the default), `heavy`,
`soft` or `rigid`; `notification` takes `success`, `warning` or
`error`. `openURL` opens `http`, `https` and `mailto` URLs only; with
`inApp: true` an iPhone or iPad shows a web page in a Safari view
instead of switching to Safari, and a Mac ignores it.

A browser lets a page use the clipboard only after a click, so there the
page shows a prompt to click first. On iPadOS, reading the clipboard
can show the system's paste prompt (Settings › Ganymede › Paste from
Other Apps sets whether it asks).

`device.info()` returns the app's answer from when the kernel started:

```ts
await device.info();
// { platform: "ipados", appVersion: "0.3.0", osVersion: "26.1.0", capabilities: ["clipboard.readText", "clipboard.writeText"] }
```

`platform` is `"ipados"` on an iPad and `"ios"` on an iPhone.

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

### Methods behind a permission

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

These need your permission ("Permissions and the ledger" below), and
work only in kernels in the app:

- `device.notifications`: schedule a notification after a delay, list
  and cancel this notebook's pending ones.
- `device.location`: the current position, a stream of positions, and
  geocoding.
- `device.motion` (iPad and iPhone): a stream of motion samples, or the
  latest one.
- `device.photos.save`: add an image to Photos. It can't read the
  library.
- `device.camera.capture` (iPad and iPhone): take a photo with the
  system camera.
- `device.contacts`: search, read, add and delete contacts.
- `device.reminders`: your reminder lists; list, add, complete and
  delete reminders.
- `device.bluetooth`: scan for Bluetooth LE peripherals, connect to
  one, and read, write and subscribe to its characteristics.

### Host events

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

`device.on(event, handler)` calls `handler` when the app changes:
`appearance` (`"light"` or `"dark"`), `foreground`, `background`,
`battery` (`{ level, charging }`) and `locale`. It needs no permission
and works only in kernels in the app. On a Mac, `background` means the
app lost focus to another app, and `foreground` that it got it back. It
returns a function that removes the handler; a `signal` option removes it
too, but an interrupt doesn't.

```ts
const off = device.on('appearance', mode => console.log('now', mode));
// later
off();
```

### Folders

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

`device.folders.pick({ write })` shows the system folder picker and
keeps the folder you pick for this notebook, across kernel and app
restarts; `device.folders.list()` gives them back. A `Folder` lists,
reads, writes and removes inside that folder only: a path that leads
outside it, through `..` or a symlink, is refused. Writing and removing
need `write: true` at the pick. The picker is your consent, so there is
no permission prompt; Settings › Device lists each notebook's folders
with Revoke. It works only in kernels in the app.

```ts
const folder = await device.folders.pick({ write: true });
if (folder) {
  for (const entry of await folder.entries()) console.log(entry.kind, entry.name);
  await folder.write('notes/today.txt', 'Written from a notebook');
}
```

The table above has each method. The
[phases](https://github.com/tlockney/ganymede-device/blob/main/docs/plan.md#phases)
list what comes next.

## Permissions and the ledger

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

Some methods need your permission, such as notifications, location
and contacts. The first time a notebook calls one, the app asks you
before the system does: **Allow Once** lets that call through, **Always
Allow** lets this notebook use it from now on, and **Don’t Allow** turns
it down from now on. Cancel turns down just that call. The call then
rejects `denied`, so the cell can carry on without it. The system's own
prompt comes after the app's, once per app.

The app keeps "always" and "don’t allow" by notebook, by its full path,
so a rename in the sidebar keeps them. Settings › Device lists them with
**Revoke**; a revoked notebook asks again at its next call. A notebook
can say what it uses in its metadata, and the app then asks when you
open it rather than in the middle of a run:

```json
{ "metadata": { "ganymede": { "device": ["notifications"] } } }
```

Each namespace with a permission also has `authorizationStatus()` and
`requestAuthorization()`, to check or ask before the first call. Only
kernels in the app (TypeScript, in the page) reach these methods. A
server kernel's `device` has only the methods that need no permission.

Answers are kept per notebook on trust in the notebook page itself: it
tells the app which notebook each kernel runs. A cell can't change that,
since it runs apart from the page, but script in the page can, such as
HTML or JavaScript output from a notebook you marked trusted. Such
script could use another notebook's answers, so trust only notebooks
whose output you would let use your device.

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
