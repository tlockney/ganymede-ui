#if os(macOS)
import AppKit
import Combine
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

    /// The notebook a page from the server shows, from its `open=` (a path
    /// from the server's root, `/`, form-encoded as URLSearchParams writes
    /// it); nil when it shows none.
    init?(page: URL) {
        let items = URLComponents(url: page, resolvingAgainstBaseURL: false)?
            .percentEncodedQueryItems ?? []
        guard let value = items.first(where: { $0.name == "open" })?.value?
            .replacingOccurrences(of: "+", with: " ").removingPercentEncoding
        else { return nil }
        let path = value.drop { $0 == "/" }
        guard !path.isEmpty else { return nil }
        self = .file(URL(fileURLWithPath: "/" + String(path), isDirectory: false).standardizedFileURL)
    }

    var url: URL {
        switch self {
        case .file(let url), .folder(let url): url
        }
    }

    /// The folder the target is in: a notebook's folder, or the folder.
    /// A terminal opened from the window starts here.
    var folder: URL {
        switch self {
        case .file(let url): url.deletingLastPathComponent()
        case .folder(let url): url
        }
    }

    /// The window title.
    var title: String {
        switch self {
        case .file(let url): url.deletingPathExtension().lastPathComponent
        case .folder(let url): url.lastPathComponent.isEmpty ? url.path : url.lastPathComponent
        }
    }

    /// The page for this target on a server rooted at `/`, as ganymede-ui
    /// reads it (#129): `open=` a notebook's path, or `dir=` a folder's.
    /// `server` is the URL the server printed (with its token); `kernels`
    /// says where kernels run. With `nativeChrome` the page leaves the
    /// sidebar and toolbar to the app (`chrome=native`, #205).
    func pageURL(server: URL, kernels: String, nativeChrome: Bool = false) -> URL {
        guard var parts = URLComponents(url: server, resolvingAgainstBaseURL: false) else {
            return server
        }
        var added: [(String, String)] = {
            switch self {
            case .file(let url): [("kernels", kernels), ("open", url.path)]
            case .folder(let url): [("kernels", kernels), ("dir", url.path)]
            }
        }()
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
final class OpenRequests: ObservableObject {
    @Published private(set) var pending: [WindowTarget] = []
    /// Until the app has finished launching.
    private var launching = true
    /// Whether `pending` came while the app launched: the window it opened
    /// on nothing then shows the first itself, instead of staying empty
    /// beside a window for it.
    private var atLaunch = false
    /// The notebook windows, by id: whether each shows nothing yet.
    private var windows: [UUID: Bool] = [:]
    /// Opens a notebook window, for requests that come after launch. Set by
    /// the notebook windows.
    var openWindow: ((WindowTarget) -> Void)?

    /// Adds the file URLs among `urls`, each once.
    func add(_ urls: [URL]) {
        var added = pending
        for target in urls.filter(\.isFileURL).map(WindowTarget.init(opening:))
        where !added.contains(target) {
            added.append(target)
        }
        guard added != pending else { return }
        if launching { atLaunch = true }
        // Once launched, each opens in a window (a new tab, or the window
        // already showing it) at once, without waiting for a window to
        // notice the queue: nothing is left pending if none does.
        if !launching, let openWindow {
            added.forEach(openWindow)
            return
        }
        pending = added
    }

    func finishLaunching() {
        launching = false
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
