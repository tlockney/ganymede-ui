import XCTest

/// Ordering and failure-prompt tests for place and kernel switches (#808).
@MainActor
final class SwitchSaveGuardTests: XCTestCase {
    func testSaveCompletesBeforeRetireForgetPlaceAndAfterSwitch() async {
        let guarder = SwitchSaveCoordinator(afterAlertDismiss: {})
        var events: [String] = []
        var resumeSave: CheckedContinuation<Void, Never>?

        let task = Task { @MainActor in
            await guarder.guardSwitch(
                notebookName: { "Orbits.ipynb" },
                save: {
                    events.append("save:start")
                    await withCheckedContinuation { continuation in
                        resumeSave = continuation
                    }
                    events.append("save:end")
                    return .saved
                },
                download: { events.append("download") },
                commit: {
                    events.append("retire")
                    events.append("forgetPage")
                    events.append("setPlace")
                    events.append("openNotebook")
                }
            )
        }

        while resumeSave == nil { await Task.yield() }
        XCTAssertEqual(events, ["save:start"], "must wait for save before retiring or switching")

        resumeSave?.resume()
        let committed = await task.value
        XCTAssertTrue(committed)
        XCTAssertNil(guarder.prompt)
        XCTAssertEqual(events, [
            "save:start",
            "save:end",
            "retire",
            "forgetPage",
            "setPlace",
            "openNotebook",
        ])
    }

    func testFailedSavePromptsAndKeepEditingCancelsWithoutSwitching() async {
        let guarder = SwitchSaveCoordinator(afterAlertDismiss: {})
        var events: [String] = []

        let task = Task { @MainActor in
            await guarder.guardSwitch(
                notebookName: { "Orbits.ipynb" },
                save: {
                    events.append("save")
                    return .failed
                },
                download: { events.append("download") },
                onCancel: { events.append("cancel") },
                commit: { events.append("commit") }
            )
        }

        while guarder.prompt == nil { await Task.yield() }
        let prompt = try? XCTUnwrap(guarder.prompt)
        XCTAssertEqual(prompt?.notebookName, "Orbits.ipynb")
        XCTAssertEqual(prompt?.timedOut, false)
        XCTAssertEqual(events, ["save"])

        guarder.decide(.keepEditing, promptID: prompt!.id)
        let committed = await task.value
        XCTAssertFalse(committed)
        XCTAssertNil(guarder.prompt)
        XCTAssertEqual(events, ["save", "cancel"])
    }

    func testDownloadCopyDownloadsAndRepromptsBeforeSwitchWithoutSaving() async {
        let guarder = SwitchSaveCoordinator(afterAlertDismiss: {})
        var events: [String] = []

        let task = Task { @MainActor in
            await guarder.guardSwitch(
                notebookName: { "Orbits.ipynb" },
                save: {
                    events.append("save")
                    return .failed
                },
                download: {
                    events.append("download")
                },
                commit: {
                    events.append("commit")
                }
            )
        }

        while guarder.prompt == nil { await Task.yield() }
        let firstPrompt = try? XCTUnwrap(guarder.prompt)
        guarder.decide(.downloadCopy, promptID: firstPrompt!.id)

        // Wait until the prompt returns after downloading, with a fresh ID.
        while guarder.prompt == nil || guarder.prompt?.id == firstPrompt?.id {
            await Task.yield()
        }
        let secondPrompt = try? XCTUnwrap(guarder.prompt)
        XCTAssertNotEqual(firstPrompt?.id, secondPrompt?.id)
        XCTAssertEqual(events, ["save", "download"], "download must not switch yet")

        guarder.decide(.switchWithoutSaving, promptID: secondPrompt!.id)
        let committed = await task.value
        XCTAssertTrue(committed)
        XCTAssertNil(guarder.prompt)
        XCTAssertEqual(events, ["save", "download", "commit"])
    }

    func testRaceSaveReportsTimedOutWhenSaveHangs() async {
        let outcome = await SwitchSaveCoordinator.raceSave(timeout: .milliseconds(25)) {
            try? await Task.sleep(for: .seconds(2))
            return true
        }
        XCTAssertEqual(outcome, .timedOut)

        let saved = await SwitchSaveCoordinator.raceSave(timeout: .seconds(2)) {
            true
        }
        XCTAssertEqual(saved, .saved)

        let failed = await SwitchSaveCoordinator.raceSave(timeout: .seconds(2)) {
            false
        }
        XCTAssertEqual(failed, .failed)
    }

    func testDismissingAlertOutsideButtonsCancelsWithoutSwitching() async {
        let guarder = SwitchSaveCoordinator(afterAlertDismiss: {})
        var cancelled = false
        var committed = false

        let task = Task { @MainActor in
            await guarder.guardSwitch(
                notebookName: { "Orbits.ipynb" },
                save: { .failed },
                download: {},
                onCancel: { cancelled = true },
                commit: { committed = true }
            )
        }

        while guarder.prompt == nil { await Task.yield() }
        guarder.dismissed(promptID: guarder.prompt!.id)

        let result = await task.value
        XCTAssertFalse(result)
        XCTAssertTrue(cancelled)
        XCTAssertFalse(committed)
    }

    func testNewSwitchSupersedesWaitingPromptWithoutRunningOldOnCancelOrCommit() async {
        let guarder = SwitchSaveCoordinator(afterAlertDismiss: {})
        var events: [String] = []

        let first = Task { @MainActor in
            await guarder.guardSwitch(
                notebookName: { "First.ipynb" },
                save: { .failed },
                download: {},
                onCancel: { events.append("first:cancel") },
                commit: { events.append("first:commit") }
            )
        }
        while guarder.prompt == nil { await Task.yield() }

        let secondCommitted = await guarder.guardSwitch(
            notebookName: { "Second.ipynb" },
            save: {
                events.append("second:save")
                return .saved
            },
            download: {},
            commit: { events.append("second:commit") }
        )

        let firstCommitted = await first.value
        XCTAssertFalse(firstCommitted)
        XCTAssertTrue(secondCommitted)
        XCTAssertEqual(events, ["second:save", "second:commit"])
    }

    func testKernelSwitchSavesAllDirtyTargetsBeforeApplyingAndRestarting() async {
        let guarder = SwitchSaveCoordinator(afterAlertDismiss: {})
        var events: [String] = []

        let ok = await guarder.guardSwitch(
            targets: [
                SwitchSaveTarget(
                    name: { "A.ipynb" },
                    save: {
                        events.append("save:A")
                        return .saved
                    },
                    download: { events.append("download:A") }
                ),
                SwitchSaveTarget(
                    name: { "B.ipynb" },
                    save: {
                        events.append("save:B")
                        return .saved
                    },
                    download: { events.append("download:B") }
                ),
            ],
            commit: {
                events.append("useForKernels:remote")
                events.append("start")
            }
        )

        XCTAssertTrue(ok)
        XCTAssertEqual(events, ["save:A", "save:B", "useForKernels:remote", "start"])
    }

    func testKernelSwitchIdentifiesFailingNotebookForDownloadCopyAndBlocksRestart() async {
        let guarder = SwitchSaveCoordinator(afterAlertDismiss: {})
        var events: [String] = []
        var askCount = 0

        let ok = await guarder.guardSwitch(
            targets: [
                SwitchSaveTarget(
                    name: { "CleanSave.ipynb" },
                    save: {
                        events.append("save:CleanSave")
                        return .saved
                    },
                    download: { events.append("download:CleanSave") }
                ),
                SwitchSaveTarget(
                    name: { "Unsaved.ipynb" },
                    save: {
                        events.append("save:Unsaved")
                        return .failed
                    },
                    download: { events.append("download:Unsaved") }
                ),
            ],
            askChoice: { prompt in
                events.append("ask:\(prompt.notebookName)")
                askCount += 1
                return askCount == 1 ? .downloadCopy : .switchWithoutSaving
            },
            commit: {
                events.append("useForKernels")
                events.append("start")
            }
        )

        XCTAssertTrue(ok)
        XCTAssertEqual(events, [
            "save:CleanSave",
            "save:Unsaved",
            "ask:Unsaved.ipynb",
            "download:Unsaved",
            "ask:Unsaved.ipynb",
            "useForKernels",
            "start",
        ])
    }
}
