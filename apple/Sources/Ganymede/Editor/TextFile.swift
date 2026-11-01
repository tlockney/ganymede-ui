import Foundation

/// A text file on a Jupyter or Ganymede server, read and written through
/// `/api/contents` with `format=text`, so the editor works the same on the
/// app's own server and on a remote one (#122).
struct TextFileClient: Sendable {
    let endpoint: ServerEndpoint
    /// The file's path on the server, relative to its root.
    let path: String

    struct Failure: LocalizedError, Equatable {
        let message: String
        /// The server refused a save because the file changed on disk
        /// since `lastModified` (Ganymede answers 409).
        var conflict = false
        var errorDescription: String? { message }
    }

    /// The file as the server last reported it.
    struct Snapshot: Equatable, Sendable {
        /// Nil when only the metadata was asked for.
        var text: String?
        /// The server's `last_modified`, which changes when the file does.
        var lastModified: String
    }

    var name: String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    /// `GET`, with the content as text, or only the metadata.
    func readRequest(content: Bool) -> URLRequest {
        var request = endpoint.request(contentsPath)
        if let url = request.url, var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            parts.queryItems = content
                ? [
                    URLQueryItem(name: "type", value: "file"),
                    URLQueryItem(name: "format", value: "text"),
                    URLQueryItem(name: "content", value: "1"),
                ]
                : [URLQueryItem(name: "content", value: "0")]
            request.url = parts.url
        }
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return request
    }

    /// `PUT` of the whole file. With `lastModified`, Ganymede refuses the
    /// save (409) if the file changed on disk since then.
    func writeRequest(_ text: String, lastModified: String?) -> URLRequest {
        var request = endpoint.request(contentsPath, method: "PUT")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["type": "file", "format": "text", "content": text]
        if let lastModified { body["last_modified"] = lastModified }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return request
    }

    func read(content: Bool = true) async throws -> Snapshot {
        let (data, response) = try await URLSession.shared.data(for: readRequest(content: content))
        return try Self.snapshot(from: data, response: response, expectingText: content)
    }

    func write(_ text: String, lastModified: String?) async throws -> Snapshot {
        let request = writeRequest(text, lastModified: lastModified)
        let (data, response) = try await URLSession.shared.data(for: request)
        var snapshot = try Self.snapshot(from: data, response: response, expectingText: false)
        snapshot.text = text
        return snapshot
    }

    private var contentsPath: String { "api/contents/" + path }

    /// Reads a contents model, or the server's error.
    static func snapshot(from data: Data, response: URLResponse, expectingText: Bool) throws -> Snapshot {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard (200..<300).contains(status) else {
            let message = (json?["message"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            switch status {
            case 404:
                throw Failure(message: message ?? "The file no longer exists.")
            case 409:
                throw Failure(message: message ?? "The file changed on disk.", conflict: true)
            default:
                throw Failure(message: message ?? "The server answered \(status).")
            }
        }
        guard let json, let lastModified = json["last_modified"] as? String else {
            throw Failure(message: "The server's answer could not be read.")
        }
        guard expectingText else { return Snapshot(text: nil, lastModified: lastModified) }
        guard json["format"] as? String == "text", let text = json["content"] as? String else {
            throw Failure(message: "This is not a text file.")
        }
        return Snapshot(text: text, lastModified: lastModified)
    }
}

/// The languages the editor highlights, from the file name.
enum TextLanguage: String, CaseIterable, Sendable {
    case bash, javascript, json, markdown, python, toml, tsx, typescript, yaml

    init?(fileName: String) {
        let lower = fileName.lowercased()
        let ext = lower.split(separator: ".").count > 1 ? String(lower.split(separator: ".").last!) : ""
        switch ext {
        case "sh", "bash", "zsh": self = .bash
        case "js", "mjs", "cjs", "jsx": self = .javascript
        case "json", "jsonc", "geojson": self = .json
        case "md", "markdown": self = .markdown
        case "py", "pyi": self = .python
        case "toml": self = .toml
        case "tsx": self = .tsx
        case "ts", "mts", "cts": self = .typescript
        case "yaml", "yml": self = .yaml
        default:
            switch lower {
            case ".bashrc", ".bash_profile", ".zshrc", ".profile": self = .bash
            default: return nil
            }
        }
    }
}
