import Foundation

/// The app's notebook operations, for Shortcuts (`NotebookIntents`) and the
/// `ganymede://` URLs (#301, #302, #303). They match the server's MCP tools
/// (crates/ganymede-server/src/mcp.rs in tlockney/ganymede) and take their
/// names, so Shortcuts, URLs and agents offer one set of operations:
/// `notebooks_list`, `notebook_read`, `cell_run`, `notebook_run_all` and
/// `kernel_control`. Opening a notebook is the app's own (a window), not a
/// server call.
///
/// Each calls a Ganymede server's REST API with its token: in the app, its
/// in-process server over loopback, so ganymede-ffi needs no new calls.
/// Cells run through the execute endpoint (ganymede#244) with `wait`
/// (ganymede#566): the server runs them into the notebook's room, so a
/// window showing the notebook sees the outputs arrive, and they are saved
/// with it as the room autosaves.
struct NotebookActions: Sendable {
    typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    let server: ServerEndpoint
    private let send: Send
    /// How long to let the room save before running again, when a cell's
    /// source in the file is older than the room's (unsaved edits).
    var settle: Duration = .milliseconds(1500)

    init(server: ServerEndpoint, send: Send? = nil) {
        self.server = server
        self.send = send ?? { try await URLSession.shared.data(for: $0) }
    }

    enum KernelAction: String, CaseIterable, Sendable {
        case start, interrupt, restart, shutdown
    }

    /// An entry of `notebooksList`: a notebook or a folder.
    struct Item: Equatable, Sendable {
        var path: String
        var isDirectory: Bool
    }

    // MARK: Operations

    /// The notebooks and folders in `dir` (MCP `notebooks_list`), by API path.
    func notebooksList(dir: String) async throws -> [Item] {
        let body = try await json(request(Self.contents(dir), query: [URLQueryItem(name: "content", value: "1")]))
        guard let model = body as? [String: Any] else { throw NotebookActionError.badResponse("a folder listing") }
        guard model["type"] as? String == "directory" else { throw NotebookActionError.notAFolder(dir) }
        let items = model["content"] as? [[String: Any]] ?? []
        return items.compactMap { item in
            guard let path = item["path"] as? String else { return nil }
            switch item["type"] as? String {
            case "directory": return Item(path: path, isDirectory: true)
            case "notebook": return Item(path: path, isDirectory: false)
            default: return nil
            }
        }
        .sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
    }

    /// The notebook at `path` as saved (MCP `notebook_read`). The room saves
    /// a second after its last edit, so this can lag an open window by that.
    func notebookRead(path: String, requireIDs: Bool = true) async throws -> Notebook {
        let body = try await json(request(Self.contents(path), query: [
            URLQueryItem(name: "content", value: "1"), URLQueryItem(name: "type", value: "notebook"),
        ]))
        guard let model = body as? [String: Any], model["type"] as? String == "notebook",
              let content = model["content"] as? [String: Any]
        else { throw NotebookActionError.notANotebook(path) }
        let notebook = Notebook(path: path, json: content)
        // Before nbformat 4.5 cells have no ids, which every operation
        // here names them by; the server adds them once a room opens it.
        if requireIDs && notebook.cellsWithoutIDs > 0 { throw NotebookActionError.noCellIDs(path) }
        return notebook
    }

    /// A new notebook in `dir`, empty or a copy of `template`; named `name`
    /// (".ipynb" added), or as the server names a new one. Returns its path.
    func notebookNew(dir: String, name: String?, template: String?) async throws -> String {
        let name = name?.trimmingCharacters(in: .whitespaces) ?? ""
        let created: Any?
        if name.isEmpty {
            let body: [String: Any] = template.map { ["copy_from": $0] } ?? ["type": "notebook"]
            created = try await json(request(Self.contents(dir), method: "POST", body: body))
        } else {
            guard !name.contains("/") else { throw NotebookActionError.badName(name) }
            let file = name.hasSuffix(".ipynb") ? name : name + ".ipynb"
            let path = dir.isEmpty ? file : "\(dir)/\(file)"
            // Never over an existing file.
            let (status, body) = try await call(request(Self.contents(path), query: [URLQueryItem(name: "content", value: "0")]))
            if (200..<300).contains(status) { throw NotebookActionError.exists(path) }
            if status != 404 { throw NotebookActionError.server(status: status, message: Self.message(body)) }
            var content: [String: Any] = ["cells": [], "metadata": [:], "nbformat": 4, "nbformat_minor": 5]
            if let template {
                content = try await notebookRead(path: template, requireIDs: false).json
            }
            created = try await json(request(Self.contents(path), method: "PUT", body: [
                "type": "notebook", "format": "json", "content": content,
            ]))
        }
        guard let path = (created as? [String: Any])?["path"] as? String else {
            throw NotebookActionError.badResponse("a new notebook")
        }
        return path
    }

    /// Runs the code cell with id `cell`, or else every code cell tagged
    /// `cell`, and returns them with their outputs. MCP's `cell_run` runs new
    /// code; this runs cells already in the notebook, as a window does.
    func cellRun(path: String, cell: String, timeout: Int) async throws -> [NotebookCell] {
        try await run(path: path, timeout: timeout) { notebook in
            let cells = notebook.cells(matching: cell).filter { $0.kind == "code" }
            if cells.isEmpty { throw NotebookActionError.noCell(cell) }
            return cells
        }
    }

    /// Runs every code cell in order, after restarting the kernel if
    /// `restart`, and returns them (MCP `notebook_run_all`).
    func notebookRunAll(path: String, restart: Bool, timeout: Int) async throws -> [NotebookCell] {
        try await run(path: path, timeout: timeout, restart: restart) { notebook in
            notebook.cells.filter { $0.kind == "code" && !$0.source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }
    }

    /// Starts, interrupts, restarts or shuts down the notebook's kernel
    /// (MCP `kernel_control`). Returns what was done.
    func kernelControl(path: String, action: KernelAction) async throws -> String {
        switch action {
        case .start:
            let notebook = try await notebookRead(path: path)
            _ = try await kernel(for: path, spec: notebook.kernelName)
            return "Started the kernel of \(path)"
        case .restart:
            let notebook = try await notebookRead(path: path)
            let kernel = try await kernel(for: path, spec: notebook.kernelName)
            try await expectOK(request("api/kernels/\(kernel)/restart", method: "POST"))
            return "Restarted the kernel of \(path)"
        case .interrupt:
            guard let running = try await session(for: path) else { throw NotebookActionError.noKernel(path) }
            try await expectOK(request("api/kernels/\(running.kernel)/interrupt", method: "POST"))
            return "Interrupted the kernel of \(path)"
        case .shutdown:
            guard let running = try await session(for: path) else { throw NotebookActionError.noKernel(path) }
            // Deleting the session shuts its kernel down; the kernel may be
            // gone by the second call.
            try await expectOK(request("api/sessions/\(running.id)", method: "DELETE"))
            let (status, body) = try await call(request("api/kernels/\(running.kernel)", method: "DELETE"))
            if !(200..<300).contains(status) && status != 404 {
                throw NotebookActionError.server(status: status, message: Self.message(body))
            }
            return "Shut down the kernel of \(path)"
        }
    }

    // MARK: Running

    private func run(
        path: String, timeout: Int, restart: Bool = false,
        select: (Notebook) throws -> [NotebookCell]
    ) async throws -> [NotebookCell] {
        var notebook = try await notebookRead(path: path)
        var cells = try select(notebook)
        let kernel = try await kernel(for: path, spec: notebook.kernelName)
        if restart {
            try await expectOK(request("api/kernels/\(kernel)/restart", method: "POST"))
        }
        if cells.isEmpty { return [] }
        let document = try await documentID(path)
        var result = try await execute(kernel: kernel, document: document, cells: cells, timeout: timeout)
        if case .stale = result {
            // The window has edits the file doesn't yet: read again once
            // the room has saved them.
            try await Task.sleep(for: settle)
            notebook = try await notebookRead(path: path)
            cells = try select(notebook)
            if cells.isEmpty { return [] }
            result = try await execute(kernel: kernel, document: document, cells: cells, timeout: timeout)
        }
        switch result {
        case .stale(let id):
            throw NotebookActionError.changed(id)
        case .ran(let ran, let finished):
            if let failed = ran.first(where: { $0.error != nil }), let error = failed.error {
                throw NotebookActionError.cellFailed(cell: failed.id, name: error.name, value: error.value)
            }
            if !finished { throw NotebookActionError.timedOut(timeout) }
            return ran
        }
    }

    private enum Executed {
        case ran([NotebookCell], finished: Bool)
        /// A cell's source differs from the room's.
        case stale(String)
    }

    private func execute(kernel: String, document: String, cells: [NotebookCell], timeout: Int) async throws -> Executed {
        var post = try request("api/kernels/\(kernel)/execute", method: "POST", body: [
            "document_id": "json:notebook:\(document)",
            "cells": cells.map { ["cell_id": $0.id, "source_hash": String(Self.murmur2(Array($0.source.utf8)))] },
            "wait": max(1, timeout),
        ])
        // The server answers only when the cells are done.
        post.timeoutInterval = TimeInterval(max(1, timeout) + 30)
        let (status, body) = try await call(post)
        let object = body as? [String: Any]
        if status == 409, object?["error"] as? String == "source_mismatch" {
            return .stale(object?["cell_id"] as? String ?? "")
        }
        guard (200..<300).contains(status) else {
            throw NotebookActionError.server(status: status, message: Self.message(body))
        }
        // `null`: a server from before ganymede#566, which doesn't wait.
        guard let object, let finished = object["finished"] as? Bool, let list = object["cells"] as? [[String: Any]] else {
            throw NotebookActionError.oldServer
        }
        return .ran(list.compactMap(NotebookCell.init(json:)), finished: finished)
    }

    /// The notebook's file id, for its room's `json:notebook:<id>`.
    private func documentID(_ path: String) async throws -> String {
        let body = try await json(request("api/fileid/index", method: "POST", query: [URLQueryItem(name: "path", value: path)]))
        guard let id = (body as? [String: Any])?["id"] as? String else { throw NotebookActionError.badResponse("a file id") }
        return id
    }

    /// The kernel of the notebook's session; a new session (and kernel)
    /// when it has none, on `spec` or the server's default.
    private func kernel(for path: String, spec: String?) async throws -> String {
        if let running = try await session(for: path) { return running.kernel }
        var kernel: [String: Any] = [:]
        if let spec { kernel["name"] = spec }
        let body = try await json(request("api/sessions", method: "POST", body: [
            "path": path, "name": (path as NSString).lastPathComponent, "type": "notebook", "kernel": kernel,
        ]))
        guard let id = ((body as? [String: Any])?["kernel"] as? [String: Any])?["id"] as? String else {
            throw NotebookActionError.badResponse("a session")
        }
        return id
    }

    /// The session on `path` and its kernel, if there is one.
    private func session(for path: String) async throws -> (id: String, kernel: String)? {
        let body = try await json(request("api/sessions"))
        for session in body as? [[String: Any]] ?? [] where session["path"] as? String == path {
            if let id = session["id"] as? String, let kernel = (session["kernel"] as? [String: Any])?["id"] as? String {
                return (id, kernel)
            }
        }
        return nil
    }

    // MARK: HTTP

    private static func contents(_ path: String) -> String {
        path.isEmpty ? "api/contents" : "api/contents/\(path)"
    }

    private func request(
        _ path: String, method: String = "GET", query: [URLQueryItem] = [], body: [String: Any]? = nil
    ) throws -> URLRequest {
        var request = server.request(path, method: method)
        if !query.isEmpty, let url = request.url, var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            // Encoded by hand: URLComponents leaves `+` and `&` alone in
            // query values, which the server reads as a space and a separator.
            parts.percentEncodedQuery = query.map { item in
                "\(Self.encode(item.name))=\(Self.encode(item.value ?? ""))"
            }.joined(separator: "&")
            request.url = parts.url
        }
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    /// The status and the JSON body (nil when there is none).
    private func call(_ request: URLRequest) async throws -> (Int, Any?) {
        let (data, response) = try await send(request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        return (status, try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
    }

    /// The JSON body of a 2xx answer; the server's message otherwise.
    private func json(_ request: URLRequest) async throws -> Any? {
        let (status, body) = try await call(request)
        guard (200..<300).contains(status) else {
            if status == 404, request.url?.path.contains("/api/contents") == true {
                throw NotebookActionError.notFound(Self.contentsPath(request))
            }
            throw NotebookActionError.server(status: status, message: Self.message(body))
        }
        return body
    }

    private func expectOK(_ request: URLRequest) async throws {
        _ = try await json(request)
    }

    private static func contentsPath(_ request: URLRequest) -> String {
        let path = request.url?.path ?? ""
        guard let range = path.range(of: "/api/contents") else { return path }
        return String(path[range.upperBound...]).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    /// A Jupyter error body's `message` (or `reason`).
    static func message(_ body: Any?) -> String {
        let object = body as? [String: Any]
        return object?["message"] as? String ?? object?["reason"] as? String ?? "no message"
    }

    // MARK: Paths and hashes

    /// The server's API path for a file: its path under `root`, the folder
    /// the server serves (`/` on the Mac); nil outside it.
    /// The same mapping as the windows' (`FolderEntry.serverPath`), so an
    /// action and a window share the file's room and kernel.
    static func apiPath(for url: URL, root: URL) -> String? {
        if root.standardizedFileURL.path == "/" { return FolderEntry.serverPath(url) }
        let file = url.standardizedFileURL.resolvingSymlinksInPath().path
        let base = root.standardizedFileURL.resolvingSymlinksInPath().path
        guard file == base || file.hasPrefix(base.hasSuffix("/") ? base : base + "/") else { return nil }
        return FolderEntry.serverPath(url, root: root)
    }

    /// ASCII letters, digits and `-._~/`; the rest percent-encoded as UTF-8.
    private static let queryValue = CharacterSet(
        charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~/"
    )

    static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: queryValue) ?? value
    }

    /// MurmurHash2, as `jupyter-server-documents` hashes a cell's source
    /// for the execute endpoint (seed 0; ganymede_documents::murmur2).
    static func murmur2(_ data: [UInt8], seed: UInt32 = 0) -> UInt32 {
        let m: UInt32 = 0x5BD1_E995
        var h = seed ^ UInt32(truncatingIfNeeded: data.count)
        var i = 0
        while i + 4 <= data.count {
            var k = UInt32(data[i]) | UInt32(data[i + 1]) << 8 | UInt32(data[i + 2]) << 16 | UInt32(data[i + 3]) << 24
            k = k &* m
            k ^= k >> 24
            k = k &* m
            h = (h &* m) ^ k
            i += 4
        }
        let rest = data.count - i
        if rest == 3 { h ^= UInt32(data[i + 2]) << 16 }
        if rest >= 2 { h ^= UInt32(data[i + 1]) << 8 }
        if rest >= 1 {
            h ^= UInt32(data[i])
            h = h &* m
        }
        h ^= h >> 13
        h = h &* m
        h ^= h >> 15
        return h
    }
}

/// Why an operation failed, in words for Shortcuts to show.
enum NotebookActionError: LocalizedError, Equatable {
    case notFound(String)
    case notANotebook(String)
    case notAFolder(String)
    case outsideServer(String)
    case exists(String)
    case badName(String)
    case noCell(String)
    case noCellIDs(String)
    case noKernel(String)
    case changed(String)
    case cellFailed(cell: String, name: String, value: String)
    case timedOut(Int)
    case oldServer
    case server(status: Int, message: String)
    case badResponse(String)

    var errorDescription: String? {
        switch self {
        case .notFound(let path): "Nothing is at \(path)."
        case .notANotebook(let path): "\(path) isn’t a notebook."
        case .notAFolder(let path): "\(path) isn’t a folder."
        case .outsideServer(let path): "\(path) is outside the folder Ganymede serves."
        case .exists(let path): "\(path) already exists."
        case .badName(let name): "“\(name)” can’t be a notebook name."
        case .noCell(let cell): "No cell has the id or tag “\(cell)”."
        case .noCellIDs(let path):
            "\(path)’s cells have no ids (nbformat before 4.5); open it in Ganymede once and save it to add them."
        case .noKernel(let path): "No kernel is running for \(path)."
        case .changed(let cell): "Cell \(cell) changed while it was about to run; run it again."
        case .cellFailed(let cell, let name, let value):
            value.isEmpty ? "Cell \(cell) failed: \(name)" : "Cell \(cell) failed: \(name): \(value)"
        case .timedOut(let seconds): "The cells didn’t finish in \(seconds) seconds; they are still running."
        case .oldServer: "This Ganymede server can’t report when cells finish; it needs a newer version."
        case .server(let status, let message): "The server answered \(status): \(message)"
        case .badResponse(let what): "The server sent an unexpected answer for \(what)."
        }
    }
}

/// A notebook as the contents API gives it.
struct Notebook {
    var path: String
    var cells: [NotebookCell]
    /// Cells left out of `cells` for having no id (nbformat before 4.5).
    var cellsWithoutIDs: Int
    /// The kernelspec in its metadata, if any.
    var kernelName: String?
    /// The nbformat JSON, for a copy.
    var json: [String: Any]

    init(path: String, json: [String: Any]) {
        self.path = path
        self.json = json
        let all = json["cells"] as? [[String: Any]] ?? []
        cells = all.compactMap(NotebookCell.init(json:))
        cellsWithoutIDs = all.count - cells.count
        kernelName = ((json["metadata"] as? [String: Any])?["kernelspec"] as? [String: Any])?["name"] as? String
    }

    /// The cell with id `key`; else the cells tagged `key`, in order.
    func cells(matching key: String) -> [NotebookCell] {
        if let cell = cells.first(where: { $0.id == key }) { return [cell] }
        return cells.filter { $0.tags.contains(key) }
    }
}

struct NotebookCell: Equatable, Sendable {
    var id: String
    /// `code`, `markdown` or `raw`.
    var kind: String
    var source: String
    var tags: [String]
    var executionCount: Int?
    var outputs: [CellOutput]

    /// The first error among its outputs.
    var error: (name: String, value: String)? {
        outputs.first { $0.kind == .error }.map { ($0.errorName ?? "Error", $0.errorValue ?? "") }
    }

    /// From nbformat JSON; nil without an id (nbformat before 4.5).
    init?(json: [String: Any]) {
        guard let id = json["id"] as? String else { return nil }
        self.id = id
        kind = json["cell_type"] as? String ?? "code"
        source = Self.text(json["source"])
        tags = (json["metadata"] as? [String: Any])?["tags"] as? [String] ?? []
        executionCount = json["execution_count"] as? Int
        outputs = (json["outputs"] as? [[String: Any]] ?? []).compactMap(CellOutput.init(json:))
    }

    /// nbformat's multiline string: a string, or a list of lines.
    static func text(_ value: Any?) -> String {
        if let string = value as? String { return string }
        return (value as? [String])?.joined() ?? ""
    }
}

/// One output, as Shortcuts can use it: text, an image, or JSON.
struct CellOutput: Equatable, Sendable {
    enum Kind: String, Sendable {
        case stream, result, display, error
    }

    struct Image: Equatable, Sendable {
        var data: Data
        /// Its MIME type.
        var type: String
    }

    var kind: Kind
    /// A stream's text, a result's `text/plain` (or Markdown), or an
    /// error's name and value.
    var text: String?
    var image: Image?
    /// `application/json`, as text.
    var json: String?
    var errorName: String?
    var errorValue: String?

    init(kind: Kind, text: String? = nil, image: Image? = nil, json: String? = nil) {
        self.kind = kind
        self.text = text
        self.image = image
        self.json = json
    }

    init?(json output: [String: Any]) {
        switch output["output_type"] as? String {
        case "stream":
            self.init(kind: .stream, text: NotebookCell.text(output["text"]))
        case "error":
            let name = output["ename"] as? String ?? "Error"
            let value = output["evalue"] as? String ?? ""
            self.init(kind: .error, text: value.isEmpty ? name : "\(name): \(value)")
            errorName = name
            errorValue = value
        case let type? where type == "execute_result" || type == "display_data":
            let data = output["data"] as? [String: Any] ?? [:]
            self.init(kind: type == "execute_result" ? .result : .display)
            text = data["text/plain"].map(NotebookCell.text) ?? data["text/markdown"].map(NotebookCell.text)
            for mime in ["image/png", "image/jpeg", "image/gif"] {
                if let encoded = data[mime].map(NotebookCell.text),
                   let bytes = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters) {
                    image = Image(data: bytes, type: mime)
                    break
                }
            }
            if let value = data["application/json"],
               let encoded = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .prettyPrinted, .sortedKeys]) {
                self.json = String(decoding: encoded, as: UTF8.self)
            }
        default:
            return nil
        }
    }
}
