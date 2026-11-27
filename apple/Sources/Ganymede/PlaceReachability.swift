import Foundation
import Observation

/// Whether each machine answers, for the place switcher's dots (#701):
/// `api/status` through the app's mount, every `pollSeconds` while it
/// answers and with backoff while it doesn't.
@MainActor
@Observable
final class PlaceReachability {
    static let shared = PlaceReachability()

    /// The last answer per machine id; absent until the first check.
    private(set) var reachable: [String: Bool] = [:]
    /// What to do when a machine that wasn't answering answers again: the
    /// app checks its server again, since a mount that came back may be
    /// another server's, and whether it is this Mac's own (#883).
    var onReachable: ((String) -> Void)?
    @ObservationIgnored private var tasks: [String: Task<Void, Never>] = [:]
    /// Where the mount is: the app's server with its token, nil while it
    /// isn't running.
    @ObservationIgnored private var server: URL?
    @ObservationIgnored private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    /// Reachable, offline, or nil while unknown (shown as reachable).
    func isReachable(_ place: Place) -> Bool {
        guard let id = place.machineID else { return true }
        return reachable[id] ?? true
    }

    /// Watches exactly `places`' machines on `server`; stops the rest.
    func watch(_ places: [Place], on server: URL?) {
        let ids = Set(places.compactMap(\.machineID))
        if server != self.server {
            tasks.values.forEach { $0.cancel() }
            tasks = [:]
            self.server = server
        }
        for (id, task) in tasks where !ids.contains(id) {
            task.cancel()
            tasks[id] = nil
            reachable[id] = nil
        }
        guard let server else { return }
        for id in ids where tasks[id] == nil {
            tasks[id] = Task { [weak self] in await self?.poll(id, server: server) }
        }
    }

    private func poll(_ id: String, server: URL) async {
        var failures = 0
        while !Task.isCancelled {
            let ok = await Self.check(id, server: server, session: session)
            guard !Task.isCancelled else { return }
            let again = ok && reachable[id] == false
            failures = ok ? 0 : failures + 1
            if reachable[id] != ok { reachable[id] = ok }
            // A machine that answers again: the app checks its server
            // again, off this poll (#883).
            if again { onReachable?(id) }
            let wait = ReachabilitySchedule.delay(afterFailures: failures)
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
        }
    }

    /// The URL of `api/status` through the mount, on the app's server (its
    /// token rides in the query, as the page's first load does).
    nonisolated static func statusURL(_ id: String, server: URL) -> URL? {
        mountURL(id, server: server, path: "api/status")
    }

    /// `path` (already percent-encoded, relative) under machine `id`'s mount
    /// on `server`, keeping the server's own query (its token) and adding
    /// `query`, whose items are percent-encoded here. Nil for a malformed id.
    nonisolated static func mountURL(
        _ id: String, server: URL, path: String, query: [(String, String)] = []
    ) -> URL? {
        guard Place.isValidMachineID(id),
              var parts = URLComponents(url: server, resolvingAgainstBaseURL: false)
        else { return nil }
        parts.percentEncodedPath = Place.machine(id).mountPath + path
        if !query.isEmpty {
            let extra = query.map { "\(NotebookActions.encode($0.0))=\(NotebookActions.encode($0.1))" }
            parts.percentEncodedQuery = ([parts.percentEncodedQuery].compactMap { $0 } + extra)
                .filter { !$0.isEmpty }.joined(separator: "&")
        }
        return parts.url
    }

    nonisolated static func check(_ id: String, server: URL, session: URLSession) async -> Bool {
        guard let url = statusURL(id, server: server) else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        do {
            let (_, response) = try await session.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }
}
