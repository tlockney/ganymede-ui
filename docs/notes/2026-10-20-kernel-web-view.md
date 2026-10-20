## 2026-10-20, hidden kernel web view in the Apple apps (#99)

Thomas chose the hidden kernel web view over sandboxed outputs for
keeping notebook output away from native bridges such as
ganymede-device's `device` handler: sandboxed HTML/JS frames (#35) leave
widgets in the page, and WebKit gives subframes the page's message
handlers anyway.

`KernelHost.swift` owns a second `WKWebView` on `kernel.html`, a new Vite
entry (`src/kernel-host.ts`) that runs one cdp-kernel browser kernel per
kernel the UI starts. Swift relays: the UI posts `{ kernel, op: 'start' |
'send', channel, msg }` to `kernelRelay`; the kernel page posts `ready`,
`message` and `closed` to `kernelHost`; each goes to the other page's
`deliver` through `callAsyncJavaScript`, which keeps the order.
Choices:

- **Lazy load.** The kernel page loads on the first `start`, so the UI
  page has its login cookie by then; messages before `ready` queue.
- **Main frame and origin only.** Messages from subframes, or from a
  main frame on another origin, are dropped.
- **Buffers as base64.** WebKit's postMessage to native carries no
  `ArrayBuffer`s; widget buffers would otherwise vanish.
- **Kept awake.** The kernel view is a 1×1, fully transparent subview of
  the UI view (WebKit suspends web views in no window), with
  `inactiveSchedulingPolicy = .none` on macOS 14 and iOS 17. Whether this
  keeps cells running at full speed on a real iPad, and in the
  background, is untested.
- **Reset with the page.** A UI navigation (reload, restart) blanks the
  kernel page, so its kernels end with the page that owned them.

`CdpBrowserKernel` takes the relay when `webkit.messageHandlers.kernelRelay`
exists, so browsers are unchanged. An e2e test plays Swift between two
Playwright pages; `KernelHostTests` checks the Swift side between two
real web views on the in-process server, including a sandboxed frame
that tries to post into the relay.

Still open in #99: registering `device` (with cdp-kernel 0.7.1's
`preload`/`host`/`capabilities`) waits on ganymede-device being
installable, and where the Swift `DeviceBridge` lives is undecided.
