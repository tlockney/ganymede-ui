## 2026-11-20, machine sidebar offline (#753)

- `FileSourceError.machineMessage(_:machine:)` words a machine's failure: 502/503/504 or a `URLError` other than cancelled is "didn't answer"; the mount's own 404 (`No machine "<id>" is mounted`, matched exactly, so a file named "No machine…" isn't) is "isn't connected to this Mac"; anything else keeps its description. `FileSourceError.message(_:place:machineName:)` routes through it only for a machine, so this device's errors are unchanged.
- `MachineFileSource` keeps a plain-text 404 body as the message when it says "No machine", so the not-connected case is told apart whether or not the mount sends JSON.
- `FolderSidebar` takes `machineName` from `NavigatorSidebar`. While `PlaceReachability` says the machine is offline it shows one "offline. Reconnecting…" line, and folder listings skip their own error. When the machine answers again `generation` is bumped and every open folder lists again.
- `FileChanges.allowed(place:reachable:busy:)` replaces `FolderActions.busy` with `canChange`: New Folder, Rename, Duplicate and Delete wait for a running operation or an offline machine; New Notebook and New Notebook Here wait for an offline machine only. File operation alerts in a machine window use the same words.
- A file operation confirmed in a dialog after the machine went offline says it didn't answer instead of doing nothing. Journals' 404 check uses the same `isNotMounted`. With no machine name the words are "The machine …".
- Tests: `MachineFileSourceTests` covers each message case, this device unchanged, the plain-text 404 and `FileChanges`.
- By hand: #399, the #753 checks.
