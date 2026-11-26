# Fix round for #832 (pre-push review findings). Fix all; commit; don't push; delete this file in your last commit.

1. HIGH apple/Sources/Ganymede/RemotesView.swift (KernelLocationSection, ~105 and ~142-150): `check()`
   returns early when `model.kernelRemote == nil` and never clears `specs`, so after switching to
   "This Mac" (or to another remote) the old remote's "isn't answering" line stays. Key the status to
   the remote it was fetched for: store the remote id with `specs`, clear on change (set nil before the
   guard), and show the line only when it matches the chosen remote. A failed load (`try?`) must also
   clear a stale status for a different remote.
2. (Filed as #851, nothing to code: `gateway_name` waits on the GANYMEDE_REF bump.) Cite #851 in the dev
   log's "Left undone" and in docs.
3. docs/apps.md (~185-196, ~903-911): the Unreleased notes must say this needs a Ganymede server with
   ganymede#969 (unreleased); the apps embed v0.17.0, so in the Mac/iPad/iPhone apps nothing shows until
   GANYMEDE_REF moves (#851); it works today against a `ganymede serve` built from ganymede main.
4. Docs accuracy: on the Mac, Where Kernels Run is in Settings > Kernels (SettingsWindow.swift:456); on
   iOS in Settings > Remotes. Name each. ProblemNotice.tsx puts the not-answering line first, while the
   docs/dev log say lists "end with" it: move it to the end in ProblemNotice (and its test) to match.
   Fix the same claims in docs/notes/2026-11-26-kernel-place.md.
5. src/lib/kernel-place.ts `useKernelPlaces` tests (each must fail if its behaviour is removed; check by
   temporarily reverting): (a) a deferred first fetch resolving after rerender with new settings is
   ignored, and `remote` is null before the second server answers (reset + `stopped` check);
   (b) a failed ask (503) after a remote was named asks again on the next timer tick; (c) with
   `document.visibilityState === 'hidden'` no fetch happens; (d) a `focus` / `visibilitychange` event
   triggers an ask.
6. App wiring test in src/App.test.tsx: a backend whose `api/kernelspecs` returns
   `gateway: {name: "workmbp", reachable: false, error: "..."}` and a spec with `gateway: true`; assert
   the posted PageState has `kernels[].gateway === "workmbp"` and `kernelsRemote`, and that the toolbar's
   kernel menu shows "· workmbp" and the not-answering line. Follow how existing App tests post/observe
   native state.
7. apple/Tests/GanymedeTests/PageStateTests.swift `testNoRemoteLineWithoutARemoteOrAnError`: bodies lack
   required keys (`dirty`, `kernelMissing`, `trusted`), so `PageState(body:)` is nil and asserts can't
   fail. Include the required keys, `XCTUnwrap` the PageState, and drop/reshape the no-`name` case.
8. LOW: Settings > Kernels (KernelSpecsList.swift: KernelSpecRow and InstalledKernelsSection) uses the
   server's gateway name while Where Kernels Run uses `model.kernelRemote?.title`. Use the app's title
   (when kernels run on a remote) in both.
9. NIT: share one Swift helper for the two `notAnswering` implementations (PageState and KernelSpecs).

Then run: `npm run check`, `npx vitest run`, the Mac Swift tests touched (PageStateTests,
KernelSpecsTests, and any for RemotesView), and the iPad simulator build. Add a short "Pre-push review
round" section to the dev log listing these fixes.
