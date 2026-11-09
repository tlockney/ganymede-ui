import Foundation

// The notebooks the share sheet offers (#435, ganymede-device phase 4.3;
// a spike). The app copies a notebook into the App Group's container when
// the person offers it; the share extension, sandboxed, reads the copies
// and runs one on what was shared. Each copy keeps the original's path,
// which keys the permission ledger, so a kept "always" carries over.

enum AppGroup {
    /// Shared by the app and its extensions. Each build that embeds an
    /// extension needs it registered for the team (follow-up in #435).
    static let id = "group.com.ganymede-server.Ganymede"

    /// The group's container, or nil when this build isn't entitled to it.
    static func container() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
    }

    /// The group's defaults, or nil when this build isn't entitled to it.
    static func defaults() -> UserDefaults? {
        container() == nil ? nil : UserDefaults(suiteName: id)
    }
}

/// A notebook the share sheet offers.
struct ShareNotebook: Codable, Equatable, Identifiable {
    /// The copy's file name in the folder.
    var id: String
    /// What the share sheet lists.
    var name: String
    /// The original's path, which keys the ledger, folders and secrets.
    var path: String
}

/// The offered notebooks: copies in one folder, listed in notebooks.json.
struct ShareNotebooks {
    let folder: URL

    /// The App Group's, or nil when this build isn't entitled to it.
    static func shared() -> ShareNotebooks? {
        AppGroup.container().map { ShareNotebooks(folder: $0.appendingPathComponent("Share", isDirectory: true)) }
    }

    private var index: URL { folder.appendingPathComponent("notebooks.json") }

    func list() -> [ShareNotebook] {
        guard let data = try? Data(contentsOf: index) else { return [] }
        return (try? JSONDecoder().decode([ShareNotebook].self, from: data)) ?? []
    }

    /// Offers the notebook at `url`, or refreshes its copy if it's offered
    /// already.
    @discardableResult
    func add(_ url: URL, name: String? = nil) throws -> ShareNotebook {
        let path = url.standardizedFileURL.path
        var notebooks = list()
        let entry = notebooks.first { $0.path == path }
            ?? ShareNotebook(id: "\(UUID().uuidString).ipynb", name: name ?? url.deletingPathExtension().lastPathComponent, path: path)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try Data(contentsOf: url).write(to: folder.appendingPathComponent(entry.id), options: .atomic)
        notebooks.removeAll { $0.id == entry.id }
        notebooks.append(entry)
        try save(notebooks)
        return entry
    }

    func remove(_ id: String) throws {
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(id))
        try save(list().filter { $0.id != id })
    }

    /// The copy's `.ipynb` data.
    func data(for notebook: ShareNotebook) throws -> Data {
        try Data(contentsOf: folder.appendingPathComponent(notebook.id))
    }

    private func save(_ notebooks: [ShareNotebook]) throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(notebooks.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending })
            .write(to: index, options: .atomic)
    }
}
