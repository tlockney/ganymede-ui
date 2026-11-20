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
    /// Removes the item: the Trash on this device. Returns where it went,
    /// when the source can say (the Trash's copy).
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
}

// MARK: - This device

/// The device's disk, through `FileManager`.
struct LocalFileSource: FileSource {
    init() {}

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
        try trash(url)
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
        FolderEntry.serverPath(url)
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
            throw FileSourceError.server(status: status, message: (body as? [String: Any])?["message"] as? String)
        }
        return body
    }
}
