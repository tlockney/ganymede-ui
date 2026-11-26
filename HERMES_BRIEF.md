# Brief: open a connected machine's text files in the app's editor (#855)

Read issue #855 first (`gh issue view 855`); it has the acceptance list.
Branch `claude/project-thread-fneunc`. Keep the repo's comment style:
short `///` doc comments that say why, citing `(#855)`. Delete this file
in your commit. Commit once, do not push.

## Facts you need

- The editor: `apple/Sources/Ganymede/Editor/EditorDocument.swift`
  (`EditorRequest`, `EditorDocument(path:endpoint:)`, reads and writes
  through `TextFileClient(endpoint:path:)` on `/api/contents`) and
  `Editor/EditorWindow.swift` (builds the document with
  `{ AppModel.shared.localServer }`).
- `ServerEndpoint` (`Terminal/JupyterTerminalTransport.swift`): `base`
  URL ending in `/`, and `token`.
- The app's server mounts a machine under `/machines/{id}/`
  (`Place.mountPath`); the local token works there from loopback.
  `MachineFileSource` (`FileSource.swift`) already lists a machine's
  files this way: follow how it builds URLs and reads errors
  (`FileSource.machineMessage`, `isNotMounted`).
- `Place` (`Place.swift`): `allows(_:)`, `handlerNames`, `machineID`,
  `isValidMachineID`. A machine allows `.settings`, `.nativeChrome`,
  `.agentKeys` today.
- Call sites that open the editor: `ContentView.swift` (Mac sidebar
  callback near `NavigatorSidebar(... ) { path in openWindow(value:
  EditorRequest(path: path)) }`, the Mac `WebView(... onOpenFile: ...)`,
  iOS `openEditor(_:)` which uses `editing` on iPhone and
  `openFiles` (`IPadOpenFiles` in `IPadPanel.swift`) on iPad),
  `GanymedeApp.swift` (`WindowGroup("Editor", for: EditorRequest.self)`).
- `OpenTextFiles` / `LinkOpener.swift`: links to this device's open
  text files. A machine's file must never be in that list.

## Changes

1. `EditorRequest`: add `var machine: String? = nil`. Its `id` must
   differ for the same path on this device and on a machine (e.g.
   `machine.map { "\($0):\(path)" } ?? path`). Decoding JSON with only
   `path` (older builds' restored windows) gives `machine == nil`. Add
   `var place: Place { machine.flatMap(Place.init(machine:)) ?? .thisDevice }`
   only if it helps; an invalid id must not fall back to this device
   silently for a request that named a machine: such a request has no
   endpoint and shows the "server is not running"-style problem.
2. `ServerEndpoint`: add `func mounted(machine id: String) -> ServerEndpoint?`
   returning nil unless `Place.isValidMachineID(id)`, else the same token
   with `base` + `machines/\(id)/`.
3. `EditorWindow`: the endpoint closure uses
   `AppModel.shared.localServer` for this device, and
   `AppModel.shared.localServer?.mounted(machine:)` for a machine. On
   the Mac, the window title adds the machine's name (find how
   `ContentView` gets `machineName` for a place and reuse it; fall back
   to the id if the remote is gone).
4. `Place.allows(.openFile)`: true for a machine. Update PlaceTests
   (`testAMachineWindowGetsNoBridgeGrantsShortcutsEditorOrAppLinks`
   becomes `...GrantsShortcutsOrAppLinks` and drops `.openFile`; the
   allowed set and the `sharesName: true` set gain `openFile`;
   `testTheWebViewIsMadeFromThePlacesHandlerTable` gains `openFile`).
5. Call sites pass `machine: place.machineID`. On iPad, `IPadOpenFiles`
   keeps `EditorRequest`s (or path + machine) instead of bare paths, and
   `switchPlace` drops the open files of the place being left (look at
   what it already resets). iPhone's `editing` gets the machine too.
6. `OpenTextFiles`: register only this device's paths (requests with
   `machine == nil`).
7. Errors: a machine that's gone or not mounted gives the same message
   the sidebar gives (`FileSource.machineMessage` / `isNotMounted`), not
   a raw HTTP error. Reuse; don't duplicate.
8. Tests (Swift, in `apple/Tests/GanymedeTests`):
   - `ServerEndpoint.mounted`: valid id gives `.../machines/<id>/` with
     the same token; `""`, `"a/b"`, `"../x"` give nil.
   - `EditorRequest`: old JSON `{"path":"/a.txt"}` decodes with nil
     machine; same path with and without a machine have different ids;
     round-trips with a machine.
   - PlaceTests as in 4.
   - If `IPadOpenFiles` logic changes, a test for "switching place drops
     the other place's files" if it is testable without UIKit views.
   New test files must be added to both test targets in
   `apple/project.yml` if that file lists test sources explicitly.
9. Docs: `docs/apps.md` "What a machine's window doesn't get" drops
   "the app's editor for text files"; extend the Unreleased note right
   after that list to name the editor for a machine's files too. Dev
   log `docs/notes/2026-11-26-machine-editor.md`, starting
   `## 2026-11-26, Open a connected machine's text files in the editor (#855)`:
   what changed and why, in a few short paragraphs.

## Check

```sh
npm run check
cd apple && xcodebuild test -scheme Ganymede -destination 'platform=macOS' \
  -only-testing:GanymedeTests/PlaceTests -only-testing:GanymedeTests/RemoteStoreTests \
  <your new test classes> 2>&1 | tail -40
xcodebuild build -scheme Ganymede-iOS -destination 'platform=iOS Simulator,name=iPhone 18 Pro' 2>&1 | tail -5
```

Commit message: "Open a connected machine's text files in the app's
editor (#855)". Delete HERMES_BRIEF.md in that commit.
