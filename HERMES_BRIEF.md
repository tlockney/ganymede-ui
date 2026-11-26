# Brief: tlockney/ganymede-ui#832 — show where each kernel runs, and when the remote isn't answering

Read the issue: https://github.com/tlockney/ganymede-ui/issues/832. The server side is merged in
tlockney/ganymede#969 (issue #963). Read its docs on `main` of tlockney/ganymede: docs/api.md
"List kernelspecs" and docs/reference.md "Gateway".

Follow CLAUDE.md, CONTRIBUTING.md and /mnt is not available to you; repo rules are in the repo.
Work on this branch (`claude/project-thread-obabcr`). Commit; do not push. Delete this file in your last commit.

## Server API (from ganymede#969, not yet in a ganymede release)
`GET /api/kernelspecs` may carry two optional extra keys:
- top level `"gateway": {"name": string, "reachable": bool, "error": string|null}`, present whenever
  the server runs kernels on a remote. `reachable:false, error:null` = not checked yet (show nothing
  then, or "checking…"); `reachable:false` with an error = not answering.
- per spec (beside `name`, `spec`, `resources`): `"gateway": true` for kernels that run on that remote.
Both are absent from the released server, so every change must be a no-op when they're absent.

Do NOT pass `gateway_name` to the server: the server config uses `deny_unknown_fields`, and the
app's XCFramework (GANYMEDE_REF, a released tag) doesn't know the key yet, so the server would refuse
to start. Note this as a follow-up in the dev log (pass it once GANYMEDE_REF includes ganymede#969).

## What to build
1. Page (TypeScript, `src/`):
   - Read the extra keys from the kernelspecs model (JupyterLab's KernelSpecManager keeps unknown keys
     in `specs`? check: if it drops them, fetch `api/kernelspecs` via the existing serverSettings/
     `makeRequest` path used elsewhere, e.g. src/lib/kernel-usage.ts, with the confined fetch for
     machines). Put the logic in a small module `src/lib/kernel-place.ts` with unit tests:
     label for a spec (`"<display_name> · <gateway name>"` for gateway specs, unchanged otherwise),
     and a status line (`"<name> isn't answering: <error>"`, or null).
   - `src/App.tsx` postState (~line 881): each entry of `kernels` gains `gateway?: string` (the
     remote's name when the spec runs there). Add `kernelsRemote: {name, reachable, error} | null`
     to PageState (`src/lib/native.ts`, ~line 211) and post it.
   - Web kernel picker (`src/components/Toolbar.tsx`, and ProblemNotice.tsx's kernel list): mark
     gateway kernels with the remote's name; when not reachable, one disabled line
     "<name> isn't answering". Update their tests (Toolbar.test.tsx, ProblemNotice.test.tsx).
   - In a machine's page (config.machine set, src/lib/backends.ts), the line reads
     "<machineName> runs kernels on <name>, which isn't answering".
2. Apple apps (Swift, `apple/Sources/Ganymede/`):
   - Decode the new PageState fields where PageState is decoded (find `kernelVersionLine` /
     `kernels` in PageModel.swift or the Swift PageState type) with defaults when missing.
   - Mac kernel popover and Kernel menu (NativeChrome.swift ~694 and ~949), iPad kernel menu
     (IPadChrome.swift ~1034): show the "· <name>" mark and the disabled not-answering line.
   - Settings > Where Kernels Run (RemotesView.swift ~108): when the selected remote isn't answering,
     a line under the picker: "<remote> isn't answering: <error>". Settings > Installed
     (KernelSpecsList.swift, InstalledKernelsSection, loads api/kernelspecs itself ~line 70):
     group or mark by where each runs, and show the same line.
   - Keep SwiftUI bodies small (split into computed views): iOS CI has failed with "unable to
     type-check this expression in reasonable time" in long modifier chains.
3. Docs: docs/apps.md (kernels / remotes / connected machines sections) with the
   "**Unreleased.**" note from CLAUDE.md. Dev log: docs/notes/2026-11-26-kernel-place.md starting
   `## 2026-11-26, where kernels run and remote status (#832)`.
4. Checks: `npm run lint`, `npm run typecheck` (or the repo's equivalents in package.json),
   `npm test`; build the Mac app and an iPad simulator build per CONTRIBUTING.md / apple/README.md
   (use a named iPad simulator destination, not generic/platform=iOS Simulator), and run the Swift
   unit tests you touch.

Report: files changed, every command run with its result, anything left undone.
