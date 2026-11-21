import Foundation

/// Where the native sidebar's files are (#737): this device's disk, or a
/// connected machine's contents API through the app's mount (#701). The
/// sidebar and the search only see `FolderEntry` items whose `url` is
/// opaque, and ask the source to list and change them.
protocol FileSource: Sendable {
    /// The visible items in `folder`: folders first, then files, each in
    /// Finder order. Hidden files are left out.
    func list(_ folder: URL) async throws -> [FolderEntry]
    /// Makes a folder in `parent`, named "untitled folder" (locally) or as
    /// the server names it, and returns it.
    func newFolder(in parent: URL) async throws -> URL
    /// Renames the item to `name` (no slash) in its own folder; returns its
    /// new location.
    func rename(_ url: URL, to name: String) async throws -> URL
    /// Copies the item next to itself and returns the copy. A machine's
    /// contents API copies files only, so a folder there throws
    /// `FileSourceError.foldersCantBeDuplicated`.
    func duplicate(_ url: URL) async throws -> URL
    /// Removes the item: the Trash on this device (the iPad's source deletes
    /// for good). Returns where it went, when the source can say (the
    /// Trash's copy).
    @discardableResult
    func delete(_ url: URL) async throws -> URL?
    /// The text of the file, or nil when it holds none. A notebook's is its
    /// JSON.
    func readText(_ url: URL) async throws -> String?
    /// The path the page's `open` and `new-notebook` take for the item.
    func serverPath(_ url: URL) -> String
}

enum FileSourceError: LocalizedError, Equatable {
    /// A name that is empty, has a slash, or is "." or "..".
    case badName(String)
    /// The id of a machine the server doesn't accept.
    case badMachine(String)
    /// The server's answer to a request: its `message` when it sent one.
    case server(status: Int, message: String?)
    case badResponse(String)
    /// A location that isn't on this source's machine.
    case notThisMachine
    /// A machine's contents API doesn't copy folders.
    case foldersCantBeDuplicated

    var errorDescription: String? {
        switch self {
        case .badName(let name): "“\(name)” can’t be used as a name."
        case .badMachine(let id): "“\(id)” isn’t a machine id."
        case .server(let status, let message):
            message.flatMap { $0.isEmpty ? nil : $0 } ?? "The server answered \(status)."
        case .badResponse(let what): "The server’s answer didn’t have \(what)."
        case .notThisMachine: "That isn’t on this machine."
        case .foldersCantBeDuplicated: "Folders can’t be duplicated on a machine."
        }
    }

    /// Whether `name` can name one item in a folder.
    static func isValidName(_ name: String) -> Bool {
        !name.isEmpty && !name.contains("/") && name != "." && name != ".."
    }

    /// What a machine's file request failing comes to, in words (#753): the
    /// mount answers 502 (and a proxy 503 or 504) when the machine doesn't
    /// answer, and a network error means the same; its 404 "No machine … is
    /// mounted" means the machine isn't connected here. Any other error
    /// keeps its own description.
    /// `machine` nil (no name known) reads "The machine".
    static func machineMessage(_ error: Error, machine: String?) -> String {
        let subject = machine.map { "“\($0)”" } ?? "The machine"
        if let error = error as? FileSourceError, case .server(let status, let message) = error {
            if [502, 503, 504].contains(status) { return "\(subject) didn’t answer." }
            if status == 404, isNotMounted(message) { return "\(subject) isn’t connected to this Mac." }
        } else if let error = error as? URLError, error.code != .cancelled {
            return "\(subject) didn’t answer."
        }
        return error.localizedDescription
    }

    /// The words for an error from a listing or file operation in `place`:
    /// a machine's through `machineMessage`, this device's as they are.
    static func message(_ error: Error, place: Place, machineName: String?) -> String {
        guard place.isMachine else { return error.localizedDescription }
        return machineMessage(error, machine: machineName)
    }

    /// Whether a 404's message is the mount's for a machine it hasn't
    /// mounted: exactly its form, `No machine "<id>" is mounted`, so a
    /// contents 404 naming a file that happens to say "no machine" isn't.
    static func isNotMounted(_ message: String?) -> Bool {
        guard let text = message?.trimmingCharacters(in: .whitespacesAndNewlines) else { return false }
        return text.hasPrefix("No machine ") && text.hasSuffix(" is mounted")
    }

    /// The same for a 404's raw body: its JSON `message`, else its text.
    static func isNotMounted(body: Data) -> Bool {
        let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
        return isNotMounted((json?["message"] as? String) ?? String(decoding: body, as: UTF8.self))
    }
}

/// Which file operations a machine's sidebar allows (#753).
enum FileChanges {
    /// Whether the menu items that change files are enabled: not while one
    /// is running, and not while a machine doesn't answer. This device is
    /// always reachable.
    static func allowed(place: Place, reachable: Bool, busy: Bool) -> Bool {
        !busy && (reachable || !place.isMachine)
    }
}

// MARK: - This device

/// The device's disk, through `FileManager`.
struct LocalFileSource: FileSource {
    /// The folder the app's server is rooted at, when it isn't `/`: the
    /// iPad's is its notebook folder (#208), so server paths are relative
    /// to it. Nil: the Mac's, rooted at `/`.
    let root: URL?
    /// Whether `delete` removes the item for good instead of moving it to
    /// the Trash: the iPad's sidebar always has, and its alert says "This
    /// can't be undone".
    let deletesForGood: Bool

    init(root: URL? = nil, deletesForGood: Bool = false) {
        self.root = root
        self.deletesForGood = deletesForGood
    }

    /// The iPad's and iPhone's: its server is rooted at the notebook folder,
    /// and nothing is trashed (#757).
    static func notebookFolder(_ folder: URL) -> LocalFileSource {
        LocalFileSource(root: folder, deletesForGood: true)
    }

    func list(_ folder: URL) async throws -> [FolderEntry] {
        try FolderEntry.list(folder)
    }

    func newFolder(in parent: URL) async throws -> URL {
        let fm = FileManager.default
        var url = parent.appendingPathComponent("untitled folder")
        var n = 2
        while fm.fileExists(atPath: url.path) {
            url = parent.appendingPathComponent("untitled folder \(n)")
            n += 1
        }
        try fm.createDirectory(at: url, withIntermediateDirectories: false)
        return url
    }

    func rename(_ url: URL, to name: String) async throws -> URL {
        guard FileSourceError.isValidName(name) else { throw FileSourceError.badName(name) }
        let target = url.deletingLastPathComponent().appendingPathComponent(name)
        try FileManager.default.moveItem(at: url, to: target)
        return target
    }

    func duplicate(_ url: URL) async throws -> URL {
        let fm = FileManager.default
        let target = FolderEntry.duplicateURL(for: url) { fm.fileExists(atPath: $0.path) }
        try fm.copyItem(at: url, to: target)
        return target
    }

    @discardableResult
    func delete(_ url: URL) async throws -> URL? {
        if deletesForGood {
            try FileManager.default.removeItem(at: url)
            return nil
        }
        return try trash(url)
    }

    /// Moves the item to the Trash and returns where it went, when the
    /// system says.
    func trash(_ url: URL) throws -> URL? {
        var result: NSURL?
        try FileManager.default.trashItem(at: url, resultingItemURL: &result)
        return result as URL?
    }

    func readText(_ url: URL) async throws -> String? {
        String(data: try Data(contentsOf: url), encoding: .utf8)
    }

    func serverPath(_ url: URL) -> String {
        guard let root else { return FolderEntry.serverPath(url) }
        return FolderEntry.serverPath(url, root: root)
    }
}

// MARK: - A connected machine

/// A machine's files through its Jupyter contents API, at
/// `<server>/machines/<id>/api/contents/<path>` on the app's own server,
/// which forwards with the machine's credentials. The server's URL keeps
/// its query (the token), as `PlaceReachability.statusURL` does. Items are
/// `FolderEntry.machineURL`s.
struct MachineFileSource: FileSource {
    typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    let id: String
    /// The app's server with its token in the query.
    let server: URL
    private let send: Send

    init(id: String, server: URL, send: Send? = nil) {
        self.id = id
        self.server = server
        self.send = send ?? { try await URLSession.shared.data(for: $0) }
    }

    func list(_ folder: URL) async throws -> [FolderEntry] {
        let path = try machinePath(of: folder)
        let model = try await json(request(path, query: [("content", "1")]))
        guard let model = model as? [String: Any], model["type"] as? String == "directory" else {
            throw FileSourceError.badResponse("a folder listing")
        }
        let items = model["content"] as? [[String: Any]] ?? []
        let entries = items.compactMap { item -> FolderEntry? in
            guard let name = item["name"] as? String, !name.isEmpty, !name.hasPrefix(".") else { return nil }
            // A machine sends the names: one with a separator would climb out of the folder.
            guard !name.contains("/"), !name.contains("\\") else { return nil }
            // The answer's own path for the item, when it has one, is the folder's plus the name.
            if let itemPath = item["path"] as? String,
               itemPath.trimmingCharacters(in: CharacterSet(charactersIn: "/")) != Self.join(path, name) {
                return nil
            }
            let isDirectory: Bool
            switch item["type"] as? String {
            case "directory": isDirectory = true
            case "notebook", "file": isDirectory = false
            default: return nil
            }
            guard let url = FolderEntry.machineURL(id, path: Self.join(path, name)) else { return nil }
            return FolderEntry(url: url, isDirectory: isDirectory)
        }
        return entries.sorted { a, b in
            if a.isDirectory != b.isDirectory { return a.isDirectory }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
    }

    func newFolder(in parent: URL) async throws -> URL {
        let created = try await json(request(machinePath(of: parent), method: "POST", body: ["type": "directory"]))
        return try location(of: created, "a new folder")
    }

    func rename(_ url: URL, to name: String) async throws -> URL {
        guard FileSourceError.isValidName(name) else { throw FileSourceError.badName(name) }
        let path = try machinePath(of: url)
        let target = Self.join(FolderEntry.parentPath(path), name)
        let moved = try await json(request(path, method: "PATCH", body: ["path": target]))
        // The server's own spelling of the path when it sends one.
        return try (try? location(of: moved, "the moved item")) ?? machineURL(target)
    }

    func duplicate(_ url: URL) async throws -> URL {
        let path = try machinePath(of: url)
        // The server's copy refuses directories: say so without sending the copy.
        guard !(try await isDirectory(path)) else { throw FileSourceError.foldersCantBeDuplicated }
        let copy = try await json(request(
            FolderEntry.parentPath(path), method: "POST", body: ["copy_from": path]))
        return try location(of: copy, "the copy")
    }

    @discardableResult
    func delete(_ url: URL) async throws -> URL? {
        _ = try await json(request(machinePath(of: url), method: "DELETE"))
        return nil
    }

    func readText(_ url: URL) async throws -> String? {
        let path = try machinePath(of: url)
        if url.pathExtension.lowercased() == "ipynb" {
            let model = try await json(request(path, query: [("content", "1"), ("type", "notebook")]))
            guard let content = (model as? [String: Any])?["content"] as? [String: Any] else { return nil }
            let data = try JSONSerialization.data(withJSONObject: content)
            return String(data: data, encoding: .utf8)
        }
        let model = try await json(request(path, query: [
            ("content", "1"), ("type", "file"), ("format", "text"),
        ]))
        return (model as? [String: Any])?["content"] as? String
    }

    func serverPath(_ url: URL) -> String {
        FolderEntry.serverPath(url)
    }

    // MARK: Requests

    /// The item's path on the machine; throws for a URL that isn't this
    /// machine's.
    private func machinePath(of url: URL) throws -> String {
        guard Place.isValidMachineID(id) else { throw FileSourceError.badMachine(id) }
        // The host's case isn't relied on; requests use `id` as given.
        guard let location = FolderEntry.machineLocation(url),
              location.id.caseInsensitiveCompare(id) == .orderedSame
        else {
            throw FileSourceError.notThisMachine
        }
        return location.path
    }

    private func machineURL(_ path: String) throws -> URL {
        guard let url = FolderEntry.machineURL(id, path: path) else { throw FileSourceError.badMachine(id) }
        return url
    }

    /// Whether the item is a folder, by asking for it without its content.
    private func isDirectory(_ path: String) async throws -> Bool {
        let model = try await json(request(path, query: [("content", "0")]))
        return (model as? [String: Any])?["type"] as? String == "directory"
    }

    private func location(of model: Any?, _ what: String) throws -> URL {
        guard let path = (model as? [String: Any])?["path"] as? String,
              let url = FolderEntry.machineURL(id, path: path)
        else { throw FileSourceError.badResponse(what) }
        return url
    }

    static func join(_ parent: String, _ name: String) -> String {
        parent.isEmpty ? name : parent + "/" + name
    }

    /// The contents API's URL for `path` through the mount, each segment
    /// percent-encoded, with the server's token in the query.
    func contentsURL(_ path: String, query: [(String, String)] = []) throws -> URL {
        let parts = path.split(separator: "/").map(String.init)
        if let dot = parts.first(where: FolderEntry.isDotSegment) { throw FileSourceError.badName(dot) }
        let encoded = parts.map {
            String($0).addingPercentEncoding(withAllowedCharacters: FolderEntry.segmentAllowed) ?? String($0)
        }
        let api = encoded.isEmpty ? "api/contents" : "api/contents/" + encoded.joined(separator: "/")
        guard let url = PlaceReachability.mountURL(id, server: server, path: api, query: query) else {
            throw FileSourceError.badMachine(id)
        }
        return url
    }

    private func request(
        _ path: String, method: String = "GET", query: [(String, String)] = [], body: [String: Any]? = nil
    ) throws -> URLRequest {
        var request = URLRequest(url: try contentsURL(path, query: query))
        request.httpMethod = method
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    /// The JSON body of a 2xx answer (nil when it has none); the server's
    /// message, or its status, as an error otherwise.
    private func json(_ request: URLRequest) async throws -> Any? {
        let (data, response) = try await send(request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let body = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        guard (200..<300).contains(status) else {
            var message = (body as? [String: Any])?["message"] as? String
            // The mount's 404 for an unmounted machine may be plain text.
            if message == nil, status == 404 {
                let text = String(decoding: data, as: UTF8.self)
                if FileSourceError.isNotMounted(text) { message = text }
            }
            throw FileSourceError.server(status: status, message: message)
        }
        return body
    }
}

// MARK: - Removing an item

/// How the sidebar removes an item in a place (#743). This device moves it
/// to the Trash, and asks only when it holds the open notebook. A machine's
/// server deletes it for good (Ganymede's contents API keeps no Trash), so
/// the item says Delete and always asks.
struct RemoveAction: Equatable {
    /// The menu item's title.
    let menuTitle: String
    /// The confirming button's title.
    let buttonTitle: String
    /// Whether to ask even when the item doesn't hold the open notebook.
    let alwaysAsks: Bool

    init(place: Place) {
        if place.isMachine {
            self.init(menuTitle: "Delete…", buttonTitle: "Delete", alwaysAsks: true)
        } else {
            self.init(menuTitle: "Move to Trash", buttonTitle: "Move to Trash", alwaysAsks: false)
        }
    }

    private init(menuTitle: String, buttonTitle: String, alwaysAsks: Bool) {
        self.menuTitle = menuTitle
        self.buttonTitle = buttonTitle
        self.alwaysAsks = alwaysAsks
    }

    /// The alert's message and detail, or nil when nothing needs asking.
    /// `holdsOpen`: the item is or holds the window's open notebook, which
    /// closes; `dirty`: that notebook has unsaved changes.
    func question(for entry: FolderEntry, holdsOpen: Bool, dirty: Bool) -> (message: String, detail: String)? {
        guard alwaysAsks || holdsOpen else { return nil }
        let name = entry.isDirectory ? entry.name : entry.title
        let message: String
        if holdsOpen {
            message = entry.isDirectory ? "“\(name)” holds the open notebook." : "“\(name)” is open in this window."
        } else {
            message = "Delete “\(name)”?"
        }
        var detail: [String] = []
        if alwaysAsks {
            detail.append(entry.isDirectory
                ? "The machine deletes the folder and everything in it. This can’t be undone."
                : "The machine deletes it for good. This can’t be undone.")
        }
        if holdsOpen {
            let verb = alwaysAsks ? "Delete" : "Move it to the Trash"
            detail.append(dirty ? "It has unsaved changes. \(verb) and close it without saving?" : "\(verb) and close it?")
        }
        return (message, detail.joined(separator: " "))
    }

    /// The iPad's and iPhone's delete confirmation in `place` (#758): the
    /// title, and the message under it. It always asks (nothing is
    /// trashed there). This device keeps its own words, which say the
    /// delete can't be undone; a machine's are `question`'s, which also
    /// say when the item holds the open notebook.
    static func deleteAlert(
        place: Place, for entry: FolderEntry, holdsOpen: Bool, dirty: Bool
    ) -> (title: String, message: String) {
        if place.isMachine,
           let question = RemoveAction(place: place).question(for: entry, holdsOpen: holdsOpen, dirty: dirty) {
            return (question.message, question.detail)
        }
        return ("Delete “\(entry.isNotebook ? entry.title : entry.name)”?", "This can't be undone.")
    }
}
