import DeviceBridge
import Foundation
import Observation

/// A `ganymede://` URL (#303): what it asks the app to do, and where to
/// send the answer. Launchers, Markdown links, `open` in a terminal and
/// other apps open these; `AppURLHandler` does what they ask, with the
/// operations Shortcuts uses (`NotebookActions`).
///
///     ganymede://open?path=…
///     ganymede://open?folder=<name>&file=<path in that folder>
///     ganymede://new?dir=…[&name=…][&template=…]
///     ganymede://run?path=…[&cell=id|tag][&restart=0][&timeout=600]
///     ganymede://run?path=…&p.NAME=VALUE…|&params=<JSON object>[&timeout=600]
///     ganymede://x-callback-url/<route>?…&x-success=…&x-error=…&x-cancel=…
///
/// Paths are file paths: absolute, `~/…`, or relative to the folder the
/// app's server serves. On iPad and iPhone `open` works only in the folders
/// the person granted and the one the app has open (`LinkFolders`); `folder`
/// and `file` name a notebook by the granted folder's name, as a link made
/// where the full path isn't known does (#640).
struct AppURL: Equatable {
    enum Command: Equatable {
        case open(path: String)
        /// `file` is relative to the granted folder named `folder` (#640).
        case openInFolder(folder: String, file: String)
        case new(dir: String, name: String?, template: String?)
        /// `cell`: a cell id, or a tag; nil runs every code cell.
        /// `params`: the run contract's parameters (ganymede#650), as a
        /// JSON object's text; a run with them goes to a fresh kernel.
        case run(path: String, cell: String?, restart: Bool, timeout: Int, params: String? = nil)
    }

    /// x-callback-url's answers (x-callback-url.com): URLs to open with
    /// the result, the error, or when the person cancels.
    struct Callback: Equatable {
        var success: URL?
        var error: URL?
        var cancel: URL?

        /// Where a run's output or error goes, as `scheme://host` each,
        /// for the person to see before it runs; nil when nowhere.
        var destination: String? {
            let places = Set([success, error].compactMap { url -> String? in
                guard let url, let scheme = url.scheme?.lowercased() else { return nil }
                return "\(scheme)://\(url.host?.lowercased() ?? "")"
            })
            return places.isEmpty ? nil : places.sorted().joined(separator: ", ")
        }
    }

    static let scheme = "ganymede"

    /// Where a Shortcuts action's run sends its output, as
    /// `URLRunPermissions` keeps it (#586). A link's destination is always
    /// `scheme://host`, so the two never share a key.
    static let shortcutsDestination = "Shortcuts actions"

    /// The host of Shortcuts' callbacks, `ganymede://device-callback/…`
    /// (ganymede-device#40), which `KernelHost.shortcuts` takes; any other
    /// `ganymede://` URL is a link to open.
    static let shortcutsCallbackHost = "device-callback"

    /// `url` with `.`, `..` and symlinks resolved, so two spellings of one
    /// place (`/var` and `/private/var`) compare equal. Foundation's
    /// `resolvingSymlinksInPath` leaves a path alone whose last component
    /// doesn't exist, and drops `/private` only from a path that exists,
    /// so a missing file would not match its folder. This resolves the
    /// deepest part that exists, and puts the rest after it.
    /// A symlink that points at nothing is there, and is followed to where
    /// it points (up to `maxLinks` of them in a row), so a dangling link
    /// that leaves a folder doesn't look like a missing file inside it.
    static func resolvedURL(_ url: URL, fileManager: FileManager = .default, linksFollowed: Int = 0) -> URL {
        var existing = url.standardizedFileURL
        var missing: [String] = []
        while existing.path != "/", !fileManager.fileExists(atPath: existing.path) {
            if linksFollowed < maxLinks,
               let destination = try? fileManager.destinationOfSymbolicLink(atPath: existing.path) {
                let target = destination.hasPrefix("/")
                    ? URL(fileURLWithPath: destination)
                    : existing.deletingLastPathComponent().appendingPathComponent(destination)
                var followed = resolvedURL(target, fileManager: fileManager, linksFollowed: linksFollowed + 1)
                for name in missing { followed.appendPathComponent(name) }
                return followed
            }
            missing.insert(existing.lastPathComponent, at: 0)
            existing = existing.deletingLastPathComponent()
        }
        var resolved = existing.resolvingSymlinksInPath()
        for name in missing { resolved.appendPathComponent(name) }
        return resolved
    }

    private static let maxLinks = 16

    /// Whether `a` and `b` are the same place, by whatever spelling.
    static func isSame(_ a: URL, _ b: URL) -> Bool {
        resolvedURL(a).path == resolvedURL(b).path
    }

    /// Whether `url` is one of `folders` or inside one.
    static func isInside(_ url: URL, anyOf folders: [URL]) -> Bool {
        let path = resolvedURL(url).path
        return folders.contains { contains(base: resolvedURL($0).path, path) }
    }

    /// Whether `path` is `base` or inside it, both already resolved.
    static func contains(base: String, _ path: String) -> Bool {
        path == base || path.hasPrefix(base.hasSuffix("/") ? base : base + "/")
    }

    /// Whether a `new` link must ask first (#586): unless it writes into
    /// one of `trusted` (Settings' folders) and copies a template from
    /// one, if any.
    static func newNeedsConfirmation(folder: URL, template: URL?, trusted: [URL]) -> Bool {
        !isInside(folder, anyOf: trusted) || template.map { !isInside($0, anyOf: trusted) } == true
    }

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
            // `path` wins when a link has both forms.
            if let path = value("path") {
                command = .open(path: path)
            } else if let folder = value("folder") {
                command = .openInFolder(folder: folder, file: try required("file"))
            } else {
                throw AppURLError.missing("path")
            }
        case "new":
            command = .new(dir: try required("dir"), name: value("name"), template: value("template"))
        case "run":
            let params = try Self.params(parts.queryItems ?? [])
            if params != nil, value("cell") != nil { throw AppURLError.cellWithParameters }
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
            command = .run(
                path: try required("path"), cell: value("cell"), restart: restart, timeout: timeout, params: params
            )
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

    /// The run contract's parameters in a query: `params=` (a JSON object),
    /// then each `p.NAME=VALUE` over it, its value JSON if it parses and
    /// else a string, as `ganymede execute -p` reads them. Nil when there
    /// are none; else a JSON object's text, keys sorted.
    static func params(_ items: [URLQueryItem]) throws -> String? {
        var params: [String: Any]?
        for item in items where item.name.lowercased() == "params" {
            let text = item.value ?? ""
            guard let object = NotebookActions.paramsObject(text) else { throw AppURLError.badValue("params", text) }
            params = object
        }
        for item in items where item.name.lowercased().hasPrefix("p.") {
            let name = String(item.name.dropFirst(2))
            guard !name.isEmpty else { throw AppURLError.badValue("parameter name", item.name) }
            let text = item.value ?? ""
            let value = (try? JSONSerialization.jsonObject(with: Data(text.utf8), options: .fragmentsAllowed)) ?? text
            params = (params ?? [:]).merging([name: value]) { $1 }
        }
        return try params.map { try NotebookActions.paramsText($0) }
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
    case cellWithParameters
    case cancelled
    /// A `folder=` link reached the Mac, which opens files by `path=` (#640).
    case folderLinkNotOnMac
    /// A route iPad and iPhone don't do (#640): `run` and `new`.
    case macOnly(String)

    var errorDescription: String? {
        switch self {
        case .notOurs: "This isn’t a ganymede:// URL."
        case .unknownRoute(let route): "Ganymede has no “\(route)” URL; it has open, new and run."
        case .missing(let name): "The URL needs “\(name)”."
        case .badValue(let name, let value): "“\(value)” isn’t a valid \(name)."
        case .cellWithParameters: "A run with parameters runs the whole notebook; leave out “cell”."
        case .cancelled: "The run was cancelled."
        case .folderLinkNotOnMac: "Links with a folder open on iPad and iPhone. On the Mac, a link names the notebook with path=."
        case .macOnly(let route): "“\(route)” links work only on the Mac."
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
/// allow"), by file path and where the run's output goes: a link that
/// answers an x-callback URL is allowed only for that callback's scheme
/// and host, so allowing a notebook for Shortcuts doesn't let a web page
/// run it and read its output. Settings › General lists them with Revoke.
/// Runs with parameters are allowed separately, since parameters can
/// reach further than the notebook's own run (a path, a command).
/// A key is the path, then `separator` and the destination if any, then
/// `separator` and `withParams` for runs with parameters.
///
/// An answer is for the file it was given for (#584). Each key has the
/// stamp (`FileStamp`) of its file as the app last saw it, and is forgotten
/// when the file no longer matches: it was changed by something other than
/// the app's server (git, Finder, another editor, a sync), and the next run
/// asks again. The server's own writes (a window's save, a run saving its
/// outputs, a room's autosave, an agent over MCP) keep it: the server
/// reports each one (`KeptAnswers.watch`) and `serverWrote` moves the stamp
/// along. A key with no stamp (kept before stamps, or while the file wasn't
/// there) takes the file's stamp when it is next checked. A file that isn't
/// there leaves the key alone, so a notebook that is moved back, or still
/// being written, keeps its answer; a different file made at that path has
/// another inode.
@MainActor
@Observable
final class URLRunPermissions {
    static let shared = URLRunPermissions()
    static let defaultsKey = "urlRunAllowedNotebooks"
    /// Each key's stamp, `[key: stamp]`, apart from `defaultsKey` so what
    /// Settings lists, and what older versions stored, stay as they are.
    static let stampsKey = "urlRunAllowedStamps"
    static let separator: Character = "\u{1F}"
    static let withParams = "+params"

    @ObservationIgnored private let defaults: UserDefaults
    /// The stamp of the file at a path now, nil when it isn't there.
    /// `FileStamp.of`; tests pass their own.
    @ObservationIgnored private let stamp: (String) -> String?
    /// The server's reported writes, which explain a stamp that moved
    /// before `serverWrote` caught up; nil for none.
    @ObservationIgnored private let log: ServerWriteLog?
    @ObservationIgnored private var stamps: [String: String]
    private(set) var paths: [String]

    init(
        defaults: UserDefaults = .standard, stamp: @escaping (String) -> String? = FileStamp.of,
        log: ServerWriteLog? = ServerWriteLog.shared
    ) {
        self.defaults = defaults
        self.stamp = stamp
        self.log = log
        paths = defaults.stringArray(forKey: Self.defaultsKey) ?? []
        stamps = defaults.dictionary(forKey: Self.stampsKey) as? [String: String] ?? [:]
    }

    /// Whether the run is allowed: kept, and for the file as it is. A key
    /// whose file was changed since is forgotten here, and the run asks.
    func allows(_ url: URL, sendingTo destination: String?, withParameters: Bool = false) -> Bool {
        holds(Self.key(url, destination, withParameters))
    }

    func allow(_ url: URL, sendingTo destination: String?, withParameters: Bool = false) {
        let key = Self.key(url, destination, withParameters)
        stamps[key] = stamp(Self.parts(key).path)
        if !paths.contains(key) {
            paths.append(key)
            paths.sort { $0.localizedStandardCompare($1) == .orderedAscending }
        }
        save()
    }

    func revoke(_ path: String) {
        paths.removeAll { $0 == path }
        stamps[path] = nil
        save()
    }

    func revokeAll() {
        paths = []
        stamps = [:]
        save()
    }

    /// The server wrote the file at `path` (canonical), which had stamp
    /// `before` and now has `after`: the keys of that file move to `after`,
    /// when they were for the file as it was (`before`) or have no stamp
    /// yet. A key for some other stamp stays, and the next check forgets
    /// it: the file was changed by something else first, and the server's
    /// write doesn't make that change the app's. Nothing is saved when no
    /// key is for `path`, and nothing moves when `after` is nil (the server
    /// couldn't read the file again).
    func serverWrote(path: String, before: String?, after: String?) {
        guard let after else { return }
        var changed = false
        for key in paths {
            let was = stamps[key]
            guard was == nil || was == before, was != after,
                  FileStamp.canonical(Self.parts(key).path) == path
            else { continue }
            stamps[key] = after
            changed = true
        }
        if changed { save() }
    }

    /// Forgets every key whose file was changed since it was kept, so
    /// Settings lists only answers that still hold.
    func pruneStale() {
        for key in paths { _ = holds(key) }
    }

    /// Whether `key` is kept and its file is the one it was kept for:
    /// - a stamp that differs from the file's now: the key is revoked,
    ///   unless the server's reported writes lead from it to the file's
    ///   (the server wrote the file and `serverWrote` hasn't run yet), in
    ///   which case it takes the file's stamp;
    /// - no stamp, and the file is there: it takes the file's stamp (trust
    ///   on first use, for keys kept before stamps);
    /// - no file: the key stays.
    private func holds(_ key: String) -> Bool {
        guard paths.contains(key) else { return false }
        guard let now = stamp(Self.parts(key).path) else { return true }
        guard let was = stamps[key] else {
            stamps[key] = now
            save()
            return true
        }
        if was == now { return true }
        if log?.leads(path: FileStamp.canonical(Self.parts(key).path), from: was, to: now) == true {
            stamps[key] = now
            save()
            return true
        }
        revoke(key)
        return false
    }

    private func save() {
        defaults.set(paths, forKey: Self.defaultsKey)
        defaults.set(stamps, forKey: Self.stampsKey)
    }

    /// `url`'s path, one spelling per file.
    private static func filePath(_ url: URL) -> String {
        url.standardizedFileURL.resolvingSymlinksInPath().path
    }

    /// One key per file, however the URL spelled its path, and destination.
    private static func key(_ url: URL, _ destination: String?, _ withParameters: Bool) -> String {
        let path = filePath(url)
        return ([path, destination, withParameters ? withParams : nil] as [String?])
            .compactMap { $0 }
            .joined(separator: String(separator))
    }

    /// A key's notebook path, destination, and whether it allows runs with
    /// parameters, for Settings.
    static func parts(_ key: String) -> (path: String, destination: String?, withParameters: Bool) {
        var fields = key.split(separator: separator, omittingEmptySubsequences: false).map(String.init)
        let withParameters = fields.count > 1 && fields.last == withParams
        if withParameters { fields.removeLast() }
        return (fields.first ?? key, fields.count > 1 ? fields[1] : nil, withParameters)
    }
}

/// What the app does with kept answers when the server writes a notebook
/// (#584): the links' "Always allow" (`URLRunPermissions`), the device
/// ledger's answers (`PermissionLedger`) and the folders notebooks were
/// given (`FolderGrants`) follow the file. A change by anything but the
/// server forgets them; the server's own writes keep them.
enum KeptAnswers {
    /// Has `host` report each write it makes. Called for every server
    /// start, since a new server has no observer. A report goes to
    /// `ServerWriteLog.shared` at once, on the server's thread, so a check
    /// of a kept answer that runs before the main-actor hop below can
    /// still tell the server's write from an outside change; then to the
    /// stores on the main actor.
    static func watch(_ host: ServerHost) {
        host.setWriteObserver { path, before, after in
            ServerWriteLog.shared.record(path: path, before: before, after: after)
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    KeptAnswers.serverWrote(path: path, before: before, after: after)
                }
            }
        }
    }

    /// The server wrote the file at `path` (canonical): each kept answer
    /// for it moves to the file's new stamp. Local files only: the server
    /// reports files under its own root, never a machine's.
    @MainActor
    static func serverWrote(path: String, before: String?, after: String?) {
        serverWrote(
            path: path, before: before, after: after,
            links: .shared, ledger: PermissionLedger(store: AppGroup.ledgerStore()), folders: FolderGrants())
    }

    /// As above, on the stores given: tests pass their own.
    @MainActor
    static func serverWrote(
        path: String, before: String?, after: String?,
        links: URLRunPermissions, ledger: PermissionLedger, folders: FolderGrants
    ) {
        links.serverWrote(path: path, before: before, after: after)
        ledger.serverWrote(path: path, before: before, after: after)
        folders.serverWrote(path: path, before: before, after: after)
    }
}
