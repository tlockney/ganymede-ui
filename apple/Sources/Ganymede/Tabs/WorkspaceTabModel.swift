import Foundation

/// What kind of item a workspace tab represents (#844 Step 6, #903):
/// notebooks and files, connected machines, standalone terminals, or text
/// files. Each keeps its own unselected silhouette and top-edge signal when
/// selected.
enum WorkspaceTabKind: String, Equatable, Hashable {
    case notebook
    case machine
    case terminal
    case editor
}

/// Which side of the strip's separator a tab belongs to (#903): document
/// tabs sit on the left, machine and terminal tabs sit on the right.
enum WorkspaceTabGroup: Equatable, Hashable {
    case document
    case environment
}

/// The 1.5pt top-edge color signal on a selected tab (#844 Step 6, #903):
/// orange for notebooks and files, blue for connected machines, neutral for
/// terminals.
enum WorkspaceTabTone: Equatable, Hashable {
    case orange
    case blue
    case neutral
}

/// The short language chip shown on notebook and editor tabs (#903),
/// matching `E-Tabs.png` (`TS`, `PY`, `SQL`, etc.).
struct TabLanguageBadge: Equatable, Hashable {
    enum Palette: Equatable, Hashable {
        case typescript
        case python
        case javascript
        case sql
        case neutral
    }

    let code: String
    let palette: Palette

    /// Resolves a two- or three-letter badge from `PageState.kernelLanguage`,
    /// falling back to console or file-extension hints when no language is
    /// reported yet.
    static func resolve(
        language: String?,
        isConsole: Bool = false,
        pathExtension: String? = nil
    ) -> TabLanguageBadge {
        if let raw = language?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            switch raw.lowercased() {
            case "typescript", "ts":
                return TabLanguageBadge(code: "TS", palette: .typescript)
            case "python", "python3", "py":
                return TabLanguageBadge(code: "PY", palette: .python)
            case "javascript", "js":
                return TabLanguageBadge(code: "JS", palette: .javascript)
            case "sql", "duckdb":
                return TabLanguageBadge(code: "SQL", palette: .sql)
            case "julia":
                return TabLanguageBadge(code: "JL", palette: .neutral)
            case "r":
                return TabLanguageBadge(code: "R", palette: .neutral)
            case "rust":
                return TabLanguageBadge(code: "RS", palette: .neutral)
            case "go":
                return TabLanguageBadge(code: "GO", palette: .neutral)
            case "bash", "sh", "zsh", "shell":
                return TabLanguageBadge(code: "SH", palette: .neutral)
            case "markdown", "md":
                return TabLanguageBadge(code: "MD", palette: .neutral)
            default:
                let letters = String(raw.prefix(2)).uppercased()
                return TabLanguageBadge(code: letters, palette: .neutral)
            }
        }
        if isConsole {
            return TabLanguageBadge(code: "SQL", palette: .sql)
        }
        if let ext = pathExtension?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
           !ext.isEmpty {
            switch ext {
            case "ipynb":
                return TabLanguageBadge(code: "NB", palette: .neutral)
            case "ts", "tsx":
                return TabLanguageBadge(code: "TS", palette: .typescript)
            case "py":
                return TabLanguageBadge(code: "PY", palette: .python)
            case "js", "jsx":
                return TabLanguageBadge(code: "JS", palette: .javascript)
            case "sql":
                return TabLanguageBadge(code: "SQL", palette: .sql)
            case "md", "markdown":
                return TabLanguageBadge(code: "MD", palette: .neutral)
            case "csv", "tsv", "json", "parquet":
                return TabLanguageBadge(code: String(ext.prefix(3)).uppercased(), palette: .neutral)
            default:
                return TabLanguageBadge(code: String(ext.prefix(2)).uppercased(), palette: .neutral)
            }
        }
        return TabLanguageBadge(code: "NB", palette: .neutral)
    }
}

/// View-independent description of one tab in the custom tab strip (#903).
struct WorkspaceTabDescriptor: Identifiable, Equatable {
    let id: UUID
    var kind: WorkspaceTabKind
    /// Short display title (per #867 / #892: `metadata.title`, first `#`
    /// heading, or filename without `YYYY-MM-DD-`).
    var title: String
    /// Full filename or location shown on hover.
    var toolTip: String
    var badge: TabLanguageBadge?
    var kernelKind: HeaderStatus.ChipKind?
    /// Accessible description for the kernel mark (`"Kernel idle"`,
    /// `"Kernel busy"`, etc., matching `HeaderStatus.dotLabel`).
    var kernelLabel: String?
    /// SF Symbol name when `kind == .machine`.
    var machineSymbol: String = "desktopcomputer"
    var isPrimary: Bool = false
    var isSample: Bool = false
    var isCloseable: Bool = true

    var group: WorkspaceTabGroup {
        switch kind {
        case .notebook, .editor: .document
        case .machine, .terminal: .environment
        }
    }

    var topEdgeTone: WorkspaceTabTone {
        switch kind {
        case .notebook, .editor: .orange
        case .machine: .blue
        case .terminal: .neutral
        }
    }

    var accessibilityLabel: String {
        switch kind {
        case .notebook: title
        case .machine: "Machine \(title)"
        case .terminal: "Terminal \(title)"
        case .editor: "File \(title)"
        }
    }

    var accessibilityValue: String {
        kernelLabel ?? ""
    }

    /// Builds a descriptor from a live `WindowTarget` and its `PageState`.
    static func fromTarget(
        id: UUID,
        target: WindowTarget,
        state: PageState,
        place: Place,
        machineName: String?,
        metadataTitle: String?,
        isPrimary: Bool = true,
        isCloseable: Bool = true
    ) -> WorkspaceTabDescriptor {
        let title = target.tabTitle(
            consoleName: state.console?.name,
            machineName: machineName,
            metadataTitle: metadataTitle
        )
        let isConsole: Bool = {
            if case .console = target { return true }
            return state.console != nil
        }()
        let isMachineView: Bool = {
            guard place.isMachine else { return false }
            if case .machineFolder = target { return !state.hasNotebook }
            return false
        }()
        let kind: WorkspaceTabKind = isMachineView ? .machine : .notebook
        let toolTip = Self.toolTip(for: target, state: state, machineName: machineName)

        let showsDocumentBadge: Bool = {
            guard kind == .notebook else { return false }
            if state.hasNotebook || state.showsData || isConsole { return true }
            switch target {
            case .file, .machineFile, .console: return true
            case .folder, .machineFolder: return false
            }
        }()

        let badge: TabLanguageBadge? = showsDocumentBadge
            ? TabLanguageBadge.resolve(
                language: state.kernelLanguage,
                isConsole: isConsole,
                pathExtension: Self.pathExtension(target: target, statePath: state.path)
            )
            : nil

        let (kernelKind, kernelLabel): (HeaderStatus.ChipKind?, String?) = {
            guard kind == .notebook, state.hasNotebook || isConsole else { return (nil, nil) }
            if state.hasNotebook,
               let header = HeaderStatus.make(state: state, savedOn: "", runsOn: nil) {
                let markKind: HeaderStatus.ChipKind = state.kernelMissing ? .missing : header.chipKind
                return (markKind, header.dotLabel)
            }
            if isConsole, let status = state.status {
                let header = HeaderStatus(
                    savedOn: "",
                    runsOn: nil,
                    dirty: false,
                    locked: false,
                    kernel: state.kernelDisplayName,
                    language: state.kernelLanguage,
                    kernelMissing: state.kernelMissing,
                    status: status
                )
                return (header.chipKind, header.dotLabel)
            }
            return (nil, nil)
        }()

        return WorkspaceTabDescriptor(
            id: id,
            kind: kind,
            title: title,
            toolTip: toolTip,
            badge: badge,
            kernelKind: kernelKind,
            kernelLabel: kernelLabel,
            machineSymbol: Self.machineSymbol(for: machineName ?? title),
            isPrimary: isPrimary,
            isSample: false,
            isCloseable: isCloseable
        )
    }

    /// Builds a descriptor for a standalone terminal tab.
    static func terminal(
        id: UUID,
        title: String,
        toolTip: String? = nil,
        isSample: Bool = false,
        isCloseable: Bool = true
    ) -> WorkspaceTabDescriptor {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let shown = trimmed.isEmpty ? "zsh" : trimmed
        return WorkspaceTabDescriptor(
            id: id,
            kind: .terminal,
            title: shown,
            toolTip: toolTip ?? "Terminal: \(shown)",
            badge: nil,
            kernelKind: nil,
            kernelLabel: nil,
            isPrimary: false,
            isSample: isSample,
            isCloseable: isCloseable
        )
    }

    /// Builds a descriptor for a connected machine tab.
    static func machine(
        id: UUID,
        name: String,
        toolTip: String? = nil,
        isPrimary: Bool = false,
        isSample: Bool = false,
        isCloseable: Bool = true
    ) -> WorkspaceTabDescriptor {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let shown = trimmed.isEmpty ? "Machine" : trimmed
        return WorkspaceTabDescriptor(
            id: id,
            kind: .machine,
            title: shown,
            toolTip: toolTip ?? "Machine \(shown)",
            badge: nil,
            kernelKind: nil,
            kernelLabel: nil,
            machineSymbol: machineSymbol(for: shown),
            isPrimary: isPrimary,
            isSample: isSample,
            isCloseable: isCloseable
        )
    }

    /// Builds a descriptor for a text file editor tab.
    static func editor(
        id: UUID,
        path: String,
        machineName: String? = nil,
        isCloseable: Bool = true
    ) -> WorkspaceTabDescriptor {
        let url = URL(fileURLWithPath: path)
        let name = url.lastPathComponent
        let title = machineName.map { "\(name) · \($0)" } ?? name
        let ext = url.pathExtension
        return WorkspaceTabDescriptor(
            id: id,
            kind: .editor,
            title: title,
            toolTip: path,
            badge: TabLanguageBadge.resolve(language: nil, isConsole: false, pathExtension: ext),
            kernelKind: nil,
            kernelLabel: nil,
            isPrimary: false,
            isSample: false,
            isCloseable: isCloseable
        )
    }

    /// Chooses an appropriate hardware SF Symbol for a machine's name.
    static func machineSymbol(for name: String) -> String {
        let lower = name.lowercased()
        if lower.contains("mbp") || lower.contains("book") || lower.contains("air") || lower.contains("laptop") {
            return "laptopcomputer"
        }
        return "desktopcomputer"
    }

    /// Sample tabs matching `docs/design/mac-visual-redesign/boards/E-Tabs.png`
    /// and `E-Mac.png` for inspecting all silhouettes when Developer Settings'
    /// sample toggle is enabled.
    static func sampleAddons(for existing: [WorkspaceTabDescriptor]) -> [WorkspaceTabDescriptor] {
        var addons: [WorkspaceTabDescriptor] = []
        if !existing.contains(where: { $0.title == "DuckDB console" }) {
            addons.append(
                WorkspaceTabDescriptor(
                    id: UUID(uuidString: "00000000-0000-0000-0000-000000000101")!,
                    kind: .notebook,
                    title: "DuckDB console",
                    toolTip: "duckdb-console.ipynb",
                    badge: TabLanguageBadge(code: "SQL", palette: .sql),
                    kernelKind: .working,
                    kernelLabel: "Kernel busy",
                    isSample: true
                )
            )
        }
        if !existing.contains(where: { $0.kind == .machine && $0.title == "m4mini" }) {
            addons.append(
                machine(
                    id: UUID(uuidString: "00000000-0000-0000-0000-000000000102")!,
                    name: "m4mini",
                    toolTip: "Machine m4mini (sample)",
                    isSample: true
                )
            )
        }
        if !existing.contains(where: { $0.kind == .machine && $0.title == "workmbp" }) {
            addons.append(
                machine(
                    id: UUID(uuidString: "00000000-0000-0000-0000-000000000103")!,
                    name: "workmbp",
                    toolTip: "Machine workmbp (sample)",
                    isSample: true
                )
            )
        }
        if !existing.contains(where: { $0.kind == .terminal }) {
            addons.append(
                terminal(
                    id: UUID(uuidString: "00000000-0000-0000-0000-000000000104")!,
                    title: "zsh",
                    toolTip: "Terminal: zsh (sample)",
                    isSample: true
                )
            )
        }
        return addons
    }

    private static func pathExtension(target: WindowTarget, statePath: String?) -> String? {
        if let statePath, !statePath.isEmpty {
            let ext = (statePath as NSString).pathExtension
            if !ext.isEmpty { return ext }
        }
        let ext = target.url.pathExtension
        return ext.isEmpty ? nil : ext
    }

    private static func toolTip(
        for target: WindowTarget,
        state: PageState,
        machineName: String?
    ) -> String {
        switch target {
        case .file(let url):
            return url.lastPathComponent
        case .folder(let url):
            if let path = state.path, !path.isEmpty {
                return (path as NSString).lastPathComponent
            }
            return url.path
        case .console(let url, _):
            let folder = url.lastPathComponent.isEmpty ? url.path : url.lastPathComponent
            return "DuckDB console · \(folder)"
        case .machineFile(_, let path):
            let file = (path as NSString).lastPathComponent
            return machineName.map { "\(file) · \($0)" } ?? file
        case .machineFolder(_, let path):
            if let pathName = state.path, !pathName.isEmpty {
                let file = (pathName as NSString).lastPathComponent
                return machineName.map { "\(file) · \($0)" } ?? file
            }
            return machineName.map { "\($0) · \(path)" } ?? path
        }
    }
}
