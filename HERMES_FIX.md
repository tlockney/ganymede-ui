# Fix brief: review of #868 (Notebook Access and app links on a machine)

Branch `claude/project-thread-fneunc` (head 2708379 + this file). Fix
every item, keep the comment style (cite `(#868)`), delete this file in
your commit, commit once, do not push.

## High / Medium

1. The 404 comes from THIS device's bundled mount, not the machine.
   At `GANYMEDE_REF` v0.17.0 the mount refuses `api/host/grants` with a
   JSON 404 `{"message":"Not Found","reason":null}`, so `answer()` in
   `src/lib/host-grants.ts` shows "Not Found". Any machine server from
   v0.15.0 on already serves grants; ganymede#973 changed only the mount.
   - In `answer()`: a 404 whose message is missing or exactly
     `"Not Found"` is the "no settings" case. For a machine backend the
     message is "Notebook access on a connected machine needs a newer
     version of this app." (pass whether the backend is a machine into
     `answer`, or decide the wording in the caller); for a server it
     stays "This server has no notebook access settings. They need a
     newer Ganymede."
   - Test in host-grants.test.ts with a real
     `new Response(JSON.stringify({message:'Not Found',reason:null}), {status:404})`
     for both a machine and a server backend.
2. Dimmed when unavailable (issue #868 acceptance): for a machine
   backend, the probe GET the padlock effect already makes
   (App.tsx ~961-976) decides availability. On that 404, set
   `hostGrants` false for native chrome / the palette (so Notebook
   Access is dimmed) and keep the padlock silent. Note the probe only
   runs when the notebook has `wants`; make the probe run for a machine
   backend whenever a notebook is open (one GET per opened notebook),
   and until it answers treat a machine as unavailable. A server backend
   keeps today's behaviour. App test: machine backend, probe rejects
   with the 404 → `states.at(-1).hostGrants === false`; probe succeeds
   → true.
3. Docs and comments say the wrong side needs ganymede#973. Fix
   `docs/apps.md` (Machines section and its Unreleased note), the
   comment at `src/lib/host-grants.ts` ~25-26, and the dev log
   `docs/notes/2026-11-26-machine-access-links.md`: it needs an app
   whose bundled server includes ganymede#973 (`GANYMEDE_REF` after
   v0.17.0); any machine with Ganymede v0.15.0 or later works; until
   then Notebook Access is dimmed in a machine's window.
4. `WebView.swift` ~412-418: the machine `ganymede://` branch must
   act only on `navigationAction.navigationType == .linkActivated`;
   any other navigation to `ganymede://` in a machine's window is
   cancelled silently (a script in an output frame could otherwise loop
   it). On macOS show the refusal with
   `alert.beginSheetModal(for: webView.window!)` (guard the window),
   not `runModal()`, so it is window-scoped; fix the doc comment at
   ~594 accordingly. `createWebViewWith` stays as is.

## Low

5. Extract the decision into a pure static function (e.g. in
   Place.swift: `func linkAction(for url: URL, clicked: Bool) -> LinkAction`
   with cases like `.allow`, `.cancel`, `.openExternally`,
   `.openOnMachine(path)`, `.refuse`, or a narrower helper for the
   `ganymede://` part) that WebView calls, and test it in PlaceTests,
   including: machine + clicked `open?path=a.ipynb` → open; machine +
   not clicked → cancel silently; machine + clicked `run` → refuse;
   this device unchanged. It must fail if the WebView wiring logic is
   reverted to the old branch.
6. Edit your by-hand comments to match: #399
   (issuecomment-7206047571) and #273 (issuecomment-7206048014), via
   `gh api -X PATCH repos/tlockney/ganymede-ui/issues/comments/<id> -f body=...`,
   keeping the footer. With the current bundled server: Notebook Access
   is dimmed in a machine's window, no padlock error. Add: a script in
   an output can't trigger the link notice (only a click does).

## Checks

`npm run check`, `npx vitest run`, macOS unit tests, iOS build on an
arm64 simulator. Report counts.
