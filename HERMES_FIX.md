# Fix round for #855 (branch claude/project-thread-fneunc)

Make these changes, run the checks at the end, commit once (deleting this
file in that commit), do not push. Comment style: short `///` comments
that say why, citing `(#855)`.

First `git merge --no-edit origin/main` (the branch is one commit behind;
the merge is clean).

## 1. The page's own `openFile` and search in a machine window (src/App.tsx)

`src/App.tsx` sets
`editsFiles = canOpenFiles() && !!backend && isAppServer(backend.config)`.
`isAppServer` (src/lib/app-config.ts) is false whenever `config.machine`
is set, so a machine window's page never offers "Open as Text" and its
search reports `opensFiles: false` (the iPad then dims a machine's text
files).

- Add to `src/lib/app-config.ts`:
  ```ts
  /** The Apple app's server or its mount of a connected machine (#855):
   *  where the app's own editor can open files. */
  export function isAppOrMountedServer(config: BackendConfig): boolean {
    return config.kind === 'ganymede' && config.url === '';
  }
  ```
  with a unit test in the existing app-config test file (machine config
  true, plain app server true, a remote URL false).
- `editsFiles` uses `isAppOrMountedServer`. Leave every other
  `isAppServer` use as it is.
- Update the comment above `editsFiles`, `apple/Sources/Ganymede/PageState.swift`
  lines ~92-93 ("only from the app's own server"), and
  `docs/architecture.md` (~637-639) to say "or its mount of a connected
  machine".
- If App tests already cover Open as Text or `opensFiles`, add a case for
  a machine config; otherwise the app-config test is enough.

## 2. Segment check on a machine's path (Swift)

The page's `openFile` path reaches `appendingPathComponent`, which keeps
`..`. For a machine, refuse any path with an empty, `.` or `..` segment
(after splitting on `/` and ignoring a leading `/`).

## 3. One tested place that turns a request into an endpoint (Swift)

Today `EditorDocument.endpoint(machine:)` and the call sites carry the
logic. Move it into `Editor/EditorRequest.swift` (already in both test
targets):

```swift
/// The request for `path` in `place`'s window (#855).
init(path: String, place: Place)

/// The server this request's file is on (#855): this device's, or the
/// app's mount of the machine. Nil without a server, for a machine id
/// that isn't valid (never this device's server instead), and for a
/// machine path with an empty, `.` or `..` segment.
func endpoint(local: ServerEndpoint?) -> ServerEndpoint?
```

`EditorDocument`, both `EditorWindow.init`s, `IPadOpenFiles.document(for:)`
and every `ContentView` call site (`EditorRequest(path:, machine:
place.machineID)` now `EditorRequest(path:, place:)`) use these. Remove
`EditorDocument.endpoint(machine:)` if nothing else needs it.

Tests in `EditorRequestTests`: `init(path:place:)` for this device and a
machine; `endpoint(local:)`: nil local gives nil; this device gives local;
a machine gives `local.mounted(...)`; an invalid id gives nil (not
local); a machine path `a/../b`, `./a`, `a//b` gives nil; a plain machine
path works.

Drop the assertion in `testTheIPadsStackKeepsAPlacesFilesApart` that only
filters the test's own array (`XCTAssertEqual(stack.filter { $0.machine == nil }, [local])`)
and its comment's claim about `switchPlace`; if `IPadOpenFiles` can be
tested without UIKit views, test that switching place drops the other
place's files instead, otherwise delete that test.

## 4. Errors

- The mount's 404 is JSON: `{"message": "No machine \"<id>\" is mounted", "reason": null}`.
  Change `testAMachineThatIsNotMountedSaysSoAsTheSidebarDoes` to feed that
  JSON body. In `TextFile.swift` (~307-313) drop the plain-text branch if
  the JSON branch covers it, or reword its comment as a fallback.
- An invalid machine id: `EditorDocument` shows "This file's machine is
  not one the app knows." (or similar) instead of "Ganymede's server is
  not running." Only when the request names a machine and
  `endpoint(local:)` is nil while the local server exists.

## 5. Stale comments

- `IPadChrome.swift` ~705: "The app's editor reads this device's disk:
  never a machine's file" — now wrong; reword.
- `NativeChrome.swift` ~16-17: "can't be ... opened in the text editor,
  which read this Mac's disk" — reword.

## 6. Dev log (docs/notes/2026-11-26-machine-editor.md)

Make every claim true: the page's Open as Text and the iPad search now
work for a machine (item 1); the 404 is JSON (item 4); an invalid id
gets its own message; the segment check (item 2). Say the by-hand checks
are on #399 and #273 (they are being added there now).

## Check

```sh
npm run check && npx vitest run src/lib
cd apple && xcodebuild test -scheme Ganymede -destination 'platform=macOS' \
  -only-testing:GanymedeTests/PlaceTests -only-testing:GanymedeTests/EditorRequestTests \
  -only-testing:GanymedeTests/ServerEndpointMountedTests -only-testing:GanymedeTests/TextFileTests 2>&1 | tail -30
xcodebuild build -scheme Ganymede-iOS -destination 'platform=iOS Simulator,name=iPhone 18 Pro' 2>&1 | tail -5
```

Commit: "Fix review of #855: page Open as Text and search, tested endpoint
choice, segment check, JSON 404".
