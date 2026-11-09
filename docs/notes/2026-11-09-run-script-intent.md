## 2026-11-09, Run Script on Device from Shortcuts (#434)

Phase 4.4 of the device API, on the headless runner from #433, so it is
a spike: the action throws until Settings › Device › Run Scripts from
Shortcuts is on. Unlike #302's Mac actions, it needs no server and no
kernel, so it works on iPad and iPhone, where a kernel dies about 30
seconds after the app is suspended.

The file parameter accepts any file: Apple's systems type `.ts` as an
MPEG transport stream, so the extension picks TypeScript, JavaScript or
a notebook. The ledger, folders and secrets are keyed by the file's path,
or `shortcuts/<name>` when Shortcuts passes a copy without one. The
bridge is `KernelHost.systemBridge` with no prompter, so a permissioned
call needs a kept Always. The result is text (`device.output`'s text or
link, else the return value); output files aren't returned yet.
