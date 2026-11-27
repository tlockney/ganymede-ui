import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Where a window's notebooks live (#701): this device, or a connected
/// machine reached through the app's own server, which mounts it under
/// `/machines/{id}/` (ganymede#894). The id is the Remote's UUID string.
///
/// A machine the app has checked is this Mac's own server (`.thisMac`,
/// #883) is reached the same way, through its mount, but trusted as this
/// device's: its files are this Mac's and its notebooks are the ones a
/// local window has.
enum Place: Hashable, Codable {
    case thisDevice
    case machine(String)
    /// A machine whose server the app verified as this Mac's own Ganymede
    /// (#883): a background `ganymede serve` on this Mac, whose process is
    /// the app's own bundled helper. Trust comes from who is listening, not
    /// where: any process of any user can listen on a loopback port, and
    /// the app sends that server its token (`ThisMacVerifier`).
    case thisMac(String)

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

    /// The place of a remote, before any this-Mac check: an SSH-only remote
    /// is no place, and one with a server is its machine. What a window
    /// opened now would be, and what the syncing paths name;
    /// `init?(remote:verified:)` is what a check's answer makes of it
    /// (#883). Trust is never given on the address alone: `ThisMacServers`
    /// matches a verified server to a remote, and a place is read from its
    /// answer.
    init?(remote: Remote) {
        guard remote.hasServer, let place = Place(machine: remote.id.uuidString) else { return nil }
        self = place
    }

    /// The place of a remote whose id the app has already verified (#883):
    /// `.thisMac` for an id in `verified`, else `.machine`. What the place
    /// switcher and a window read once `AppModel` has checked, without
    /// reading the keychain's token again.
    init?(remote: Remote, verified: Set<String>) {
        guard remote.hasServer, let place = Place(machine: remote.id.uuidString),
              let id = place.machineID
        else { return nil }
        self = verified.contains(id) ? .thisMac(id) : place
    }

    var machineID: String? {
        switch self {
        case .machine(let id), .thisMac(let id): id
        case .thisDevice: nil
        }
    }

    var isMachine: Bool { machineID != nil }

    /// Whether this is this Mac's own server (#883): a machine reached
    /// through the mount whose process the app verified.
    var isThisMac: Bool {
        if case .thisMac = self { true } else { false }
    }

    /// Whether the app draws the sidebar and toolbar of a window of this
    /// place (the page loads with `chrome=native`): on the Mac every
    /// window's, and on iOS wherever the idiom does (`iosDraws`: the iPad
    /// and iPhone), a machine's scene included (#758). The place makes no
    /// difference.
    func drawsNativeChrome(onMac: Bool, iosDraws: Bool) -> Bool { onMac || iosDraws }

    /// This device's own disk and shells: what Reveal in Finder and local
    /// Recents work on. (A machine's window has a terminal panel of its own,
    /// with the machine's shells in it, #858. This Mac's own server's window
    /// is a machine's here: its files are reached through the mount, #883.)
    var isThisDevice: Bool { !isMachine }

    /// The path the page uses as its server, on the app's own origin.
    var mountPath: String {
        switch self {
        case .thisDevice: "/"
        case .machine(let id), .thisMac(let id): "/machines/\(id)/"
        }
    }

    // MARK: What a window of this place gets

    /// What a page can ask the app for. A machine's window is the same
    /// origin as this device's, so this is decided by the window's place,
    /// never by origin (as `AgentKeys.trusted` does for the local page).
    enum Capability: CaseIterable {
        /// The `deviceRemote` handler: ganymede-device's remote subset, the
        /// `device` calls of a server kernel's comm (#568), which this
        /// device's windows always get and a machine's only when its
        /// setting says so (`allows(_:settings:)`, #877).
        case deviceRemote
        /// The permission ledger, open-time prompts, Notebook Access,
        /// Shortcuts and the lend of the web view to `AppKernels`: the
        /// `kernelRelay` handler. This device only: the ledger keeps this
        /// device's notebooks by absolute path, and a machine's notebooks
        /// aren't this device's (#877).
        case deviceLedger
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
        /// says so (`PlaceSettings`, #842).
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
        case .thisMac:
            // The server is this Mac's own, verified by its signature
            // (#883), and its notebooks are this Mac's, so its window gets
            // what a local window gets. `kernelLocation` stays a setting of
            // this device's own windows: where this Mac's kernels run is
            // not the background server's to say.
            capability != .kernelLocation
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

    /// The same table with the machine's own settings (#842, #877): a
    /// machine's window gets the person's name only when the remote it was
    /// made from says so, and its notebooks get this device's `device` API
    /// only when that says so too. The window (`WebView`) passes them; a
    /// place never reads the saved remotes itself. Everything else is as
    /// `allows(_:)`, whatever the settings say.
    func allows(_ capability: Capability, _ settings: PlaceSettings) -> Bool {
        switch capability {
        case .personName: settings.sharesName || allows(capability)
        case .deviceRemote: settings.usesDevice || allows(capability)
        default: allows(capability)
        }
    }

    /// Whether a window of this place gives its page's URL to the device
    /// bridge before it loads (`uiWillLoad`): the page a machine's kernel
    /// may call must come from, and `fromPage` refuses every call without
    /// it (#877). This device's windows, whose pages have the ledger, and a
    /// machine's when its setting says its notebooks may use this device's
    /// `device` API — the pages whose kernels can ask at all.
    func tracksPageURL(_ settings: PlaceSettings) -> Bool {
        allows(.deviceLedger, settings) || allows(.deviceRemote, settings)
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
        case .machine(let id), .thisMac(let id):
            // This Mac's own server's terminals run there too, in its
            // folders, as a machine's do (#883).
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
    /// attached by `KernelHost`; a machine's window gets the remote handler
    /// alone, and only with its setting on, #877.)
    func handlerNames(_ settings: PlaceSettings) -> [String] {
        var names: [String] = []
        if allows(.deviceLedger, settings) { names.append("kernelRelay") }
        if allows(.deviceRemote, settings) { names.append("deviceRemote") }
        if allows(.openFile, settings) { names.append("openFile") }
        if allows(.nativeChrome, settings) { names += ["state", "document"] }
        if allows(.agentKeys, settings) { names.append("agentKeys") }
        if allows(.settings, settings) { names.append("settings") }
        return names
    }

    /// The name a window of this place asks as, for the device bridge's
    /// `asker` (#877): the app's name for the machine, or "another
    /// computer" when it has none (a remote removed while its window was
    /// open), so a machine's dialogs always say the cell isn't this
    /// device's. Nil for this device's windows, whose dialogs are its
    /// alone, and for this Mac's own server's (#883): its cells are this
    /// Mac's own processes, so they ask as this device does.
    func asker(name: (String) -> String?) -> String? {
        guard case .machine(let id) = self else { return nil }
        return name(id) ?? "another computer"
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
    /// `opensExternally`'s, as they were. A this-Mac window's aren't either:
    /// it reads the relative `open` (`relativeOpenPath`) itself, and gives
    /// the rest to the system as this device does (#883).
    func machineLink(_ url: URL) -> MachineLink {
        guard case .machine = self, url.scheme?.lowercased() == AppURL.scheme else {
            return .notApp
        }
        return Self.relativeOpenPath(url).map(MachineLink.open(path:)) ?? .refused
    }

    /// The path a `ganymede://open?path=` link names, when it is relative
    /// to a server's root and doesn't climb: what a machine's window opens
    /// there (#868), and a this-Mac window opens against its server's root,
    /// `root_dir`, since its page's paths are from it (#883). Nil for
    /// another link, an x-callback one, or a path that is empty, absolute,
    /// `~` or climbs.
    static func relativeOpenPath(_ url: URL) -> String? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        // x-callback links answer another app, which a machine's window
        // gives nothing to.
        if parts.host?.lowercased() == "x-callback-url" { return nil }
        if (parts.queryItems ?? []).contains(where: { callbackNames.contains($0.name.lowercased()) }) {
            return nil
        }
        guard let request = try? AppURL(url), case .open(let path) = request.command else { return nil }
        return relativeMachinePath(path)
    }

    /// What this window does with a link (#868), which `WebView`'s policy
    /// decision asks: `clicked` is WebKit's `.linkActivated`, and only a
    /// click follows a link, so neither a script's navigation to
    /// `ganymede://` nor an output frame's can act or make the notice
    /// appear.
    func linkAction(for url: URL, clicked: Bool) -> LinkAction {
        if url.scheme?.lowercased() == AppURL.scheme {
            switch self {
            case .machine:
                // A machine's app link names a file on that machine, and is
                // read there (#868). Anything but a click is dropped without
                // a word: an output could otherwise loop it.
                guard clicked else { return .cancel }
                switch machineLink(url) {
                case .open(let path): return .openOnMachine(path: path)
                case .refused: return .refuse
                // The scheme matched, so the link isn't another kind.
                case .notApp: return .cancel
                }
            case .thisMac:
                // This Mac's own server's page has the server's `root_dir`
                // as its root, so a relative `open` opens there (#883). An
                // absolute path, `~`, `run`, `new` or an x-callback answer
                // is this device's, which the system's `AppURLHandler`
                // does, resolving the path as a file on this Mac.
                guard clicked, let path = Self.relativeOpenPath(url) else { break }
                return .openOnMachine(path: path)
            case .thisDevice:
                break
            }
        }
        // Anything else is as it was (#701): a click goes to the system,
        // the browser for a web link and this device's `AppURL` for an app
        // link, while a machine sends only its web links there. A
        // navigation nothing clicked loads here.
        guard clicked else { return .allow }
        return opensExternally(url) ? .openExternally : .cancel
    }

    /// The names x-callback-url puts in a link's query.
    static let callbackNames: Set<String> = ["x-success", "x-error", "x-cancel"]

    /// What a new window (`target="_blank"`, `window.open`) does with `url`
    /// (#883): the page asked for one, so its link is read as a click's is —
    /// a relative `open` in a machine's window, or in this Mac's own
    /// server's, shows that notebook in the window it came from, while
    /// anything else that needs no window goes to the system, as a click's
    /// does. One rule, so a new window can't be the way round
    /// `decidePolicyFor` and into this device's `AppURL`.
    func newWindowAction(for url: URL) -> LinkAction { linkAction(for: url, clicked: true) }

    /// What a window's place is (#883), from the place its page was loaded
    /// with and the one the app finds now: an upgrade to this Mac's own
    /// server applies on the window's next load, never under the page that
    /// is showing, and a downgrade applies at once — the page's elevated
    /// handlers must not outlive the verified server. A downgrade that was
    /// taken this way is held: a check that verifies the server again waits
    /// for the next load too.
    static func window(loaded: Place?, current: Place) -> Place {
        guard let loaded else { return current }
        return loaded.isThisMac && !current.isThisMac ? current : loaded
    }

    /// Whether a window's web view, made for this place, takes `new` in
    /// place (#883): only a downgrade — this Mac's own server is gone — is
    /// taken under the page that is showing, so its unsaved edits stay.
    /// Anything else, an upgrade above all, is another web view's, made on
    /// the window's next load.
    func takesInPlace(_ new: Place) -> Bool { isThisMac && !new.isThisMac }

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
    /// this device's pages, which have the app's handlers' trust. This
    /// Mac's own server's window stays on its mount too (#883).
    func allowsFollowing(_ url: URL) -> Bool {
        guard let id = machineID else { return true }
        if url.path == "/machines/\(id)" || url.path.hasPrefix(mountPath) { return true }
        guard url.path == "/" || url.path.isEmpty else { return false }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        // The first `machine=`, as `WindowTarget(page:)` and the page read it.
        return items.first { $0.name == "machine" }?.value == id
    }

    /// The place a page at `url` on the app's own server shows, as the page
    /// reads it (`machineFromSearch`): the first `machine=` on any path, a
    /// malformed one ignored, so the page falls back to this device (#842).
    /// A `machine=` names a machine to the page, never this Mac's own place:
    /// whether that machine is this Mac's is the app's to know (#883).
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
    /// device's (`allowsFollowing`) or another machine's. This Mac's own
    /// server's window keeps to its mount, as a machine's does: the page it
    /// loads is the machine page's, and the app's trust is the window's.
    func allowsLoading(_ url: URL) -> Bool {
        let shown = Self.shown(by: url)
        switch self {
        case .thisDevice: return !shown.isMachine
        case .machine, .thisMac:
            return allowsFollowing(url) && (shown.machineID == machineID || !shown.isMachine)
        }
    }

    /// Whether notebooks of this place go in native Recents, File > Open
    /// Recent and Spotlight: those keep local file URLs, and a machine's
    /// notebooks have none. This Mac's own server's have this Mac's, under
    /// its `root_dir` (#883).
    var indexesLocally: Bool {
        switch self {
        case .machine: false
        case .thisDevice, .thisMac: true
        }
    }

    /// The page URL's query for this place: `machine=` and `machine_name=`.
    func pageQuery(name: String?) -> [(String, String)] {
        guard let id = machineID else { return [] }
        var items = [("machine", id)]
        if let name, !name.isEmpty { items.append(("machine_name", name)) }
        return items
    }

    /// The folder a window of this place reads its page's paths from
    /// (#883): this Mac's own server's `root_dir` (`thisMac`, which the
    /// check that verified it keeps and which may be gone since), since the
    /// page's paths are from it; else the app server's root, which this
    /// device's and a machine's pages are from. One rule, so the ledger, a
    /// `document` message, Recents and Spotlight name the same folders.
    func pageRoot(thisMac root: URL?, server: URL) -> PageRoot {
        PageRoot(url: isThisMac ? root ?? server : server)
    }
}

/// The folder a window's page paths are under (#883). A this-Mac window's
/// server is rooted at its `root_dir`, so a path the page names is a file
/// under that; this device's page is rooted at the app server's root, and
/// a machine's paths never reach this Mac's disk at all.
struct PageRoot: Equatable {
    var url: URL

    /// The file at `path`, as the page names it.
    func file(_ path: String) -> URL {
        url.appendingPathComponent(path, isDirectory: false)
    }

    /// The files at `paths`, as the page names them.
    func files(_ paths: [String]) -> [URL] {
        paths.map(file)
    }
}

/// A window's own settings, which the remote it was made from keeps (#842,
/// #877): whether the person's name goes to a machine's rooms, and whether
/// a machine's notebooks may use this device's `device` API. The window
/// passes them to `Place`; a place never reads the saved remotes itself.
/// This device's windows ignore both (its place allows the name and the
/// device API whatever they say), and the defaults are a new remote's: the
/// name on, since a machine is one you linked yourself, and the device API
/// off, since a machine's notebooks can be written by others there.
struct PlaceSettings: Equatable {
    var sharesName = true
    var usesDevice = false
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

/// What a window does with a link it is asked to follow or load (#868),
/// as `Place.linkAction(for:clicked:)` decides it.
enum LinkAction: Equatable {
    /// Load it in the window: a navigation nothing clicked.
    case allow
    /// Drop it without a word.
    case cancel
    /// Hand it to the system: the browser for a web link, this device's
    /// app for an app link.
    case openExternally
    /// `path`, a machine's, opens in the window.
    case openOnMachine(path: String)
    /// Say the link names a file on another computer, and do nothing.
    case refuse
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
    /// where the server can't mount machines. A remote the app verified as
    /// this Mac's own server (#883, `verified` holds its id) is listed as
    /// this Mac's place.
    static func entries(
        remotes: [Remote], thisDevice: String, mounting: Bool, verified: Set<String> = []
    ) -> [PlaceEntry] {
        var list = [PlaceEntry(place: .thisDevice, title: thisDevice)]
        guard mounting else { return list }
        list += remotes.compactMap { remote in
            Place(remote: remote, verified: verified).map { PlaceEntry(place: $0, title: remote.title) }
        }
        return list
    }
}

/// A server info file the app has checked is this Mac's own Ganymede
/// (#883): `ThisMacVerifier` makes one from `jpserver-<pid>.json` only when
/// the process behind it is the app's own bundled helper. A place reads it
/// to know a remote is this Mac's, and where its notebooks are.
struct ThisMacServer: Equatable {
    /// The server's process, `pid`.
    var pid: Int32
    /// Its `url`: `127.0.0.1` or `::1`, the literal the check accepted.
    var url: URL
    /// Its `token`, which the app sends the server.
    var token: String
    /// Its `root_dir`: the folder its notebooks' paths are under.
    var root: URL
    /// Its `ganymede_version`, which must be the app's own bundled one.
    var version: String

    /// The port the server listens on: its `url`'s.
    var port: Int? { url.port }

    /// Whether `remote` names this server: the same address on its port,
    /// with its token. Not merely `localhost` on the same port — the
    /// remote must reach the address the verified process listens on, or
    /// the app's token would go to a server it didn't check. A name and an
    /// address are different addresses, and so are two addresses.
    func serves(_ remote: Remote, token: String?) -> Bool {
        guard let token, !token.isEmpty, token == self.token,
              let port, let url = URL(string: remote.serverURL),
              let host = url.host, Self.isTrustedAddress(host), url.port == port,
              let listened = self.url.host, Self.isTrustedAddress(listened),
              Self.normalize(host) == Self.normalize(listened)
        else { return false }
        return true
    }

    /// Whether `host` is an address a server the app trusts may listen on,
    /// written as the literal it is: `127.0.0.1` or `::1` (with or without
    /// the brackets an IPv6 literal may have). A name is refused,
    /// `localhost` included: the app's token must go to the address whose
    /// socket the check looked at, and what a name resolves to is the
    /// system's to say (#883).
    static func isTrustedAddress(_ host: String) -> Bool {
        ["127.0.0.1", "::1"].contains(normalize(host))
    }

    /// `host` as written, with the brackets an IPv6 literal may keep off
    /// and its case gone: `[::1]` and `::1` are one address, and a name is
    /// the same name in any case.
    static func normalize(_ host: String) -> String {
        var host = host.lowercased()
        if host.hasPrefix("["), host.hasSuffix("]") { host = String(host.dropFirst().dropLast()) }
        return host
    }
}

/// The servers a this-Mac check verified (#883), by remote id: what
/// `AppModel` keeps, what a window's place is read from, and where a
/// `.thisMac` window's notebooks are. Empty on iOS, where nothing verifies.
struct ThisMacServers: Equatable {
    /// Each verified remote's server, by the remote's id (its UUID string).
    private(set) var byID: [String: ThisMacServer] = [:]

    init() {}

    /// The remotes whose server `servers` holds: each matched on its saved
    /// address, its port and its token, so a remote that names another
    /// address or has another token stays an ordinary machine.
    init(_ servers: [ThisMacServer], remotes: [Remote], token: (UUID) -> String?) {
        for remote in remotes {
            guard let server = servers.first(where: { $0.serves(remote, token: token(remote.id)) })
            else { continue }
            byID[remote.id.uuidString] = server
        }
    }

    /// The remotes the check verified, for the place switcher.
    var ids: Set<String> { Set(byID.keys) }

    var isEmpty: Bool { byID.isEmpty }

    /// The server verified for `id`, if one was.
    func server(_ id: String) -> ThisMacServer? { byID[id] }

    /// The same with `id`'s server gone: its process ended, or it stopped
    /// answering, so it isn't this Mac's own any more.
    func removing(_ id: String) -> ThisMacServers {
        var servers = self
        servers.byID[id] = nil
        return servers
    }

    /// What a window's target is, as a place: a machine whose server the
    /// check verified is `.thisMac`, whatever the window was opened as.
    func place(for target: WindowTarget) -> Place {
        switch target.place {
        case .machine(let id) where byID[id] != nil: .thisMac(id)
        default: target.place
        }
    }

    /// The folder a `.thisMac` window's server is rooted at (`root_dir`),
    /// which its ledger keeps notebooks under and its Recents point into;
    /// nil for every other place.
    func root(for place: Place) -> URL? {
        guard case .thisMac(let id) = place else { return nil }
        return byID[id]?.root
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
