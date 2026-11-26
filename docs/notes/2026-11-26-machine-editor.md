## 2026-11-26, Open a connected machine's text files in the editor (#855)

A machine's window dimmed its text files, because `EditorRequest` named only a
path and `EditorWindow` built every document on `AppModel.shared.localServer`:
the editor read this Mac's disk. `Place.allows(.openFile)` was false for a
machine to keep the page from asking for a file that would have opened a path
of this Mac's instead.

`EditorRequest` now carries `machine: String?`, nil for this device's, and its
`id` puts the machine first, so the same path here and on a machine are two
files and two windows. A request saved by an older build has only `path`, so
it decodes as this device's, as it was. `ServerEndpoint.mounted(machine:)`
gives the app's server with `/machines/{id}/` as its root and the same token,
which is how `MachineFileSource` already reaches a machine's contents API; the
editor's `TextFileClient` then reads and writes `/machines/{id}/api/contents/…`
through it. Nothing is built from an id `Place.isValidMachineID` refuses: such
a request has no endpoint and says so, rather than falling back to this Mac.

`Place.allows(.openFile)` is true for a machine, so its sidebar, its search
results and its page's `openFile` open the file; `handlerNames` gains
`openFile` with it. On the Mac the editor window's title names the machine,
"notes.md · m4mini", and it has no proxy icon, since a machine's file is no
file of this Mac's. The iPad's open files are `EditorRequest`s now, so a
machine's file isn't left open over this device's notebook when the place
changes; `switchPlace` still saves and clears them. Only this device's paths
reach `OpenTextFiles`, which a folder switch waits on.

A machine that doesn't answer says so in the sidebar's words: the mount's
`No machine … is mounted` 404 and its 502 are read there
(`FileSourceError.machineMessage`), not shown as a bare HTTP error. The
editor's `TextFileClient.Failure` gained the status, and keeps a plain-text
mount answer, so both can be told apart.

Part of ganymede#965, section 2. By-hand checks on #399 (Mac) and #273 (iPad
and iPhone).
