#if os(macOS)
import AppKit
import Observation
import os
#endif
import Foundation
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

/// What a notebook window shows: one notebook, or a folder of them. A
/// window with none shows the last folder opened (or the home folder).
enum WindowTarget: Codable, Hashable {
    case file(URL)
    case folder(URL)
    /// A DuckDB console on a folder (#729), in a tab of its own. The id
    /// makes each New DuckDB Console a window of its own: opening by value
    /// brings forward a window that has the value, and each console has a
    /// new engine. It is also the id of the console's record in the page's
    /// recent consoles (`session=` in its URL, #735), so a restored tab, or
    /// a recent console opened again, comes back as the same console.
    case console(folder: URL, id: UUID)
    /// A notebook or folder on a connected machine (#701), by its path on
    /// that machine, from its root, `/`-led. The machine is a `Place` id.
    case machineFile(machine: String, path: String)
    case machineFolder(machine: String, path: String)

    /// A machine's notebook or folder; nil for a malformed machine id.
    static func machine(_ id: String, path: String, isFolder: Bool) -> WindowTarget? {
        guard Place.isValidMachineID(id) else { return nil }
        // Never a path that climbs: it becomes the page's `open=` / `dir=`.
        guard !path.split(whereSeparator: { $0 == "/" || $0 == "\\" }).contains(where: {
            FolderEntry.isDotSegment(String($0))
        }) else { return nil }
        let clean = "/" + path.split(separator: "/").joined(separator: "/")
        return isFolder ? .machineFolder(machine: id, path: clean) : .machineFile(machine: id, path: clean)
    }

    /// Where this target's notebooks live.
    var place: Place {
        switch self {
        case .file, .folder, .console: .thisDevice
        case .machineFile(let id, _), .machineFolder(let id, _): .machine(id)
        }
    }

    /// From a URL the Finder or File > Open… hands over: a folder opens as
    /// one, anything else as a notebook.
    init(opening url: URL) {
        let standard = url.standardizedFileURL
        var isDirectory: ObjCBool = false
        if FileManager.default.fileExists(atPath: standard.path, isDirectory: &isDirectory),
           isDirectory.boolValue {
            self = .folder(standard)
        } else {
            self = .file(standard)
        }
    }

    /// What a page from the server shows: a DuckDB console (`console=duckdb`
    /// with its `dir=`, #729), or the notebook its `open=` names,
    /// or else the folder its `dir=` names (the sidebar's folder, #220), or
    /// else the server's root. The paths are from the server's root, `/`,
    /// form-encoded as URLSearchParams writes them. A console is read with
    /// its `session=` as the id, so it equals the tab's own target; with no
    /// `session` it has a new id, and only `shows(_:)` matches it to the
    /// tab, not `==`. Nil for a URL that
    /// isn't the app's page, which is served at the server's root: a file
    /// the page linked to, or an error page.
    init?(page: URL) {
        guard let parts = URLComponents(url: page, resolvingAgainstBaseURL: false),
              parts.path.isEmpty || parts.path == "/"
        else { return nil }
        let items = parts.percentEncodedQueryItems ?? []
        let machine = items.first { $0.name == "machine" }?.value?.removingPercentEncoding
        func path(_ name: String) -> String? {
            guard let value = items.first(where: { $0.name == name })?.value?
                .replacingOccurrences(of: "+", with: " ").removingPercentEncoding
            else { return nil }
            let path = value.split(separator: "/").joined(separator: "/")
            return path.isEmpty ? nil : path
        }
        if let machine, Place.isValidMachineID(machine) {
            // A machine's page: the paths are the machine's, not this device's.
            if let file = path("open"), let target = Self.machine(machine, path: file, isFolder: false) {
                self = target
            } else {
                // A `dir` that climbs is none: the root.
                self = Self.machine(machine, path: path("dir") ?? "", isFolder: true)
                    ?? .machineFolder(machine: machine, path: "/")
            }
        } else if let file = path("open") {
            // A notebook wins over `console`, as the page's `readLaunch` has it.
            self = .file(URL(fileURLWithPath: "/" + file, isDirectory: false).standardizedFileURL)
        } else if items.first(where: { $0.name == "console" })?.value == "duckdb" {
            let folder = path("dir").map { "/" + $0 } ?? "/"
            let session = items.first { $0.name == "session" }?.value.flatMap(UUID.init(uuidString:))
            self = .console(folder: URL(fileURLWithPath: folder, isDirectory: true), id: session ?? UUID())
        } else {
            let folder = path("dir").map { "/" + $0 } ?? "/"
            self = .folder(URL(fileURLWithPath: folder, isDirectory: true))
        }
    }

    var url: URL {
        switch self {
        case .file(let url), .folder(let url), .console(let url, _): url
        // The machine's path as a URL, for its name and folder only: it is
        // not a file on this device.
        case .machineFile(_, let path): URL(fileURLWithPath: path, isDirectory: false)
        case .machineFolder(_, let path): URL(fileURLWithPath: path, isDirectory: true)
        }
    }

    /// The folder the target is in, as a location (#740): a notebook's
    /// folder, or the folder. A file URL on this device, where a terminal
    /// opened from the window starts; a machine's is its
    /// `FolderEntry.machineURL`, which is never a file on this device.
    var folder: URL {
        switch self {
        case .file(let url): url.deletingLastPathComponent()
        case .folder(let url), .console(let url, _): url
        case .machineFile(let id, let path):
            Self.machineLocation(id, path: FolderEntry.parentPath(path))
        case .machineFolder(let id, let path):
            Self.machineLocation(id, path: path)
        }
    }

    /// A machine's location; for a malformed id a host-less URL, which is
    /// no machine's location (`FolderEntry.machineLocation` is nil), so
    /// nothing falls back to this device's disk.
    private static func machineLocation(_ id: String, path: String) -> URL {
        FolderEntry.machineURL(id, path: path) ?? URL(string: "\(FolderEntry.machineScheme):///")!
    }

    /// The window that opens a sidebar item: its machine's notebook or
    /// folder, or on this device what `init(opening:)` makes. Nil for a
    /// machine URL with a malformed id.
    init?(opening entry: FolderEntry) {
        if entry.url.scheme == FolderEntry.machineScheme {
            guard let location = FolderEntry.machineLocation(entry.url),
                  let target = Self.machine(location.id, path: location.path, isFolder: entry.isDirectory)
            else { return nil }
            self = target
        } else {
            self = WindowTarget(opening: entry.url)
        }
    }

    /// The folder window of `place`'s root: what the place menu opens.
    /// `device` is this device's folder.
    static func root(of place: Place, device: URL) -> WindowTarget? {
        switch place {
        case .thisDevice: .folder(device)
        case .machine(let id), .thisMac(let id): machine(id, path: "/", isFolder: true)
        }
    }

    /// What a new window shows: its own value, else what New Tab or New
    /// Window asked for (a machine's root too, #741), else `root`.
    static func opening(_ target: WindowTarget?, requested: WindowTarget?, root: URL) -> WindowTarget {
        target ?? requested ?? .folder(root)
    }

    /// What File > New Tab and New Window open from a window of `place`: a
    /// machine's window opens that machine's root, so the new window is on
    /// the same machine (#741); this device's, `folder` (the window's own)
    /// or else `root`. A nil `place` (no window) is this device.
    static func newTab(place: Place?, folder: URL?, root: URL) -> WindowTarget {
        if let place, place.isMachine, let target = Self.root(of: place, device: root) {
            return target
        }
        return .folder(folder ?? root)
    }

    /// The window subtitle (#812, #867): only where the notebook is saved —
    /// "Saved on <machine>", "Edited" or "Locked: changed on disk" — since
    /// where it runs and its kernel are the toolbar's chip. Without a
    /// notebook, "on <machine>" for a machine's window and nothing
    /// otherwise.
    static func subtitle(header: HeaderStatus?, machineName: String?) -> String {
        if let header { return header.save }
        guard let machineName, !machineName.isEmpty else { return "" }
        return "on \(machineName)"
    }

    /// The window title. A machine's window adds its name, so its tab
    /// can't be taken for a local one (`machineName`, from `Remote.title`).
    /// A notebook is called the title the page reports (#867, #892): its
    /// `metadata.title`, else its first level-1 heading's text, else the
    /// file's name.
    func displayTitle(machineName: String? = nil, metadataTitle: String? = nil) -> String {
        let base: String
        switch self {
        case .file(let url):
            base = Self.displayName(fileStem: url.deletingPathExtension().lastPathComponent,
                                    metadataTitle: metadataTitle)
        case .folder(let url): base = url.lastPathComponent.isEmpty ? url.path : url.lastPathComponent
        case .console(let url, _):
            base = "DuckDB · " + (url.lastPathComponent.isEmpty ? url.path : url.lastPathComponent)
        case .machineFile(_, let path):
            base = Self.displayName(
                fileStem: URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent,
                metadataTitle: metadataTitle)
        case .machineFolder(_, let path):
            let name = URL(fileURLWithPath: path, isDirectory: true).lastPathComponent
            base = name.isEmpty || path == "/" ? (machineName ?? "Machine") : name
        }
        guard let machineName, place.isMachine, base != machineName else { return base }
        return "\(base) · \(machineName)"
    }

    /// What a notebook's window is called (#867): the title the page reports
    /// (#892) — its `metadata.title`, else its first level-1 heading's text —
    /// else the file's name without the date an agent's journal starts it
    /// with ("2026-11-09-fremont-bridge" is "fremont-bridge"), so the title
    /// reads as a title where the sidebar keeps the file's name. A name that
    /// is only a date keeps it.
    static func displayName(fileStem: String, metadataTitle: String?) -> String {
        if let title = metadataTitle?.trimmingCharacters(in: .whitespacesAndNewlines),
           !title.isEmpty {
            return title
        }
        let range = NSRange(fileStem.startIndex..., in: fileStem)
        let stripped = datePrefix?.stringByReplacingMatches(
            in: fileStem, range: range, withTemplate: "") ?? fileStem
        return stripped.isEmpty ? fileStem : stripped
    }

    /// The day a journal's file name starts with: `YYYY-MM-DD-`.
    private static let datePrefix = try? NSRegularExpression(pattern: #"^\d{4}-\d{2}-\d{2}-"#)

    var title: String { displayTitle() }

    /// The tab's title: a console shows the name the page reports (#735),
    /// the rest their usual title.
    func tabTitle(consoleName: String?, machineName: String? = nil,
                 metadataTitle: String? = nil) -> String {
        if case .console = self, let name = consoleName?.trimmingCharacters(in: .whitespaces), !name.isEmpty {
            return name
        }
        return displayTitle(machineName: machineName, metadataTitle: metadataTitle)
    }

    /// The page's `metadata.title`, once the page reports the file `target`
    /// is for (#871): until then `metadataTitle` is the previous
    /// notebook's, and a file window that just changed target would take
    /// its title for a moment. The file's name is enough to tell across
    /// server spellings of the folder, with a known limit: a file of the
    /// same name in another folder can show the old title until the page
    /// posts. A folder window has no expected file and shows whichever
    /// notebook its page has open.
    static func shownTitle(
        target: WindowTarget, pagePath: String?, metadataTitle: String?
    ) -> String? {
        let expected: String? = switch target {
        case .file(let url): url.lastPathComponent
        case .machineFile(_, let path): (path as NSString).lastPathComponent
        default: nil
        }
        if let expected, expected != pagePath.map({ ($0 as NSString).lastPathComponent }) {
            return nil
        }
        return metadataTitle
    }

    /// Whether this window already shows `page`, a target read from its
    /// page's URL (`init?(page:)`): the same, but a console is the console
    /// of that folder whatever its id.
    func shows(_ page: WindowTarget) -> Bool {
        if case .console(let mine, _) = self, case .console(let theirs, _) = page {
            return mine.standardizedFileURL.path == theirs.standardizedFileURL.path
        }
        return self == page
    }

    /// The notebook or data file target for `serverPath` in `place` (#884):
    /// a machine target for `.machine` / `.thisMac`, or a root-relative
    /// local file URL for `.thisDevice`.
    static func file(serverPath: String, in place: Place) -> WindowTarget? {
        if let id = place.machineID {
            return machine(id, path: serverPath, isFolder: false)
        }
        let clean = String(serverPath.drop { $0 == "/" })
        guard !clean.isEmpty else { return nil }
        return .file(URL(fileURLWithPath: "/" + clean, isDirectory: false).standardizedFileURL)
    }

    /// Whether `self` and `other` name the same open notebook, data file,
    /// folder, or console for focusing an existing tab (#884). Local file
    /// URLs resolve symlinks so `/tmp/...` and `/private/tmp/...` match.
    func matchesOpenTarget(_ other: WindowTarget) -> Bool {
        switch (self, other) {
        case (.file(let a), .file(let b)):
            return Self.sameFileURL(a, b)
        case (.folder(let a), .folder(let b)):
            return Self.sameFileURL(a, b)
        case (.console(let a, let idA), .console(let b, let idB)):
            return idA == idB && Self.sameFileURL(a, b)
        case (.machineFile(let m1, let p1), .machineFile(let m2, let p2)):
            return m1.caseInsensitiveCompare(m2) == .orderedSame && p1 == p2
        case (.machineFolder(let m1, let p1), .machineFolder(let m2, let p2)):
            return m1.caseInsensitiveCompare(m2) == .orderedSame && p1 == p2
        default:
            return false
        }
    }

    private static func sameFileURL(_ a: URL, _ b: URL) -> Bool {
        let sa = a.standardizedFileURL
        let sb = b.standardizedFileURL
        if sa.path == sb.path { return true }
        return sa.resolvingSymlinksInPath().path == sb.resolvingSymlinksInPath().path
    }

    /// The page for this target on a server rooted at `/`, as ganymede-ui
    /// reads it (#129): `open=` a notebook's path, or `dir=` a folder's.
    /// `server` is the URL the server printed (with its token); `kernels`
    /// says where kernels run. With `nativeChrome` the page leaves the
    /// sidebar and toolbar to the app (`chrome=native`, #205).
    func pageURL(
        server: URL, kernels: String, nativeChrome: Bool = false, machineName: String? = nil
    ) -> URL {
        guard var parts = URLComponents(url: server, resolvingAgainstBaseURL: false) else {
            return server
        }
        var added: [(String, String)] = {
            switch self {
            case .file(let url): [("kernels", kernels), ("open", url.path)]
            case .folder(let url): [("kernels", kernels), ("dir", url.path)]
            // The page keeps `console` in its URL, so a reload keeps the console.
            case .console(let url, let id):
                [("kernels", kernels), ("dir", url.path), ("console", "duckdb"),
                 ("session", id.uuidString.lowercased())]
            case .machineFile(_, let path): [("kernels", kernels), ("open", path)]
            case .machineFolder(_, let path): [("kernels", kernels), ("dir", path)]
            }
        }()
        added += place.pageQuery(name: machineName)
        // The window draws the sidebar and toolbar, a machine's too (#740).
        if nativeChrome { added.append(("chrome", "native")) }
        // Encoded by hand: URLComponents leaves `+` and `&` alone in query
        // values, which a page reads as a space and a separator.
        let encoded = added.map { name, value in "\(name)=\(Self.encode(value))" }
        parts.percentEncodedQuery = ([parts.percentEncodedQuery].compactMap { $0 } + encoded)
            .filter { !$0.isEmpty }
            .joined(separator: "&")
        return parts.url ?? server
    }

    /// ASCII letters, digits and a few marks; everything else, including
    /// non-ASCII letters, is percent-encoded as UTF-8.
    private static let queryValue = CharacterSet(
        charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~/"
    )

    private static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: queryValue) ?? value
    }
}

#if os(macOS)
/// Notebooks and folders the Finder asked the app to open (double-click,
/// Open With, the Dock), until a window takes them (#228). The app
/// delegate adds them; notebook windows register here and watch
/// `pending`, and the first to see them takes them all.
@MainActor
@Observable
final class OpenRequests {
    private(set) var pending: [WindowTarget] = []
    /// Until shortly after the app has finished launching.
    @ObservationIgnored private var launching = true
    /// Whether `pending` came while the app launched: the window it opened
    /// on nothing then shows the first itself, instead of staying empty
    /// beside a window for it.
    @ObservationIgnored private var atLaunch = false
    /// The first file asked for while the app launched, to bring forward
    /// once launch ends: windows the system restores can come back in
    /// front of it (#268).
    @ObservationIgnored private var firstAtLaunch: WindowTarget?
    /// The window to bring forward, set when launch ends.
    private(set) var front: WindowTarget?
    /// The notebook windows, by id: whether each shows nothing yet.
    @ObservationIgnored private var windows: [UUID: Bool] = [:]
    /// Opens a notebook window, for requests that come after launch. Set by
    /// the notebook windows.
    @ObservationIgnored var openWindow: ((WindowTarget) -> Void)?
    /// The same, from the app's menus, for when no notebook window has
    /// appeared: launched from the Finder to open a file, SwiftUI may make
    /// no window at all, leaving the app with no UI (#266).
    @ObservationIgnored var fallbackOpenWindow: ((WindowTarget) -> Void)?

    func useFallback(_ open: @escaping (WindowTarget) -> Void) {
        fallbackOpenWindow = open
    }

    /// Adds the file URLs among `urls`, each once.
    func add(_ urls: [URL]) {
        var added = pending
        for target in urls.filter(\.isFileURL).map(WindowTarget.init(opening:))
        where !added.contains(target) {
            added.append(target)
        }
        guard added != pending else { return }
        if launching {
            atLaunch = true
            if firstAtLaunch == nil { firstAtLaunch = added.first }
        }
        // Once launched, each opens in a window (a new tab, or the window
        // already showing it) at once, without waiting for a window to
        // notice the queue: nothing is left pending if none does.
        if !launching, let openWindow = openWindow ?? fallbackOpenWindow {
            added.forEach(openWindow)
            return
        }
        pending = added
    }

    /// The window `front` named has come forward.
    func broughtForward() {
        front = nil
    }

    /// Ends launch. Files no window took by now (none opened) each get a
    /// window.
    func finishLaunching() {
        launching = false
        if !pending.isEmpty, let openWindow = openWindow ?? fallbackOpenWindow {
            let left = pending
            pending = []
            atLaunch = false
            left.forEach(openWindow)
        }
        front = firstAtLaunch
        firstAtLaunch = nil
    }

    /// The file URLs an Open Documents Apple Event names: a list, or one.
    nonisolated static func fileURLs(in event: NSAppleEventDescriptor) -> [URL] {
        guard let files = event.paramDescriptor(forKeyword: keyDirectObject) else { return [] }
        guard files.numberOfItems > 0 else { return files.fileURLValue.map { [$0] } ?? [] }
        return (1...files.numberOfItems).compactMap { files.atIndex($0)?.fileURLValue }
    }

    /// A notebook window, and whether it shows nothing yet.
    func register(_ id: UUID, blank: Bool) {
        windows[id] = blank
    }

    func unregister(_ id: UUID) {
        windows[id] = nil
    }

    /// Takes every request. A window opened on nothing (`blank`) shows the
    /// first itself if they came at launch; the rest each get a window.
    /// While a blank window waits for them at launch, other windows (ones
    /// restored with a notebook) take nothing.
    func take(blank: Bool) -> (shown: WindowTarget?, others: [WindowTarget]) {
        if atLaunch, !blank, windows.values.contains(true) { return (nil, []) }
        defer {
            pending = []
            atLaunch = false
        }
        guard blank, atLaunch, let first = pending.first else { return (nil, pending) }
        return (first, Array(pending.dropFirst()))
    }
}
#endif

/// A tab the page asks the app to open (its `openTab` message, #729), by
/// server paths: the Mac's server is rooted at `/`.
enum TabRequest: Equatable {
    /// A notebook or data file.
    case file(path: String)
    /// A DuckDB console on a folder; "" is the root. With a `session`, the
    /// recent console that id names (#735), else a new one.
    case duckdbConsole(folder: String, session: UUID? = nil)

    /// From the message body: `{ path }`, or `{ console: "duckdb", folder,
    /// session? }`. Nil for anything else; a `session` that isn't a UUID
    /// is ignored.
    init?(body: Any) {
        guard let fields = body as? [String: Any] else { return nil }
        if let console = fields["console"] as? String {
            guard console == "duckdb" else { return nil }
            self = .duckdbConsole(
                folder: fields["folder"] as? String ?? "",
                session: (fields["session"] as? String).flatMap(UUID.init(uuidString:)))
        } else if let path = fields["path"] as? String, !path.isEmpty {
            self = .file(path: path)
        } else {
            return nil
        }
    }

    /// The window that opens it, on a server rooted at `root`. A notebook,
    /// data file or folder opens as `WindowTarget(opening:)` would, which
    /// brings forward a window already showing it; a console is the
    /// request's `session`, so a window already showing that console (on
    /// the same folder) comes forward, else a new `id`.
    func target(root: URL, id: UUID = UUID()) -> WindowTarget {
        switch self {
        case .file(let path):
            return WindowTarget(opening: root.appendingPathComponent(path, isDirectory: false))
        case .duckdbConsole(let folder, let session):
            let url = folder.isEmpty ? root : root.appendingPathComponent(folder, isDirectory: true)
            return .console(folder: url.standardizedFileURL, id: session ?? id)
        }
    }
}

extension WindowTarget {
    /// For `@SceneStorage`, which keeps strings: JSON, or "" for none.
    static func saved(_ target: WindowTarget?) -> String {
        guard let target, let data = try? JSONEncoder().encode(target) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    init?(saved: String) {
        guard !saved.isEmpty,
              let target = try? JSONDecoder().decode(WindowTarget.self, from: Data(saved.utf8))
        else { return nil }
        self = target
    }
}

#if os(macOS)
/// What the app was asked to open, in the unified log (Console, category
/// "open"), for checking Finder opens on a Mac.
enum OpenLog {
    static let log = Logger(subsystem: "com.ganymede-server.Ganymede", category: "open")
}
#endif

#if canImport(UniformTypeIdentifiers)
extension UTType {
    /// `.ipynb`, as the app's Info.plist imports it.
    static let jupyterNotebook = UTType(importedAs: "org.jupyter.ipynb", conformingTo: .json)
}
#endif
