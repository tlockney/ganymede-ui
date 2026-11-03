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
It is early: today it has the text clipboard and nothing else.

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

| Method                             | Returns                    | In the app | Remote kernel | Browser                |
| ---------------------------------- | -------------------------- | ---------- | ------------- | ---------------------- |
| `device.info()`                    | platform, version, methods | yes        | planned       | planned                |
| `device.has(method)`               | `boolean`, synchronously   | yes        | planned       | planned                |
| `device.clipboard.readText()`      | `string`, or `null`        | yes        | planned       | planned, after a click |
| `device.clipboard.writeText(text)` | nothing                    | yes        | planned       | planned, after a click |

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

Next come methods that need no permission: device details, haptics,
images on the clipboard, alerts and pickers, share and open URL. After
those, methods behind a system permission, such as location and
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
