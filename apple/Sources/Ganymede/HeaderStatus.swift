import Foundation

/// The status line under a notebook's title (#812), as the browser's
/// `src/lib/header-status.ts` words it (#801): where the file is saved,
/// where it runs, the kernel and what it is doing. The place words come
/// from the app (`places(...)`), not from the page, whose own config in the
/// app is "local server".
struct HeaderStatus: Equatable {
    /// Where the file is: "This Mac", "This iPad", or a machine's name.
    var savedOn: String
    /// Where its kernel runs: "This Mac", a remote's or machine's name; nil when unknown.
    var runsOn: String?
    var dirty: Bool
    var locked: Bool
    /// The kernel's display name; nil with none.
    var kernel: String?
    var kernelMissing: Bool
    /// The kernel's state (`idle`, `busy`, `none`, …).
    var status: String?

    /// The save part: Saved on <place>, Edited, or Locked.
    var save: String {
        if locked { return dirty ? "Edited · Locked: changed on disk" : "Locked: changed on disk" }
        return dirty ? "Edited" : "Saved on \(savedOn)"
    }

    /// The runs part; nil when the kernel is missing or the place unknown.
    var runs: String? {
        if kernelMissing { return nil }
        return runsOn.map { "Runs on \($0)" }
    }

    /// The kernel part: its name, or "<name> (not installed) · Choose kernel".
    var kernelText: String {
        if kernelMissing { return "\(kernel ?? "Kernel") (not installed) · Choose kernel" }
        return kernel ?? "No kernel"
    }

    /// The state part, only while the kernel is doing something other than
    /// waiting. The same words as the browser's `STATUS_LABEL`.
    var stateText: String? {
        switch status {
        case nil, "idle"?, "none"?: nil
        case "busy"?: "Running"
        case "starting"?: "Starting"
        case "restarting"?, "autorestarting"?: "Restarting"
        case "connecting"?: "Connecting"
        case "dead"?: "Stopped"
        case "unknown"?: "Unknown"
        case "terminating"?: "Stopping"
        case let other?: other
        }
    }

    /// `<save> · <runs> · <kernel>[ · <state>]`, for example
    /// "Saved on This Mac · Runs on This Mac · TypeScript".
    var full: String {
        let parts: [String?] = [save, runs, kernelText, stateText]
        return parts.compactMap { $0 }.joined(separator: " · ")
    }

    /// The iPhone's form: the save state as one word, then where it runs,
    /// with no kernel, so a long name doesn't push the runs part out.
    var short: String {
        let word: String
        if locked {
            word = dirty ? "Edited · Locked" : "Locked"
        } else {
            word = dirty ? "Edited" : "Saved"
        }
        let parts: [String?] = [word, runs]
        return parts.compactMap { $0 }.joined(separator: " · ")
    }

    /// Whether the line is drawn as a warning: a missing kernel, or a file
    /// that changed on disk.
    var needsAttention: Bool { kernelMissing || locked }

    /// The line for the page's state and the window's place; nil when no
    /// notebook is open (a data file or a console has no kernel or save state).
    static func make(state: PageState, savedOn: String, runsOn: String?) -> HeaderStatus? {
        guard state.hasNotebook else { return nil }
        return HeaderStatus(
            savedOn: savedOn,
            runsOn: runsOn,
            dirty: state.dirty,
            locked: state.locked ?? false,
            kernel: state.kernelDisplayName,
            kernelMissing: state.kernelMissing,
            status: state.status
        )
    }

    /// The place words. A machine's window saves and runs on the machine.
    /// This device saves on `deviceName` and runs on the chosen remote
    /// (`kernelLocation`, its title), else on the device.
    static func places(
        machineName: String?, isMachine: Bool, deviceName: String, kernelLocation: String?
    ) -> (savedOn: String, runsOn: String) {
        if isMachine {
            let name = machineName.flatMap { $0.isEmpty ? nil : $0 } ?? "Machine"
            return (name, name)
        }
        return (deviceName, kernelLocation ?? deviceName)
    }

    /// The place words for a window: `place` and its machine's name, the
    /// app's kernel location setting, and the notebook's kernel by name.
    /// The location counts only where this device chooses it (not a
    /// machine's window), and never for the in-app kernel, which runs in
    /// this app whatever the setting (#812).
    static func places(
        place: Place, machineName: String?, deviceName: String,
        locations: KernelLocations, kernel: String?
    ) -> (savedOn: String, runsOn: String) {
        let remote = place.allows(.kernelLocation) && locations.selected != nil
            && kernel != AppKernels.inAppKernelName
        return places(
            machineName: machineName, isMachine: place.isMachine,
            deviceName: deviceName, kernelLocation: remote ? locations.title : nil)
    }
}
