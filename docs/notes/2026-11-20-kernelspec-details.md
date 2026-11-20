## 2026-11-20, kernelspec details in Settings > Kernels (#694)

The installed-kernels list is now `InstalledKernelsSection`
(`KernelSpecsList.swift`), shared by the Mac's Settings > Kernels and the
iPad and iPhone's Settings (after `KernelLocationSection` in `RemotesView`),
so it follows the server kernels run on. Each row (`KernelSpecRow`) is a
`DisclosureGroup` whose whole label toggles it. Opened, it shows the fields
the server reports: interrupt mode, protocol version, the kernelspec
folder, `argv` as a monospaced command with Copy (`NSPasteboard` on the Mac,
`UIPasteboard` on iOS), `env` and `metadata` as key/value rows. A row with
none of them stays a plain row.

`KernelSpecs.Spec` keeps these from `/api/kernelspecs`. Every field is
optional, a field of the wrong type is dropped, and an empty string counts
as absent (the server always sends `kernel_protocol_version`, "" when
kernel.json lacks it). `resource_dir` is read from the entry's top level
(ganymede#890); the bundled server (v0.13.1) lacks it, and a remote's
gateway listing doesn't report it. `argv` elements with spaces or shell
metacharacters are single-quoted, for display and Copy
(`KernelSpecs.shellCommand`). Metadata strings, numbers and booleans show
plainly; null, arrays and objects show as compact JSON with sorted keys and
unescaped slashes. Booleans are told from numbers by `CFBooleanGetTypeID`,
as `JSONSerialization` returns both as `NSNumber`.

Not compiled or run: the container has no Swift toolchain; CI is the first
build.
