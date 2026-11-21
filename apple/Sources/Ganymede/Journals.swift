import Foundation

/// A place's journals (#705, #740): the notebooks an agent is in, from the
/// server's open rooms (`GET api/collaboration/rooms`, ganymede#893). A port
/// of `src/lib/journals.ts` (`parseRooms`, `isJournal`, `journalsOf`), so the
/// native Journals tab lists what the page's tab did.
enum Journals {
    struct Client: Equatable {
        enum Kind { case person, agent }
        var name: String
        var kind: Kind
    }

    struct LastChange: Equatable {
        var at: String
        var by: String
        var person: Bool
    }

    struct Room: Equatable {
        var path: String
        var type: String?
        var clients: [Client] = []
        var lastChange: LastChange?
    }

    struct Journal: Equatable, Identifiable {
        var path: String
        /// The notebook's name without `.ipynb`.
        var name: String
        /// The agent in it now, or the one that last wrote.
        var agent: String?
        /// An agent is in it now.
        var running: Bool
        var lastChangeAt: String?

        var id: String { path }
    }

    /// What a rooms request came to. `unsupported`: an older server answered 404.
    enum Result: Equatable {
        case rooms([Room])
        case unsupported
        case error(String)
    }

    /// How often the tab asks again while it shows (`JOURNALS_POLL_MS`).
    static let pollSeconds = 5.0

    /// Reads the rooms answer, dropping entries without a path. A
    /// `last_change` with no `at` is none.
    static func parseRooms(_ body: Any?) -> [Room] {
        guard let list = (body as? [String: Any])?["rooms"] as? [Any] else { return [] }
        var rooms: [Room] = []
        for raw in list {
            guard let r = raw as? [String: Any], let path = r["path"] as? String, !path.isEmpty else { continue }
            guard isSafePath(path) else { continue }
            var clients: [Client] = []
            for case let c as [String: Any] in (r["clients"] as? [Any] ?? []) {
                guard let name = c["name"] as? String, let kind = c["kind"] as? String else { continue }
                if kind == "person" {
                    clients.append(Client(name: name, kind: .person))
                } else if kind == "agent" {
                    clients.append(Client(name: name, kind: .agent))
                }
            }
            var change: LastChange?
            if let lc = r["last_change"] as? [String: Any], let at = lc["at"] as? String {
                change = LastChange(at: at, by: lc["by"] as? String ?? "", person: lc["person"] as? Bool == true)
            }
            rooms.append(Room(path: path, type: r["type"] as? String, clients: clients, lastChange: change))
        }
        return rooms
    }

    /// A machine sends the paths: not one with a "." or ".." segment (also
    /// percent-encoded), an empty one after trimming, or a backslash, which
    /// would climb out of its mount.
    static func isSafePath(_ path: String) -> Bool {
        guard !path.contains("\\") else { return false }
        let segments = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        return !segments.isEmpty && !segments.contains {
            FolderEntry.isDotSegment($0)
        }
    }

    static func agents(in room: Room) -> [Client] {
        room.clients.filter { $0.kind == .agent }
    }

    /// An agent is in the room, or an agent was the last to change it. A
    /// room only people are in, last changed by a person, is an ordinary
    /// open notebook.
    static func isJournal(_ room: Room) -> Bool {
        if let type = room.type, !type.isEmpty, type != "notebook" { return false }
        return !agents(in: room).isEmpty || (room.lastChange.map { !$0.person } ?? false)
    }

    /// The journals among `rooms`: running ones first, then newest change
    /// first, then by path so the order is stable.
    static func journalsOf(_ rooms: [Room]) -> [Journal] {
        rooms.filter(isJournal).map { room in
            let agents = agents(in: room)
            let byAgent = room.lastChange.flatMap { $0.person ? nil : $0.by } ?? ""
            let first = agents.first?.name ?? ""
            let agent = first.isEmpty ? byAgent : first
            var name = room.path.split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? room.path
            if name.hasSuffix(".ipynb") { name = String(name.dropLast(6)) }
            return Journal(
                path: room.path, name: name.isEmpty ? room.path : name,
                agent: agent.isEmpty ? nil : agent, running: !agents.isEmpty,
                lastChangeAt: room.lastChange?.at)
        }
        .sorted { a, b in
            if a.running != b.running { return a.running }
            let at = time(a.lastChangeAt), bt = time(b.lastChangeAt)
            if at != bt { return at > bt }
            return a.path.localizedCompare(b.path) == .orderedAscending
        }
    }

    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let plainFormatter = ISO8601DateFormatter()

    /// Seconds since 1970; 0 for none or unparsable, as `Date.parse(...) || 0`.
    static func time(_ iso: String?) -> TimeInterval {
        guard let iso else { return 0 }
        return (fractionalFormatter.date(from: iso) ?? plainFormatter.date(from: iso))?
            .timeIntervalSince1970 ?? 0
    }

    /// "running", or "2 min ago": the journal's second line (`journalStatus`).
    static func status(_ journal: Journal, now: Date = Date()) -> String {
        if journal.running { return "running" }
        let t = time(journal.lastChangeAt)
        if t == 0 { return "no changes yet" }
        func round(_ x: Double) -> Int { Int(x.rounded(.toNearestOrAwayFromZero)) }
        let seconds = max(0, round(now.timeIntervalSince1970 - t))
        if seconds < 60 { return "just now" }
        let minutes = round(Double(seconds) / 60)
        if minutes < 60 { return "\(minutes) min ago" }
        let hours = round(Double(minutes) / 60)
        if hours < 24 { return "\(hours) h ago" }
        return "\(round(Double(hours) / 24)) d ago"
    }

    /// What the tab says in place of rows (#758, shared by the Mac's and the
    /// iPad's): why there are none; nil while the first answer is awaited or
    /// when there are `journalCount` rows to show.
    static func statusMessage(_ result: Result?, journalCount: Int) -> String? {
        switch result {
        case nil: nil
        case .unsupported?: "This server is too old to list journals."
        case .error(let text)?: "Couldn’t list journals: \(text)"
        case .rooms?: journalCount == 0 ? "No journals yet. A notebook an agent works in shows here." : nil
        }
    }

    // MARK: Fetching

    /// The rooms URL of `place` on the app's server, which keeps its token
    /// query: this device's own, or the machine's through its mount. Nil for
    /// a malformed machine id.
    static func roomsURL(place: Place, server: URL) -> URL? {
        let path = "api/collaboration/rooms"
        if let id = place.machineID { return PlaceReachability.mountURL(id, server: server, path: path) }
        guard var parts = URLComponents(url: server, resolvingAgainstBaseURL: false) else { return nil }
        parts.percentEncodedPath = "/" + path
        return parts.url
    }

    typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    /// Fetches the rooms; 404 means a server older than ganymede#893.
    static func fetch(
        place: Place, server: URL,
        send: Send = { try await URLSession.shared.data(for: $0) }
    ) async -> Result {
        guard let url = roomsURL(place: place, server: server) else {
            return .error("This machine can’t be reached.")
        }
        do {
            let (data, response) = try await send(URLRequest(url: url))
            return result(status: (response as? HTTPURLResponse)?.statusCode ?? 0, body: data)
        } catch {
            return .error(error.localizedDescription)
        }
    }

    static func result(status: Int, body: Data) -> Result {
        if status == 404 {
            // The mount's own 404 for a machine it hasn't mounted (yet) isn't
            // an older server, and may be fixed by a reconnect: keep asking.
            if FileSourceError.isNotMounted(body: body) {
                return .error("This machine isn’t mounted.")
            }
            return .unsupported
        }
        guard (200..<300).contains(status) else { return .error("The server answered \(status).") }
        guard let json = try? JSONSerialization.jsonObject(with: body) else {
            return .error("The server’s answer wasn’t JSON.")
        }
        return .rooms(parseRooms(json))
    }
}
