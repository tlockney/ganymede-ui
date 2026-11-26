import XCTest

/// The status line under a notebook's title (#812), worded as the browser's
/// (`src/lib/header-status.test.ts`).
final class HeaderStatusTests: XCTestCase {
    private func status(
        savedOn: String = "This Mac", runsOn: String? = "This Mac", dirty: Bool = false,
        locked: Bool = false, kernel: String? = "TypeScript", language: String? = nil,
        missing: Bool = false, state: String? = "idle"
    ) -> HeaderStatus {
        HeaderStatus(
            savedOn: savedOn, runsOn: runsOn, dirty: dirty, locked: locked,
            kernel: kernel, language: language, kernelMissing: missing, status: state)
    }

    func testNamesWhereItIsSavedAndRuns() {
        XCTAssertEqual(status().full, "Saved on This Mac · Runs on This Mac · TypeScript")
        XCTAssertEqual(
            status(savedOn: "This iPad", runsOn: "Studio Mac").full,
            "Saved on This iPad · Runs on Studio Mac · TypeScript")
        XCTAssertEqual(
            status(savedOn: "Studio Mac", runsOn: "Studio Mac").full,
            "Saved on Studio Mac · Runs on Studio Mac · TypeScript")
    }

    func testSaysEditedInPlaceOfTheSavePart() {
        XCTAssertEqual(
            status(runsOn: "Studio Mac", dirty: true, kernel: "Python 3", state: "busy").full,
            "Edited · Runs on Studio Mac · Python 3 · Running")
    }

    func testSaysLockedAndEditedToo() {
        XCTAssertEqual(
            status(locked: true).full, "Locked: changed on disk · Runs on This Mac · TypeScript")
        XCTAssertEqual(
            status(dirty: true, locked: true).full,
            "Edited · Locked: changed on disk · Runs on This Mac · TypeScript")
    }

    /// The save part beside the Mac toolbar's chip (#867): only what "Saved
    /// on …" doesn't say, and nothing while the file is saved.
    func testTheChipShowsTheSavePartOnlyWhenThereIsSomethingToSay() {
        XCTAssertNil(status().saveNote)
        XCTAssertEqual(status(dirty: true).saveNote, "Edited")
        XCTAssertEqual(status(locked: true).saveNote, "Locked: changed on disk")
        XCTAssertEqual(
            status(dirty: true, locked: true).saveNote, "Edited · Locked: changed on disk")
        // What the popover and the subtitle say still has it all.
        XCTAssertEqual(status().save, "Saved on This Mac")
        XCTAssertEqual(status(dirty: true).save, "Edited")
    }

    func testTheShortFormKeepsTheSaveStateAndWhereItRuns() {
        XCTAssertEqual(status(runsOn: "Studio Mac", state: "busy").short, "Saved · Runs on Studio Mac")
        XCTAssertEqual(status(dirty: true).short, "Edited · Runs on This Mac")
        XCTAssertEqual(status(locked: true).short, "Locked · Runs on This Mac")
        XCTAssertEqual(status(dirty: true, locked: true).short, "Edited · Locked · Runs on This Mac")
        XCTAssertEqual(status(runsOn: nil).short, "Saved")
    }

    func testAMissingKernelAsksToChooseAndLeavesOutWhereItRuns() {
        let missing = status(kernel: "julia", missing: true)
        XCTAssertEqual(missing.full, "Saved on This Mac · julia (not installed) · Choose kernel")
        XCTAssertEqual(missing.short, "Saved")
        XCTAssertTrue(missing.needsAttention)
        XCTAssertEqual(
            status(kernel: nil, missing: true).kernelText, "Kernel (not installed) · Choose kernel")
        XCTAssertEqual(
            status(kernel: "julia", missing: true, state: "dead").full,
            "Saved on This Mac · julia (not installed) · Choose kernel · Stopped")
    }

    func testNoKernelAndUnknownPlace() {
        XCTAssertEqual(status(runsOn: nil, kernel: nil).full, "Saved on This Mac · No kernel")
        XCTAssertFalse(status().needsAttention)
        XCTAssertTrue(status(locked: true).needsAttention)
    }

    func testTheStateShowsOnlyWhileTheKernelIsDoingSomething() {
        XCTAssertNil(status(state: "idle").stateText)
        XCTAssertNil(status(state: "none").stateText)
        XCTAssertNil(status(state: nil).stateText)
        XCTAssertEqual(status(state: "idle").full, "Saved on This Mac · Runs on This Mac · TypeScript")
        let words = [
            "busy": "Running", "starting": "Starting", "restarting": "Restarting",
            "autorestarting": "Restarting", "connecting": "Connecting", "dead": "Stopped",
            "unknown": "Unknown", "terminating": "Stopping", "odd": "odd",
        ]
        for (state, word) in words {
            XCTAssertEqual(status(state: state).stateText, word, state)
            XCTAssertTrue(status(state: state).full.hasSuffix(" · TypeScript · \(word)"), state)
        }
    }

    /// The chip beside the Mac's title (#867): the kernel, where it runs and
    /// what it is doing, in that order.
    func testTheChipsWords() {
        XCTAssertEqual(status().chipText, "TypeScript · This Mac · Idle")
        XCTAssertEqual(
            status(runsOn: "Studio Mac", state: "busy").chipText, "TypeScript · Studio Mac · Running")
        XCTAssertEqual(status(runsOn: nil).chipText, "TypeScript · Idle")
        XCTAssertEqual(status(state: nil).chipText, "TypeScript · This Mac · Idle")
        XCTAssertEqual(status(state: "none").chipText, "TypeScript · This Mac · Idle")
        XCTAssertEqual(status(kernel: nil).chipText, "No kernel · This Mac · Idle")
        // The missing kernel asks for one instead of saying what it does.
        let missing = status(kernel: "julia", missing: true)
        XCTAssertEqual(missing.chipText, "julia not installed · Choose Kernel")
        XCTAssertEqual(missing.chipState, nil)
        XCTAssertEqual(status(kernel: nil, missing: true).chipText, "Kernel not installed · Choose Kernel")
    }

    /// The chip calls the notebook by its language, not the kernel's
    /// display name (#867): "Python" for the "Python 3" kernel, and a
    /// language the app doesn't know with its first letter capitalized.
    func testTheChipNamesTheNotebooksLanguage() {
        XCTAssertEqual(
            status(kernel: "Python 3", language: "python").chipText, "Python · This Mac · Idle")
        XCTAssertEqual(
            status(kernel: "TypeScript (in app)", language: "typescript").chipText,
            "TypeScript · This Mac · Idle")
        XCTAssertEqual(status(kernel: "Python 3", language: "julia").chipText, "Julia · This Mac · Idle")
        XCTAssertEqual(
            status(kernel: "Python 3", language: "wolfram").chipText, "Wolfram · This Mac · Idle")
        XCTAssertEqual(status(kernel: nil, language: "r").chipText, "R · This Mac · Idle")
        // No language: the kernel's display name, as before.
        XCTAssertEqual(status(kernel: "Python 3").chipText, "Python 3 · This Mac · Idle")
        XCTAssertEqual(status(kernel: "Python 3", language: " ").chipText, "Python 3 · This Mac · Idle")
        // The known names, as each language writes itself.
        let known = [
            "typescript": "TypeScript", "javascript": "JavaScript", "python": "Python",
            "sql": "SQL", "r": "R", "julia": "Julia", "rust": "Rust", "go": "Go", "bash": "Bash",
        ]
        for (language, name) in known {
            XCTAssertEqual(HeaderStatus.languageName(language), name, language)
        }
        XCTAssertNil(HeaderStatus.languageName(nil))
        XCTAssertNil(HeaderStatus.languageName(""))
        // A missing kernel asks for one whatever language the file names.
        XCTAssertEqual(
            status(kernel: "julia", language: "julia", missing: true).chipText,
            "julia not installed · Choose Kernel")
    }

    /// The chip's mark: a dot while the kernel waits, a spinner while it
    /// works, a grey dot when it has stopped, a triangle when it is missing.
    func testTheChipsMark() {
        XCTAssertEqual(status().chipKind, .idle)
        XCTAssertEqual(status().dotLabel, "Kernel idle")
        XCTAssertEqual(status(state: nil).chipKind, .idle)
        XCTAssertEqual(status(state: "none").dotLabel, "Kernel idle")
        for state in ["busy", "restarting", "autorestarting", "connecting", "terminating"] {
            XCTAssertEqual(status(state: state).chipKind, .working, state)
            XCTAssertEqual(status(state: state).dotLabel, "Kernel busy", state)
        }
        XCTAssertEqual(status(state: "starting").chipKind, .working)
        XCTAssertEqual(status(state: "starting").dotLabel, "Kernel starting")
        for state in ["dead", "unknown", "odd"] {
            XCTAssertEqual(status(state: state).chipKind, .stopped, state)
            XCTAssertEqual(status(state: state).dotLabel, "Kernel stopped", state)
        }
        XCTAssertEqual(status(kernel: "julia", missing: true).chipKind, .missing)
        XCTAssertEqual(status(kernel: "julia", missing: true).dotLabel, "Kernel not installed")
    }

    func testPlacesForThisDeviceAndAMachine() {
        let device = HeaderStatus.places(
            machineName: nil, isMachine: false, deviceName: "This iPad", kernelLocation: nil)
        XCTAssertEqual(device.savedOn, "This iPad")
        XCTAssertEqual(device.runsOn, "This iPad")
        let remote = HeaderStatus.places(
            machineName: nil, isMachine: false, deviceName: "This Mac", kernelLocation: "Studio Mac")
        XCTAssertEqual(remote.savedOn, "This Mac")
        XCTAssertEqual(remote.runsOn, "Studio Mac")
        // A machine's window ignores this device's kernel location.
        let machine = HeaderStatus.places(
            machineName: "mini", isMachine: true, deviceName: "This Mac", kernelLocation: "Studio Mac")
        XCTAssertEqual(machine.savedOn, "mini")
        XCTAssertEqual(machine.runsOn, "mini")
        let unnamed = HeaderStatus.places(
            machineName: nil, isMachine: true, deviceName: "This Mac", kernelLocation: nil)
        XCTAssertEqual(unnamed.savedOn, "Machine")
        XCTAssertEqual(
            HeaderStatus.places(machineName: "", isMachine: true, deviceName: "x", kernelLocation: nil).runsOn,
            "Machine")
    }

    func testMakeReadsThePageState() {
        var state = PageState()
        XCTAssertNil(HeaderStatus.make(state: state, savedOn: "This Mac", runsOn: "This Mac"))
        state.path = "Io.ipynb"
        state.dirty = true
        state.status = "busy"
        state.kernelDisplayName = "TypeScript"
        state.kernelLanguage = "typescript"
        let header = HeaderStatus.make(state: state, savedOn: "This Mac", runsOn: "Studio Mac")
        XCTAssertEqual(header?.full, "Edited · Runs on Studio Mac · TypeScript · Running")
        XCTAssertEqual(header?.chipLead, "TypeScript · Studio Mac")
        XCTAssertEqual(header?.language, "typescript")
        // A page older than #867 sends no language: the chip says the
        // kernel's display name.
        state.kernelLanguage = nil
        XCTAssertEqual(
            HeaderStatus.make(state: state, savedOn: "This Mac", runsOn: nil)?.chipLead,
            "TypeScript")
        // A page older than #812 sends no `locked`.
        XCTAssertEqual(header?.locked, false)
        state.locked = true
        XCTAssertEqual(
            HeaderStatus.make(state: state, savedOn: "This Mac", runsOn: nil)?.full,
            "Edited · Locked: changed on disk · TypeScript · Running")
        state.kernelMissing = true
        state.kernelDisplayName = "Python 3"
        XCTAssertEqual(
            HeaderStatus.make(state: state, savedOn: "This Mac", runsOn: "This Mac")?.kernelText,
            "Python 3 (not installed) · Choose kernel")
    }

    func testADataFileHasNoStatusLine() {
        var state = PageState()
        for path in ["moons/Io.csv", "a.TSV", "a.json", "dir/a.parquet"] {
            state.path = path
            XCTAssertNil(HeaderStatus.make(state: state, savedOn: "This Mac", runsOn: "This Mac"), path)
        }
    }

    /// The kernel location counts for this device's windows, except for the
    /// in-app kernel, which runs in the app whatever the setting; a
    /// machine's window saves and runs on the machine (#812).
    func testWindowPlacesFollowTheKernelLocation() {
        let studio = Remote(name: "Studio Mac", serverURL: "http://studio:8888")
        let remote = KernelLocations(remotes: [studio], selected: studio.id)
        let here = KernelLocations(remotes: [studio], selected: nil)
        func places(_ place: Place, _ locations: KernelLocations, _ kernel: String?) -> String {
            let names = HeaderStatus.places(
                place: place, machineName: "mini", deviceName: "This iPad",
                locations: locations, kernel: kernel)
            return "\(names.savedOn) / \(names.runsOn)"
        }
        XCTAssertEqual(places(.thisDevice, here, "python3"), "This iPad / This iPad")
        XCTAssertEqual(places(.thisDevice, remote, "python3"), "This iPad / Studio Mac")
        XCTAssertEqual(places(.thisDevice, remote, nil), "This iPad / Studio Mac")
        XCTAssertEqual(places(.thisDevice, remote, AppKernels.inAppKernelName), "This iPad / This iPad")
        XCTAssertEqual(places(.machine("m1"), remote, "python3"), "mini / mini")
        XCTAssertEqual(AppKernels.inAppKernelName, "cdp-browser")
    }
}
