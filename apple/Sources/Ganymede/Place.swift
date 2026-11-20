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
        /// The page's `openFile` (the app's editor, on this device's files).
        case openFile
        /// The `state` and `document` messages, which drive native chrome,
        /// the window's proxy icon, native Recents and Spotlight.
        case nativeChrome
        /// The agent's API keys in the Keychain.
        case agentKeys
        /// The person's name, sent to rooms on this device's server.
        case personName
        /// Opening `ganymede://` and other non-web links.
        case appLinks
        /// The page's Settings tab messages.
        case settings
        /// Switching to another place, from a machine window's own sidebar.
        case switchPlace
    }

    func allows(_ capability: Capability) -> Bool {
        switch self {
        case .thisDevice:
            capability != .switchPlace
        case .machine:
            capability == .settings || capability == .switchPlace
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
        if allows(.switchPlace) { names.append("place") }
        return names
    }

    /// Whether a link the page asked to open goes to the system: web links
    /// always, `ganymede://` and other app links only for this device.
    func opensExternally(_ url: URL) -> Bool {
        allows(.appLinks) || ["http", "https"].contains(url.scheme?.lowercased() ?? "")
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

    /// The JSON a machine's page gets as `window.ganymedePlaces`: names and
    /// ids, never an address or a token.
    static func pageJSON(_ entries: [PlaceEntry]) -> String {
        let items: [[String: Any]] = entries.map { entry in
            ["id": entry.place.machineID.map { $0 as Any } ?? NSNull(), "name": entry.title]
        }
        guard let data = try? JSONSerialization.data(withJSONObject: items) else { return "[]" }
        return String(decoding: data, as: UTF8.self)
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
