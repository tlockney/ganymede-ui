#if os(macOS)
import AppIntents
import AppKit
import UniformTypeIdentifiers

// Shortcuts and Siri actions for notebooks (#302), on `NotebookActions`
// against the app's in-process server. Mac only for now: on iOS the
// kernel dies about 30 seconds after the app is suspended, so run actions
// there need their own design (#301).

// MARK: Entities

/// A notebook file, by its path.
struct NotebookEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Notebook"
    static let defaultQuery = NotebookQuery()

    /// The file's path.
    let id: String

    init(url: URL) {
        id = url.standardizedFileURL.path
    }

    init(id: String) {
        self.id = id
    }

    var url: URL { URL(fileURLWithPath: id) }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(url.lastPathComponent)",
            subtitle: "\((url.deletingLastPathComponent().path as NSString).abbreviatingWithTildeInPath)"
        )
    }
}

/// Recent notebooks, and those in the notebook folder (the last folder
/// opened) and its subfolders.
struct NotebookQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [NotebookEntity] {
        identifiers.filter { FileManager.default.fileExists(atPath: $0) }.map(NotebookEntity.init(id:))
    }

    func suggestedEntities() async throws -> [NotebookEntity] {
        await NotebookFinder.all()
    }

    func entities(matching string: String) async throws -> [NotebookEntity] {
        await NotebookFinder.all().filter { $0.url.lastPathComponent.localizedStandardContains(string) }
    }
}

enum NotebookFinder {
    /// How many folder entries to look at under the notebook folder.
    static let limit = 5000

    /// The last walk, reused for a few seconds: Shortcuts asks again on
    /// every keystroke of a search.
    @MainActor private static var cached: (at: ContinuousClock.Instant, root: URL, found: [URL])?

    @MainActor
    static func all() async -> [NotebookEntity] {
        let recents = Recents.shared.urls.filter { $0.pathExtension == "ipynb" }
        let root = AppModel.shared.root
        let found: [URL]
        if let cached, cached.root == root, ContinuousClock.now - cached.at < .seconds(10) {
            found = cached.found
        } else {
            found = await Task.detached(priority: .userInitiated) { notebooks(under: root) }.value
            cached = (ContinuousClock.now, root, found)
        }
        var seen = Set<String>()
        return (recents + found).map(NotebookEntity.init(url:)).filter { seen.insert($0.id).inserted }
    }

    /// Notebooks under `folder`, skipping hidden files and packages.
    static func notebooks(under folder: URL) -> [URL] {
        guard let walk = FileManager.default.enumerator(
            at: folder, includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else { return [] }
        var found: [URL] = []
        var looked = 0
        while let url = walk.nextObject() as? URL, looked < limit {
            looked += 1
            if url.pathExtension == "ipynb" { found.append(url) }
        }
        return found.sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
    }
}

/// One output of a cell, for the next action: text, an image or JSON.
struct CellOutputEntity: TransientAppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Cell Output"

    @Property(title: "Cell")
    var cell: String
    @Property(title: "Kind")
    var kind: String
    @Property(title: "Text")
    var text: String?
    @Property(title: "JSON")
    var json: String?
    @Property(title: "Image")
    var image: IntentFile?

    init() {}

    /// `index` is the output's place in its cell, which names its image.
    init(_ output: CellOutput, cell: String, index: Int = 0) {
        self.init()
        self.cell = cell
        kind = output.kind.rawValue
        text = output.text
        json = output.json
        if let picture = output.image {
            let type = UTType(mimeType: picture.type)
            let name = "\(cell)-\(index + 1).\(type?.preferredFilenameExtension ?? "png")"
            image = IntentFile(data: picture.data, filename: name, type: type)
        }
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(text ?? json ?? kind)")
    }

    /// Every output of `cells`, in order.
    static func of(_ cells: [NotebookCell]) -> [CellOutputEntity] {
        cells.flatMap { cell in
            cell.outputs.enumerated().map { CellOutputEntity($1, cell: cell.id, index: $0) }
        }
    }
}

extension NotebookActions.KernelAction: AppEnum {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Kernel Action"
    static let caseDisplayRepresentations: [NotebookActions.KernelAction: DisplayRepresentation] = [
        .start: "Start",
        .interrupt: "Interrupt",
        .restart: "Restart",
        .shutdown: "Shut Down",
    ]
}

extension NotebookActionError: CustomLocalizedStringResourceConvertible {
    var localizedStringResource: LocalizedStringResource {
        "\(errorDescription ?? "The notebook action failed.")"
    }
}

/// The app's server, ready, and API paths on it.
@MainActor
enum IntentServer {
    static func actions() async throws -> NotebookActions {
        NotebookActions(server: try await AppModel.shared.readyServer())
    }

    static func path(_ url: URL) throws -> String {
        guard let path = NotebookActions.apiPath(for: url, root: AppModel.shared.serverRootFolder) else {
            throw NotebookActionError.outsideServer(url.path)
        }
        return path
    }

    static func url(_ path: String) -> URL {
        AppModel.shared.serverRootFolder.appendingPathComponent(path)
    }

    /// The folder a Shortcuts folder parameter names.
    static func folder(_ file: IntentFile) throws -> URL {
        guard let url = file.fileURL else { throw NotebookActionError.notAFolder(file.filename) }
        return url
    }

    /// Opens `url` in a window and brings the app forward.
    static func open(_ url: URL) {
        NSApp.activate()
        AppModel.shared.openRequests.add([url])
    }
}

// MARK: Intents

struct OpenNotebookIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Notebook"
    static let description = IntentDescription("Opens a notebook in a Ganymede window.")
    static let openAppWhenRun = true

    @Parameter(title: "Notebook")
    var notebook: NotebookEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Open \(\.$notebook)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard FileManager.default.fileExists(atPath: notebook.id) else {
            throw NotebookActionError.notFound(notebook.id)
        }
        IntentServer.open(notebook.url)
        return .result()
    }
}

struct NewNotebookIntent: AppIntent {
    static let title: LocalizedStringResource = "New Notebook"
    static let description = IntentDescription(
        "Creates a notebook in a folder, empty or as a copy of a template notebook, and returns it."
    )

    @Parameter(title: "Folder", supportedContentTypes: [.folder])
    var folder: IntentFile
    @Parameter(title: "Name", description: "The file name; Ganymede names it Untitled when empty.")
    var name: String?
    @Parameter(title: "Template", description: "A notebook to copy.")
    var template: NotebookEntity?
    @Parameter(title: "Open", default: true)
    var open: Bool

    static var parameterSummary: some ParameterSummary {
        Summary("New notebook in \(\.$folder)") {
            \.$name
            \.$template
            \.$open
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<NotebookEntity> {
        let actions = try await IntentServer.actions()
        let dir = try IntentServer.path(IntentServer.folder(folder))
        let templatePath = try template.map { try IntentServer.path($0.url) }
        let path = try await actions.notebookNew(dir: dir, name: name, template: templatePath)
        let url = IntentServer.url(path)
        if open { IntentServer.open(url) }
        return .result(value: NotebookEntity(url: url))
    }
}

struct RunNotebookIntent: AppIntent {
    static let title: LocalizedStringResource = "Run Notebook"
    static let description = IntentDescription(
        "Runs every code cell of a notebook in order and returns their outputs. The outputs are saved with the notebook."
    )

    @Parameter(title: "Notebook")
    var notebook: NotebookEntity
    @Parameter(title: "Restart Kernel First", default: true)
    var restart: Bool
    @Parameter(title: "Time Limit (seconds)", default: 600, inclusiveRange: (1, 3600))
    var timeout: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Run \(\.$notebook)") {
            \.$restart
            \.$timeout
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[CellOutputEntity]> {
        let actions = try await IntentServer.actions()
        let path = try IntentServer.path(notebook.url)
        let cells = try await actions.notebookRunAll(path: path, restart: restart, timeout: timeout)
        return .result(value: CellOutputEntity.of(cells))
    }
}

struct RunNotebookWithParametersIntent: AppIntent {
    static let title: LocalizedStringResource = "Run Notebook with Parameters"
    static let description = IntentDescription(
        "Runs a notebook in a new kernel with parameters and returns its named results as JSON. The notebook and its window are left as they are."
    )

    @Parameter(title: "Notebook")
    var notebook: NotebookEntity
    @Parameter(title: "Parameters", description: "A JSON object, like {\"day\": \"2026-11-10\"}.", default: "{}")
    var params: String
    @Parameter(title: "Time Limit (seconds)", default: 600, inclusiveRange: (1, 3600))
    var timeout: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Run \(\.$notebook) with \(\.$params)") {
            \.$timeout
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let actions = try await IntentServer.actions()
        let path = try IntentServer.path(notebook.url)
        let result = try await actions.notebookRunWithParams(path: path, params: params, timeout: timeout)
        if result.status != "ok" { throw NotebookActionError.runFailed(result.error ?? "no message") }
        return .result(value: result.results)
    }
}

struct RunCellIntent: AppIntent {
    static let title: LocalizedStringResource = "Run Cell"
    static let description = IntentDescription(
        "Runs one cell of a notebook by its id, or every cell with a tag, and returns the outputs."
    )

    @Parameter(title: "Notebook")
    var notebook: NotebookEntity
    @Parameter(title: "Cell", description: "A cell id, or a tag the cells to run have.")
    var cell: String
    @Parameter(title: "Time Limit (seconds)", default: 600, inclusiveRange: (1, 3600))
    var timeout: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Run cell \(\.$cell) of \(\.$notebook)") {
            \.$timeout
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[CellOutputEntity]> {
        let actions = try await IntentServer.actions()
        let path = try IntentServer.path(notebook.url)
        let cells = try await actions.cellRun(path: path, cell: cell, timeout: timeout)
        return .result(value: CellOutputEntity.of(cells))
    }
}

struct ReadOutputsIntent: AppIntent {
    static let title: LocalizedStringResource = "Get Notebook Outputs"
    static let description = IntentDescription(
        "Returns the saved outputs of a notebook, or of one cell by id or tag, without running anything."
    )

    @Parameter(title: "Notebook")
    var notebook: NotebookEntity
    @Parameter(title: "Cell", description: "A cell id or tag; every cell when empty.")
    var cell: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Get the outputs of \(\.$notebook)") {
            \.$cell
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[CellOutputEntity]> {
        let actions = try await IntentServer.actions()
        let read = try await actions.notebookRead(path: IntentServer.path(notebook.url))
        var cells = read.cells
        if let cell, !cell.isEmpty {
            cells = read.cells(matching: cell)
            if cells.isEmpty { throw NotebookActionError.noCell(cell) }
        }
        return .result(value: CellOutputEntity.of(cells))
    }
}

struct KernelControlIntent: AppIntent {
    static let title: LocalizedStringResource = "Control Notebook Kernel"
    static let description = IntentDescription("Starts, interrupts, restarts or shuts down a notebook's kernel.")

    @Parameter(title: "Action", default: .restart)
    var action: NotebookActions.KernelAction
    @Parameter(title: "Notebook")
    var notebook: NotebookEntity

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$action) the kernel of \(\.$notebook)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let actions = try await IntentServer.actions()
        let done = try await actions.kernelControl(path: IntentServer.path(notebook.url), action: action)
        return .result(value: done)
    }
}

struct ListNotebooksIntent: AppIntent {
    static let title: LocalizedStringResource = "List Notebooks"
    static let description = IntentDescription("Returns the notebooks in a folder (not its subfolders).")

    @Parameter(title: "Folder", supportedContentTypes: [.folder])
    var folder: IntentFile

    static var parameterSummary: some ParameterSummary {
        Summary("List the notebooks in \(\.$folder)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[NotebookEntity]> {
        let actions = try await IntentServer.actions()
        let items = try await actions.notebooksList(dir: IntentServer.path(IntentServer.folder(folder)))
        let notebooks = items.filter { !$0.isDirectory }.map { NotebookEntity(url: IntentServer.url($0.path)) }
        return .result(value: notebooks)
    }
}

struct GanymedeShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenNotebookIntent(),
            phrases: ["Open a notebook in \(.applicationName)"],
            shortTitle: "Open Notebook",
            systemImageName: "book"
        )
        AppShortcut(
            intent: RunNotebookIntent(),
            phrases: ["Run a notebook in \(.applicationName)"],
            shortTitle: "Run Notebook",
            systemImageName: "play"
        )
    }
}
#endif
