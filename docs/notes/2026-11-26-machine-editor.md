## 2026-11-26, Open a connected machine's text files in the editor (#855)

A machine's window dimmed its text files, because `EditorRequest` named only a
path and `EditorWindow` built every document on `AppModel.shared.localServer`:
the editor read this Mac's disk.

`EditorRequest` now carries `machine: String?`, nil for this device's, and its
`id` puts the machine first, so the same path here and on a machine are two
files and two windows. A request saved by an older build has only `path`, so it
decodes as this device's, as it was. `EditorRequest(path:place:)` builds one
for a window's place, and `endpoint(local:)` is the one place that says which
server holds the file: this device's, or its mount of the machine
(`ServerEndpoint.mounted(machine:)`: `/machines/{id}/` as the root and the same
token, which is how `MachineFileSource` already reaches a machine's contents
API). The editor's `TextFileClient` then reads and writes
`/machines/{id}/api/contents/…` through it. The endpoint is nil without a
server, and for an id `Place.isValidMachineID` refuses: such a request never
falls back to this Mac's server, which would open a path of this Mac's instead.
It is nil for a machine's path with an empty, `.` or `..` segment too, since
`appendingPathComponent` keeps `..` and the mount would be asked for a path
above its root. The editor says which case it is: "This file's machine is not
one the app knows." for a machine it has no mount for, and the missing server
for the rest.

`Place.allows(.openFile)` is true for a machine, so its sidebar, its search
results and its page ask for the file, and `handlerNames` gains `openFile` with
it. The page decides with `isAppOrMountedServer`: the app's own server, or that
server's mount of a machine. Both `editsFiles` and the search's `opensFiles`
come from it, so a machine's window offers "Open as Text" and its sidebar no
longer dims the machine's text files. On the Mac the editor window's title
names the machine, "notes.md · m4mini", and it has no proxy icon, since a
machine's file is no file of this Mac's. The iPad's open files are
`EditorRequest`s now, so a machine's file isn't left open over this device's
notebook when the place changes; `switchPlace` still saves and clears them.
Only this device's paths reach `OpenTextFiles`, which a folder switch waits
on.

A machine that doesn't answer says so in the sidebar's words: the mount's
`No machine … is mounted` 404, which is JSON like the server's other errors,
and its 502, both through `FileSourceError.machineMessage`, not as a bare HTTP
error. The editor's `TextFileClient.Failure` gained the status, and reads the
404's message from that JSON body.

Part of ganymede#965, section 2. The by-hand checks are on #399 (Mac) and #273
(iPad and iPhone), and are being added there now.
