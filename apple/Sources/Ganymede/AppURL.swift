import Foundation
import Observation

/// A `ganymede://` URL (#303): what it asks the app to do, and where to
/// send the answer. Launchers, Markdown links, `open` in a terminal and
/// other apps open these; `AppURLHandler` does what they ask, with the
/// operations Shortcuts uses (`NotebookActions`).
///
///     ganymede://open?path=…
///     ganymede://new?dir=…[&name=…][&template=…]
///     ganymede://run?path=…[&cell=id|tag][&restart=0][&timeout=600]
///     ganymede://x-callback-url/<route>?…&x-success=…&x-error=…&x-cancel=…
///
/// Paths are file paths: absolute, `~/…`, or relative to the folder the
/// app's server serves.
struct AppURL: Equatable {
    enum Command: Equatable {
        case open(path: String)
        case new(dir: String, name: String?, template: String?)
        /// `cell`: a cell id, or a tag; nil runs every code cell.
        case run(path: String, cell: String?, restart: Bool, timeout: Int)
    }

    /// x-callback-url's answers (x-callback-url.com): URLs to open with
    /// the result, the error, or when the person cancels.
    struct Callback: Equatable {
        var success: URL?
        var error: URL?
        var cancel: URL?
    }

    static let scheme = "ganymede"

    var command: Command
    /// Set for `x-callback-url/<route>`, even with none of its URLs.
    var callback: Callback?

    /// Seconds a run may take, as the Shortcuts actions allow.
    static let timeouts = 1...3600
    static let defaultTimeout = 600

    init(command: Command, callback: Callback? = nil) {
        self.command = command
        self.callback = callback
    }

    init(_ url: URL) throws {
        guard url.scheme?.lowercased() == Self.scheme,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { throw AppURLError.notOurs }
        let host = parts.host?.lowercased() ?? ""
        var route = host
        if host == "x-callback-url" {
            route = parts.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
        }
        // The last of a repeated item wins.
        var query: [String: String] = [:]
        for item in parts.queryItems ?? [] {
            query[item.name] = item.value ?? ""
        }
        func value(_ name: String) -> String? {
            query[name].flatMap { $0.isEmpty ? nil : $0 }
        }
        func required(_ name: String) throws -> String {
            guard let value = value(name) else { throw AppURLError.missing(name) }
            return value
        }

        if host == "x-callback-url" {
            callback = Callback(
                success: try value("x-success").map { try Self.callbackURL($0, "x-success") },
                error: try value("x-error").map { try Self.callbackURL($0, "x-error") },
                cancel: try value("x-cancel").map { try Self.callbackURL($0, "x-cancel") }
            )
        }

        switch route {
        case "open":
            command = .open(path: try required("path"))
        case "new":
            command = .new(dir: try required("dir"), name: value("name"), template: value("template"))
        case "run":
            // The run contract's parameters (ganymede#650) need a run in a
            // fresh kernel, which the server doesn't offer yet (ganymede#652).
            if query.keys.contains(where: { $0 == "params" || $0.hasPrefix("p.") }) {
                throw AppURLError.parametersUnsupported
            }
            var restart = true
            if let flag = value("restart") {
                guard let parsed = Self.bool(flag) else { throw AppURLError.badValue("restart", flag) }
                restart = parsed
            }
            var timeout = Self.defaultTimeout
            if let text = value("timeout") {
                guard let seconds = Int(text), Self.timeouts.contains(seconds) else {
                    throw AppURLError.badValue("timeout", text)
                }
                timeout = seconds
            }
            command = .run(path: try required("path"), cell: value("cell"), restart: restart, timeout: timeout)
        case "":
            throw AppURLError.missing("route")
        default:
            throw AppURLError.unknownRoute(route)
        }
    }

    /// Whether the command runs code, which needs the person's yes.
    var runsCode: Bool {
        if case .run = command { return true }
        return false
    }

    private static func bool(_ text: String) -> Bool? {
        switch text.lowercased() {
        case "1", "true", "yes": true
        case "0", "false", "no": false
        default: nil
        }
    }

    /// A callback must be a URL with a scheme, and not a file.
    private static func callbackURL(_ text: String, _ name: String) throws -> URL {
        guard let url = URL(string: text), let scheme = url.scheme, scheme.lowercased() != "file" else {
            throw AppURLError.badValue(name, text)
        }
        return url
    }

    // MARK: Paths

    /// The file a URL's path names: absolute, `~/…` under `home`, or else
    /// relative to `root`, the folder the app's server serves.
    static func fileURL(_ path: String, root: URL, home: URL) -> URL {
        if path.hasPrefix("/") { return URL(fileURLWithPath: path).standardizedFileURL }
        if path == "~" { return home.standardizedFileURL }
        if path.hasPrefix("~/") {
            return home.appendingPathComponent(String(path.dropFirst(2))).standardizedFileURL
        }
        return root.appendingPathComponent(path).standardizedFileURL
    }

    // MARK: Answers

    /// `base` with `items` added to its query, each value encoded so that
    /// `&`, `=`, `+` and `#` in it stay part of the value.
    static func adding(_ items: [URLQueryItem], to base: URL) -> URL {
        guard var parts = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return base }
        let added = items.map { "\(encode($0.name))=\(encode($0.value ?? ""))" }
        let query = ([parts.percentEncodedQuery].compactMap { $0 }.filter { !$0.isEmpty } + added)
            .joined(separator: "&")
        parts.percentEncodedQuery = query.isEmpty ? nil : query
        return parts.url ?? base
    }

    private static let unreserved = CharacterSet(
        charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"
    )

    private static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? value
    }

    /// x-callback-url's error answer.
    static func errorItems(_ error: Error) -> [URLQueryItem] {
        let code = (error as? AppURLError)?.code ?? 1
        return [
            URLQueryItem(name: "errorCode", value: String(code)),
            URLQueryItem(name: "errorMessage", value: error.localizedDescription),
        ]
    }

    /// The text of the cells' outputs, in order, as the Shortcuts actions
    /// give it when used as text: streams as written, the rest a line each.
    static func outputText(_ cells: [NotebookCell]) -> String {
        var text = ""
        for output in cells.flatMap(\.outputs) {
            guard let piece = output.text ?? output.json, !piece.isEmpty else { continue }
            if !text.isEmpty && !text.hasSuffix("\n") { text += "\n" }
            text += piece
        }
        return text
    }
}

enum AppURLError: LocalizedError, Equatable {
    case notOurs
    case unknownRoute(String)
    case missing(String)
    case badValue(String, String)
    case parametersUnsupported
    case cancelled

    var errorDescription: String? {
        switch self {
        case .notOurs: "This isn’t a ganymede:// URL."
        case .unknownRoute(let route): "Ganymede has no “\(route)” URL; it has open, new and run."
        case .missing(let name): "The URL needs “\(name)”."
        case .badValue(let name, let value): "“\(value)” isn’t a valid \(name)."
        case .parametersUnsupported: "This version of Ganymede can’t run a notebook with parameters from a URL."
        case .cancelled: "The run was cancelled."
        }
    }

    /// x-callback-url's `errorCode`: 2 for a bad URL, 3 cancelled; 1 for
    /// anything else (the notebook or the server).
    var code: Int {
        switch self {
        case .cancelled: 3
        default: 2
        }
    }
}

/// Notebooks the person let `ganymede://run` run without asking ("Always
/// allow"), by file path. Settings › General lists them with Revoke.
@MainActor
@Observable
final class URLRunPermissions {
    static let shared = URLRunPermissions()
    static let defaultsKey = "urlRunAllowedNotebooks"

    @ObservationIgnored private let defaults: UserDefaults
    private(set) var paths: [String]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        paths = defaults.stringArray(forKey: Self.defaultsKey) ?? []
    }

    func allows(_ url: URL) -> Bool {
        paths.contains(Self.key(url))
    }

    func allow(_ url: URL) {
        let key = Self.key(url)
        guard !paths.contains(key) else { return }
        paths.append(key)
        paths.sort { $0.localizedStandardCompare($1) == .orderedAscending }
        save()
    }

    func revoke(_ path: String) {
        paths.removeAll { $0 == path }
        save()
    }

    func revokeAll() {
        paths = []
        save()
    }

    private func save() {
        defaults.set(paths, forKey: Self.defaultsKey)
    }

    /// One key per file, however the URL spelled its path.
    private static func key(_ url: URL) -> String {
        url.standardizedFileURL.resolvingSymlinksInPath().path
    }
}
