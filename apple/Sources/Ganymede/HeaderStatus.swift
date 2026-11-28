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
    /// Another Ganymede server on this machine owns the notebook (#839).
    var readOnly: Bool = false
    /// The kernel's display name; nil with none.
    var kernel: String?
    /// The notebook's language (#867), as its kernel's kernelspec or the
    /// file's metadata names it ("python", "typescript"); nil when neither
    /// does, and the chip says the kernel's display name instead.
    var language: String?
    var kernelMissing: Bool
    /// The kernel's state (`idle`, `busy`, `none`, …).
    var status: String?
    /// Room save failed or a server recovery copy needs review (#831).
    var saveAttention: Bool = false

    /// The save part: Saved on <place>, Edited, Locked, or Save needs attention.
    var save: String { saveNote ?? "Saved on \(savedOn)" }

    /// The save part beside the Mac toolbar's chip (#867): only what
    /// "Saved on …" doesn't say, as "Edited", "Locked: changed on disk",
    /// or "Save needs attention", and nothing while the file is saved.
    var saveNote: String? {
        if locked { return dirty ? "Edited · Locked: changed on disk" : "Locked: changed on disk" }
        if saveAttention { return dirty ? "Edited · Save needs attention" : "Save needs attention" }
        if readOnly { return "Read-only" }
        return dirty ? "Edited" : nil
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

    /// The Mac toolbar chip's first words (#867): the notebook's language
    /// and where it runs — "TypeScript · This Mac" — or, for a kernel that
    /// isn't installed, "julia not installed · Choose Kernel". The language
    /// gives way to the kernel's display name when the page names no
    /// language. The state is a part of its own (`chipState`), so the view
    /// can hold its width.
    var chipLead: String {
        if kernelMissing { return "\(kernel ?? "Kernel") not installed · Choose Kernel" }
        return [HeaderStatus.languageName(language) ?? kernel ?? "No kernel", runsOn]
            .compactMap { $0 }.joined(separator: " · ")
    }

    /// Languages the chip writes as they are written (#867): "typescript"
    /// reads "TypeScript" where capitalizing its first letter would not.
    private static let languageNames = [
        "typescript": "TypeScript", "javascript": "JavaScript", "python": "Python",
        "sql": "SQL", "r": "R", "julia": "Julia", "rust": "Rust", "go": "Go", "bash": "Bash",
    ]

    /// The chip's name for a notebook's language (#867): a known language's
    /// spelling, else the language with its first letter capitalized. Nil
    /// for no language, so the chip falls back to the kernel's name.
    static func languageName(_ language: String?) -> String? {
        guard let language = language?.trimmingCharacters(in: .whitespacesAndNewlines),
              !language.isEmpty else { return nil }
        if let known = languageNames[language.lowercased()] { return known }
        return language.prefix(1).uppercased() + language.dropFirst()
    }

    /// The chip's state: "Idle" while the kernel waits or there is none;
    /// nil when it is missing, where the chip asks for one instead.
    var chipState: String? {
        if kernelMissing { return nil }
        return stateText ?? "Idle"
    }

    /// The whole chip: `<kernel> · <runs on> · <state>`, as
    /// "TypeScript · This Mac · Idle", or the missing kernel's words.
    var chipText: String {
        [chipLead, chipState].compactMap { $0 }.joined(separator: " · ")
    }

    /// How the chip's mark is drawn (#867): a solid dot while the kernel
    /// waits, a spinner while it works, a grey dot once it has stopped, and
    /// the warning triangle while the kernel isn't installed. The shape
    /// says which, so nothing moves and nothing needs a colour of its own.
    enum ChipKind: Equatable {
        case idle, working, stopped, missing
    }

    var chipKind: ChipKind {
        if kernelMissing { return .missing }
        switch status {
        case "busy"?, "starting"?, "restarting"?, "autorestarting"?, "connecting"?,
             "terminating"?: return .working
        case nil, "idle"?, "none"?: return .idle
        default: return .stopped
        }
    }

    /// What VoiceOver says of the chip's dot.
    var dotLabel: String {
        if kernelMissing { return "Kernel not installed" }
        switch status {
        case "starting"?: return "Kernel starting"
        case "busy"?, "restarting"?, "autorestarting"?, "connecting"?:
            return "Kernel busy"
        case "terminating"?: return "Kernel stopping"
        case nil, "idle"?, "none"?: return "Kernel idle"
        default: return "Kernel stopped"
        }
    }

    /// The iPhone's form: the save state as one word, then where it runs,
    /// with no kernel, so a long name doesn't push the runs part out.
    var short: String {
        let word: String
        if locked {
            word = dirty ? "Edited · Locked" : "Locked"
        } else if saveAttention {
            word = dirty ? "Edited · Attention" : "Needs attention"
        } else if readOnly {
            word = "Read-only"
        } else {
            word = dirty ? "Edited" : "Saved"
        }
        let parts: [String?] = [word, runs]
        return parts.compactMap { $0 }.joined(separator: " · ")
    }

    /// Whether the line is drawn as a warning: a missing kernel, a file
    /// that changed on disk, or a save needing attention.
    var needsAttention: Bool { kernelMissing || locked || saveAttention }

    /// The line for the page's state and the window's place; nil when no
    /// notebook is open (a data file or a console has no kernel or save state).
    static func make(state: PageState, savedOn: String, runsOn: String?) -> HeaderStatus? {
        guard state.hasNotebook else { return nil }
        return HeaderStatus(
            savedOn: savedOn,
            runsOn: runsOn,
            dirty: state.dirty,
            locked: state.locked ?? false,
            readOnly: state.readOnly ?? false,
            kernel: state.kernelDisplayName,
            language: state.kernelLanguage,
            kernelMissing: state.kernelMissing,
            status: state.status,
            saveAttention: state.saveAttention ?? false
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
