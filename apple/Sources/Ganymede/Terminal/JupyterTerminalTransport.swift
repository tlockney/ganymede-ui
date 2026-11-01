import Foundation

/// A Jupyter or Ganymede server to open terminals on: its base URL (with
/// a trailing slash) and token.
struct ServerEndpoint: Equatable, Sendable {
    let base: URL
    let token: String

    init(base: URL, token: String) {
        var url = base
        if !url.path.hasSuffix("/") {
            url = url.appendingPathComponent("")
        }
        if var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            parts.query = nil
            parts.fragment = nil
            url = parts.url ?? url
        }
        self.base = url
        self.token = token
    }

    /// A URL as the server prints it, `http://host:port/base/?token=...`.
    init?(serverURL: URL) {
        guard let parts = URLComponents(url: serverURL, resolvingAgainstBaseURL: false),
              let token = parts.queryItems?.first(where: { $0.name == "token" })?.value
        else { return nil }
        self.init(base: serverURL, token: token)
    }

    /// A URL and token as entered in Settings; nil when the URL is empty
    /// or not http(s).
    init?(string: String, token: String) {
        guard let url = URL(string: string.trimmingCharacters(in: .whitespaces)),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "")
        else { return nil }
        self.init(base: url, token: token)
    }

    func url(_ path: String) -> URL {
        base.appendingPathComponent(path)
    }

    func request(_ path: String, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: url(path))
        request.httpMethod = method
        if !token.isEmpty {
            request.setValue("token \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }
}

/// A terminal on a Jupyter server's `/api/terminals`, spoken over
/// terminado's websocket protocol: `["stdin", text]` and
/// `["set_size", rows, cols]` out, `["stdout", text]` and `["disconnect"]`
/// in. Works with Ganymede (0.5 and later) and with `jupyter_server`.
///
/// The terminal is created on `start` and deleted on `close`, so closing
/// the window ends the shell.
@MainActor
final class JupyterTerminalTransport: TerminalTransport {
    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    var onOutput: ((ArraySlice<UInt8>) -> Void)?
    var onClose: ((String?) -> Void)?
    let endpoint: ServerEndpoint
    /// The terminal's name on the server, once created.
    private(set) var name: String?
    private let cwd: String?
    private let session: URLSession
    private var socket: URLSessionWebSocketTask?
    private var size: (cols: Int, rows: Int)?
    private var ended = false
    /// Bytes of a UTF-8 character split across `send` calls.
    private var partial: [UInt8] = []

    init(endpoint: ServerEndpoint, cwd: String? = nil, session: URLSession = .shared) {
        self.endpoint = endpoint
        self.cwd = cwd
        self.session = session
    }

    func start() {
        Task { await connect() }
    }

    func send(_ data: ArraySlice<UInt8>) {
        let (complete, rest) = Self.splitUTF8(partial + data)
        partial = rest
        guard !complete.isEmpty else { return }
        message(["stdin", String(decoding: complete, as: UTF8.self)])
    }

    /// Splits off a trailing incomplete UTF-8 sequence, so a character
    /// split across chunks is not sent as U+FFFD. Invalid bytes are not
    /// held back.
    nonisolated static func splitUTF8(_ bytes: [UInt8]) -> (complete: [UInt8], rest: [UInt8]) {
        // A lead byte is at most 3 bytes before the end of an incomplete sequence.
        var i = bytes.count - 1
        while i >= 0, i >= bytes.count - 3, bytes[i] & 0xC0 == 0x80 {
            i -= 1
        }
        guard i >= 0 else { return (bytes, []) }
        let lead = bytes[i]
        let length: Int
        switch lead {
        case 0xC0...0xDF: length = 2
        case 0xE0...0xEF: length = 3
        case 0xF0...0xF7: length = 4
        default: return (bytes, [])
        }
        guard bytes.count - i < length else { return (bytes, []) }
        return (Array(bytes[..<i]), Array(bytes[i...]))
    }

    func resize(cols: Int, rows: Int) {
        guard cols > 0, rows > 0 else { return }
        size = (cols, rows)
        message(["set_size", rows, cols])
    }

    func close() {
        guard !ended else { return }
        ended = true
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        if let name {
            delete(name)
        }
    }

    private func connect() async {
        do {
            let name = try await create()
            guard !ended else {
                delete(name)
                return
            }
            self.name = name
            let socket = session.webSocketTask(with: websocketRequest(name))
            self.socket = socket
            socket.resume()
            if let size {
                message(["set_size", size.rows, size.cols])
            }
            receive(socket)
        } catch {
            finish(error.localizedDescription)
        }
    }

    private func create() async throws -> String {
        var request = endpoint.request("api/terminals", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: String] = [:]
        if let cwd {
            body["cwd"] = cwd
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            throw Failure(message: status == 404
                ? "This server has no terminals."
                : "The server refused a terminal (HTTP \(status)).")
        }
        guard let model = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let name = model["name"] as? String
        else {
            throw Failure(message: "The server's answer named no terminal.")
        }
        return name
    }

    private func websocketRequest(_ name: String) -> URLRequest {
        let escaped = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        var request = endpoint.request("terminals/websocket/\(escaped)")
        if var parts = URLComponents(url: request.url!, resolvingAgainstBaseURL: false) {
            parts.scheme = parts.scheme == "https" ? "wss" : "ws"
            request.url = parts.url
        }
        return request
    }

    private func receive(_ socket: URLSessionWebSocketTask) {
        socket.receive { [weak self] result in
            Task { @MainActor in
                self?.handle(result, from: socket)
            }
        }
    }

    private func handle(_ result: Result<URLSessionWebSocketTask.Message, Error>, from socket: URLSessionWebSocketTask) {
        guard !ended, socket === self.socket else { return }
        switch result {
        case .failure(let error):
            finish(error.localizedDescription)
        case .success(.string(let text)):
            guard let data = text.data(using: .utf8),
                  let message = try? JSONSerialization.jsonObject(with: data) as? [Any],
                  let kind = message.first as? String
            else {
                receive(socket)
                return
            }
            switch kind {
            case "stdout":
                if let text = message.dropFirst().first as? String {
                    onOutput?(Array(text.utf8)[...])
                }
            case "disconnect":
                finish(nil)
                return
            default:
                break
            }
            receive(socket)
        case .success:
            receive(socket)
        }
    }

    private func message(_ value: [Any]) {
        guard !ended, let socket,
              let data = try? JSONSerialization.data(withJSONObject: value),
              let text = String(data: data, encoding: .utf8)
        else { return }
        socket.send(.string(text)) { _ in }
    }

    private func finish(_ reason: String?) {
        guard !ended else { return }
        ended = true
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        onClose?(reason)
    }

    private func delete(_ name: String) {
        let escaped = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        let request = endpoint.request("api/terminals/\(escaped)", method: "DELETE")
        session.dataTask(with: request).resume()
    }
}
