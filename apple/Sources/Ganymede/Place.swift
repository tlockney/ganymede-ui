import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Where a window's notebooks live (#701): this device, or a connected
/// machine reached through the app's own server, which mounts it under
/// `/machines/{id}/` (ganymede#894). The id is the Remote's UUID string.
enum Place: Hashable, Codable {
    case thisDevice
    case machine(String)

    /// What the server accepts as a machine id: `[A-Za-z0-9_-]{1,64}`.
    static func isValidMachineID(_ id: String) -> Bool {
        guard (1...64).contains(id.utf8.count) else { return false }
        return id.utf8.allSatisfy { byte in
            (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5A)
                || (byte >= 0x61 && byte <= 0x7A) || byte == 0x5F || byte == 0x2D
        }
    }

    /// The machine with this id; nil when the id is malformed, so a path is
    /// never built from it.
    init?(machine id: String) {
        guard Self.isValidMachineID(id) else { return nil }
        self = .machine(id)
    }

    /// The place of a remote: its UUID string.
    init?(remote: Remote) {
        guard remote.hasServer else { return nil }
        self.init(machine: remote.id.uuidString)
    }

    var machineID: String? {
        if case .machine(let id) = self { id } else { nil }
    }

    var isMachine: Bool { machineID != nil }

    /// Whether the app draws the sidebar and toolbar of a window of this
    /// place (the page loads with `chrome=native`): on the Mac every
    /// window's, and on iOS wherever the idiom does (`iosDraws`: the iPad
    /// and iPhone), a machine's scene included (#758). The place makes no
    /// difference.
    func drawsNativeChrome(onMac: Bool, iosDraws: Bool) -> Bool { onMac || iosDraws }

    /// This device's own disk and shells: what Reveal in Finder and local
    /// Recents work on. (A machine's window has a terminal panel of its own,
    /// with the machine's shells in it, #858.)
    var isThisDevice: Bool { !isMachine }

    /// The path the page uses as its server, on the app's own origin.
    var mountPath: String {
        switch self {
        case .thisDevice: "/"
        case .machine(let id): "/machines/\(id)/"
        }
    }

    // MARK: What a window of this place gets

    /// What a page can ask the app for. A machine's window is the same
    /// origin as this device's, so this is decided by the window's place,
    /// never by origin (as `AgentKeys.trusted` does for the local page).
    enum Capability: CaseIterable {
        /// ganymede-device's bridge, the permission ledger, Notebook Access
        /// and Shortcuts: the `kernelRelay` and `deviceRemote` handlers.
        case deviceBridge
        /// The page's `openFile` (the app's editor, on this device's files
        /// or a machine's through its mount, #855).
        case openFile
        /// The `state` and `document` messages, which drive native chrome,
        /// the window's proxy icon, native Recents and Spotlight.
        case nativeChrome
        /// The agent's API keys in the Keychain: a machine's window too
        /// (#849), so a key is the same in every window.
        case agentKeys
        /// The person's name, sent in a notebook room's awareness: always
        /// on this device, and on a machine when its remote's setting
        /// says so (`allows(_:sharesName:)`, #842).
        case personName
        /// Opening `ganymede://` and other non-web links.
        case appLinks
        /// The page's Settings tab messages.
        case settings
        /// Where this Mac's kernels run (Runs On, Kernel > Advanced): a
        /// setting of this device, not of a machine's window.
        case kernelLocation
        /// A shell on this device's own server, which only this device has:
        /// a machine's window runs its terminals on the machine (#858).
        case localTerminal
    }

    func allows(_ capability: Capability) -> Bool {
        switch self {
        case .thisDevice:
            true
        case .machine:
            // `nativeChrome`: the Mac draws a machine's sidebar and toolbar
            // too (#740), from the page's `state`. Its `document` message
            // never reaches native Recents, Spotlight or the proxy icon
            // (`indexesLocally`). `agentKeys` (#849): the window's page is
            // the app's own (`allowsLoading`), and a machine's files reach
            // it sandboxed, in an opaque origin `AgentKeys.trusted` refuses.
            // `openFile` (#855): the editor reads a machine's file through
            // the app's mount, not this Mac's disk.
            capability == .settings || capability == .nativeChrome || capability == .agentKeys
                || capability == .openFile
        }
    }

    /// The same table with the machine's own setting for `personName`
    /// (#842): a machine's window gets the person's name only when the
    /// remote it was made from says so, which the window (`WebView`)
    /// passes; a place never reads the saved remotes itself. Everything
    /// else is as `allows(_:)`, whatever `sharesName` says.
    func allows(_ capability: Capability, sharesName: Bool) -> Bool {
        (capability == .personName && sharesName) || allows(capability)
    }

    /// What a new terminal in a window of this place runs on (#858): a shell
    /// on this device, or one on the server of the machine the window shows,
    /// so a machine's window starts its terminals where its files are rather
    /// than on this Mac. It starts in the folder of the notebook the window
    /// shows, else in `fallbackFolder`, the folder the window is on; both are
    /// paths from the window's own server's root, "" for the root itself.
    /// Nil for a machine whose remote was removed, or has no server: it has
    /// nowhere to run one.
    func terminalTarget(notebook: String?, fallbackFolder: String, remotes: [Remote]) -> TerminalTarget? {
        let folder = notebook.map(FolderEntry.parentPath) ?? fallbackFolder
        switch self {
        case .thisDevice:
            // The app's server on this Mac is rooted at `/`, so one of its
            // paths is a path from there, and "" is `/` itself: a window on
            // the root starts its shell there, as it did before this was one
            // place's rule, not in the app's own default folder.
            return .local(folder: URL(fileURLWithPath: "/" + folder.drop { $0 == "/" }, isDirectory: true))
        case .machine(let id):
            // The remote the window was made from, as it is saved now: one
            // that is gone, or was saved again with SSH only, is no server.
            guard let remote = remotes.first(where: { $0.id.uuidString == id && $0.hasServer }) else {
                return nil
            }
            return .server(remote.id, folder: folder.isEmpty ? nil : folder)
        }
    }

    /// The script message handlers a window of this place registers. The
    /// one table the web view is made from, so a gate that is wrong shows
    /// in a test. (`kernelRelay` and `deviceRemote` are the device bridge's,
    /// attached by `ServerHost.kernels`.)
    var handlerNames: [String] {
        var names: [String] = []
        if allows(.deviceBridge) { names += ["kernelRelay", "deviceRemote"] }
        if allows(.openFile) { names.append("openFile") }
        if allows(.nativeChrome) { names += ["state", "document"] }
        if allows(.agentKeys) { names.append("agentKeys") }
        if allows(.settings) { names.append("settings") }
        return names
    }

    /// Whether a link the page asked to open goes to the system: web links
    /// always, `ganymede://` and other app links only for this device.
    func opensExternally(_ url: URL) -> Bool {
        allows(.appLinks) || ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    }

    /// What `url` asks a machine's window to do (#868). A link in a
    /// machine's notebook names the machine's files, so it is read against
    /// the machine: only `ganymede://open?path=P` with `P` relative to the
    /// machine's root opens a notebook there. Anything that would act on
    /// this device ([`AppURL`]'s `run`, `new`, a granted folder's `open`,
    /// an x-callback answer) or reach outside the machine's root is
    /// refused. This device's app links aren't this function's: they stay
    /// `opensExternally`'s, as they were.
    func machineLink(_ url: URL) -> MachineLink {
        guard case .machine = self, url.scheme?.lowercased() == AppURL.scheme else {
            return .notApp
        }
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            // A `ganymede://` URL that doesn't parse names nothing to open.
            return .refused
        }
        let items = parts.queryItems ?? []
        // x-callback links answer another app, which a machine's window
        // gives nothing to.
        if parts.host?.lowercased() == "x-callback-url" { return .refused }
        if items.contains(where: { Self.callbackNames.contains($0.name.lowercased()) }) {
            return .refused
        }
        guard let request = try? AppURL(url), case .open(let path) = request.command else {
            return .refused
        }
        return Self.relativeMachinePath(path).map(MachineLink.open(path:)) ?? .refused
    }

    /// The names x-callback-url puts in a link's query.
    static let callbackNames: Set<String> = ["x-success", "x-error", "x-cancel"]

    /// `path` when a machine's window may open it: relative to the
    /// machine's root, with no empty, `.` or `..` segment, which
    /// `appendingPathComponent` would keep and the mount would be asked
    /// for above its root. Nil for an absolute path, `~`, or a path that
    /// climbs.
    static func relativeMachinePath(_ path: String) -> String? {
        guard !path.isEmpty, !path.hasPrefix("/"), !path.hasPrefix("~") else { return nil }
        let segments = path.split(separator: "/", omittingEmptySubsequences: false)
        guard !segments.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { return nil }
        return path
    }

    /// Whether a link the person followed, to a page on the app's own
    /// server, may load in this place's window. This device's windows are
    /// checked by `allowsLoading`. A machine's may stay on its mount, or
    /// reload its own page (`/` with its `machine=`), but not turn into
    /// this device's pages, which have the app's handlers' trust.
    func allowsFollowing(_ url: URL) -> Bool {
        guard case .machine(let id) = self else { return true }
        if url.path == "/machines/\(id)" || url.path.hasPrefix(mountPath) { return true }
        guard url.path == "/" || url.path.isEmpty else { return false }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        // The first `machine=`, as `WindowTarget(page:)` and the page read it.
        return items.first { $0.name == "machine" }?.value == id
    }

    /// The place a page at `url` on the app's own server shows, as the page
    /// reads it (`machineFromSearch`): the first `machine=` on any path, a
    /// malformed one ignored, so the page falls back to this device (#842).
    static func shown(by url: URL) -> Place {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard let raw = items.first(where: { $0.name == "machine" })?.value else { return .thisDevice }
        // `URLSearchParams` reads `+` as a space; a space is never a valid id.
        return Place(machine: raw.replacingOccurrences(of: "+", with: " ")) ?? .thisDevice
    }

    /// Whether this place's window may load `url`, a page on the app's own
    /// server, by any navigation (#842). A window's handlers and the person's
    /// name are fixed for its place, so it never becomes another place's
    /// page: this device's window never a machine's, a machine's never this
    /// device's (`allowsFollowing`) or another machine's.
    func allowsLoading(_ url: URL) -> Bool {
        let shown = Self.shown(by: url)
        switch self {
        case .thisDevice: return !shown.isMachine
        case .machine: return allowsFollowing(url) && (shown == self || !shown.isMachine)
        }
    }

    /// Whether notebooks of this place go in native Recents, File > Open
    /// Recent and Spotlight: those keep local file URLs, and a machine's
    /// notebooks have none.
    var indexesLocally: Bool { !isMachine }

    /// The page URL's query for this place: `machine=` and `machine_name=`.
    func pageQuery(name: String?) -> [(String, String)] {
        guard let id = machineID else { return [] }
        var items = [("machine", id)]
        if let name, !name.isEmpty { items.append(("machine_name", name)) }
        return items
    }
}

/// What a `ganymede://` link asks in a machine's window (#868). A machine's
/// notebook links name that machine's files, never this device's: only
/// opening a notebook by a path on the machine is followed.
enum MachineLink: Equatable {
    /// Not a `ganymede://` link, or not a machine's window: web links keep
    /// today's path, and this device's app links are `AppURL`'s.
    case notApp
    /// `ganymede://open?path=P`: open `P`, relative to the machine's root,
    /// in this window.
    case open(path: String)
    /// An app link a machine's window won't follow: `run`, `new`,
    /// `open?folder=&file=`, x-callback, or a path that is absolute, `~`
    /// or climbs.
    case refused
}

/// One entry of the place switcher.
struct PlaceEntry: Identifiable, Equatable {
    var place: Place
    var title: String
    var id: Place { place }
}

enum Places {
    /// What the place switcher calls this device.
    @MainActor static var deviceName: String {
        #if os(macOS)
        "This Mac"
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? "This iPad" : "This iPhone"
        #endif
    }

    /// This device first, then each remote with a server (an SSH-only remote
    /// stays in Settings and is not a place). Only one entry, this device,
    /// where the server can't mount machines.
    static func entries(remotes: [Remote], thisDevice: String, mounting: Bool) -> [PlaceEntry] {
        var list = [PlaceEntry(place: .thisDevice, title: thisDevice)]
        guard mounting else { return list }
        list += remotes.compactMap { remote in
            Place(remote: remote).map { PlaceEntry(place: $0, title: remote.title) }
        }
        return list
    }
}

/// How often and how soon a machine's reachability is checked: the same
/// schedule as the page's (`src/lib/places.ts`, `nextCheckDelay`).
enum ReachabilitySchedule {
    static let pollSeconds = 15.0
    static let firstRetrySeconds = 1.0
    static let maxBackoffSeconds = 30.0

    /// The wait before the next check after `failures` in a row failed.
    static func delay(afterFailures failures: Int) -> Double {
        guard failures > 0 else { return pollSeconds }
        // Capped before the shift, which would overflow for a long outage.
        let steps = min(failures - 1, 6)
        return min(maxBackoffSeconds, firstRetrySeconds * Double(1 << steps))
    }
}
