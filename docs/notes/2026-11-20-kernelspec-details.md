## 2026-11-20, kernelspec details in Settings > Kernels (#694)

Each row of the Mac's Settings > Kernels list is now a `DisclosureGroup`
(`KernelSpecRow` in `SettingsWindow.swift`). Opened, it shows the fields the
kernelspec sets and nothing else: interrupt mode, protocol version, the
kernelspec folder, `argv` as a monospaced command with Copy (`NSPasteboard`,
as `MCPConfigRow` does), `env` and `metadata` as key/value rows. A row with
none of them stays a plain row.

`KernelSpecs.Spec` keeps these from `/api/kernelspecs`. Every field is
optional and a field of the wrong type is dropped, not an error.
`resource_dir` is read from the entry's top level (ganymede#890); a server
that lacks it just shows no folder. Metadata strings, numbers and booleans
show plainly; null, arrays and objects show as compact JSON with sorted keys.
Booleans are told from numbers by `CFBooleanGetTypeID`, as `JSONSerialization`
returns both as `NSNumber`.

The iPad and iPhone have no installed-kernels list in their settings (only
`KernelLocationSection`), so there is nothing to change there. Not compiled
or run: the container has no Swift toolchain; CI is the first build.
