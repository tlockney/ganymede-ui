import Foundation

/// The writes the Ganymede server reported making to notebooks' files
/// (`ganymede_server_set_write_observer`), kept for a short while so a
/// check of a kept answer can tell the server's own write from a change
/// made outside the app (#584).
///
/// The server reports each write on one of its own threads, with the
/// file's stamp (`FileStamp`) before and after. The app restamps the kept
/// answers from the main actor, a hop later. A check that runs between
/// the two sees a stamp its answer doesn't have yet; `leads` says whether
/// the reports explain the difference, in which case the check restamps
/// and keeps the answer instead of forgetting it.
///
/// Thread-safe: `record` runs on the server's threads, `leads` on the
/// main actor.
public final class ServerWriteLog: @unchecked Sendable {
    /// The log the app's server reports to, and the stores check against.
    public static let shared = ServerWriteLog()

    /// Transitions kept per file; older ones are dropped.
    static let perPath = 32
    /// Files kept; the one reported longest ago is dropped past this.
    static let paths = 256

    private struct Transition {
        let before: String?
        let after: String?
    }

    private let lock = NSLock()
    private var transitions: [String: [Transition]] = [:]
    /// The files in `transitions`, oldest first.
    private var order: [String] = []

    public init() {}

    /// The server wrote the file at `path` (canonical, as the server
    /// names it), which had stamp `before` (nil: it wasn't there) and now
    /// has `after` (nil: it couldn't be read).
    public func record(path: String, before: String?, after: String?) {
        lock.withLock {
            // The last file reported goes to the end, so the one reported
            // longest ago is dropped past the limit.
            if transitions[path] != nil, let index = order.lastIndex(of: path) {
                order.remove(at: index)
            }
            order.append(path)
            if order.count > Self.paths {
                transitions[order.removeFirst()] = nil
            }
            var list = transitions[path] ?? []
            list.append(Transition(before: before, after: after))
            if list.count > Self.perPath { list.removeFirst(list.count - Self.perPath) }
            transitions[path] = list
        }
    }

    /// Whether the writes recorded for `path` lead from stamp `from` to
    /// stamp `to`: some transition begins at `from`, the next at where
    /// that ended, and so on until `to`. Stamps already reached aren't
    /// followed again, so a file written back to an earlier stamp can't
    /// loop. True when `from == to`.
    public func leads(path: String, from: String, to: String) -> Bool {
        if from == to { return true }
        let list = lock.withLock { transitions[path] ?? [] }
        var reached: Set<String> = [from]
        var frontier = [from]
        while let current = frontier.popLast() {
            for transition in list where transition.before == current {
                guard let next = transition.after, reached.insert(next).inserted else { continue }
                if next == to { return true }
                frontier.append(next)
            }
        }
        return false
    }
}
